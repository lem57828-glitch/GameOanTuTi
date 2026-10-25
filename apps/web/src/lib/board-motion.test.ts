import { describe, expect, it } from 'vitest';
import type { Board } from '@arena/contracts';
import { boardMoveOffset } from './board-motion';

const blue = { side: 'blue', type: 'ROCK' } as const;
const pink = { side: 'pink', type: 'SCISSORS' } as const;
describe('board move presentation', () => {
  it('connects an exact one-cell move in the correct screen direction without mutating state', () => {
    const before: Board = { C3: blue, H8: pink };
    const after: Board = { D4: blue, H8: pink };
    const vector = boardMoveOffset(before, after, { from: 'C3', to: 'D4' });
    expect(vector?.x).toBeLessThan(0);
    expect(vector?.y).toBeGreaterThan(0);
    expect(before).toEqual({ C3: blue, H8: pink });
    expect(after).toEqual({ D4: blue, H8: pink });
  });
  it('permits a captured piece to disappear at the destination', () => {
    expect(boardMoveOffset({ C3: blue, D4: pink }, { D4: blue }, { from: 'C3', to: 'D4' })).not.toBeNull();
  });
  it('does not animate initial loads or a poll of an unchanged board', () => {
    expect(boardMoveOffset(null, { C3: blue }, { from: 'B2', to: 'C3' })).toBeNull();
    expect(boardMoveOffset({ C3: blue }, { C3: blue }, { from: 'B2', to: 'C3' })).toBeNull();
  });
  it('shows replay seeks and multi-move snapshot jumps immediately', () => {
    expect(
      boardMoveOffset({ C3: blue, H8: pink }, { D4: blue, G7: pink }, { from: 'C3', to: 'D4' }),
    ).toBeNull();
    expect(boardMoveOffset({ C3: blue }, { E5: blue }, { from: 'D4', to: 'E5' })).toBeNull();
  });
  it('does not present a correction, missing move, or invalid coordinate as a valid flight', () => {
    expect(boardMoveOffset({ C3: blue }, { D4: pink }, { from: 'C3', to: 'D4' })).toBeNull();
    expect(boardMoveOffset({ C3: blue }, { D4: blue }, null)).toBeNull();
    expect(boardMoveOffset({ C3: blue }, { D4: blue }, { from: 'C0', to: 'D4' })).toBeNull();
  });
});
