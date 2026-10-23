import { useMemo } from 'react';
import type { TestRunDetail } from '@arena/contracts';
import { Board } from '../../components/Board';
import { ReplayBar } from '../rooms-matches/ReplayBar';
import { useReplay } from '../rooms-matches/useReplay';
import { testRunReplaySource } from './test-run-replay';

export function TestRunReplay({ run }: { run: TestRunDetail }) {
  const source = useMemo(() => testRunReplaySource(run), [run]);
  const replay = useReplay(source);
  if (!source)
    return (
      <p className="text-sm text-ink-muted">
        Ván này chưa có đủ dữ liệu bàn cờ để xem lại. Hãy chạy một ván đấu thử mới.
      </p>
    );
  return (
    <section aria-label="Xem lại ván đấu thử">
      <h3 className="mb-2 text-sm font-semibold">Xem lại ván đấu thử</h3>
      <p className="mb-3 text-xs text-ink-muted">
        Bot của bạn: {run.mySide === 'blue' ? 'Xanh' : 'Hồng'}. Bấm Chạy hoặc tua để xem từng nước.
      </p>
      <Board board={replay.board} lastMove={replay.lastMove} label="Bàn cờ đấu thử" />
      <ReplayBar r={replay} />
    </section>
  );
}
