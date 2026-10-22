// Theo dõi phòng đấu: snapshot HTTP + Socket.IO. Chỉ đọc — xem phòng/tải lại/reconnect không tạo ván mới.
// Khi kết nối lại, server tự gửi snapshot mới nhất sau room.join; sự kiện lệch stream/seq → tải snapshot.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, RoomEvent, RoomSnapshot } from '@arena/contracts';
import { ApiError, api } from '../../lib/api';
import { applyRoomEvent, preferSnapshot } from './room-state';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export function useRoomStream(roomId: string) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<ApiError | null>(null);
  const [coinFor, setCoinFor] = useState<string | null>(null);
  const ref = useRef<RoomSnapshot | null>(null);
  const resyncs = useRef(0);

  const accept = useCallback((incoming: RoomSnapshot, live: boolean) => {
    const prev = ref.current;
    const next = preferSnapshot(prev, incoming);
    if (next === prev) return;
    // Hoạt ảnh tung xu chỉ khi chứng kiến ván mới bắt đầu; tải lại trang chỉ hiện kết quả đã lưu.
    const fresh =
      next.gameId &&
      next.coinResult &&
      (prev ? prev.streamId !== next.streamId && live : next.status === 'waiting');
    if (fresh) setCoinFor(next.gameId);
    ref.current = next;
    setSnapshot(next);
  }, []);

  const resync = useCallback(async () => {
    resyncs.current++;
    try {
      accept(RoomSnapshot.parse(await api<RoomSnapshot>(`/rooms/${encodeURIComponent(roomId)}`)), false);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Không tải được phòng.'));
    }
  }, [roomId, accept]);

  useEffect(() => {
    ref.current = null;
    setSnapshot(null);
    setError(null);
    void resync();

    const socket: Socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    const join = () => socket.emit(SOCKET_EVENTS.join, { roomId });
    socket.on('connect', () => {
      setConnection('live');
      join();
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', () => setConnection(navigator.onLine ? 'reconnecting' : 'offline'));
    socket.on(SOCKET_EVENTS.snapshot, (raw: unknown) => {
      const parsed = RoomSnapshot.safeParse(raw);
      if (!parsed.success) {
        void resync();
        return;
      }
      const s = parsed.data;
      if (s.roomId === roomId) accept(s, true);
    });
    socket.on(SOCKET_EVENTS.event, (raw: unknown) => {
      const parsed = RoomEvent.safeParse(raw);
      if (!parsed.success) {
        void resync();
        return;
      }
      const ev = parsed.data;
      const cur = ref.current;
      if (!cur || ev.aggregateId !== roomId) return;
      const r = applyRoomEvent(cur, ev);
      if (r.kind === 'applied') {
        ref.current = r.snapshot;
        setSnapshot(r.snapshot);
      } else if (r.kind === 'resync') {
        void resync();
      }
    });
    socket.on(SOCKET_EVENTS.error, (e: { code?: string; message?: string }) => {
      setError(
        new ApiError(0, (e.code as ApiError['code']) ?? 'INTERNAL_ERROR', e.message ?? 'Lỗi kết nối phòng.'),
      );
    });
    const offline = () => {
      socket.disconnect();
      setConnection('offline');
    };
    const online = () => {
      if (socket.connected) {
        setConnection('live');
        join();
      } else {
        setConnection('reconnecting');
        socket.connect();
      }
      void resync();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    // Redis pub/sub không bền vững: bù cả tín hiệu cuối bị mất dù socket vẫn còn kết nối.
    const catchup = window.setInterval(() => void resync(), 5000);
    return () => {
      window.clearInterval(catchup);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      if (socket.connected) socket.emit(SOCKET_EVENTS.leave, { roomId });
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomId, resync, accept]);

  const dismissCoin = useCallback(() => setCoinFor(null), []);
  return { snapshot, connection, error, resync, coinFor, dismissCoin };
}
