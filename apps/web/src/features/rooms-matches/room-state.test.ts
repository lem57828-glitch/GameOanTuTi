import { expect, it } from 'vitest';
import type { RoomEvent, RoomSnapshot } from '@arena/contracts';
import { applyRoomEvent, preferSnapshot } from './room-state';
import { boardAt } from './useReplay';
const snapshot: RoomSnapshot = {
  roomId: 'room_test',
  title: 'Test',
  isDemo: true,
  streamId: 'game:test',
  seq: 2,
  status: 'running',
  gameId: 'test',
  rulesetId: 'demo',
  teams: { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' } },
  coinResult: null,
  board: { A2: { side: 'blue', type: 'ROCK' } },
  turn: { side: 'blue', ply: 0 },
  history: [],
  result: null,
  job: null,
  serverTime: '2026-10-20T08:00:00.000Z',
  deadline: null,
  match: null,
};
const event: RoomEvent = {
  eventId: 'event_test',
  schemaVersion: 1,
  aggregateId: 'room_test',
  streamId: 'game:test',
  seq: 3,
  occurredAt: snapshot.serverTime,
  type: 'game.move',
  payload: {
    gameId: 'test',
    move: { ply: 1, side: 'blue', from: 'A2', to: 'B3', type: 'ROCK', capture: null },
  },
};
it('ignores duplicate/old sequence, resyncs on gap or changed stream', () => {
  expect(applyRoomEvent(snapshot, { ...event, seq: 2 }).kind).toBe('ignore');
  expect(applyRoomEvent(snapshot, { ...event, seq: 4 }).kind).toBe('resync');
  expect(applyRoomEvent(snapshot, { ...event, streamId: 'game:new' }).kind).toBe('resync');
});
it('applies next event without mutating the old board, rejects late snapshots', () => {
  const next = applyRoomEvent(snapshot, event);
  expect(next.kind).toBe('applied');
  if (next.kind !== 'applied') throw new Error('Expected applied event');
  expect(next.snapshot.board.B3?.type).toBe('ROCK');
  expect(snapshot.board.A2).toBeDefined();
  expect(preferSnapshot(next.snapshot, snapshot)).toBe(next.snapshot);
});
it('chung kết: quân dừng ở ô đổi loại nhận loại mới theo promoted (live và replay khớp server)', () => {
  const swap: RoomEvent = {
    ...event,
    payload: {
      gameId: 'test',
      move: { ply: 1, side: 'blue', from: 'A2', to: 'B3', type: 'ROCK', capture: null, promoted: 'PAPER' },
    },
  };
  const next = applyRoomEvent(snapshot, swap);
  if (next.kind !== 'applied') throw new Error('Expected applied event');
  expect(next.snapshot.board.B3).toEqual({ side: 'blue', type: 'PAPER' });
  expect(boardAt(snapshot.board, [swap.payload.move], 1).B3).toEqual({ side: 'blue', type: 'PAPER' });
});
