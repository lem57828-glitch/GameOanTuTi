// Bán kết, chung kết offline — phần hiển thị dùng chung cho BTC, thí sinh và khán giả.
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, CardHeader, type BadgeTone } from '@arena/ui';
import type { FinalsRoundView, FinalsView } from '@arena/contracts';
import { PairingLine } from './competition-ui';

export const FINALS_STATUS: Record<FinalsRoundView['status'], { label: string; tone: BadgeTone }> = {
  waiting: { label: 'Chờ vòng trước', tone: 'neutral' },
  collecting: { label: 'Đang nhận bài', tone: 'warning' },
  locked: { label: 'Đã khóa bài · kiểm tra bot', tone: 'blue' },
  running: { label: 'Đang thi đấu', tone: 'accent' },
  finished: { label: 'Đã đấu xong · chờ chốt', tone: 'warning' },
  done: { label: 'Đã chốt', tone: 'success' },
};

export const RULESET_LABEL: Record<string, string> = {
  'semifinal-obstacles-1': 'Luật bán kết: 5 vật cản cố định (C5, D6, E5, F4, G5)',
  'final-dynamic-1':
    'Luật chung kết: vật cản cố định C5, G5 · 2 vật cản động quanh E5 (6 nước/ô) · ô khiên E3, E7 · ô đổi loại B5, H5',
};

/** Thí sinh / khán giả: tiến trình bán kết, chung kết, phòng xem trực tiếp và đội vô địch. */
export function FinalsPanel({ finals, myTeamId }: { finals: FinalsView; myTeamId?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {finals.champion && (
        <Card className="border-success/60">
          <CardHeader
            title={`🏆 Vô địch: ${finals.champion.name}`}
            subtitle={finals.runnerUp ? `Á quân: ${finals.runnerUp.name}` : undefined}
          />
        </Card>
      )}
      {finals.rounds.map((r) => {
        const mine = !!myTeamId && r.teams.some((t) => t.id === myTeamId);
        return (
          <Card key={r.phase}>
            <CardHeader
              title={`${r.title} · BO${r.bestOf} (thắng ${r.winsNeeded} ván trước)`}
              subtitle={
                r.rulesetId
                  ? (RULESET_LABEL[r.rulesetId] ?? r.rulesetId)
                  : 'Thi offline tại trường; luật mới được BTC công bố tại chỗ.'
              }
              action={<Badge tone={FINALS_STATUS[r.status].tone}>{FINALS_STATUS[r.status].label}</Badge>}
            />
            {mine && (r.status === 'collecting' || r.status === 'locked') && (
              <Alert tone="info" title="Đội bạn thi vòng này — offline tại trường" className="mb-3">
                Mang laptop cá nhân có Python. Giám thị yêu cầu ngắt Internet, Wi-Fi, điểm phát sóng; không
                dùng điện thoại hay USB cá nhân. Sau khi BTC công bố luật mới và phát bộ kiểm thử offline, đội
                có 90–120 phút sửa bot. Hết giờ, giám thị thu mã nguồn bằng USB của BTC; sau đó không được sửa
                nữa.
                {r.status === 'locked' && ' BTC đã khóa bài và đang kiểm tra bot.'}
              </Alert>
            )}
            {r.status === 'waiting' ? (
              <p className="text-sm text-ink-muted">Chờ kết quả vòng trước.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.pairings.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1 rounded-md border border-line p-3">
                    <PairingLine p={p} />
                    {p.roomId && (
                      <Link className="text-sm font-semibold text-accent" to={`/rooms/${p.roomId}`}>
                        {p.status === 'scheduled' ? 'Xem trực tiếp →' : 'Xem lại các ván →'}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
