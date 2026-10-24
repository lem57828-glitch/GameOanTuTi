import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { DemoGameRequest, Id, z, type SessionUser } from '@arena/contracts';
import { CurrentUser, DemoOnly, Roles } from '../../core/auth/guards.js';
import { notImplemented } from '../../core/errors.js';
import { ok, parse, type ArenaRequest } from '../../core/http.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsService } from './rooms.service.js';

const EventsQuery = z.object({ afterSeq: z.coerce.number().int().nonnegative().default(0) });

@Controller()
export class RoomsController {
  private readonly demoLimiter = new RateLimiter(30, 60_000);

  constructor(
    private readonly rooms: RoomsService,
    private readonly gateway: RoomsGateway,
  ) {}

  // ---- Công khai, chỉ đọc.

  @Get('rooms')
  async list() {
    return ok(await this.rooms.list());
  }

  @Get('rooms/:id')
  async snapshot(@Param('id') id: string) {
    return ok(await this.rooms.snapshot(parse(Id, id)));
  }

  @Get('rooms/:id/games/:gameId')
  async gameSnapshot(@Param('id') id: string, @Param('gameId') gameId: string) {
    return ok(await this.rooms.gameSnapshot(parse(Id, id), parse(Id, gameId)));
  }

  /** Sự kiện của một ván: replay mẫu và bù seq bị thiếu. */
  @Get('games/:id/events')
  async events(@Param('id') id: string, @Query() query: unknown) {
    const { afterSeq } = parse(EventsQuery, query);
    return ok(await this.rooms.gameEvents(parse(Id, id), afterSeq));
  }

  // ---- Demo: BTC tạo ván mô phỏng (chỉ khi DEMO_MODE bật).

  @Post('demo/games')
  @DemoOnly()
  @Roles('admin')
  async createDemoGame(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() req: ArenaRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.demoLimiter.check(`demo-games:${user.id}`);
    const input = parse(DemoGameRequest, body);
    const out = await this.rooms.createDemoGame(user, input, req.requestId);
    if (out.created) this.gateway.flush(out.roomId);
    res.status(out.created ? 201 : 200);
    return ok(out);
  }

  // ---- Chưa làm (TV4): phòng ngoài cặp đấu của giải; phòng theo cặp mở qua admin/tournaments/:id/matches/open.

  @Post('rooms')
  @Roles('admin', 'referee')
  open() {
    notImplemented('Mở phòng cho cặp đấu của giải', 'TV4');
  }
}
