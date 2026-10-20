import { Controller, Get, Param, Post } from '@nestjs/common';
import type { SessionUser } from '@arena/contracts';
import { Authenticated, CurrentUser } from '../../core/auth/guards.js';
import { notImplemented } from '../../core/errors.js';
import { ok } from '../../core/http.js';
import { AccountsTeamsService } from './accounts-teams.service.js';

@Controller('teams')
export class TeamsController {
  constructor(private readonly accounts: AccountsTeamsService) {}

  /** Đội của người dùng trong giải hiện tại; `team: null` khi chưa có đội. */
  @Get('mine')
  @Authenticated()
  async mine(@CurrentUser() user: SessionUser) {
    return ok({ team: user.teamId ? await this.accounts.team(user.teamId) : null });
  }

  // ---- Chưa làm ở M0 (TV1).

  @Post()
  @Authenticated()
  create() {
    notImplemented('Lập đội', 'TV1');
  }

  @Post(':id/members')
  @Authenticated()
  invite(@Param('id') _id: string) {
    notImplemented('Mời/duyệt thành viên đội', 'TV1');
  }
}
