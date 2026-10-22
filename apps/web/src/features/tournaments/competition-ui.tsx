// Thành phần hiển thị dùng chung của phần thi đấu (TV3): bảng xếp hạng, nhánh đấu, dòng kết quả cặp.
// Trạng thái luôn có nhãn chữ, không chỉ phân biệt bằng màu.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, EmptyState, Select, Spinner, Table, cn, type BadgeTone } from '@arena/ui';
import type { BracketView, LevelView, PairingView, StandingRowView, StandingsView } from '@arena/contracts';
import { api } from '../../lib/api';

export const LEVEL_STATUS: Record<LevelView['status'], { label: string; tone: BadgeTone }> = {
  planned: { label: 'Chưa bắt đầu', tone: 'neutral' },
  locked: { label: 'Đã khóa bot', tone: 'blue' },
  running: { label: 'Đang thi', tone: 'accent' },
  cutting: { label: 'Đang tranh suất', tone: 'warning' },
  done: { label: 'Đã chốt', tone: 'success' },
  skipped: { label: 'Bỏ qua (đủ suất)', tone: 'neutral' },
};

const ROW_STATE: Record<NonNullable<StandingRowView['state']>, { label: string; tone: BadgeTone }> = {
  zone: { label: 'Trong vùng đi tiếp (tạm)', tone: 'blue' },
  maybe: { label: 'Bằng điểm ở ranh giới', tone: 'warning' },
  contest: { label: 'Đang tranh suất', tone: 'warning' },
  advanced: { label: 'Đi tiếp', tone: 'success' },
  eliminated: { label: 'Bị loại', tone: 'danger' },
  withdrawn: { label: 'Đã rút', tone: 'neutral' },
};

export const KIND_LABEL: Record<PairingView['kind'], string> = {
  swiss: 'Swiss',
  bye: 'Lượt nghỉ',
  tiebreak: 'Tranh suất',
  knockout: 'Loại trực tiếp',
};

const DECIDED: Record<string, string> = {
  score: 'theo điểm',
  extra: 'sau hiệp phụ',
  lots: 'bốc thăm',
  bye: 'lượt nghỉ',
  walkover: 'vắng đối thủ',
};

export function pairingLabel(p: PairingView): string {
  if (p.kind === 'knockout') return `${p.phase?.toUpperCase()} · cặp ${(p.slot ?? 0) + 1}`;
  if (p.kind === 'tiebreak') return `Tranh suất bước ${p.round - 1000}`;
  return `Mức ${p.levelOrd ?? ''} · vòng ${p.round}`.replace('Mức  · ', '');
}

/** Một cặp đấu: hai đội, tỉ số và cách phân thắng. */
export function PairingLine({ p, compact = false }: { p: PairingView; compact?: boolean }) {
  const name = (t: PairingView['teamA'], seed: number | null) =>
    t ? `${seed ? `#${seed} ` : ''}${t.name}` : '— (trống)';
  const won = (id: string | undefined) => !!id && p.winnerTeamId === id;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', compact ? 'text-xs' : 'text-sm')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('truncate', won(p.teamA?.id) ? 'font-bold text-ink' : 'text-ink-muted')}>
          {won(p.teamA?.id) && <span className="sr-only">Thắng: </span>}
          {name(p.teamA, p.seedA)}
        </span>
        <span className="shrink-0 font-mono font-bold">
          {p.status === 'done' && p.kind !== 'bye' ? p.scoreA : ''}
        </span>
      </div>
      {p.kind !== 'bye' && (
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate', won(p.teamB?.id) ? 'font-bold text-ink' : 'text-ink-muted')}>
            {won(p.teamB?.id) && <span className="sr-only">Thắng: </span>}
            {name(p.teamB, p.seedB)}
          </span>
          <span className="shrink-0 font-mono font-bold">{p.status === 'done' ? p.scoreB : ''}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {p.status === 'scheduled' && <Badge tone="warning">Chờ kết quả</Badge>}
        {p.status === 'done' && p.decidedBy && (
          <Badge tone="neutral">{DECIDED[p.decidedBy] ?? p.decidedBy}</Badge>
        )}
        {p.status === 'done' &&
          (p.confirmed ? <Badge tone="success">Đã chốt</Badge> : <Badge tone="blue">Kết quả tạm</Badge>)}
        {p.source === 'simulation' && <Badge tone="warning">Mô phỏng</Badge>}
        {p.openAppeals > 0 && <Badge tone="danger">{p.openAppeals} khiếu nại mở</Badge>}
      </div>
    </div>
  );
}

export function StandingsPanel({ tournamentId, levels }: { tournamentId: string; levels: LevelView[] }) {
  const [level, setLevel] = useState<string>('');
  const q = useQuery({
    queryKey: ['standings', tournamentId, level],
    queryFn: () =>
      api<StandingsView>(`/tournaments/${tournamentId}/standings${level ? `?level=${level}` : ''}`),
    refetchInterval: 10_000,
  });
  if (!levels.length) {
    return (
      <EmptyState
        icon="≡"
        title="Chưa có kế hoạch sơ loại"
        description="BTC chưa lập các mức sơ loại cho giải này."
      />
    );
  }
  const s = q.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select
            label="Mức sơ loại"
            value={level || (s?.level ? String(s.level.ord) : undefined)}
            onValueChange={setLevel}
            options={levels.map((l) => ({
              value: String(l.ord),
              label: `${l.name} — ${LEVEL_STATUS[l.status].label}`,
            }))}
          />
        </div>
        {s?.level && (
          <p className="text-sm text-ink-muted">
            Vòng {s.level.roundsPlayed}/{s.level.rounds} · chọn {s.level.teamTarget} đội ·{' '}
            {s.provisional ? 'điểm tạm (chưa xác nhận hết)' : 'điểm đã xác nhận'}
          </p>
        )}
      </div>
      {s?.level?.late && (
        <Alert tone="warning" title="Kết quả mức này đang chậm so với giờ công bố">
          BTC chưa chốt xong mức; không chọn đội từ bảng điểm chưa đủ trận.
        </Alert>
      )}
      {q.isLoading && <Spinner label="Đang tải bảng xếp hạng" />}
      {q.error && (
        <Alert tone="error" title="Không tải được bảng xếp hạng">
          {(q.error as Error).message}
        </Alert>
      )}
      {s && (
        <Table
          label="Bảng xếp hạng sơ loại"
          rows={s.rows}
          rowKey={(r) => r.teamId}
          empty={
            <EmptyState
              title="Mức này chưa có đội tham gia"
              description="Đội được đưa vào khi BTC khóa bot của mức."
            />
          }
          caption="Thứ tự: điểm (thắng 3, hòa 1, thua 0, nghỉ 3) → điểm trung bình đối thủ → hiệu số ván. Bằng hoàn toàn thì cùng hạng."
          columns={[
            {
              key: 'rank',
              header: '#',
              cell: (r) => <span className="font-mono font-bold">{r.rank}</span>,
              className: 'w-12',
            },
            { key: 'name', header: 'Đội', cell: (r) => <span className="font-semibold">{r.name}</span> },
            {
              key: 'pts',
              header: 'Điểm',
              cell: (r) => <span className="font-mono font-bold text-accent-strong">{r.points}</span>,
            },
            {
              key: 'wdl',
              header: 'T-H-B',
              cell: (r) => (
                <span className="font-mono">{`${r.w}-${r.d}-${r.l}${r.byes ? ` (+${r.byes} nghỉ)` : ''}`}</span>
              ),
            },
            {
              key: 'opp',
              header: 'ĐTB đối thủ',
              cell: (r) => <span className="font-mono">{r.oppAvg.toFixed(2)}</span>,
            },
            {
              key: 'diff',
              header: 'Hiệu số',
              cell: (r) => <span className="font-mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</span>,
            },
            {
              key: 'state',
              header: 'Trạng thái',
              cell: (r) =>
                r.state ? <Badge tone={ROW_STATE[r.state].tone}>{ROW_STATE[r.state].label}</Badge> : null,
            },
          ]}
        />
      )}
    </div>
  );
}

const ROUND_STATUS: Record<BracketView[number]['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Chưa bắt đầu', tone: 'neutral' },
  running: { label: 'Đang thi', tone: 'accent' },
  finished: { label: 'Đấu xong, chờ chốt', tone: 'warning' },
  done: { label: 'Đã chốt', tone: 'success' },
};

/** Cây 32 → 4: mỗi cột một vòng, cuộn ngang trong vùng riêng trên màn hình hẹp. */
export function BracketPanel({
  bracket,
  top4,
}: {
  bracket: BracketView;
  top4: Array<{ id: string; name: string }> | null;
}) {
  if (!bracket.length) {
    return (
      <EmptyState
        icon="⑂"
        title="Chưa có nhánh đấu"
        description="Nhánh 32 đội được lập khi BTC chốt mức sơ loại cuối."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {top4 && (
        <Alert tone="success" title="Top 4 vào bán kết">
          {top4.map((t) => t.name).join(' · ')}
        </Alert>
      )}
      <div
        role="region"
        aria-label="Nhánh đấu 32 → 4"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line p-3 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <div className="grid min-w-[760px] grid-cols-3 gap-4">
          {bracket.map((r) => (
            <section key={r.phase} aria-label={r.title} className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{r.title}</h3>
                <Badge tone={ROUND_STATUS[r.status].tone}>{ROUND_STATUS[r.status].label}</Badge>
              </header>
              {r.pairings.length === 0 ? (
                <p className="text-xs text-ink-muted">Cặp đấu có sau khi chốt vòng trước.</p>
              ) : (
                <ol className="flex flex-col justify-around gap-2" style={{ minHeight: '100%' }}>
                  {r.pairings.map((p) => (
                    <li key={p.id} className="rounded-md border border-line bg-bg-deep/50 p-2">
                      <PairingLine p={p} compact />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        Mỗi cặp 5 hiệp (thắng 3, hòa 1, thua 0); bằng điểm chơi đúng 2 hiệp phụ, vẫn bằng thì bốc thăm công
        khai. Nhánh cố định theo hạt giống.
      </p>
    </div>
  );
}
