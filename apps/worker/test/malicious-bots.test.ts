import { beforeAll, afterAll } from 'vitest';
const previousMode = process.env.BOT_SANDBOX_MODE;
beforeAll(() => {
  process.env.BOT_SANDBOX_MODE = 'trusted-local';
});
afterAll(() => {
  if (previousMode === undefined) delete process.env.BOT_SANDBOX_MODE;
  else process.env.BOT_SANDBOX_MODE = previousMode;
});
import { describe, expect, it } from 'vitest';
import type { GameRequest } from '@arena/contracts';
import { PythonBotProcess } from '../src/runner/python-process.js';
import { SandboxGameRunner } from '../src/runner/sandbox-game-runner.js';

describe('Gói việc 5 — Bộ test Bot độc hại & An ninh Sandbox (TV2)', () => {
  it('Kịch bản 1: Bot cố tình đọc trộm biến môi trường (Database/Redis secrets)', async () => {
    // Bot hacker cố tình đọc sạch os.environ để tìm mật khẩu DB hoặc biến nhạy cảm
    const envStealerBot = `
import os

def make_move(state):
    # Cố tình quét các biến môi trường nhạy cảm
    leaked = []
    for key in ["DATABASE_URL", "REDIS_URL", "SESSION_SECRET"]:
        if key in os.environ:
            leaked.append(key)
    if leaked:
        # Nếu đọc trộm được thì báo lỗi lộ bí mật
        raise RuntimeError(f"HACK_SUCCESS: Lộ biến môi trường: {','.join(leaked)}")
    moves = state.get("legal_moves", [])
    return moves[0] if moves else {"from": "B2", "to": "B3"}
`;

    const proc = new PythonBotProcess({
      sourceCode: envStealerBot,
      startupMs: 3000,
      wallMsPerMove: 1000,
    });

    await proc.start();

    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'B2', to: 'B3', capture: null }],
    };

    // Bot chạy bình thường vì env đã được tẩy trùng sạch (sanitized), không lộ secret nào!
    const move = await proc.requestMove(dummyState, 1000);
    expect(move).toEqual({ from: 'B2', to: 'B3' });

    proc.terminate();
  });

  it('Kịch bản 2: Bot in rác phá hoại stdout (Polluted Stdout) bị bắt lỗi định dạng', async () => {
    // Bot cố tình in hàng loạt text rác lung tung vào stdout trước khi trả kết quả
    const noisyBot = `
import sys

def make_move(state):
    print("RÁC 123456789 !!! WARNING !!!")
    print("MÃ ĐỘC PHÁ HOẠI TIẾN TRÌNH...")
    moves = state.get("legal_moves", [])
    return moves[0] if moves else {"from": "B2", "to": "B3"}
`;

    const proc = new PythonBotProcess({
      sourceCode: noisyBot,
      startupMs: 3000,
      wallMsPerMove: 1000,
    });

    await proc.start();

    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'B2', to: 'B3', capture: null }],
    };

    // Khi bot in rác ra stdout thay vì JSON hợp lệ, Sandbox phải tóm ngay lỗi INVALID_RESPONSE
    await expect(proc.requestMove(dummyState, 1000)).rejects.toThrow(/không phải JSON hợp lệ/);

    proc.terminate();
  });

  it('Kịch bản 3: Bot gây crash tiến trình (Chia cho 0 / Lỗi cú pháp)', async () => {
    const crashingBot = `
def make_move(state):
    # Cố tình gây lỗi chia cho 0
    x = 100 / 0
    return {"from": "B2", "to": "B3"}
`;

    const proc = new PythonBotProcess({
      sourceCode: crashingBot,
      startupMs: 3000,
      wallMsPerMove: 1000,
    });

    await proc.start();

    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'B2', to: 'B3', capture: null }],
    };

    // Worker Sandbox phải tóm được lỗi division by zero và ném ngoại lệ rõ ràng
    await expect(proc.requestMove(dummyState, 1000)).rejects.toThrow(/division by zero/);

    proc.terminate();
  });

  it('Kịch bản 4: Bot lặp vô tận câu giờ (Timeout)', async () => {
    const infiniteLoopBot = `
import time

def make_move(state):
    # Treo cứng 10 giây
    time.sleep(10)
    return {"from": "B2", "to": "B3"}
`;

    const proc = new PythonBotProcess({
      sourceCode: infiniteLoopBot,
      startupMs: 3000,
      wallMsPerMove: 500, // giới hạn 500ms
    });

    await proc.start();

    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'B2', to: 'B3', capture: null }],
    };

    // Sandbox kích hoạt timer và bắn hạ bot sau 500ms
    await expect(proc.requestMove(dummyState, 500)).rejects.toThrow(/quá thời gian suy nghĩ/);

    proc.terminate();
  });

  it('Kịch bản 5: Đấu thật trọn vẹn — Bot độc hại tự crash sẽ bị xử thua ngay lập tức', async () => {
    const maliciousCrashingCode = `
def make_move(state):
    # Nước thứ 2 sẽ tự nổ tung
    if state["turn"] >= 2:
        raise Exception("BOOM! Bot nổ tung!")
    return state["legal_moves"][0]
`;

    const runner = new SandboxGameRunner(async (botId) => {
      if (botId === 'bot_malicious') {
        return { isDemo: false, sourceCode: maliciousCrashingCode };
      }
      return { isDemo: true, demoPolicy: 'random' };
    });

    const mockRequest: GameRequest = {
      contractVersion: 1,
      requestKey: 'test-req-malicious-match',
      gameId: 'game_malicious_1',
      choices: {
        blue: { botVersionId: 'bot_malicious', extraType: 'PAPER' },
        pink: { botVersionId: 'bot_demo_pink', extraType: 'PAPER' },
      },
      rulesetId: 'standard-32-4',
      seed: 12345,
      limits: {
        cpuMsPerMove: 200,
        wallMsPerMove: 1000,
        startupMs: 3000,
        maxPlies: 50,
        maxErrorsPerGame: 3,
      },
    };

    const outcome = await runner.run(mockRequest, async () => {});

    // Kết quả: Bot Xanh tự nổ nên Hồng thắng ngay lập tức do lỗi crash!
    expect(outcome.winner).toBe('pink');
    expect(outcome.reason).toBe('crash');
  });
});
