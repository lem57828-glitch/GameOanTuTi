import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './core/auth/guards.js';
import { OriginMiddleware } from './core/auth/origin.middleware.js';
import { CoreModule } from './core/core.module.js';
import { ErrorFilter } from './core/http.js';
import { AccountsTeamsModule } from './modules/accounts-teams/accounts-teams.module.js';
import { SessionMiddleware } from './modules/accounts-teams/session.middleware.js';
import { BotsRunnerModule } from './modules/bots-runner/bots-runner.module.js';
import { RoomsMatchesModule } from './modules/rooms-matches/rooms-matches.module.js';
import { TournamentsModule } from './modules/tournaments/tournaments.module.js';
import { HealthController } from './system/health.controller.js';
import { OpenApiController } from './system/openapi.js';

@Module({
  imports: [CoreModule, TournamentsModule, AccountsTeamsModule, BotsRunnerModule, RoomsMatchesModule],
  controllers: [HealthController, OpenApiController],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginMiddleware, SessionMiddleware).forRoutes('*path');
  }
}
