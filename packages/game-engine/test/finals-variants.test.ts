import { describe, expect, it } from 'vitest';
import type { Board } from '@arena/contracts';
import {
  FINAL_RULESET_ID,
  FINAL_VARIANT,
  SEMIFINAL_RULESET_ID,
  SEMIFINAL_VARIANT,
  STANDARD_RULESET_ID,
  applyMove,
  getRuleset,
  legalMoves,
  newGame,
  obstaclesAt,
  replay,
  simulate,
  square,
  parseSquare,
  toPythonState,
  type GameState,
} from '../src/index.js';

const semi = getRuleset(SEMIFINAL_RULESET_ID);
const final = getRuleset(FINAL_RULESET_ID, { blue: 'ROCK', pink: 'SCISSORS' });
const at = (rules: typeof semi, board: Board, ply = 0, toMove: 'blue' | 'pink' = 'blue'): GameState => ({
  rulesetId: rules.id,
  board,
  toMove,
  ply,
  maxPlies: 200,
  history: [],
  end: null,
  repetitionHistory: [],
});
/** Đủ ba loại quân mỗi bên ở góc xa để không kết thúc vì mất loại quân. */
const reserves: Board = {
  A1: { side: 'blue', type: 'ROCK' },
  A2: { side: 'blue', type: 'PAPER' },
  B1: { side: 'blue', type: 'SCISSORS' },
  I8: { side: 'pink', type: 'ROCK' },
  H9: { side: 'pink', type: 'PAPER' },
  H8: { side: 'pink', type: 'SCISSORS' },
};
const mirror = (sq: string) => {
  const [c, r] = parseSquare(sq)!;
  return square(8 - c, 8 - r);
};

describe('biến thể bán kết / chung kết', () => {
  it('luật chuẩn không đổi: không vật cản, không trường biến thể trong state Python', () => {
    const std = getRuleset(STANDARD_RULESET_ID);
    expect(std.variant).toBeUndefined();
    expect(obstaclesAt(std, 0)).toEqual([]);
    expect(toPythonState(std, newGame(std))).not.toHaveProperty('obstacles');
  });

  it('bố trí vật cản và ô đặc biệt đối xứng tâm, không đè quân xuất phát hay ô đích', () => {
    for (const v of [SEMIFINAL_VARIANT, FINAL_VARIANT]) {
      const all = [...v.fixed, ...v.moving.flatMap((o) => o.path), ...v.special.map((x) => x.square)];
      for (const sq of v.fixed) expect(v.fixed).toContain(mirror(sq));
      for (const x of v.special)
        expect(v.special.some((y) => y.square === mirror(x.square) && y.kind === x.kind)).toBe(true);
      const start = getRuleset(STANDARD_RULESET_ID).setup;
      for (const sq of all) {
        expect(start[sq]).toBeUndefined();
        expect(['A1', 'I9']).not.toContain(sq);
      }
    }
    // Hai vật cản động luôn ở hai ô đối xứng nhau.
    for (let ply = 0; ply < 60; ply++) {
      const [a, b] = FINAL_VARIANT.moving.map((o) => o.path[Math.floor(ply / o.every) % o.path.length]!);
      expect(b).toBe(mirror(a!));
    }
  });

  it('bán kết: không đi vào ô vật cản cố định, kể cả để ăn quân', () => {
    const board: Board = {
      ...reserves,
      D5: { side: 'blue', type: 'ROCK' },
      E6: { side: 'pink', type: 'SCISSORS' },
    };
    const moves = legalMoves(semi, at(semi, board)).filter((m) => m.from === 'D5');
    const targets = moves.map((m) => m.to);
    for (const sq of ['C5', 'D6', 'E5']) expect(targets).not.toContain(sq);
    expect(targets).toContain('E6'); // ăn quân bình thường khi không có vật cản
    expect(() => applyMove(semi, at(semi, board), { from: 'D5', to: 'E5' })).toThrow(/không hợp lệ/);
  });

  it('chung kết: vật cản động đổi chỗ sau mỗi 6 nước và chặn đúng ô ở từng thời điểm', () => {
    expect(obstaclesAt(final, 0)).toEqual(['C5', 'D4', 'F6', 'G5']);
    expect(obstaclesAt(final, 5)).toEqual(['C5', 'D4', 'F6', 'G5']);
    expect(obstaclesAt(final, 6)).toEqual(['C5', 'E4', 'E6', 'G5']);
    const board: Board = { ...reserves, D3: { side: 'blue', type: 'PAPER' } };
    expect(legalMoves(final, at(final, board, 0)).some((m) => m.from === 'D3' && m.to === 'D4')).toBe(false);
    expect(legalMoves(final, at(final, board, 6)).some((m) => m.from === 'D3' && m.to === 'D4')).toBe(true);
    expect(legalMoves(final, at(final, board, 6)).some((m) => m.from === 'D3' && m.to === 'E4')).toBe(false);
  });

  it('quân đứng sẵn ở ô vật cản động vừa tới vẫn đi ra được; đối phương không ăn được quân đó', () => {
    const board: Board = {
      ...reserves,
      E4: { side: 'pink', type: 'SCISSORS' },
      E3: { side: 'blue', type: 'PAPER' },
      D3: { side: 'blue', type: 'ROCK' },
    };
    const s = at(final, board, 6, 'blue'); // ply 6: vật cản ở E4
    expect(legalMoves(final, s).some((m) => m.to === 'E4')).toBe(false);
    const pinkMoves = legalMoves(final, { ...s, toMove: 'pink' }, 'pink').filter((m) => m.from === 'E4');
    expect(pinkMoves.length).toBeGreaterThan(0);
  });

  it('ô khiên: quân đứng trên ô không bị ăn; vào ô khiên trống thì được', () => {
    const board: Board = {
      ...reserves,
      E3: { side: 'pink', type: 'SCISSORS' },
      D2: { side: 'blue', type: 'ROCK' },
    };
    const s = at(final, board);
    expect(legalMoves(final, s).some((m) => m.from === 'D2' && m.to === 'E3')).toBe(false);
    const empty: Board = { ...reserves, D2: { side: 'blue', type: 'ROCK' } };
    expect(legalMoves(final, at(final, empty)).some((m) => m.from === 'D2' && m.to === 'E3')).toBe(true);
  });

  it('ô đổi loại: quân dừng ở ô đổi loại kế tiếp, nước đi ghi promoted và replay dựng lại đúng', () => {
    const board: Board = {
      ...reserves,
      B4: { side: 'blue', type: 'ROCK' },
      A3: { side: 'blue', type: 'ROCK' },
    };
    const out = applyMove(final, at(final, board), { from: 'B4', to: 'B5' });
    expect(out.record).toMatchObject({ type: 'ROCK', promoted: 'PAPER' });
    expect(out.state.board.B5).toEqual({ side: 'blue', type: 'PAPER' });
    const plain = applyMove(final, at(final, board), { from: 'B4', to: 'C4' });
    expect(plain.record).not.toHaveProperty('promoted');
  });

  it('đổi loại làm chính bên vừa đi mất hẳn một loại quân → bên đó thua', () => {
    const board: Board = {
      A2: { side: 'blue', type: 'PAPER' },
      B1: { side: 'blue', type: 'SCISSORS' },
      B4: { side: 'blue', type: 'ROCK' },
      ...Object.fromEntries(Object.entries(reserves).filter(([, p]) => p.side === 'pink')),
    };
    const out = applyMove(final, at(final, board), { from: 'B4', to: 'B5' });
    expect(out.end).toEqual({ winner: 'pink', reason: 'eliminate' });
  });

  it('state cho bot Python có vật cản hiện tại, lịch vật cản động và ô đặc biệt', () => {
    const st = toPythonState(final, { ...newGame(final), ply: 6 });
    expect(st.ruleset_id).toBe(FINAL_RULESET_ID);
    expect(st.obstacles).toEqual(['C5', 'E4', 'E6', 'G5']);
    expect(st.fixed_obstacles).toEqual(['C5', 'G5']);
    expect(st.moving_obstacles).toHaveLength(2);
    expect(st.special_cells).toContainEqual({ square: 'B5', kind: 'swap' });
    expect(st.legal_moves.every((m) => !st.obstacles!.includes(m.to))).toBe(true);
  });

  it('mô phỏng trọn ván theo seed: xác định, mọi nước tránh vật cản, replay khớp', () => {
    for (const rules of [semi, final]) {
      for (const seed of [1, 7, 42, 2024]) {
        const a = simulate(rules, { blue: 'rusher', pink: 'greedy' }, seed);
        const b = simulate(rules, { blue: 'rusher', pink: 'greedy' }, seed);
        expect(b.moves).toEqual(a.moves);
        a.moves.forEach((m) => expect(obstaclesAt(rules, m.ply - 1)).not.toContain(m.to));
        expect(replay(rules, a.moves).board).toEqual(a.finalBoard);
      }
    }
  });
});
