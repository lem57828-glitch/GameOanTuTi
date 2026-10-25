import { IdentityMark, SectorArt } from '../../components/WorkspaceVisuals';
// Thành phần hiển thị dùng chung của phần thi đấu (TV3): bảng xếp hạng, nhánh đấu, dòng kết quả cặp.
// Trạng thái luôn có nhãn chữ, không chỉ phân biệt bằng màu.
import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingState,
  Select,
  Table,
  cn,
  type BadgeTone,
} from '@arena/ui';
import type {
  BracketView,
  DemoKind,
  LevelView,
  PairingView,
  StandingRowView,
  StandingsView,
} from '@arena/contracts';
import { matchesSearch } from '../../lib/workspace-navigation';
import { api } from '../../lib/api';

/** Nhãn loại giải demo, dùng chung cho màn hình BTC và sinh viên. */
export const DEMO_KIND: Record<DemoKind, { label: string; tone: BadgeTone; hint: string }> = {
  experience: {
    label: 'Giải trải nghiệm · Chạy bot thật',
    tone: 'accent',
    hint: 'Mọi kết quả đến từ phòng đấu do worker chạy bot; không có kết quả mô phỏng.',
  },
  simulation: {
    label: 'Giải mô phỏng nhanh',
    tone: 'warning',
    hint: 'Dùng để thử ghép cặp, bảng điểm, cây giải. Kết quả mô phỏng có nhãn, không phải ván bot đã chạy.',
  },
};

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
        <span className={cn('pairing-team', won(p.teamA?.id) ? 'font-bold text-ink' : 'text-ink-muted')}>
          {won(p.teamA?.id) && <span className="sr-only">Thắng: </span>}
          {name(p.teamA, p.seedA)}
        </span>
        <span className="shrink-0 font-mono font-bold">
          {p.status === 'done' && p.kind !== 'bye' ? p.scoreA : ''}
        </span>
      </div>
      {p.kind !== 'bye' && (
        <div className="flex items-center justify-between gap-2">
          <span className={cn('pairing-team', won(p.teamB?.id) ? 'font-bold text-ink' : 'text-ink-muted')}>
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
        {p.source === 'manual' && <Badge tone="warning">BTC phân xử</Badge>}
        {p.openAppeals > 0 && <Badge tone="danger">{p.openAppeals} khiếu nại mở</Badge>}
        {p.roomId && (
          <Link
            to={`/rooms/${p.roomId}`}
            className="text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
          >
            Xem phòng
          </Link>
        )}
      </div>
    </div>
  );
}

export function StandingsPanel({ tournamentId, levels }: { tournamentId: string; levels: LevelView[] }) {
  const [level, setLevel] = useState<string>('');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['standings', tournamentId, level],
    queryFn: () =>
      api<StandingsView>(`/tournaments/${tournamentId}/standings${level ? `?level=${level}` : ''}`),
    refetchInterval: 10_000,
  });
  const s = q.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {levels.length > 0 && (
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
        )}
        {s?.level && !s.preview && (
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
      <Input
        label="Tìm đội trong bảng xếp hạng"
        type="search"
        placeholder="Tên đội…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {q.isLoading && <LoadingState label="Đang tải bảng xếp hạng" />}
      {q.error && (
        <Alert tone="error" title="Không tải được bảng xếp hạng">
          {(q.error as Error).message}
        </Alert>
      )}
      {s?.preview && (
        <Alert
          tone="info"
          title={`Danh sách đội dự kiến tham gia${s.level ? ` ${s.level.name}` : ''} (${s.rows.length} đội)`}
        >
          {levels.length === 0
            ? 'BTC chưa lập kế hoạch các mức sơ loại. Đây là các đội đã được duyệt của giải.'
            : 'Mức này chưa khóa bot. Danh sách được chốt khi BTC bấm "Khóa bot và mở mức"; đội rút hoặc chưa được duyệt sẽ không vào mức.'}
        </Alert>
      )}
      {s && !s.preview && s.rows.length > 0 && (
        <section className="leader-strip" aria-label="Nhóm đầu bảng">
          <div className="leader-strip-header">
            <h2>Nhóm đầu bảng</h2>
            <Badge tone={s.provisional ? 'warning' : 'neutral'}>
              {s.provisional ? 'Điểm tạm' : 'Điểm đã xác nhận'}
            </Badge>
          </div>
          <ol>
            {[...s.rows]
              .sort((a, b) => a.rank - b.rank)
              .slice(0, 3)
              .map((row) => (
                <li
                  key={row.teamId}
                  data-motion-stamp={`${row.rank}:${row.points}:${row.w}:${row.d}:${row.l}`}
                >
                  <IdentityMark seed={row.teamId} label={row.name} />
                  <div>
                    <small>HẠNG {row.rank}</small>
                    <strong>{row.name}</strong>
                    <span>
                      {row.points} điểm · {row.w} thắng / {row.d} hòa / {row.l} thua
                    </span>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      )}
      {s && (
        <Table
          label="Bảng xếp hạng sơ loại"
          rows={s.rows.filter((row) => matchesSearch(row.name, search))}
          rowKey={(r) => r.teamId}
          empty={
            <EmptyState
              title={
                search
                  ? 'Không tìm thấy đội phù hợp'
                  : s.preview
                    ? 'Chưa có đội đủ điều kiện'
                    : 'Mức này chưa có đội tham gia'
              }
              action={
                search ? (
                  <Button variant="secondary" onClick={() => setSearch('')}>
                    Xóa tìm kiếm
                  </Button>
                ) : undefined
              }
              description={
                s.preview
                  ? 'Đội cần được BTC duyệt (hoặc mức trước cần chốt) mới có tên ở đây.'
                  : 'Đội được đưa vào khi BTC khóa bot của mức.'
              }
            />
          }
          caption="Thứ tự: điểm (thắng 3, hòa 1, thua 0, nghỉ 3) → điểm trung bình đối thủ → hiệu số ván. Bằng hoàn toàn thì cùng hạng."
          columns={[
            {
              key: 'rank',
              header: '#',
              cell: (r) => <span className="font-mono font-bold">{s.preview ? '—' : r.rank}</span>,
              className: 'w-12',
            },
            {
              key: 'name',
              header: 'Đội',
              cell: (r) => (
                <span className="standings-team-name">
                  <IdentityMark seed={r.teamId} label={r.name} />
                  <strong>{r.name}</strong>
                </span>
              ),
            },
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

/** Nhánh thực tế: giữ nguyên trạng thái, xác nhận và đường dẫn phòng từ API. */
export function BracketPanel({
  bracket,
  top4,
}: {
  bracket: BracketView;
  top4: Array<{ id: string; name: string }> | null;
}) {
  const [search, setSearch] = useState('');
  if (!bracket.length)
    return (
      <EmptyState
        className="sector-empty"
        icon={<SectorArt variant="tournament" />}
        title="Chưa có nhánh đấu"
        description="Nhánh 32 đội được lập khi BTC chốt mức sơ loại cuối."
      />
    );
  const slots = Math.max(16, ...bracket.map((round, index) => round.pairings.length * 2 ** index));
  const unit = 160;
  return (
    <div className="bracket-feature">
      {top4 && top4.length > 0 && (
        <section className="finalists" aria-label="Các đội vào bán kết">
          <p>HÀNH TRÌNH TIẾP NỐI</p>
          <h2>Top 4 vào bán kết</h2>
          <ul>
            {top4.map((team) => (
              <li key={team.id}>
                <IdentityMark seed={team.id} label={team.name} />
                <strong>{team.name}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="bracket-tools">
        <Input
          label="Tìm đội trong nhánh đấu"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Làm nổi hành trình của một đội…"
        />
        {search && (
          <Button size="sm" variant="ghost" onClick={() => setSearch('')}>
            Xóa tìm kiếm
          </Button>
        )}
        <p>Cuộn ngang và dọc để theo dõi các vòng. Tỷ số, kết quả tạm và xử thắng được ghi riêng.</p>
      </div>
      <div
        className="bracket-viewport"
        role="region"
        aria-label="Nhánh đấu 32 đến 4, cuộn ngang và dọc"
        tabIndex={0}
      >
        <div
          className="bracket-rounds"
          style={{ gridTemplateColumns: `repeat(${bracket.length},minmax(260px,1fr))` }}
        >
          {bracket.map((round, roundIndex) => (
            <section className="bracket-round-column" key={round.phase} aria-label={round.title}>
              <header>
                <h3>{round.title}</h3>
                <Badge tone={ROUND_STATUS[round.status].tone}>{ROUND_STATUS[round.status].label}</Badge>
              </header>
              <ol style={{ gridTemplateRows: `repeat(${slots},${unit}px)` }}>
                {round.pairings.length === 0 ? (
                  <li className="bracket-pending">Cặp đấu xuất hiện sau khi vòng trước được chốt.</li>
                ) : (
                  round.pairings.map((pairing, index) => {
                    const span = 2 ** roundIndex;
                    const slot = pairing.slot ?? index;
                    const matched =
                      !search ||
                      matchesSearch(`${pairing.teamA?.name ?? ''} ${pairing.teamB?.name ?? ''}`, search);
                    return (
                      <li
                        className={`bracket-node${roundIndex === bracket.length - 1 ? ' last-round' : ''}${slot % 2 === 1 ? ' lower-branch' : ''}${!matched ? ' is-muted' : ''}`}
                        style={
                          {
                            gridRow: `${slot * span + 1} / span ${span}`,
                            '--branch-height': `${(unit * span) / 2}px`,
                          } as CSSProperties
                        }
                        data-motion-stamp={`${pairing.status}:${pairing.scoreA}:${pairing.scoreB}:${pairing.confirmed}:${pairing.winnerTeamId ?? ''}`}
                        key={pairing.id}
                      >
                        <span className="bracket-match-id">Cặp {slot + 1}</span>
                        <PairingLine p={pairing} />
                      </li>
                    );
                  })
                )}
              </ol>
            </section>
          ))}
        </div>
      </div>
      <p className="bracket-explanation">
        Mỗi cặp 5 hiệp; bằng điểm chơi đúng 2 hiệp phụ, vẫn bằng thì bốc thăm công khai. Nhánh cố định theo
        hạt giống. Thắng do vắng đối thủ được ghi rõ, không phải trận bot đã chạy.
      </p>
    </div>
  );
}
