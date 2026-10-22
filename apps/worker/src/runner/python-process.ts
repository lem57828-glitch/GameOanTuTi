// TV2 — Gói việc 3: Quản lý tiến trình Python trong Sandbox cách ly (Process Sandbox)
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { PythonBotState } from '@arena/game-engine';

export interface PythonProcessOptions {
  sourceCode: string;
  startupMs?: number;
  wallMsPerMove?: number;
  pythonCmd?: string;
}

export type ProcessErrorType = 'STARTUP_TIMEOUT' | 'STARTUP_ERROR' | 'MOVE_TIMEOUT' | 'CRASH' | 'INVALID_RESPONSE';

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
        move = bot.make_move(state)
        print(json.dumps({"status": "OK", "move": move}), flush=True)
    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": f"Lỗi thực thi make_move: {str(e)}"}), flush=True)
`;

export class PythonBotProcess {
  private child: ChildProcess | null = null;
  private readline: Interface | null = null;
  private tempDir: string | null = null;
  private isTerminated = false;

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
    const pythonCmd = this.opts.pythonCmd ?? 'python';

    this.tempDir = await mkdtemp(join(tmpdir(), 'arena-bot-'));
    await writeFile(join(this.tempDir, 'bot.py'), this.opts.sourceCode, 'utf8');
    await writeFile(join(this.tempDir, 'runner.py'), RUNNER_SCRIPT, 'utf8');

    // Chỉ truyền các biến môi trường thiết yếu của hệ thống, tuyệt đối chặn secret DB / Redis
    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      HOMEPATH: process.env.HOMEPATH,
      USERPROFILE: process.env.USERPROFILE,
      PYTHONUNBUFFERED: '1',
    };

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.terminate();
          reject(new PythonProcessError('STARTUP_TIMEOUT', `Bot không khởi động xong trong ${startupMs}ms.`));
        }
      }, startupMs);

      try {
        this.child = spawn(pythonCmd, ['runner.py'], {
          cwd: this.tempDir!,
          env: safeEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.readline = createInterface({ input: this.child.stdout! });

        this.readline.once('line', (line) => {
          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;
          try {
            const res = JSON.parse(line);
            if (res.status === 'READY') {
              resolve();
            } else {
              this.terminate();
              reject(new PythonProcessError('STARTUP_ERROR', res.message || 'Lỗi khởi động bot.'));
            }
          } catch {
            this.terminate();
            reject(new PythonProcessError('INVALID_RESPONSE', 'Phản hồi khởi động không phải JSON hợp lệ.'));
          }
        });

        this.child.on('error', (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            this.terminate();
            reject(new PythonProcessError('CRASH', `Không thể khởi chạy tiến trình Python: ${err.message}`));
          }
        });

        this.child.on('exit', (code) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            this.terminate();
            reject(new PythonProcessError('CRASH', `Tiến trình bot thoát sớm với mã lỗi ${code}.`));
          }
        });
      } catch (err: any) {
        clearTimeout(timeout);
        this.terminate();
        reject(new PythonProcessError('CRASH', `Lỗi tạo tiến trình: ${err.message}`));
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
          reject(new PythonProcessError('MOVE_TIMEOUT', `Bot chạy quá thời gian suy nghĩ cho phép (${wallMs}ms).`));
        }
      }, wallMs);

      const onLine = (line: string) => {
        clearTimeout(timer);
        if (done) return;
        done = true;

        try {
          const res = JSON.parse(line);
          if (res.status === 'OK' && res.move && typeof res.move.from === 'string' && typeof res.move.to === 'string') {
            resolve({ from: res.move.from, to: res.move.to });
          } else if (res.status === 'ERROR') {
            reject(new PythonProcessError('CRASH', res.message || 'Lỗi thực thi trong bot.'));
          } else {
            reject(new PythonProcessError('INVALID_RESPONSE', 'Bot trả về cấu trúc nước đi không đúng chuẩn {from, to}.'));
          }
        } catch {
          reject(new PythonProcessError('INVALID_RESPONSE', 'Dữ liệu nước đi của bot không phải JSON hợp lệ.'));
        }
      };

      this.readline!.once('line', onLine);

      try {
        const payload = JSON.stringify(state) + '\n';
        this.child!.stdin!.write(payload);
      } catch (err: any) {
        clearTimeout(timer);
        this.terminate();
        reject(new PythonProcessError('CRASH', `Không thể gửi dữ liệu cho bot: ${err.message}`));
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
          if (this.child && !this.child.killed) this.child.kill('SIGKILL');
        }, 500);
      }
    } catch {
      // bỏ qua lỗi kill
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
