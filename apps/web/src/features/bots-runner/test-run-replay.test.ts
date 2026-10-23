import { describe, expect, it } from 'vitest';
import type { TestRunDetail } from '@arena/contracts';
import { testRunReplaySource } from './test-run-replay';
import { boardAt } from '../rooms-matches/useReplay';

const run: TestRunDetail = {
  id: 'practice-1',
  botVersionId: 'bot-1',
  status: 'succeeded',
  mySide: 'pink',
  opponentType: 'demo',
  opponentTarget: 'greedy',
  createdAt: '2026-10-24T00:00:00Z',
  initialBoard: {
    A2: { side: 'blue', type: 'ROCK' },
    B3: { side: 'pink', type: 'SCISSORS' },
  },
  // Older records can omit type/capture; seq is the authoritative event order.
  events: [
    { seq: 2, ply: 2, side: 'pink', from: 'B3', to: 'B2' },
    { seq: 1, ply: 1, side: 'blue', from: 'A2', to: 'A3' },
    { seq: 3, ply: 3, side: 'blue', from: 'A3', to: 'B2' },
  ],
};

describe('practice replay using saved board and events', () => {
  it('reconstructs captures in sequence and can seek back without mutating the saved run', () => {
    const before = JSON.stringify(run);
    const replay = testRunReplaySource(run)!;
    expect(replay.streamId).toBe(run.id);
    expect(replay.status).toBe('finished');
    expect(replay.history[2]).toMatchObject({ type: 'ROCK', capture: 'SCISSORS' });
    expect(boardAt(replay.initialBoard!, replay.history, 3)).toEqual({
      B2: { side: 'blue', type: 'ROCK' },
    });
    expect(boardAt(replay.initialBoard!, replay.history, 0)).toEqual(run.initialBoard);
    expect(JSON.stringify(run)).toBe(before);
  });

  it('does not invent boards or silently skip missing moves for incomplete historic runs', () => {
    expect(testRunReplaySource({ ...run, initialBoard: undefined })).toBeNull();
    expect(testRunReplaySource({ ...run, events: undefined })).toBeNull();
    expect(testRunReplaySource({ ...run, events: [run.events![0]!] })).toBeNull();
    expect(testRunReplaySource({ ...run, events: [run.events![2]!] })).toBeNull();
    expect(testRunReplaySource({ ...run, events: [] })?.history).toEqual([]);
    expect(testRunReplaySource({ ...run, plies: 4 })).toBeNull();
  });
});
