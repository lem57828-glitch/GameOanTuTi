import { Controller, Get, Param, Post } from '@nestjs/common';
import { Authenticated, Roles } from '../../core/auth/guards.js';
import { notImplemented } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { TournamentsService } from './tournaments.service.js';

@Controller()
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get('tournaments/current')
  async current() {
    return ok(await this.tournaments.current());
  }

  // ---- Chưa làm ở M0 (TV3). Trả 501 FEATURE_NOT_IMPLEMENTED, không trả dữ liệu giả.

  @Get('tournaments/:id/standings')
  standings(@Param('id') _id: string) {
    notImplemented('Bảng xếp hạng sơ loại', 'TV3');
  }

  @Post('tournaments/:id/stages/:stageId/pairings')
  @Roles('admin')
  pair(@Param('id') _id: string) {
    notImplemented('Ghép cặp Swiss / loại trực tiếp', 'TV3');
  }

  @Post('appeals')
  @Authenticated()
  appeal() {
    notImplemented('Gửi khiếu nại', 'TV3');
  }
}
