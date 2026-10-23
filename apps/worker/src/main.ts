import { validateBot } from './validate-bot.js';
// Worker Bot Arena: nhận job từ BullMQ, chạy ván qua GameRunner, lưu sự kiện/kết quả vào PostgreSQL,
// báo API qua Redis pub/sub, gửi heartbeat để trang BTC biết worker còn sống.
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueJobData, redisKeys } from '@arena/contracts';
import { loadConfig } from './config.js';
import { GameProcessor, LeaseBusyError } from './process-game.js';
import { PermanentRunError } from './runner/game-runner.js';
import { SandboxGameRunner } from './runner/sandbox-game-runner.js';
import { TestRunProcessor } from './test-run-processor.js';

const cfg = loadConfig();
const keys = redisKeys(cfg.queuePrefix);
const log = (msg: string) => console.log(`[worker ${cfg.workerId}] ${new Date().toISOString()} ${msg}`);

// Fail at startup instead of accepting submitted bots into a broken runtime.
try {
  if (cfg.sandboxMode === 'trusted-local') {
    execFileSync(
      process.env.PYTHON_CMD || 'python',
      ['-I', '-c', 'import sys; assert sys.version_info >= (3, 10)'],
      {
        timeout: 5000,
        stdio: 'pipe',
      },
    );
    log('Chế độ demo trusted-local: bot mẫu và bot Python nộp đều chạy được; chỉ dùng mã tin cậy của nhóm.');
  } else {
    execFileSync(process.env.BOT_CONTAINER_CMD || 'docker', ['info'], { timeout: 10_000, stdio: 'pipe' });
    execFileSync(
      process.env.BOT_CONTAINER_CMD || 'docker',
      ['image', 'inspect', process.env.BOT_SANDBOX_IMAGE || 'python:3.13-slim'],
      {
        timeout: 5000,
        stdio: 'pipe',
      },
    );
    log('Môi trường Docker chạy bot đã sẵn sàng.');
  }
} catch {
  throw new Error(
    cfg.sandboxMode === 'trusted-local'
      ? 'Không tìm thấy Python >= 3.10. Kiểm tra PYTHON_CMD rồi khởi động lại worker.'
      : 'Docker/image chưa sẵn sàng. Bật Docker và tải image; demo local có thể cấu hình BOT_SANDBOX_MODE=trusted-local.',
  );
}

const prisma = new PrismaClient();
const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
const bullConnection = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
for (const c of [redis, bullConnection]) c.on('error', (e) => log(`Redis lỗi: ${e.message}`));

// Khởi tạo Runner Sandbox hỗ trợ cả bot mô phỏng M0 và bot Python thật (TV2 - Gói 3)
const resolveBot = async (botVersionId: string, allowPending = false) => {
  if (botVersionId.startsWith('demo:')) {
    const policy = botVersionId.replace('demo:', '');
    return {
      isDemo: true,
      demoPolicy: policy,
      sourceCode: null,
    };
  }

  const bot = await prisma.botVersion.findUnique({
    where: { id: botVersionId },
    select: { isDemo: true, demoPolicy: true, sourceCode: true, status: true },
  });
  if (!bot || (bot.status !== 'valid' && !(allowPending && bot.status === 'pending'))) return null;
  return {
    isDemo: bot.isDemo,
    demoPolicy: bot.demoPolicy,
    sourceCode: bot.sourceCode,
  };
};
const runner = new SandboxGameRunner(resolveBot);
const validationRunner = new SandboxGameRunner((id) => resolveBot(id, true));

const processor = new GameProcessor({
  prisma,
  runner,
  workerId: cfg.workerId,
  leaseMs: cfg.leaseMs,
  moveDelayMs: cfg.moveDelayMs,
  log,
  signal: async (roomId, gameId) => {
    // Tín hiệu chỉ là "có dữ liệu mới"; mất tín hiệu thì người xem vẫn tải được snapshot từ API.
    await redis
      .publish(keys.roomSignals, JSON.stringify({ roomId, gameId }))
      .catch((e: Error) => log(`publish lỗi: ${e.message}`));
  },
});

const testRunProcessor = new TestRunProcessor({
  prisma,
  runner,
  log,
});

const worker = new Worker<QueueJobData>(
  keys.gameQueue,
  async (job: Job<QueueJobData>) => {
    const parsed = QueueJobData.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload hàng đợi không hợp lệ.');
    log(
      `Nhận job ${parsed.data.jobId} (${parsed.data.requestKey}, kind=${parsed.data.kind ?? 'game'}), lần giao ${job.attemptsMade + 1}.`,
    );

    if (parsed.data.kind === 'validate_bot') {
      await validateBot(prisma, validationRunner, parsed.data.jobId);
      return { status: 'validated' };
    }
    if (parsed.data.kind === 'test_run') {
      await testRunProcessor.process(parsed.data.jobId);
      return { status: 'succeeded', testRunId: parsed.data.jobId };
    }

    try {
      const out = await processor.process(parsed.data);
      log(`Xong job ${parsed.data.jobId}: ${out.status}, kết quả ${out.resultId}.`);
      return out;
    } catch (e) {
      if (e instanceof PermanentRunError) throw new UnrecoverableError(e.message);
      if (e instanceof LeaseBusyError) log(e.message);
      throw e;
    }
  },
  {
    connection: bullConnection,
    prefix: cfg.queuePrefix,
    concurrency: cfg.concurrency,
    lockDuration: cfg.lockMs,
    stalledInterval: cfg.stalledMs,
    maxStalledCount: 2,
  },
);

worker.on('failed', (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  const final =
    err instanceof UnrecoverableError || err.name === 'UnrecoverableError' || job.attemptsMade >= attempts;
  log(
    `Job ${job.data.jobId} lỗi (lần ${job.attemptsMade}/${attempts}${final ? ', dừng' : ', sẽ thử lại'}): ${err.message}`,
  );
  if (final && job.data.kind === 'validate_bot') {
    void prisma.botVersion
      .updateMany({
        where: { id: job.data.jobId, status: 'pending' },
        data: { validationLog: `Lỗi hạ tầng kiểm thử: ${err.message}. BTC khôi phục job để kiểm thử lại.` },
      })
      .catch((e) => log(String(e)));
    return;
  }
  if (final && job.data.kind === 'test_run') {
    void prisma.botTestRun
      .updateMany({
        where: {
          id: job.data.jobId,
          status: { in: ['queued', 'running'] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { status: 'failed', error: err.message, finishedAt: new Date() },
      })
      .catch((e: Error) => log(e.message));
    return;
  }
  if (final)
    void processor.markFailed(job.data, err.message).catch((e: Error) => log(`markFailed lỗi: ${e.message}`));
});
worker.on('error', (e) => log(`BullMQ lỗi: ${e.message}`));

// ---- Heartbeat.
const beat = async () => {
  try {
    const registry = `${keys.workerHeartbeat}:registry`;
    const times = `${keys.workerHeartbeat}:times`;
    const payload = JSON.stringify({
      workerId: cfg.workerId,
      at: new Date().toISOString(),
      concurrency: cfg.concurrency,
      runtime: cfg.sandboxMode,
    });
    const expired = await redis.zrangebyscore(times, '-inf', Date.now() - 10_000);
    const batch = redis
      .multi()
      .set(keys.workerHeartbeat, payload, 'PX', 10_000)
      .hset(registry, cfg.workerId, payload)
      .zadd(times, Date.now(), cfg.workerId);
    if (expired.length) batch.hdel(registry, ...expired).zrem(times, ...expired);
    await batch.exec();
  } catch (e) {
    log(`heartbeat lỗi: ${String(e)}`);
  }
};
void beat();
const heartbeat = setInterval(beat, 3_000);

log(
  `Sẵn sàng: hàng đợi ${cfg.queuePrefix}:${keys.gameQueue}, concurrency ${cfg.concurrency}, runner sandbox Python.`,
);

async function shutdown(signal: string): Promise<void> {
  log(`Nhận ${signal}, đang dừng worker...`);
  clearInterval(heartbeat);
  await worker.close();
  await Promise.all([redis.quit(), bullConnection.quit(), prisma.$disconnect()]);
  log('Đã dừng an toàn.');
  process.exit(0);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void shutdown(sig));
}
