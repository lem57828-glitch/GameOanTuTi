// TV2 — Gói việc 3: Quản lý tiến trình Python trong Sandbox cách ly (Process Sandbox)
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { PythonBotState } from '@arena/game-engine';

export interface PythonProcessOptions {
  sourceCode: string;
  startupMs?: number;
  wallMsPerMove?: number;
  cpuMsPerMove?: number;
  seed?: number;
  maxRuntimeMs?: number;
  pythonCmd?: string;
  /** Only for trusted local development, never submissions from other users. */
  trustedLocal?: boolean;
}

export type ProcessErrorType =
  | 'SANDBOX_UNAVAILABLE'
  /** Container khởi động quá chậm (máy quá tải): lỗi tạm thời, worker thử lại job. */
  | 'SANDBOX_TIMEOUT'
  | 'STARTUP_TIMEOUT'
  | 'STARTUP_ERROR'
  | 'MOVE_TIMEOUT'
  | 'CRASH'
  | 'INVALID_RESPONSE';

export class PythonProcessError extends Error {
  constructor(
    readonly type: ProcessErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'PythonProcessError';
  }
}

/**
 * Script bọc Python (Runner Wrapper):
 * - Nạp bot.py của thí sinh vào môi trường cách ly
 * - Kiểm tra sự tồn tại của hàm make_move
 * - Giữ tiến trình sống liên tục trong suốt hiệp đấu, trao đổi qua stdin/stdout
 */
const RUNNER_SCRIPT = `
import sys
import json
import time
import random
random.seed(BOT_SEED)

print(json.dumps({"status": "BOOT"}), flush=True)
try:
    import bot
    if not hasattr(bot, 'make_move') or not callable(getattr(bot, 'make_move')):
        print(json.dumps({"status": "ERROR", "message": "Bot không có hàm make_move(state)"}), flush=True)
        sys.exit(1)
    print(json.dumps({"status": "READY"}), flush=True)
except Exception as e:
    print(json.dumps({"status": "ERROR", "message": f"Lỗi khởi động bot: {str(e)}"}), flush=True)
    sys.exit(1)

for line in sys.stdin:
    line = line.strip()
    if not line or line == "QUIT":
        break
    try:
        state = json.loads(line)
        cpu_started = time.process_time()
        move = bot.make_move(state)
        if time.process_time() - cpu_started > CPU_BUDGET:
            print(json.dumps({"status": "CPU_TIMEOUT", "message": "Bot vượt ngân sách CPU mỗi nước"}), flush=True)
            continue
        print(json.dumps({"status": "OK", "move": move}), flush=True)
    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": f"Lỗi thực thi make_move: {str(e)}"}), flush=True)
`;

export class PythonBotProcess {
  private child: ChildProcess | null = null;
  private readline: Interface | null = null;
  private tempDir: string | null = null;
  private isTerminated = false;
  private containerName: string | null = null;
  private stderr = '';
  private outputBytes = 0;
  private watchdog: ChildProcess | null = null;

  constructor(private readonly opts: PythonProcessOptions) {}

  /**
   * Khởi động bot trong sandbox:
   * - Tạo thư mục tạm
   * - Ghi file bot.py và runner.py
   * - Bật tiến trình Python với env an toàn (chặn token, DB secret)
   * - Chờ thông điệp READY trong startupMs (mặc định 3s)
   */
  async start(): Promise<void> {
    const startupMs = this.opts.startupMs ?? 3000;
    const pythonCmd = this.opts.pythonCmd ?? process.env.PYTHON_CMD ?? 'python';
    const local =
      this.opts.trustedLocal === true ||
      (process.env.BOT_SANDBOX_MODE === 'trusted-local' && process.env.NODE_ENV !== 'production');

    this.tempDir = await mkdtemp(join(tmpdir(), 'arena-bot-'));
    await writeFile(join(this.tempDir, 'bot.py'), this.opts.sourceCode, 'utf8');
    await writeFile(
      join(this.tempDir, 'runner.py'),
      RUNNER_SCRIPT.replace(
        'import sys',
        `import sys\nCPU_BUDGET = ${(this.opts.cpuMsPerMove ?? 200) / 1000}\nBOT_SEED = ${this.opts.seed ?? 0}`,
      ),
      'utf8',
    );
    // The non-root container user must be able to read its isolated bind mount.
    await chmod(this.tempDir, 0o755);
    await chmod(join(this.tempDir, 'bot.py'), 0o644);
    await chmod(join(this.tempDir, 'runner.py'), 0o644);

    // Chỉ truyền các biến môi trường thiết yếu của hệ thống, tuyệt đối chặn secret DB / Redis
    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      HOMEPATH: process.env.HOMEPATH,
      USERPROFILE: process.env.USERPROFILE,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONHASHSEED: String(this.opts.seed ?? 0),
    };

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      let booted = false;
      let timeout = setTimeout(
        () => {
          if (!resolved) {
            resolved = true;
            this.terminate();
            reject(
              new PythonProcessError(
                local ? 'STARTUP_TIMEOUT' : 'SANDBOX_TIMEOUT',
                `Môi trường Python/container chưa sẵn sàng. ${this.stderr}`,
              ),
            );
          }
        },
        // Docker: gồm cả thời gian dựng container với hạn mức 0,2 CPU; máy bận có thể mất vài chục giây.
        // Không tính vào thời gian suy nghĩ của bot (mỗi nước vẫn giới hạn riêng).
        local ? startupMs : 45_000,
      );

      try {
        this.containerName = local ? null : `arena-bot-${randomUUID()}`;
        const args = local
          ? ['-X', 'utf8', '-u', 'runner.py']
          : [
              'run',
              '--pull=never',
              '--rm',
              '-i',
              '--name',
              this.containerName!,
              '--network=none',
              '--read-only',
              '--env',
              `PYTHONHASHSEED=${this.opts.seed ?? 0}`,
              '--cap-drop=ALL',
              '--security-opt=no-new-privileges',
              '--memory=128m',
              '--memory-swap=128m',
              `--cpus=${Math.max(0.01, Math.min(1, (this.opts.cpuMsPerMove ?? 200) / (this.opts.wallMsPerMove ?? 1000)))}`,
              '--pids-limit=32',
              '--user=65534:65534',
              '--tmpfs=/tmp:rw,noexec,nosuid,size=16m',
              '--mount',
              `type=bind,source=${this.tempDir},target=/bot,readonly`,
              '-w',
              '/bot',
              process.env.BOT_SANDBOX_IMAGE || 'python:3.13-slim',
              'python',
              '-X',
              'utf8',
              '-B',
              '-u',
              'runner.py',
            ];
        this.child = spawn(local ? pythonCmd : process.env.BOT_CONTAINER_CMD || 'docker', args, {
          cwd: this.tempDir!,
          env: local ? safeEnv : process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (!local) {
          // Independent host watchdog survives a worker crash; untrusted code cannot stop it.
          this.watchdog = spawn(
            process.execPath,
            [
              '-e',
              `const {execFile}=require('node:child_process');setTimeout(()=>execFile(process.argv[1],['rm','-f',process.argv[2]],()=>process.exit()),Number(process.argv[3]));`,
              process.env.BOT_CONTAINER_CMD || 'docker',
              this.containerName!,
              String(this.opts.maxRuntimeMs ?? 230_000),
            ],
            { detached: true, windowsHide: true, stdio: 'ignore' },
          );
          this.watchdog.on('error', () => this.terminate());
          this.watchdog.unref();
        }
        this.child.stderr!.on('data', (chunk: Buffer) => {
          this.stderr = (this.stderr + chunk.toString()).slice(-8192);
          this.outputBytes += chunk.length;
          if (this.outputBytes > 1024 * 1024) this.terminate();
        });
        this.child.stdout!.on('data', (chunk: Buffer) => {
          this.outputBytes += chunk.length;
          if (this.outputBytes > 1024 * 1024) this.terminate();
        });
        this.child.stdin!.on('error', () => this.terminate());

        this.readline = createInterface({ input: this.child.stdout! });

        const onStartupLine = (line: string) => {
          if (resolved) return;
          try {
            const res = JSON.parse(line);
            if (res.status === 'BOOT' && !booted) {
              booted = true;
              clearTimeout(timeout);
              timeout = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                this.terminate();
                reject(
                  new PythonProcessError(
                    'STARTUP_TIMEOUT',
                    `Bot không khởi động xong trong ${startupMs}ms sau khi Python sẵn sàng.`,
                  ),
                );
              }, startupMs);
              return;
            }
            resolved = true;
            clearTimeout(timeout);
            this.readline?.removeListener('line', onStartupLine);
            if (res.status === 'READY' && booted) resolve();
            else {
              this.terminate();
              reject(new PythonProcessError('STARTUP_ERROR', res.message || 'Lỗi khởi động bot.'));
            }
          } catch {
            resolved = true;
            clearTimeout(timeout);
            this.terminate();
            reject(new PythonProcessError('INVALID_RESPONSE', 'Phản hồi khởi động không phải JSON hợp lệ.'));
          }
        };
        this.readline.on('line', onStartupLine);

        this.child.on('error', (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            this.terminate();
            reject(
              new PythonProcessError(
                'SANDBOX_UNAVAILABLE',
                `Không thể khởi chạy môi trường bot: ${err instanceof Error ? err.message : String(err)}. Kiểm tra Docker/image hoặc PYTHON_CMD.`,
              ),
            );
          }
        });

        this.child.on('exit', (code) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            this.terminate();
            reject(
              new PythonProcessError(
                !local && (code === 125 || code === 126 || code === 127) ? 'SANDBOX_UNAVAILABLE' : 'CRASH',
                `Tiến trình bot thoát sớm với mã lỗi ${code}. ${this.stderr}`,
              ),
            );
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        this.terminate();
        reject(
          new PythonProcessError(
            'CRASH',
            `Lỗi tạo tiến trình: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  /**
   * Gửi trạng thái bàn cờ qua stdin và đợi nước đi qua stdout với timeout (mặc định 1 giây).
   */
  async requestMove(state: PythonBotState, wallMs = 1000): Promise<{ from: string; to: string }> {
    if (this.isTerminated || !this.child || !this.readline) {
      throw new PythonProcessError('CRASH', 'Tiến trình bot đã bị đóng hoặc sập.');
    }

    return new Promise<{ from: string; to: string }>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          this.terminate();
          reject(
            new PythonProcessError('MOVE_TIMEOUT', `Bot chạy quá thời gian suy nghĩ cho phép (${wallMs}ms).`),
          );
        }
      }, wallMs);

      const onLine = (line: string) => {
        clearTimeout(timer);
        if (done) return;
        done = true;
        this.child?.removeListener('exit', onExit);

        try {
          const res = JSON.parse(line);
          if (
            res.status === 'OK' &&
            res.move &&
            typeof res.move.from === 'string' &&
            typeof res.move.to === 'string'
          ) {
            resolve({ from: res.move.from, to: res.move.to });
          } else if (res.status === 'CPU_TIMEOUT') {
            reject(new PythonProcessError('MOVE_TIMEOUT', res.message));
          } else if (res.status === 'ERROR') {
            reject(
              new PythonProcessError('CRASH', `${res.message || 'Lỗi thực thi trong bot.'} ${this.stderr}`),
            );
          } else {
            reject(
              new PythonProcessError(
                'INVALID_RESPONSE',
                'Bot trả về cấu trúc nước đi không đúng chuẩn {from, to}.',
              ),
            );
          }
        } catch {
          reject(
            new PythonProcessError('INVALID_RESPONSE', 'Dữ liệu nước đi của bot không phải JSON hợp lệ.'),
          );
        }
      };

      const onExit = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.readline?.removeListener('line', onLine);
        reject(
          new PythonProcessError('CRASH', `Tiến trình bot đã thoát khi đang tính nước đi. ${this.stderr}`),
        );
      };
      this.child!.once('exit', onExit);
      this.readline!.once('line', onLine);

      try {
        const payload = JSON.stringify(state) + '\n';
        this.child!.stdin!.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.terminate();
        reject(
          new PythonProcessError(
            'CRASH',
            `Không thể gửi dữ liệu cho bot: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  /**
   * Đóng dọn dẹp an toàn tiến trình bot và xóa thư mục tạm.
   */
  terminate(): void {
    if (this.isTerminated) return;
    this.isTerminated = true;

    try {
      if (this.child && !this.child.killed) {
        this.child.stdin?.write('QUIT\n');
        this.child.kill('SIGTERM');
        setTimeout(() => {
          if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL');
        }, 500);
      }
    } catch {
      // bỏ qua lỗi kill
    }

    this.watchdog?.kill();
    this.watchdog = null;
    if (this.containerName) {
      const cleanup = spawn(process.env.BOT_CONTAINER_CMD || 'docker', ['rm', '-f', this.containerName], {
        stdio: 'ignore',
      });
      cleanup.on('error', () => undefined);
      this.containerName = null;
    }
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.tempDir) {
      const dir = this.tempDir;
      this.tempDir = null;
      rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
