// Dải thông báo trận đấu của đội, nổi ở mọi trang: vòng/giai đoạn nào, hiệp nào, đội cần làm gì, còn bao lâu.
// Loại trực tiếp: khi tới lượt đội chọn kín, hiện hộp "tự vào phòng sau 5 giây" (có nút Ở lại).
// Chỉ đọc dữ liệu sẵn có (cặp đấu của đội, snapshot phòng, lựa chọn của đội); không đổi trạng thái trận.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dialog, cn } from '@arena/ui';
import type { MyMatchSelection, MyPairingView, RoomSnapshot, TournamentView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const PHASE: Record<string, string> = { r32: 'Vòng 32', r16: 'Vòng 16', qf: 'Tứ kết' };
const AUTO_ENTER_SECONDS = 5;

function stageTitle(p: MyPairingView): string {
  if (p.kind === 'knockout') return PHASE[p.phase ?? ''] ?? 'Loại trực tiếp';
  if (p.kind === 'tiebreak') return 'Tranh suất ranh giới';
  return `Mức ${p.levelOrd ?? 1} · vòng ${p.round}`;
}

/** Nhớ trong phiên trình duyệt (bỏ qua nếu bị chặn): phòng nào người dùng đã chọn "Ở lại". */
const stayed = {
  has(id: string) {
    try {
      return sessionStorage.getItem(`stay:${id}`) === '1';
    } catch {
      return false;
    }
  },
  add(id: string) {
    try {
      sessionStorage.setItem(`stay:${id}`, '1');
    } catch {
      /* không lưu được thì thôi */
    }
  },
};

function useCountdown(deadline: string | null | undefined, serverTime: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline || !serverTime) return null;
  const skew = Date.parse(serverTime) - Date.now();
  const left = Math.max(0, Math.round((Date.parse(deadline) - (now + skew)) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

export function LiveMatchBanner() {
  const { user } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const student = user?.role === 'student' && !!user.teamId;
  const tournament = useQuery({
    queryKey: ['tournament', 'current'],
    queryFn: () => api<TournamentView>('/tournaments/current'),
    enabled: student,
    refetchInterval: 15_000,
    retry: false,
  });
  const t = tournament.data;
  const pairings = useQuery({
    queryKey: ['my-pairings', t?.id, user?.id],
    queryFn: () => api<MyPairingView[]>(`/tournaments/${t!.id}/my-pairings`),
    enabled: student && !!t,
    refetchInterval: 5000,
  });
  // Cặp đang chờ thi của đội (ưu tiên cặp đã có phòng).
  const pending = (pairings.data ?? []).filter((p) => p.status === 'scheduled');
  const active = pending.find((p) => p.roomId) ?? pending[0] ?? null;
  const roomId = active?.roomId ?? null;
  const room = useQuery({
    queryKey: ['banner-room', roomId],
    queryFn: () => api<RoomSnapshot>(`/rooms/${roomId}`),
    enabled: !!roomId,
    refetchInterval: 3000,
  });
  const mine = useQuery({
    queryKey: ['banner-selection', roomId, room.data?.match?.currentNo, room.data?.match?.status],
    queryFn: () => api<MyMatchSelection | null>(`/rooms/${roomId}/my-selection`),
    enabled: !!roomId && room.data?.match?.status === 'selecting',
    refetchInterval: 4000,
  });
  const m = room.data?.match ?? null;
  const countdown = useCountdown(m?.status === 'selecting' ? m.deadline : null, room.data?.serverTime);
  const onRoomPage = !!roomId && location.pathname === `/rooms/${roomId}`;

  // Loại trực tiếp, tới lượt đội chọn kín mà đang ở trang khác → hộp tự vào phòng.
  const mustChoose =
    m?.status === 'selecting' && mine.data?.canChoose === true && mine.data?.current?.ready !== true;
  const autoEnter =
    !!roomId && active?.kind === 'knockout' && mustChoose && !onRoomPage && !stayed.has(roomId);
  const [left, setLeft] = useState(AUTO_ENTER_SECONDS);
  const [, rerender] = useState(0);
  const stay = () => {
    if (roomId) stayed.add(roomId);
    rerender((n) => n + 1);
  };
  useEffect(() => {
    if (!autoEnter) {
      setLeft(AUTO_ENTER_SECONDS);
      return;
    }
    if (left <= 0) {
      navigate(`/rooms/${roomId}`);
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [autoEnter, left, roomId, navigate]);

  if (!student || !user || !active || onRoomPage) return null;
  const opponent = active.teamA?.id === user.teamId ? active.teamB?.name : active.teamA?.name;
  const side = active.teamA?.id === user.teamId ? 'a' : 'b';
  const score = m ? `${side === 'a' ? m.scoreA : m.scoreB}–${side === 'a' ? m.scoreB : m.scoreA}` : '';
  let tone: 'urgent' | 'live' | 'info' = 'info';
  let text = `Đội bạn gặp ${opponent ?? 'đối thủ'} · chờ BTC mở phòng thi đấu`;
  if (m) {
    if (m.status === 'selecting' && active.kind === 'knockout') {
      if (mustChoose) {
        tone = 'urgent';
        text = `Hiệp ${m.currentNo}: đội bạn cần chọn bot và quân thứ 10${countdown ? ` · còn ${countdown}` : ''} · tỷ số ${score}`;
      } else if (mine.data?.current?.ready) {
        text = `Hiệp ${m.currentNo}: đội bạn đã sẵn sàng · chờ đối thủ · tỷ số ${score}`;
      } else {
        text = `Hiệp ${m.currentNo}: chờ đội trưởng chọn bot và quân thứ 10 · tỷ số ${score}`;
      }
    } else if (m.status === 'running' || m.status === 'selecting') {
      tone = 'live';
      text = `Hiệp ${m.currentNo} đang diễn ra với ${opponent ?? 'đối thủ'} · tỷ số ${score}`;
    } else if (m.status === 'completed') {
      text = `Trận với ${opponent ?? 'đối thủ'} đã xong (${score}) · chờ BTC xác nhận kết quả`;
    } else if (m.status === 'paused') {
      tone = 'urgent';
      text = 'Trận đang tạm dừng · BTC đang xử lý';
    }
  }
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'mb-6 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm',
          tone === 'urgent' && 'border-warning/60 bg-warning/10',
          tone === 'live' && 'border-accent/50 bg-accent/10',
          tone === 'info' && 'border-line bg-surface',
        )}
      >
        <span className="flex items-center gap-2 font-bold">
          {tone !== 'info' && (
            <span
              className={cn(
                'h-2 w-2 animate-pulse rounded-full',
                tone === 'urgent' ? 'bg-warning' : 'bg-accent',
              )}
            />
          )}
          {stageTitle(active)}
        </span>
        <span className="min-w-0 flex-1">{text}</span>
        {roomId ? (
          <Button asChild size="sm" variant={tone === 'urgent' ? 'primary' : 'secondary'}>
            <Link to={`/rooms/${roomId}`}>{mustChoose ? 'Vào phòng chọn' : 'Vào phòng'}</Link>
          </Button>
        ) : (
          <Link to="/competition" className="font-semibold text-accent">
            Thi đấu của đội →
          </Link>
        )}
      </div>
      <Dialog
        open={autoEnter}
        onOpenChange={(o) => {
          if (!o) stay();
        }}
        title={`${stageTitle(active)}: tới lượt đội bạn`}
        description={`Hiệp ${m?.currentNo ?? 1}: chọn kín bot và quân thứ 10${countdown ? ` (còn ${countdown})` : ''}. Tự vào phòng sau ${left} giây.`}
        footer={
          <>
            <Button variant="ghost" onClick={stay}>
              Ở lại trang này
            </Button>
            <Button onClick={() => navigate(`/rooms/${roomId}`)}>Vào ngay</Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Đối thủ: {opponent ?? '—'} · tỷ số hiện tại {score || '0–0'}. Hết hạn chọn mà chưa chọn, hệ thống
          dùng lựa chọn mặc định.
        </p>
      </Dialog>
    </>
  );
}
