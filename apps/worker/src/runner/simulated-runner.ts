// Runner mô phỏng tin cậy: dùng @arena/game-engine với ruleset demo và bot do hệ thống viết.
// Không nhận, không chạy mã do sinh viên gửi.
import type { GameRequest, MoveRecord } from '@arena/contracts';
import { DEMO_POLICIES, countPieces, getRuleset, simulate } from '@arena/game-engine';
import { PermanentRunError, type GameRunner, type RunOutcome } from './game-runner.js';

/** Tra chính sách bot mô phỏng theo botVersionId (đọc từ BotVersion.demoPolicy). */
export type PolicyResolver = (botVersionId: string) => Promise<string | null>;

export class SimulatedRunner implements GameRunner {
  constructor(private readonly resolvePolicy: PolicyResolver) {}

  async run(request: GameRequest, onMove: (move: MoveRecord) => Promise<void>): Promise<RunOutcome> {
    let rules;
    try {
      rules = getRuleset(request.rulesetId, {
        blue: request.choices.blue.extraType,
        pink: request.choices.pink.extraType,
      });
    } catch (e) {
      throw new PermanentRunError((e as Error).message);
    }
    const [blue, pink] = await Promise.all([
      this.resolvePolicy(request.choices.blue.botVersionId),
      this.resolvePolicy(request.choices.pink.botVersionId),
    ]);
    for (const [side, policy] of [
      ['blue', blue],
      ['pink', pink],
    ] as const) {
      if (!policy || !DEMO_POLICIES[policy]) {
        throw new PermanentRunError(`Bot bên ${side} không phải bot mô phỏng; runner bot thật chưa có ở M0.`);
      }
    }
    const sim = simulate(rules, { blue: blue!, pink: pink! }, request.seed, request.limits.maxPlies);
    for (const move of sim.moves) await onMove(move);
    return {
      winner: sim.end.winner,
      reason: sim.end.reason,
      plies: sim.moves.length,
      piecesLeft: countPieces(sim.finalBoard),
    };
  }
}
