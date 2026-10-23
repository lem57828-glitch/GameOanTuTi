// TV2 — Gói việc 5: Script đo lường tải & Benchmark Worker Sandbox
import { performance } from 'node:perf_hooks';
import type { GameRequest } from '@arena/contracts';
import { SandboxGameRunner } from './runner/sandbox-game-runner.js';

async function runBenchmark(numMatches = 5) {
  console.log('================================================================');
  console.log('   BẮT ĐẦU BENCHMARK NĂNG LỰC XỬ LÝ WORKER SANDBOX (TV2)');
  console.log(`   Số lượng ván đấu mô phỏng: ${numMatches} ván`);
  console.log('================================================================\n');

  // Khởi tạo Runner với 2 bot Python thực tế
  const samplePythonBot = `
def make_move(state):
    moves = state["legal_moves"]
    for m in moves:
        if m.get("capture"):
            return m
    return moves[0]
`;

  const runner = new SandboxGameRunner(async (_id) => ({
    isDemo: false,
    sourceCode: samplePythonBot,
  }));

  let totalPlies = 0;
  const matchTimes: number[] = [];

  const overallStart = performance.now();

  for (let i = 1; i <= numMatches; i++) {
    const request: GameRequest = {
      contractVersion: 1,
      requestKey: `benchmark-req-${i}`,
      gameId: `benchmark-game-${i}`,
      choices: {
        blue: { botVersionId: `bot_bench_blue_${i}`, extraType: 'PAPER' },
        pink: { botVersionId: `bot_bench_pink_${i}`, extraType: 'PAPER' },
      },
      rulesetId: 'standard-32-4',
      seed: 1000 + i,
      limits: {
        cpuMsPerMove: 200,
        wallMsPerMove: 1000,
        startupMs: 3000,
        maxPlies: 60, // Giới hạn 60 nước mỗi ván
        maxErrorsPerGame: 3,
      },
    };

    const matchStart = performance.now();
    let pliesInMatch = 0;

    const outcome = await runner.run(request, async () => {
      pliesInMatch++;
    });

    const matchDuration = performance.now() - matchStart;
    matchTimes.push(matchDuration);
    totalPlies += outcome.plies;

    console.log(
      `[Ván ${i}/${numMatches}] Hoàn thành: ${outcome.plies} nước | Thời gian: ${matchDuration.toFixed(1)}ms | Lý do: ${outcome.reason} | Thắng: ${outcome.winner ?? 'Hòa'}`,
    );
  }

  const overallDuration = performance.now() - overallStart;
  const avgMatchTime = matchTimes.reduce((a, b) => a + b, 0) / matchTimes.length;
  const avgTimePerPly = overallDuration / totalPlies;
  const matchesPerMinute = (60000 / avgMatchTime).toFixed(1);

  console.log('\n================== KẾT QUẢ BENCHMARK ==================');
  console.log(`• Tổng thời gian thực thi: ${(overallDuration / 1000).toFixed(2)}s`);
  console.log(`• Tổng số nước đi đã xử lý: ${totalPlies} nước`);
  console.log(`• Thời gian trung bình / ván: ${avgMatchTime.toFixed(1)}ms`);
  console.log(`• Độ trễ trung bình / nước đi (Latency per move): ${avgTimePerPly.toFixed(2)}ms`);
  console.log(`• Năng lực 1 Worker: ~${matchesPerMinute} ván/phút (với 1 luồng concurrency)`);
  console.log(`• Năng lực CỤM 4 LAPTOP (x4 Throughput): ~${(Number(matchesPerMinute) * 4).toFixed(0)} ván/phút`);
  console.log('========================================================\n');
}

void runBenchmark(3);
