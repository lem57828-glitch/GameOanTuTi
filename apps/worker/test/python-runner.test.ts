import { describe, expect, it } from 'vitest';
import type { GameRequest } from '@arena/contracts';
import { PythonBotProcess } from '../src/runner/python-process.js';
import { SandboxGameRunner } from '../src/runner/sandbox-game-runner.js';

describe('Gói việc 3 — Sandbox cách ly & Runner Python (TV2)', () => {
  it('khởi động bot Python hợp lệ, gửi state và nhận lại nước đi qua stdin/stdout', async () => {
    const validBotCode = `
def make_move(state):
    # Chọn nước đi hợp lệ đầu tiên mà Trọng tài gợi ý
    moves = state.get("legal_moves", [])
    if moves:
        return moves[0]
    return {"from": "A2", "to": "A3"}
`;

    const proc = new PythonBotProcess({
      sourceCode: validBotCode,
      startupMs: 3000,
      wallMsPerMove: 1000,
    });

    await proc.start();

    // Giả lập gửi trạng thái bàn cờ
    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'A2', to: 'A3', capture: null }],
      last_move: null,
    };

    const move = await proc.requestMove(dummyState, 1000);
    expect(move).toEqual({ from: 'A2', to: 'A3' });

    proc.terminate();
  });

  it('bắt lỗi và xử thua khi bot thiếu hàm make_move', async () => {
    const brokenCode = `
# Bot không hề có hàm make_move
def some_other_func():
    pass
`;

    const proc = new PythonBotProcess({
      sourceCode: brokenCode,
      startupMs: 2000,
    });

    await expect(proc.start()).rejects.toThrow('Bot không có hàm make_move');
  });

  it('bắt lỗi timeout khi bot chạy vòng lặp vô tận (while True)', async () => {
    const infiniteLoopBot = `
import time

def make_move(state):
    # Cố tình chạy vòng lặp vô tận làm đơ máy
    while True:
        time.sleep(0.1)
`;

    const proc = new PythonBotProcess({
      sourceCode: infiniteLoopBot,
      startupMs: 3000,
    });

    await proc.start();

    const dummyState: any = {
      my_side: 'blue',
      turn: 1,
      ply: 0,
      board: {},
      pieces_left: { blue: 10, pink: 10 },
      legal_moves: [{ from: 'A2', to: 'A3', capture: null }],
    };

    // Chờ 300ms xem có bị ngắt không
    await expect(proc.requestMove(dummyState, 300)).rejects.toThrow(/quá thời gian suy nghĩ/);
    proc.terminate();
  });

  it('SandboxGameRunner chạy trận đấu giữa Bot Python thật và Bot mô phỏng', async () => {
    const smartBotPython = `
def make_move(state):
    moves = state["legal_moves"]
    # Ưu tiên ăn quân
    for m in moves:
        if m.get("capture"):
            return m
    return moves[0]
`;

    const runner = new SandboxGameRunner(async (botId) => {
      if (botId === 'bot_python_real') {
        return { isDemo: false, sourceCode: smartBotPython };
      }
      return { isDemo: true, demoPolicy: 'greedy' };
    });

    const mockRequest: GameRequest = {
      contractVersion: 1,
      requestKey: 'test-req-sandbox-1',
      gameId: 'game_sandbox_1',
      choices: {
        blue: { botVersionId: 'bot_python_real', extraType: 'PAPER' },
        pink: { botVersionId: 'bot_demo_pink', extraType: 'PAPER' },
      },
      rulesetId: 'standard-32-4',
      seed: 42,
      limits: {
        cpuMsPerMove: 200,
        wallMsPerMove: 1000,
        startupMs: 3000,
        maxPlies: 20, // chạy ngắn 20 nước để test nhanh
        maxErrorsPerGame: 3,
      },
    };

    const movesRecorded: any[] = [];
    const outcome = await runner.run(mockRequest, async (move) => {
      movesRecorded.push(move);
    });

    expect(outcome).toBeDefined();
    expect(outcome.plies).toBeGreaterThan(0);
    expect(movesRecorded.length).toBe(outcome.plies);
  });
});
