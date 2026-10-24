import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { Id, z, type SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser, Roles } from '../../core/auth/guards.js';
import { RateLimiter } from '../../core/rate-limit.js';
import { ok, parse } from '../../core/http.js';
import { BotsRunnerService } from './bots-runner.service.js';

const ListQuery = z.object({ teamId: Id.optional() });

@Controller()
export class BotsController {
  private readonly submissions = new RateLimiter(10, 60_000);
  private readonly practice = new RateLimiter(10, 60_000);
  constructor(private readonly bots: BotsRunnerService) {}

  @Post('stages/:stageId/bot-selection')
  @Authenticated()
  async selectBots(
    @CurrentUser() user: SessionUser,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    return ok(await this.bots.saveSelection(user, parse(Id, stageId), body));
  }
  @Post('stages/:stageId/bot-selection/lock')
  @Roles('admin')
  async lockBots(@CurrentUser() user: SessionUser, @Param('stageId') stageId: string, @Body() body: unknown) {
    return ok(await this.bots.saveSelection(user, parse(Id, stageId), body, true));
  }
  @Get('stages/:stageId/bot-selection/:teamId')
  @Authenticated()
  async selection(
    @CurrentUser() user: SessionUser,
    @Param('stageId') stageId: string,
    @Param('teamId') teamId: string,
  ) {
    return ok(await this.bots.selection(user, parse(Id, teamId), parse(Id, stageId)));
  }
  @Get('admin/bots/duplicates')
  @Roles('admin')
  async duplicates() {
    return ok(await this.bots.duplicateReport());
  }

  /** Danh sách phiên bản bot (không kèm mã nguồn). Sinh viên chỉ thấy bot của đội mình. */
  @Get('bots')
  @Authenticated()
  async list(@CurrentUser() user: SessionUser, @Query() query: unknown) {
    const { teamId } = parse(ListQuery, query);
    return ok(await this.bots.listBots(user, teamId));
  }

  @Get('games/:id/bot-diagnostics')
  @Authenticated()
  async diagnostics(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return ok(await this.bots.diagnostics(user, parse(Id, id)));
  }

  @Get('jobs/:id')
  @Roles('admin')
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
    this.submissions.check(user.teamId ?? user.id);
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

  /** Xóa một phiên bản bot không dùng nữa (kèm các lượt đấu thử). Bot đã thi đấu chính thức được giữ lại. */
  @Delete('bots/:id')
  @Authenticated()
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return ok(await this.bots.deleteBot(user, parse(Id, id)));
  }

  // ---- Đấu thử trong sandbox (TV2 - Gói việc 4)
  @Post('bots/:id/test-runs')
  @Authenticated()
  async testRun(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    this.practice.check(user.teamId ?? user.id);
    const run = await this.bots.createTestRun(user, parse(Id, id), body);
    return ok(run);
  }

  @Get('bots/:id/test-runs')
  @Authenticated()
  async listTestRuns(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const list = await this.bots.listTestRuns(user, parse(Id, id));
    return ok(list);
  }

  @Get('test-runs/:runId')
  @Authenticated()
  async getTestRun(@CurrentUser() user: SessionUser, @Param('runId') runId: string) {
    const detail = await this.bots.getTestRun(user, parse(Id, runId));
    return ok(detail);
  }
}
