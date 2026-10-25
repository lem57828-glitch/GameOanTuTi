import { describe, expect, it } from 'vitest';
import { initialReplayState, replayReducer, replayTravelMs, REPLAY_SPEEDS } from './replay-state';

describe('replay transport state', () => {
  it('ignores a queued tick after pause or seek and a tick belonging to another game', () => {
    const state = initialReplayState('a', false);
    expect(replayReducer(state, { type: 'tick', total: 20, stream: 'a' })).toBe(state);
    const sought = replayReducer(state, { type: 'seek', value: 7, cursor: 0, total: 20 });
    expect(replayReducer(sought, { type: 'tick', total: 20, stream: 'a' })).toBe(sought);
    const playing = replayReducer(state, { type: 'play', cursor: 0, total: 20, live: false });
    expect(replayReducer(playing, { type: 'tick', total: 20, stream: 'old-game' })).toBe(playing);
    expect(replayReducer(playing, { type: 'tick', total: 20, stream: 'a' }).position).toBe(1);
  });

  it('resets position, revealed history and play state when switching to another saved game', () => {
    let state = initialReplayState('game-a', false);
    state = replayReducer(state, { type: 'seek', value: 15, cursor: 0, total: 20 });
    state = replayReducer(state, { type: 'seen', cursor: 15 });
    state = replayReducer(state, { type: 'play', cursor: 15, total: 20, live: false });
    state = replayReducer(state, { type: 'source', stream: 'game-b', follow: false });
    expect(state).toMatchObject({
      stream: 'game-b',
      position: 0,
      seen: 0,
      playing: false,
      following: false,
      intent: 'none',
    });
  });
  it('keeps an archive position stable across polls of the same source', () => {
    const state = { ...initialReplayState('game-a', false), position: 7, seen: 7 };
    expect(replayReducer(state, { type: 'source', stream: 'game-a', follow: false })).toBe(state);
  });
  it('differentiates a forward step from a scrub or backwards jump', () => {
    let state = initialReplayState('a', false);
    state = replayReducer(state, { type: 'step', value: 1, cursor: 0, total: 12 });
    expect(state).toMatchObject({ position: 1, intent: 'forward', playing: false });
    state = replayReducer(state, { type: 'seek', value: 9, cursor: 1, total: 12 });
    expect(state).toMatchObject({ position: 9, intent: 'seek', playing: false });
    expect(replayReducer(state, { type: 'step', value: -1, cursor: 9, total: 12 })).toMatchObject({
      position: 8,
      intent: 'seek',
    });
  });
  it('restarts a finished game from the opening and waits for new data at the live edge', () => {
    const state = initialReplayState('a', false);
    expect(replayReducer(state, { type: 'play', cursor: 12, total: 12, live: false })).toMatchObject({
      position: 0,
      playing: true,
    });
    expect(replayReducer(state, { type: 'play', cursor: 12, total: 12, live: true })).toMatchObject({
      position: 12,
      playing: true,
    });
  });
  it('keeps known history available when going back without revealing new moves', () => {
    let state = replayReducer(initialReplayState('a', false), { type: 'seen', cursor: 4 });
    state = replayReducer(state, { type: 'seek', value: 1, cursor: 4, total: 20 });
    expect(state.seen).toBe(4);
    expect(state.position).toBe(1);
  });
  it('clamps scrubbing and stepping to received moves and rejects invalid speed values', () => {
    const state = initialReplayState('a', false);
    expect(replayReducer(state, { type: 'seek', value: 100, cursor: 0, total: 12 }).position).toBe(12);
    expect(replayReducer(state, { type: 'step', value: -1, cursor: 0, total: 12 }).position).toBe(0);
    expect(replayReducer(state, { type: 'speed', value: 0 })).toBe(state);
    expect(replayReducer(state, { type: 'speed', value: NaN })).toBe(state);
  });
  it('finishes each piece animation before the next scheduled move at every supported speed', () => {
    for (const speed of REPLAY_SPEEDS) {
      expect(replayTravelMs(speed)).toBeGreaterThan(0);
      expect(replayTravelMs(speed)).toBeLessThan(speed);
      expect(replayTravelMs(speed)).toBeLessThanOrEqual(380);
    }
  });
  it('returns to the exact received live edge without starting another game', () => {
    const state = replayReducer(initialReplayState('a', false), { type: 'follow', total: 31 });
    expect(state).toMatchObject({ stream: 'a', position: 31, seen: 31, following: true, playing: false });
  });
});
