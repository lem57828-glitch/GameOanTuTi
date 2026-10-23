import { describe, expect, it } from 'vitest';
import type { Board } from '@arena/contracts';
import {
  DEMO_RULESET,
  STANDARD_RULESET,
  applyMove,
  checkEnd,
  countPieces,
  createStandardBoard,
  getBoardSignature,
  getRuleset,
  legalMoves,
  newGame,
  replay,
  simulate,
  toPythonState,
  type GameState,
} from '../src/index.js';

const rules = DEMO_RULESET;
const state = (board: Board, toMove: 'blue' | 'pink' = 'blue'): GameState => ({
  rulesetId: rules.id,
  board,
  toMove,
  ply: 0,
  maxPlies: 200,
  history: [],
});

const reserves: Board = {
  A3: { side: 'blue', type: 'ROCK' },
  A4: { side: 'blue', type: 'PAPER' },
  A5: { side: 'blue', type: 'SCISSORS' },
  I7: { side: 'pink', type: 'ROCK' },
  I6: { side: 'pink', type: 'PAPER' },
  I5: { side: 'pink', type: 'SCISSORS' },
};

describe('ruleset demo (tương thích ngược)', () => {
  it('bố trí đối xứng, mỗi bên 10 quân, Xanh đi trước', () => {
    const g = newGame(rules, 200);
    expect(countPieces(g.board)).toEqual({ blue: 10, pink: 10 });
    expect(g.toMove).toBe('blue');
    expect(g.board.B5).toEqual({ side: 'blue', type: 'PAPER' });
    expect(g.board.H5).toEqual({ side: 'pink', type: 'PAPER' });
  });

  it('đi 8 hướng; ăn quân bị khắc; quân mình, cùng loại, quân mạnh hơn chặn đường', () => {
    const s = state({
      ...reserves,
      E5: { side: 'blue', type: 'ROCK' },
      E6: { side: 'pink', type: 'SCISSORS' },
      F6: { side: 'pink', type: 'ROCK' },
      F5: { side: 'pink', type: 'PAPER' },
      D5: { side: 'blue', type: 'PAPER' },
    });
    const moves = Object.fromEntries(
      legalMoves(rules, s)
        .filter((m) => m.from === 'E5')
        .map((m) => [m.to, m.capture]),
    );
    expect(moves.E6).toBe('SCISSORS');
    expect('F6' in moves || 'F5' in moves || 'D5' in moves).toBe(false);
    expect(Object.keys(moves).sort()).toEqual(['D4', 'D6', 'E4', 'E6', 'F4'].sort());
  });

  it('áp nước không sửa trạng thái cũ, từ chối nước sai', () => {
    const g = newGame(rules, 200);
    const out = applyMove(rules, g, { from: 'C5', to: 'D6' });
    expect(out.state.board.D6).toEqual({ side: 'blue', type: 'SCISSORS' });
    expect(g.board.C5).toBeDefined();
    expect(out.state.toMove).toBe('pink');
    expect(() => applyMove(rules, g, { from: 'C5', to: 'E7' })).toThrow(/không hợp lệ/);
    expect(() => applyMove(rules, g, { from: 'H5', to: 'H4' })).toThrow(/không hợp lệ/);
  });

  it('thắng khi tới đích hoặc ăn hết một loại; hết giới hạn nước phân định theo số quân', () => {
    const goal = applyMove(rules, state({ ...reserves, H8: { side: 'blue', type: 'PAPER' } }), {
      from: 'H8',
      to: 'I9',
    });
    expect(goal.end).toEqual({ winner: 'blue', reason: 'goal' });
    const s = state({
      ...reserves,
      E5: { side: 'blue', type: 'ROCK' },
      E6: { side: 'pink', type: 'SCISSORS' },
    });
    delete s.board.I5;
    expect(applyMove(rules, s, { from: 'E5', to: 'E6' }).end).toEqual({
      winner: 'blue',
      reason: 'eliminate',
    });
    const limit = { ...state(reserves), maxPlies: 1 };
    expect(applyMove(rules, limit, { from: 'A3', to: 'B3' }).end).toEqual({
      winner: null,
      reason: 'max_plies',
    });
  });

  it('bên tới lượt hết nước đi thì thua', () => {
    const s = state(
      {
        I1: { side: 'pink', type: 'ROCK' },
        I2: { side: 'blue', type: 'PAPER' },
        H2: { side: 'blue', type: 'ROCK' },
        H1: { side: 'blue', type: 'PAPER' },
        A5: { side: 'blue', type: 'SCISSORS' },
      },
      'pink',
    );
    expect(legalMoves(rules, s, 'pink')).toHaveLength(0);
    const rockOnly = { ...rules, beats: { ROCK: ['SCISSORS'] } as unknown as typeof rules.beats };
    expect(checkEnd(rockOnly, s, 'blue')).toEqual({ winner: 'blue', reason: 'no_moves' });
  });
});

describe('Gói việc 2 — Ruleset chuẩn 32→4 & Luật thi đấu chính thức (TV2)', () => {
  it('bố trí 10 quân xuất phát chuẩn theo hình ảnh: 4 ô trung tâm theo quân thứ 10', () => {
    // Trường hợp 1: Chọn quân thứ 10 là BAO (PAPER) - như trên sơ đồ chốt
    const boardPaper = createStandardBoard('PAPER', 'PAPER');
    expect(countPieces(boardPaper)).toEqual({ blue: 10, pink: 10 });

    // Khối trung tâm Xanh 2x2: B2, C2, B3, C3 là BAO
    expect(boardPaper.B2).toEqual({ side: 'blue', type: 'PAPER' });
    expect(boardPaper.C2).toEqual({ side: 'blue', type: 'PAPER' });
    expect(boardPaper.B3).toEqual({ side: 'blue', type: 'PAPER' });
    expect(boardPaper.C3).toEqual({ side: 'blue', type: 'PAPER' });

    // Hàng 1 (B1, C1, D1) là KÉO
    expect(boardPaper.B1).toEqual({ side: 'blue', type: 'SCISSORS' });
    expect(boardPaper.C1).toEqual({ side: 'blue', type: 'SCISSORS' });
    expect(boardPaper.D1).toEqual({ side: 'blue', type: 'SCISSORS' });

    // Cột A (A2, A3, A4) là BÚA
    expect(boardPaper.A2).toEqual({ side: 'blue', type: 'ROCK' });
    expect(boardPaper.A3).toEqual({ side: 'blue', type: 'ROCK' });
    expect(boardPaper.A4).toEqual({ side: 'blue', type: 'ROCK' });

    // Khối trung tâm Hồng đối xứng tâm: G7, H7, G8, H8 là BAO
    expect(boardPaper.G7).toEqual({ side: 'pink', type: 'PAPER' });
    expect(boardPaper.H7).toEqual({ side: 'pink', type: 'PAPER' });
    expect(boardPaper.G8).toEqual({ side: 'pink', type: 'PAPER' });
    expect(boardPaper.H8).toEqual({ side: 'pink', type: 'PAPER' });

    // Trường hợp 2: Xanh chọn BÚA (ROCK) -> Trung tâm 4 ô là BÚA
    const boardRock = createStandardBoard('ROCK', 'SCISSORS');
    expect(boardRock.B2).toEqual({ side: 'blue', type: 'ROCK' });
    expect(boardRock.C3).toEqual({ side: 'blue', type: 'ROCK' });
    // Hồng chọn KÉO (SCISSORS) -> Trung tâm 4 ô Hồng là KÉO
    expect(boardRock.G7).toEqual({ side: 'pink', type: 'SCISSORS' });
    expect(boardRock.H8).toEqual({ side: 'pink', type: 'SCISSORS' });
  });

  it('phát hiện lặp lại thế cờ lần thứ 3 (Threefold Repetition) và dừng trận', () => {
    const stdRules = getRuleset('standard-32-4');
    let game = newGame(stdRules, 200);

    // Để lại các quân dự phòng ở góc xa để không bị dính điều kiện "ăn hết một loại quân"
    game.board = {
      ...reserves,
      E5: { side: 'blue', type: 'ROCK' },
      E7: { side: 'pink', type: 'ROCK' },
    };
    // Khởi tạo chữ ký thế cờ ban đầu (lần 1)
    game.repetitionHistory = [getBoardSignature(game.board, 'blue')];

    // Vòng lặp 1: Blue đi rồi về, Pink đi rồi về -> thế cờ xuất hiện lần 2
    game = applyMove(stdRules, game, { from: 'E5', to: 'E4' }).state;
    game = applyMove(stdRules, game, { from: 'E7', to: 'E8' }).state;
    game = applyMove(stdRules, game, { from: 'E4', to: 'E5' }).state;
    game = applyMove(stdRules, game, { from: 'E8', to: 'E7' }).state;

    // Vòng lặp 2: Blue đi rồi về, Pink đi rồi về -> thế cờ xuất hiện lần 3!
    game = applyMove(stdRules, game, { from: 'E5', to: 'E4' }).state;
    game = applyMove(stdRules, game, { from: 'E7', to: 'E8' }).state;
    game = applyMove(stdRules, game, { from: 'E4', to: 'E5' }).state;
    const finalOut = applyMove(stdRules, game, { from: 'E8', to: 'E7' });

    expect(finalOut.end).toBeDefined();
    expect(finalOut.end?.reason).toBe('repetition');
    expect(finalOut.end?.winner).toBeNull(); // Đều còn 4 quân -> Hòa
  });

  it('toPythonState đóng gói dữ liệu đầy đủ kèm danh sách legal_moves cho bot Python', () => {
    const stdRules = getRuleset('standard-32-4');
    const game = newGame(stdRules, 200);

    const pyState = toPythonState(stdRules, game, 'blue');

    expect(pyState.my_side).toBe('blue');
    expect(pyState.ply).toBe(0);
    expect(pyState.turn).toBe(1);
    expect(pyState.pieces_left).toEqual({ blue: 10, pink: 10 });
    expect(pyState.legal_moves.length).toBeGreaterThan(0);
    expect(pyState.board.B2).toBeDefined();

    // Mọi nước đi trong legal_moves đều phải là nước hợp lệ
    for (const move of pyState.legal_moves) {
      expect(move.from).toBeDefined();
      expect(move.to).toBeDefined();
    }
  });
});

describe('mô phỏng', () => {
  it('cùng seed cho cùng diễn biến; khác seed thường khác', () => {
    const a = simulate(rules, { blue: 'greedy', pink: 'rusher' }, 7, 120);
    const b = simulate(rules, { blue: 'greedy', pink: 'rusher' }, 7, 120);
    const c = simulate(rules, { blue: 'greedy', pink: 'rusher' }, 8, 120);
    expect(a).toEqual(b);
    expect(JSON.stringify(a.moves)).not.toEqual(JSON.stringify(c.moves));
  });
  it('replay từ danh sách nước ra đúng bàn cờ cuối', () => {
    const sim = simulate(rules, { blue: 'random', pink: 'greedy' }, 99, 120);
    expect(replay(rules, sim.moves, 120).board).toEqual(sim.finalBoard);
    expect(sim.moves.length).toBeLessThanOrEqual(120);
  });
});
