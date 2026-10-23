import { describe, expect, it } from 'vitest';
import type { Board, PieceType, Side } from '@arena/contracts';
import {
  applyMove,
  countPieces,
  createStandardBoard,
  getBoardSignature,
  getRuleset,
  legalMoves,
  newGame,
  replay,
  simulate,
  STANDARD_RULESET,
  STANDARD_RULESET_ID,
  toPythonState,
} from '../src/index.js';

const types: PieceType[] = ['ROCK', 'PAPER', 'SCISSORS'];
const reserves: Board = {
  A3: { side: 'blue', type: 'ROCK' },
  A4: { side: 'blue', type: 'PAPER' },
  A5: { side: 'blue', type: 'SCISSORS' },
  I7: { side: 'pink', type: 'ROCK' },
  I6: { side: 'pink', type: 'PAPER' },
  I5: { side: 'pink', type: 'SCISSORS' },
};
const withBoard = (board: Board, side: Side = 'blue') => ({
  ...newGame(STANDARD_RULESET),
  board,
  toMove: side,
  repetitionHistory: [getBoardSignature(board, side)],
});

describe('standard engine acceptance', () => {
  it('matches all 20 exact image positions and leaves both goals empty', () => {
    const board = createStandardBoard();
    for (const [side, groups] of Object.entries({
      blue: { ROCK: ['A2', 'A3', 'A4'], PAPER: ['B2', 'C2', 'B3', 'C3'], SCISSORS: ['B1', 'C1', 'D1'] },
      pink: { ROCK: ['I6', 'I7', 'I8'], PAPER: ['G7', 'H7', 'G8', 'H8'], SCISSORS: ['F9', 'G9', 'H9'] },
    })) {
      for (const [type, squares] of Object.entries(groups))
        for (const square of squares) expect(board[square]).toEqual({ side, type });
    }
    expect(Object.keys(board)).toHaveLength(20);
    expect(board.A1).toBeUndefined();
    expect(board.I9).toBeUndefined();
    expect(STANDARD_RULESET.goals).toEqual({ blue: 'I9', pink: 'A1' });
  });
  for (const blue of types)
    for (const pink of types)
      it(`independent extra types ${blue}/${pink}`, () => {
        const board = getRuleset(STANDARD_RULESET_ID, { blue, pink }).setup;
        expect(countPieces(board)).toEqual({ blue: 10, pink: 10 });
        for (const [side, extra, center] of [
          ['blue', blue, ['B2', 'C2', 'B3', 'C3']],
          ['pink', pink, ['G7', 'H7', 'G8', 'H8']],
        ] as const) {
          for (const sq of center) expect(board[sq]).toEqual({ side, type: extra });
          for (const type of types)
            expect(Object.values(board).filter((p) => p.side === side && p.type === type)).toHaveLength(
              type === extra ? 4 : 3,
            );
        }
      });
  for (const own of types)
    for (const target of types)
      it(`capture matrix ${own}/${target}`, () => {
        const state = withBoard({ E5: { side: 'blue', type: own }, F6: { side: 'pink', type: target } });
        const move = legalMoves(STANDARD_RULESET, state).find((m) => m.from === 'E5' && m.to === 'F6');
        expect(Boolean(move)).toBe(
          ({ ROCK: 'SCISSORS', PAPER: 'ROCK', SCISSORS: 'PAPER' } as const)[own] === target,
        );
      });
  it('respects boundaries, own pieces, turn and single-square movement', () => {
    const state = withBoard({
      A1: { side: 'blue', type: 'ROCK' },
      B1: { side: 'blue', type: 'PAPER' },
      I9: { side: 'pink', type: 'ROCK' },
    });
    expect(
      legalMoves(STANDARD_RULESET, state)
        .filter((m) => m.from === 'A1')
        .map((m) => m.to)
        .sort(),
    ).toEqual(['A2', 'B2']);
    expect(() => applyMove(STANDARD_RULESET, state, { from: 'I9', to: 'H8' })).toThrow();
    expect(() => applyMove(STANDARD_RULESET, state, { from: 'A1', to: 'C3' })).toThrow();
  });
  for (const side of ['blue', 'pink'] as const)
    it(`${side} wins on its own target`, () => {
      const out = applyMove(
        STANDARD_RULESET,
        withBoard({ ...reserves, [side === 'blue' ? 'H8' : 'B2']: { side, type: 'ROCK' } }, side),
        { from: side === 'blue' ? 'H8' : 'B2', to: side === 'blue' ? 'I9' : 'A1' },
      );
      expect(out.end).toEqual({ winner: side, reason: 'goal' });
    });
  it('uses material on repetition with the same side to move', () => {
    let game = withBoard({
      ...reserves,
      E5: { side: 'blue', type: 'ROCK' },
      E7: { side: 'pink', type: 'ROCK' },
      F1: { side: 'blue', type: 'PAPER' },
    });
    const cycle = [
      { from: 'E5', to: 'E4' },
      { from: 'E7', to: 'E8' },
      { from: 'E4', to: 'E5' },
      { from: 'E8', to: 'E7' },
    ];
    for (const move of [...cycle, ...cycle])
      game = applyMove(STANDARD_RULESET, game, move).state as typeof game;
    expect(game.end).toEqual({ winner: 'blue', reason: 'repetition' });
    expect(getBoardSignature(game.board, 'blue')).not.toBe(getBoardSignature(game.board, 'pink'));
  });
  it('uses material at the limit and refuses moves after an ending', () => {
    const game = { ...withBoard({ ...reserves, E5: { side: 'blue', type: 'ROCK' } }), maxPlies: 1 };
    const out = applyMove(STANDARD_RULESET, game, { from: 'E5', to: 'E6' });
    expect(out.end).toEqual({ winner: 'blue', reason: 'max_plies' });
    expect(() => applyMove(STANDARD_RULESET, out.state, { from: 'I5', to: 'H5' })).toThrow(/kết thúc/);
  });
  it('does not share mutable pieces between setup, matches and Python payloads', () => {
    const a = newGame(STANDARD_RULESET);
    const b = newGame(STANDARD_RULESET);
    const py = toPythonState(STANDARD_RULESET, a);
    py.board.B2!.type = 'ROCK';
    a.board.B3!.type = 'SCISSORS';
    expect(b.board.B2!.type).toBe('PAPER');
    expect(b.board.B3!.type).toBe('PAPER');
    expect(STANDARD_RULESET.setup.B3!.type).toBe('PAPER');
    expect(py).toMatchObject({
      protocol_version: 1,
      ruleset_id: STANDARD_RULESET_ID,
      board_size: 9,
      max_plies: 200,
      goals: { blue: 'I9', pink: 'A1' },
    });
  });
  it('replays mixed extra choices deterministically and validates rules/limits', () => {
    const rules = getRuleset(STANDARD_RULESET_ID, { blue: 'SCISSORS', pink: 'ROCK' });
    const a = simulate(rules, { blue: 'greedy', pink: 'rusher' }, 21);
    expect(replay(rules, a.moves).board).toEqual(a.finalBoard);
    expect(simulate(rules, { blue: 'greedy', pink: 'rusher' }, 21)).toEqual(a);
    expect(() => getRuleset('unknown')).toThrow();
    expect(() => newGame(rules, 201)).toThrow();
    expect(() => createStandardBoard('BAD' as PieceType)).toThrow();
  });
});
