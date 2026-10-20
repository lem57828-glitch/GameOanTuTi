// Socket.IO cho người xem phòng (chỉ đọc). Sự kiện: room.join, room.leave → room.snapshot, room.event, room.error.
//
// Luồng cập nhật: worker lưu sự kiện vào PostgreSQL rồi publish tín hiệu {roomId, gameId} lên Redis.
// API nhận tín hiệu, đọc các sự kiện có seq lớn hơn seq đã phát và gửi vào phòng Socket.IO. Nếu phòng đã sang
// ván mới (stream đổi) thì gửi snapshot đầy đủ. Mất tín hiệu không làm sai trạng thái: lần sau sẽ gửi bù,
// và client luôn có thể tải snapshot.
import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RoomJoinPayload, RoomSignal, SOCKET_EVENTS, redisKeys } from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { AppError } from '../../core/errors.js';
import { RedisService } from '../../core/redis.service.js';
import { RoomsService } from './rooms.service.js';
import { streamIdOf } from './snapshot.js';

const MAX_ROOMS_PER_SOCKET = 3;
const channel = (roomId: string) => `room:${roomId}`;

@WebSocketGateway()
export class RoomsGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RoomsGateway');
  @WebSocketServer() server: Server;

  /** Vị trí đã phát của mỗi phòng: stream hiện tại và seq cuối. */
  private readonly cursor = new Map<string, { streamId: string | null; seq: number }>();
  /** Chuỗi xử lý theo phòng để giữ đúng thứ tự phát. */
  private readonly chains = new Map<string, Promise<void>>();
  private signalChannel: string;

  constructor(
    private readonly rooms: RoomsService,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.signalChannel = redisKeys(cfg.queuePrefix).roomSignals;
  }

  async onModuleInit(): Promise<void> {
    await this.redis.subscriber.subscribe(this.signalChannel);
    this.redis.subscriber.on('message', (ch, raw) => {
      if (ch !== this.signalChannel) return;
      try {
        const signal = RoomSignal.parse(JSON.parse(raw));
        this.flush(signal.roomId);
      } catch {
        this.log.warn('Bỏ qua tín hiệu phòng không hợp lệ.');
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.subscriber.unsubscribe(this.signalChannel).catch(() => undefined);
  }

  handleConnection(socket: Socket): void {
    // Chặn gửi dồn: tối đa 20 thông điệp mỗi 10 giây trên một kết nối.
    let count = 0;
    const reset = setInterval(() => (count = 0), 10_000);
    socket.use((_packet, next) => (++count > 20 ? next(new Error('RATE_LIMITED')) : next()));
    socket.on('disconnect', () => clearInterval(reset));
  }

  @SubscribeMessage(SOCKET_EVENTS.join)
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const parsed = RoomJoinPayload.safeParse(body);
    if (!parsed.success) return this.fail(socket, 'VALIDATION_ERROR', 'roomId không hợp lệ.');
    const joined = [...socket.rooms].filter((r) => r.startsWith('room:'));
    if (joined.length >= MAX_ROOMS_PER_SOCKET && !socket.rooms.has(channel(parsed.data.roomId))) {
      return this.fail(socket, 'CONFLICT', `Chỉ xem tối đa ${MAX_ROOMS_PER_SOCKET} phòng trên một kết nối.`);
    }
    try {
      const snapshot = await this.rooms.snapshot(parsed.data.roomId);
      await socket.join(channel(parsed.data.roomId));
      socket.emit(SOCKET_EVENTS.snapshot, snapshot);
      return { ok: true };
    } catch (e) {
      if (e instanceof AppError) return this.fail(socket, e.code, e.message);
      this.log.error(`room.join lỗi: ${(e as Error).message}`);
      return this.fail(socket, 'INTERNAL_ERROR', 'Không tải được phòng.');
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.leave)
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const parsed = RoomJoinPayload.safeParse(body);
    if (parsed.success) await socket.leave(channel(parsed.data.roomId));
    return { ok: true };
  }

  /** Phát phần sự kiện mới của phòng (gọi khi có tín hiệu từ worker hoặc sau khi API tự ghi sự kiện). */
  flush(roomId: string): void {
    const prev = this.chains.get(roomId) ?? Promise.resolve();
    const next = prev
      .then(() => this.doFlush(roomId))
      .catch((e: Error) => this.log.warn(`Phát sự kiện phòng ${roomId} lỗi: ${e.message}`));
    this.chains.set(roomId, next);
    void next.finally(() => {
      if (this.chains.get(roomId) === next) this.chains.delete(roomId);
    });
  }

  private async doFlush(roomId: string): Promise<void> {
    const gameId = await this.rooms.currentGameId(roomId);
    const streamId = gameId ? streamIdOf(gameId) : null;
    const cur = this.cursor.get(roomId);
    if (!gameId || !cur || cur.streamId !== streamId) {
      const snapshot = await this.rooms.snapshot(roomId);
      this.cursor.set(roomId, { streamId: snapshot.streamId, seq: snapshot.seq });
      this.server.to(channel(roomId)).emit(SOCKET_EVENTS.snapshot, snapshot);
      return;
    }
    const events = await this.rooms.gameEvents(gameId, cur.seq);
    for (const ev of events) {
      this.server.to(channel(roomId)).emit(SOCKET_EVENTS.event, ev);
      cur.seq = ev.seq;
    }
  }

  private fail(socket: Socket, code: string, message: string) {
    socket.emit(SOCKET_EVENTS.error, { code, message });
    return { ok: false, error: { code, message } };
  }
}
