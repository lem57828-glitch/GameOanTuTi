import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Id, z, type SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser, Roles } from '../../core/auth/guards.js';
import { notImplemented } from '../../core/errors.js';
import { ok, parse } from '../../core/http.js';
import { BotsRunnerService } from './bots-runner.service.js';

const ListQuery = z.object({ teamId: Id.optional() });

@Controller()
export class BotsController {
  constructor(private readonly bots: BotsRunnerService) {}

  /** Danh sách phiên bản bot (không kèm mã nguồn). Sinh viên chỉ thấy bot của đội mình. */
  @Get('bots')
  @Authenticated()
  async list(@CurrentUser() user: SessionUser, @Query() query: unknown) {
    const { teamId } = parse(ListQuery, query);
    return ok(await this.bots.listBots(user, teamId));
  }

  @Get('jobs/:id')
  @Roles('admin', 'referee')
  async job(@Param('id') id: string) {
    return ok(await this.bots.jobView(parse(Id, id)));
  }

  // ---- Chưa làm ở M0 (TV2). Không nhận hoặc chạy mã do sinh viên gửi trong giai đoạn này.

  @Post('bots')
  @Authenticated()
  submit() {
    notImplemented('Nộp bot (GitHub riêng tư/tải lên)', 'TV2');
  }

  @Get('bots/:id/source')
  @Authenticated()
  source(@Param('id') _id: string) {
    notImplemented('Xem mã nguồn và báo cáo kiểm thử bot', 'TV2');
  }

  @Post('bots/:id/test-runs')
  @Authenticated()
  testRun(@Param('id') _id: string) {
    notImplemented('Kiểm thử/đấu thử bot trong sandbox', 'TV2');
  }
}
