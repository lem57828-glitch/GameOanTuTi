import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

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

  /**
   * Nộp phiên bản bot mới (TV2 - Gói việc 1).
   * Lưu snapshot mã nguồn, tính SHA-256 bất biến, kiểm tra cú pháp và trùng lặp.
   */
  @Post('bots')
  @Authenticated()
  async submit(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const bot = await this.bots.submitBot(user, body);
    return ok(bot);
  }

  /**
   * Xem mã nguồn và báo cáo kiểm thử của bot (TV2 - Gói việc 1).
   * Chỉ người trong đội hoặc BTC mới được xem.
   */
  @Get('bots/:id/source')
  @Authenticated()
  async source(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const detail = await this.bots.getBotSource(user, parse(Id, id));
    return ok(detail);
  }

  // ---- Đấu thử trong sandbox (TV2 - Gói việc 4)
  @Post('bots/:id/test-runs')
  @Authenticated()
  async testRun(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const run = await this.bots.createTestRun(user, parse(Id, id), body);
    return ok(run);
  }

  @Get('bots/:id/test-runs')
  @Authenticated()
  async listTestRuns(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ) {
    const list = await this.bots.listTestRuns(user, parse(Id, id));
    return ok(list);
  }

  @Get('test-runs/:runId')
  @Authenticated()
  async getTestRun(
    @CurrentUser() user: SessionUser,
    @Param('runId') runId: string,
  ) {
    const detail = await this.bots.getTestRun(user, parse(Id, runId));
    return ok(detail);
  }
}
