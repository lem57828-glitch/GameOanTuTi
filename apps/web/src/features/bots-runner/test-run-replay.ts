import type { Board, MoveRecord, TestRunDetail } from '@arena/contracts';
import type { ReplaySource } from '../rooms-matches/useReplay';

/** Reuse saved practice data, including the actual initial extra pieces; never invent a setup. */
export function testRunReplaySource(run: TestRunDetail): ReplaySource | null {
  if (!run.initialBoard || !run.events) return null;
  if (run.status === 'succeeded' && run.plies !== undefined && run.plies !== run.events.length) return null;
  const board: Board = { ...run.initialBoard };
  const history: MoveRecord[] = [];
  for (const event of [...run.events].sort((a, b) => a.seq - b.seq)) {
    if (event.seq !== history.length + 1) return null;
    const piece = board[event.from];
    if (!piece || piece.side !== event.side) return null;
    history.push({
      ply: event.ply,
      side: event.side,
      from: event.from,
      to: event.to,
      type: event.type ?? piece.type,
      capture: event.capture ?? board[event.to]?.type ?? null,
    });
    delete board[event.from];
    board[event.to] = piece;
  }
  return {
    streamId: run.id,
    status: run.status === 'succeeded' ? 'finished' : run.status === 'failed' ? 'failed' : 'running',
    initialBoard: run.initialBoard,
    board,
    history,
  };
}
