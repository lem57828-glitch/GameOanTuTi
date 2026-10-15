// Hàng đợi tác vụ trong CSDL. Worker có thể chạy chung web hoặc tách máy (cùng tệp CSDL / ổ chia sẻ).
const os = require('node:os');
const db = require('../db');
const config = require('../config');

const PRIORITY = { official: 0, validate: 1, practice: 2 };
const STALE_MS = 60_000;

function enqueue(type, refId, priority) {
  return db.run('INSERT INTO jobs (type, ref_id, priority) VALUES (?,?,?)', type, refId, priority).lastInsertRowid;
}

function claim(workerId) {
  return db.get(`UPDATE jobs SET status = 'running', worker = ?, heartbeat_at = ?, attempts = attempts + 1
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY priority, id LIMIT 1)
    RETURNING *`, workerId, Date.now());
}

/** Tác vụ "running" mất nhịp tim (worker bị tắt giữa trận) được đưa lại hàng đợi. Kết quả không cộng trùng vì trận chỉ có một kết quả. */
function recoverStale() {
  const r = db.run(`UPDATE jobs SET status = 'queued', worker = NULL WHERE status = 'running' AND heartbeat_at < ?`, Date.now() - STALE_MS);
  if (r.changes) {
    db.run(`UPDATE runs SET status = 'abandoned', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE status = 'running' AND match_id IN (SELECT ref_id FROM jobs WHERE type = 'match' AND status = 'queued')`);
    db.run(`UPDATE matches SET status = 'queued' WHERE status = 'running'
      AND id IN (SELECT ref_id FROM jobs WHERE type = 'match' AND status = 'queued')`);
  }
  return r.changes;
}

function stats() {
  const rows = db.all(`SELECT priority, status, COUNT(*) AS n FROM jobs WHERE status IN ('queued','running') GROUP BY priority, status`);
  const out = { queued: { official: 0, validate: 0, practice: 0 }, running: 0 };
  const name = Object.fromEntries(Object.entries(PRIORITY).map(([k, v]) => [v, k]));
  for (const r of rows) {
    if (r.status === 'running') out.running += r.n;
    else out.queued[name[r.priority]] += r.n;
  }
  return out;
}

class Worker {
  constructor(handlers, concurrency = config.CONCURRENCY) {
    this.handlers = handlers;
    this.concurrency = concurrency;
    this.active = 0;
    this.id = `${os.hostname()}:${process.pid}`;
    this.stopped = false;
  }

  start() {
    recoverStale();
    // Lỗi tạm thời (ví dụ CSDL đang bận) trong tác vụ định kỳ chỉ ghi log, không làm sập cả máy chủ.
    const safe = (name, fn) => () => { try { fn(); } catch (e) { console.error(`[worker] ${name} lỗi:`, e.message); } };
    this.tick = setInterval(safe('nhận việc', () => this.fill()), 500);
    this.beat = setInterval(safe('nhịp tim', () => {
      db.run(`UPDATE jobs SET heartbeat_at = ? WHERE status = 'running' AND worker = ?`, Date.now(), this.id);
      recoverStale();
    }), 5000);
    this.fill();
    return this;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.tick);
    clearInterval(this.beat);
  }

  fill() {
    while (!this.stopped && this.active < this.concurrency) {
      const job = claim(this.id);
      if (!job) return;
      this.active++;
      this.process(job).finally(() => {
        this.active--;
        try { this.fill(); } catch (e) { console.error('[worker] nhận việc lỗi:', e.message); }
      });
    }
  }

  async process(job) {
    try {
      await this.handlers[job.type](job, this.id);
      db.run(`UPDATE jobs SET status = 'done', error = NULL WHERE id = ?`, job.id);
    } catch (e) {
      console.error(`[worker] job ${job.id} lỗi:`, e);
      const retry = job.attempts < 3;
      db.run(`UPDATE jobs SET status = ?, error = ?, worker = NULL WHERE id = ?`, retry ? 'queued' : 'failed', String(e.message || e), job.id);
      if (!retry && this.handlers.onFail) this.handlers.onFail(job, e);
    }
  }

  /** Chờ hàng đợi rỗng (dùng cho demo và kiểm thử). */
  async drain() {
    for (;;) {
      this.fill();
      const left = db.get(`SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')`).n;
      if (!left && !this.active) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

module.exports = { enqueue, claim, recoverStale, stats, Worker, PRIORITY };
