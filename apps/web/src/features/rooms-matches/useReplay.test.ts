import { describe, expect, it } from 'vitest';
import type { Board, MoveRecord } from '@arena/contracts';
import { boardAt } from './useReplay';

const initial: Board = {
  A1: { side: 'blue', type: 'ROCK' },
  B2: { side: 'blue', type: 'PAPER' },
  C3: { side: 'pink', type: 'SCISSORS' },
};
const history: MoveRecord[] = [
  { ply: 1, side: 'blue', from: 'B2', to: 'B3', type: 'PAPER', capture: null },
  { ply: 2, side: 'pink', from: 'C3', to: 'C4', type: 'SCISSORS', capture: null },
  { ply: 3, side: 'blue', from: 'A1', to: 'A2', type: 'ROCK', capture: null },
];

describe('xem lại ván: bàn cờ theo nước', () => {
  it('nước 0 là bàn cờ ban đầu; không sửa dữ liệu gốc', () => {
    expect(boardAt(initial, history, 0)).toEqual(initial);
    boardAt(initial, history, 3);
    expect(initial.B2).toEqual({ side: 'blue', type: 'PAPER' });
  });
  it('áp đúng n nước đầu; n vượt quá thì dừng ở nước cuối; nước ăn quân đè quân bị ăn', () => {
    expect(boardAt(initial, history, 1)).toMatchObject({ B3: { type: 'PAPER' } });
    expect(boardAt(initial, history, 1).B2).toBeUndefined();
    expect(boardAt(initial, history, 99)).toEqual(boardAt(initial, history, 3));
    const capture: MoveRecord[] = [
      { ply: 1, side: 'pink', from: 'C3', to: 'B2', type: 'SCISSORS', capture: 'PAPER' },
    ];
    expect(boardAt(initial, capture, 1).B2).toEqual({ side: 'pink', type: 'SCISSORS' });
  });
});
