// Dựng RoomSnapshot từ dữ liệu bền vững. Hàm thuần để kiểm thử đơn vị; không đọc database.
// Bàn cờ luôn được dựng lại từ danh sách nước đã lưu bằng game-engine, không tin trạng thái tạm ở client.
import {
  CoinResult,
  PieceType,
  GameEndReason,
  MoveRecord,
  RoomSnapshot,
  RoomStatus,
  Side,
} from '@arena/contracts';
import { STANDARD_RULESET, getRuleset, newGame, replay } from '@arena/game-engine';

export interface SnapshotInput {
  room: { id: string; title: string; isDemo: boolean; status: string };
  teams: { a: { id: string; name: string }; b: { id: string; name: string } };
  game: {
    id: string;
    choices?: Array<{ side: string; extraType: string | null }>;
    rulesetId: string;
    maxPlies: number;
    lastSeq: number;
    coinResult: unknown;
    blueTeamId: string | null;
    pinkTeamId: string | null;
  } | null;
  moves: unknown[];
  result: {
    winner: string | null;
    winnerTeamId: string | null;
    reason: string;
    plies: number;
    piecesBlue: number;
    piecesPink: number;
  } | null;
  job: { id: string; status: string; attempts: number } | null;
  now: Date;
}

export const streamIdOf = (gameId: string) => `game:${gameId}`;

export function buildSnapshot(input: SnapshotInput): RoomSnapshot {
  const { room, game } = input;
  const status = RoomStatus.parse(room.status);
  const base = {
    roomId: room.id,
    title: room.title,
    isDemo: room.isDemo,
    teams: input.teams,
    job: input.job,
    serverTime: input.now.toISOString(),
    // M0 không có hạn chọn bot/quân (DECISIONS: điều hành trận chưa chốt).
    deadline: null,
  };
  if (!game) {
    return RoomSnapshot.parse({
      ...base,
      streamId: null,
      seq: 0,
      status,
      gameId: null,
      rulesetId: null,
      coinResult: null,
      board: newGame(STANDARD_RULESET, 200).board,
      turn: null,
      history: [],
      result: null,
      job: null,
    });
  }
  const choice = (side: string) => game.choices?.find((c) => c.side === side)?.extraType;
  const rules = getRuleset(game.rulesetId, {
    blue: PieceType.parse(choice('blue') ?? 'PAPER'),
    pink: PieceType.parse(choice('pink') ?? 'PAPER'),
  });
  const history = input.moves.map((m) => MoveRecord.parse(m));
  const state = replay(rules, history, game.maxPlies);
  const finished = input.result !== null;
  const r = input.result;
  return RoomSnapshot.parse({
    ...base,
    streamId: streamIdOf(game.id),
    seq: game.lastSeq,
    status,
    gameId: game.id,
    rulesetId: game.rulesetId,
    coinResult: game.coinResult ? CoinResult.parse(game.coinResult) : null,
    board: state.board,
    initialBoard: newGame(rules, game.maxPlies).board,
    maxPlies: game.maxPlies,
    turn: finished || status === 'failed' ? null : { side: state.toMove, ply: state.ply },
    history,
    result: r
      ? {
          winner: r.winner ? Side.parse(r.winner) : null,
          winnerTeamId: r.winnerTeamId,
          reason: GameEndReason.parse(r.reason),
          plies: r.plies,
          piecesLeft: { blue: r.piecesBlue, pink: r.piecesPink },
        }
      : null,
  });
}
