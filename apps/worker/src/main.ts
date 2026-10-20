// Worker Bot Arena: nhận job từ BullMQ, chạy ván qua GameRunner, lưu sự kiện/kết quả vào PostgreSQL,
// báo API qua Redis pub/sub, gửi heartbeat để trang BTC biết worker còn sống.
import { PrismaClient } from '@prisma/client';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueJobData, redisKeys } from '@arena/contracts';
import { loadConfig } from './config.js';
import { GameProcessor, LeaseBusyError } from './process-game.js';
import { PermanentRunError } from './runner/game-runner.js';
import { SimulatedRunner } from './runner/simulated-runner.js';

const cfg = loadConfig();
const keys = redisKeys(cfg.queuePrefix);
const log = (msg: string) => console.log(`[worker ${cfg.workerId}] ${new Date().toISOString()} ${msg}`);

const prisma = new PrismaClient();
const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
const bullConnection = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
for (const c of [redis, bullConnection]) c.on('error', (e) => log(`Redis lỗi: ${e.message}`));

const runner = new SimulatedRunner(async (botVersionId) => {
  const bot = await prisma.botVersion.findUnique({
    where: { id: botVersionId },
    select: { demoPolicy: true, status: true },
  });
  return bot && bot.status === 'valid' ? bot.demoPolicy : null;
});

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

const worker = new Worker<QueueJobData>(
  keys.gameQueue,
  async (job: Job<QueueJobData>) => {
    const parsed = QueueJobData.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload hàng đợi không hợp lệ.');
    log(`Nhận job ${parsed.data.jobId} (${parsed.data.requestKey}), lần giao ${job.attemptsMade + 1}.`);
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
  if (final)
    void processor.markFailed(job.data, err.message).catch((e: Error) => log(`markFailed lỗi: ${e.message}`));
});
worker.on('error', (e) => log(`BullMQ lỗi: ${e.message}`));

// ---- Heartbeat.
const beat = () =>
  redis
    .set(
      keys.workerHeartbeat,
      JSON.stringify({ workerId: cfg.workerId, at: new Date().toISOString() }),
      'PX',
      10_000,
    )
    .catch((e: Error) => log(`heartbeat lỗi: ${e.message}`));
void beat();
const heartbeat = setInterval(beat, 3_000);

log(
  `Sẵn sàng: hàng đợi ${cfg.queuePrefix}:${keys.gameQueue}, concurrency ${cfg.concurrency}, runner mô phỏng.`,
);

async function shutdown(signal: string): Promise<void> {
  log(`Nhận ${signal}, dừng worker...`);
  clearInterval(heartbeat);
  await worker.close();
  await redis.del(keys.workerHeartbeat).catch(() => undefined);
  redis.disconnect();
  bullConnection.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
