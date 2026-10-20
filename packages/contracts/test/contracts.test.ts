import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  DemoGameRequest,
  GameRequest,
  GameResult,
  RoomEvent,
  SessionUser,
  ERROR_STATUS,
} from '../src/index.js';

const request = () => ({
  contractVersion: CONTRACT_VERSION,
  requestKey: 'demo:room-1:game-1',
  gameId: 'g1',
  choices: { blue: { botVersionId: 'b1', extraType: null }, pink: { botVersionId: 'b2', extraType: null } },
  rulesetId: 'demo-ottv2-0',
  seed: 42,
  limits: { cpuMsPerMove: 200, wallMsPerMove: 1000, startupMs: 3000, maxPlies: 120, maxErrorsPerGame: 3 },
});

describe('GameRequest', () => {
  it('chấp nhận yêu cầu hợp lệ', () => {
    expect(GameRequest.parse(request())).toBeTruthy();
  });
  it('từ chối requestKey chứa ký tự lạ, phiên bản hợp đồng sai, limits thiếu', () => {
    expect(GameRequest.safeParse({ ...request(), requestKey: 'có dấu cách' }).success).toBe(false);
    expect(GameRequest.safeParse({ ...request(), contractVersion: 2 }).success).toBe(false);
    expect(GameRequest.safeParse({ ...request(), limits: { maxPlies: 10 } }).success).toBe(false);
    expect(GameRequest.safeParse({ ...request(), seed: -1 }).success).toBe(false);
  });
});

describe('GameResult và sự kiện phòng', () => {
  it('winner chỉ là blue, pink hoặc null', () => {
    const base = {
      requestKey: 'demo:k1',
      gameId: 'g',
      attemptId: 'a',
      winner: null,
      reason: 'max_plies',
      plies: 120,
      piecesLeft: { blue: 10, pink: 10 },
      rulesetId: 'demo-ottv2-0',
      resultVersion: 1,
      replayRef: '/api/v1/rooms/r/replay',
    };
    expect(GameResult.safeParse(base).success).toBe(true);
    expect(GameResult.safeParse({ ...base, winner: 'green' }).success).toBe(false);
  });
  it('phân loại sự kiện theo type và kiểm tra payload', () => {
    const move = {
      eventId: 'e1',
      type: 'game.move',
      schemaVersion: 1,
      aggregateId: 'room-1',
      streamId: 'room-1:g1:1',
      seq: 3,
      occurredAt: new Date().toISOString(),
      payload: {
        gameId: 'g1',
        move: { ply: 1, side: 'blue', from: 'B4', to: 'C5', type: 'ROCK', capture: null },
      },
    };
    expect(RoomEvent.parse(move).type).toBe('game.move');
    expect(
      RoomEvent.safeParse({ ...move, payload: { gameId: 'g1', move: { ...move.payload.move, to: 'Z9' } } })
        .success,
    ).toBe(false);
    expect(RoomEvent.safeParse({ ...move, type: 'game.unknown' }).success).toBe(false);
  });
});

describe('phiên và lỗi', () => {
  it('SessionUser không có trường xác thực', () => {
    const parsed = SessionUser.parse({
      id: 'u',
      displayName: 'A',
      role: 'student',
      teamId: null,
      demo: true,
      passwordHash: 'x',
    });
    expect('passwordHash' in parsed).toBe(false);
  });
  it('mã lỗi có HTTP status cố định', () => {
    expect(ERROR_STATUS.FEATURE_NOT_IMPLEMENTED).toBe(501);
    expect(ERROR_STATUS.VALIDATION_ERROR).toBe(400);
  });
  it('DemoGameRequest bắt buộc requestKey', () => {
    expect(DemoGameRequest.safeParse({}).success).toBe(false);
  });
});
