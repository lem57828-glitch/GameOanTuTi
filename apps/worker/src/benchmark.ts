import { performance } from 'node:perf_hooks';
import { cpus, hostname, totalmem } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { STANDARD_LIMITS, STANDARD_RULESET_ID } from '@arena/game-engine';
import { SandboxGameRunner } from './runner/sandbox-game-runner.js';

const samples = Number(process.env.BENCHMARK_SAMPLES ?? 4);
if (!Number.isInteger(samples) || samples < 2 || samples > 100)
  throw new Error('BENCHMARK_SAMPLES must be 2..100');
const bot = `def make_move(state):
    moves = state['legal_moves']
    for move in moves:
        if move.get('capture'): return move
    return moves[0]
`;
const runner = new SandboxGameRunner(async () => ({ isDemo: false, sourceCode: bot }));
const results = [];
for (const concurrency of [1, 2]) {
  let cursor = 0;
  let plies = 0;
  const durations: number[] = [];
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= samples) break;
        const began = performance.now();
        const result = await runner.run(
          {
            contractVersion: 1,
            requestKey: `bench:${concurrency}:${i}`,
            gameId: `bench-${i}`,
            rulesetId: STANDARD_RULESET_ID,
            choices: {
              blue: { botVersionId: 'bench-blue', extraType: 'PAPER' },
              pink: { botVersionId: 'bench-pink', extraType: 'SCISSORS' },
            },
            seed: 1000 + i,
            limits: STANDARD_LIMITS,
          },
          async () => {},
        );
        if (['crash', 'timeout', 'errors'].includes(result.reason))
          throw new Error(`Benchmark bot failed: ${result.reason}: ${result.logs}`);
        plies += result.plies;
        durations.push(performance.now() - began);
      }
    }),
  );
  const elapsedMs = performance.now() - start;
  durations.sort((a, b) => a - b);
  results.push({
    concurrency,
    samples,
    maxPlies: STANDARD_LIMITS.maxPlies,
    plies,
    elapsedMs,
    meanMs: durations.reduce((a, b) => a + b, 0) / samples,
    p95Ms: durations[Math.ceil(samples * 0.95) - 1],
    gamesPerMinute: (samples * 60000) / elapsedMs,
  });
}
const report = {
  measuredAt: new Date().toISOString(),
  hostname: hostname(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  hostRamBytes: totalmem(),
  runtime: process.env.BOT_CONTAINER_CMD ?? 'docker',
  image: process.env.BOT_SANDBOX_IMAGE ?? 'python:3.13-slim',
  mode: process.env.BOT_SANDBOX_MODE ?? 'docker',
  workload:
    'Two persistent greedy Python bots, full standard rules, independent extra types. Runner-only measurement; excludes queue/database/network. No multi-machine extrapolation.',
  results,
};
const output = resolve(process.env.BENCHMARK_OUTPUT ?? 'benchmark-report.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`Saved ${output}`);
