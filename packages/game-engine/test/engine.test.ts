import { describe, expect, it } from 'vitest';
import type { Board } from '@arena/contracts';
import {
  DEMO_RULESET,
  applyMove,
  checkEnd,
  countPieces,
  legalMoves,
  newGame,
  replay,
  simulate,
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
// Quân dự phòng ở góc xa để không kích hoạt điều kiện "ăn hết một loại".
const reserves: Board = {
  A3: { side: 'blue', type: 'ROCK' },
  A4: { side: 'blue', type: 'PAPER' },
  A5: { side: 'blue', type: 'SCISSORS' },
  I7: { side: 'pink', type: 'ROCK' },
  I6: { side: 'pink', type: 'PAPER' },
  I5: { side: 'pink', type: 'SCISSORS' },
};

describe('ruleset demo', () => {
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
    // Chỉ xét loại quân Hồng còn lại (Búa) để không kích hoạt điều kiện "ăn hết một loại".
    const rockOnly = { ...rules, beats: { ROCK: ['SCISSORS'] } as unknown as typeof rules.beats };
    expect(checkEnd(rockOnly, s, 'blue')).toEqual({ winner: 'blue', reason: 'no_moves' });
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
