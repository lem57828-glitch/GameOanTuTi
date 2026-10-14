// Một tiến trình bot: khởi động harness, gửi trạng thái từng lượt, nhận lựa chọn trong giới hạn thời gian.
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const config = require('../config');

const HOST = path.join(__dirname, 'bot_host.py');

function command(botPath) {
  if (config.SANDBOX === 'docker') {
    const dir = path.dirname(botPath);
    return {
      cmd: 'docker',
      args: ['run', '--rm', '-i', '--network', 'none', `--memory=${config.limits.memoryMb}m`, '--cpus=1',
        '--pids-limit=32', '--read-only', '--tmpfs', '/tmp:size=16m', '--security-opt', 'no-new-privileges',
        '-v', `${HOST}:/arena/bot_host.py:ro`, '-v', `${dir}:/bot:ro`,
        config.DOCKER_IMAGE, 'python', '-I', '/arena/bot_host.py', `/bot/${path.basename(botPath)}`],
    };
  }
  return { cmd: config.PYTHON_BIN, args: ['-I', HOST, botPath] };
}

class BotProcess {
  constructor(botPath, name) {
    this.name = name;
    this.botPath = botPath;
    this.log = '';
    this.dead = false;
    this.deathReason = null;
    this.pending = null;
  }

  appendLog(text) {
    if (this.log.length >= config.limits.logBytes) return;
    this.log += text;
    if (this.log.length >= config.limits.logBytes) this.log = this.log.slice(0, config.limits.logBytes) + '\n[log bị cắt: vượt 1 MB]\n';
  }

  start(init) {
    const { cmd, args } = command(this.botPath);
    this.proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(this.botPath), env: minimalEnv(), windowsHide: true });
    this.proc.stderr.on('data', (d) => this.appendLog(d.toString('utf8')));
    this.proc.stdin.on('error', () => {});
    this.proc.on('error', (e) => this.kill(`Không chạy được bot: ${e.message}`));
    this.proc.on('exit', (code) => {
      if (!this.dead) this.kill(`Bot thoát (mã ${code})`);
    });
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
      const p = this.pending;
      if (!p) return;
      this.pending = null;
      clearTimeout(p.timer);
      try { p.resolve(JSON.parse(line)); } catch { p.resolve({ error: 'Phản hồi sai giao thức' }); }
    });
    this.send({ type: 'init', ...init, cpu_ms: config.limits.cpuMsPerTurn, memory_mb: config.limits.memoryMb });
    return this.receive(config.limits.startupMs, 'Khởi động quá 3 giây').then((msg) => {
      if (msg.type !== 'ready') {
        this.kill(msg.msg || msg.error || 'Khởi động lỗi');
        return false;
      }
      return true;
    });
  }

  send(obj) {
    if (!this.dead) this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  receive(ms, timeoutMsg) {
    if (this.dead) return Promise.resolve({ error: this.deathReason, dead: true });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        resolve({ error: timeoutMsg, timeout: true });
      }, ms);
      this.pending = { resolve, timer };
    });
  }

  /** Trả về { move } hoặc { error, timeout?, dead? }. Hết thời gian chờ thì bot bị dừng vì có thể bị kẹt. */
  async ask(payload) {
    this.send({ type: 'turn', ...payload });
    const res = await this.receive(config.limits.wallMsPerTurn, 'Quá 1 giây chờ');
    if (res.timeout) this.kill('Quá thời gian chờ, bot bị dừng');
    if (typeof res.move === 'string') return { move: res.move.trim().toUpperCase() };
    return res;
  }

  kill(reason) {
    if (this.dead) return;
    this.dead = true;
    this.deathReason = reason;
    this.appendLog(`\n[hệ thống] ${reason}\n`);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ error: reason, dead: true });
      this.pending = null;
    }
    try { this.proc && this.proc.kill('SIGKILL'); } catch { /* đã thoát */ }
  }

  stop() {
    if (this.dead) return;
    this.send({ type: 'end' });
    this.dead = true;
    setTimeout(() => { try { this.proc.kill('SIGKILL'); } catch { /* đã thoát */ } }, 200).unref();
  }
}

// Không truyền bí mật (APP_SECRET...) xuống tiến trình chạy mã thí sinh.
function minimalEnv() {
  const keep = ['PATH', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC', 'LANG'];
  const env = { PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

module.exports = { BotProcess };
