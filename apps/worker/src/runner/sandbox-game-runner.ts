// TV2 — Gói việc 3: Bộ chạy ván cờ hoàn chỉnh hỗ trợ cả Bot Python thật trong Sandbox và Bot mô phỏng.
import type { GameEndReason, GameRequest, MoveRecord, Side } from '@arena/contracts';
import {
  DEMO_POLICIES,
  countPieces,
  getRuleset,
  legalMoves,
  newGame,
  applyMove,
  otherSide,
  toPythonState,
  rng,
  type GameState,
} from '@arena/game-engine';
import { PermanentRunError, type GameRunner, type RunOutcome } from './game-runner.js';
import { PythonBotProcess, PythonProcessError } from './python-process.js';

export interface BotInfo {
  isDemo: boolean;
  demoPolicy?: string | null;
  sourceCode?: string | null;
}

export type BotResolver = (botVersionId: string) => Promise<BotInfo | null>;

export class SandboxGameRunner implements GameRunner {
  constructor(private readonly resolveBot: BotResolver) {}

  async run(request: GameRequest, onMove: (move: MoveRecord) => Promise<void>): Promise<RunOutcome> {
    const rules = getRuleset(request.rulesetId, {
      blue: request.choices.blue.extraType,
      pink: request.choices.pink.extraType,
    });

    const [blueInfo, pinkInfo] = await Promise.all([
      this.resolveBot(request.choices.blue.botVersionId),
      this.resolveBot(request.choices.pink.botVersionId),
    ]);

    if (!blueInfo) {
      throw new PermanentRunError(`Không tìm thấy thông tin bot của bên Xanh (${request.choices.blue.botVersionId}).`);
    }
    if (!pinkInfo) {
      throw new PermanentRunError(`Không tìm thấy thông tin bot của bên Hồng (${request.choices.pink.botVersionId}).`);
    }

    const rand = rng(request.seed);
    const pythonProcesses: Partial<Record<Side, PythonBotProcess>> = {};

    try {
      // 1. Khởi động các tiến trình bot Python trong sandbox (nếu có)
      for (const [side, info] of [
        ['blue', blueInfo],
        ['pink', pinkInfo],
      ] as const) {
        if (!info.isDemo && info.sourceCode) {
          const proc = new PythonBotProcess({
            sourceCode: info.sourceCode,
            startupMs: request.limits.startupMs,
            wallMsPerMove: request.limits.wallMsPerMove,
          });
          await proc.start();
          pythonProcesses[side] = proc;
        }
      }

      // 2. Vòng lặp thi đấu ván cờ
      let state: GameState = newGame(rules, request.limits.maxPlies);
      const errorsCount: Record<Side, number> = { blue: 0, pink: 0 };
      const maxErrors = request.limits.maxErrorsPerGame ?? 3;

      while (state.ply < request.limits.maxPlies) {
        const side = state.toMove;
        const currentInfo = side === 'blue' ? blueInfo : pinkInfo;
        const proc = pythonProcesses[side];
        const validMoves = legalMoves(rules, state, side);

        if (validMoves.length === 0) {
          return {
            winner: otherSide(side),
            reason: 'no_moves',
            plies: state.ply,
            piecesLeft: countPieces(state.board),
          };
        }

        let chosenMove: { from: string; to: string } | null = null;

        // A. Lấy nước đi từ Bot Python trong Sandbox
        if (proc) {
          const pyState = toPythonState(rules, state, side);
          try {
            chosenMove = await proc.requestMove(pyState, request.limits.wallMsPerMove);
          } catch (err: any) {
            const opp = otherSide(side);
            const reason: GameEndReason =
              err instanceof PythonProcessError && err.type === 'MOVE_TIMEOUT' ? 'timeout' : 'crash';
            return {
              winner: opp,
              reason,
              plies: state.ply,
              piecesLeft: countPieces(state.board),
            };
          }
        } else {
          // B. Lấy nước đi từ Bot Mô Phỏng (Demo Policy)
          const policyKey = currentInfo.demoPolicy && DEMO_POLICIES[currentInfo.demoPolicy] ? currentInfo.demoPolicy : 'random';
          const policy = DEMO_POLICIES[policyKey]!;
          chosenMove = policy(rules, state, rand);
        }

        // C. Trọng tài kiểm tra tính hợp lệ của nước đi
        const isLegal = validMoves.some((m) => m.from === chosenMove?.from && m.to === chosenMove?.to);

        if (!isLegal) {
          errorsCount[side]++;
          if (errorsCount[side] >= maxErrors) {
            return {
              winner: otherSide(side),
              reason: 'errors',
              plies: state.ply,
              piecesLeft: countPieces(state.board),
            };
          }
          // Đi thay nước đầu tiên trong danh sách hợp lệ nếu phạm lỗi nhẹ
          chosenMove = validMoves[0]!;
        }

        // D. Áp dụng nước đi vào bàn cờ và thông báo sự kiện onMove
        const out = applyMove(rules, state, chosenMove!);
        state = out.state;
        await onMove(out.record);

        // E. Kiểm tra kết thúc ván cờ
        if (out.end) {
          return {
            winner: out.end.winner,
            reason: out.end.reason,
            plies: state.ply,
            piecesLeft: countPieces(state.board),
          };
        }
      }

      // Hết 200 nước mà chưa dừng -> tính theo số quân
      const finalPieces = countPieces(state.board);
      const winner =
        finalPieces.blue > finalPieces.pink ? 'blue' : finalPieces.pink > finalPieces.blue ? 'pink' : null;

      return {
        winner,
        reason: 'max_plies',
        plies: state.ply,
        piecesLeft: finalPieces,
      };
    } finally {
      // Dọn dẹp an toàn các tiến trình Python và xóa sandbox
      for (const proc of Object.values(pythonProcesses)) {
        proc?.terminate();
      }
    }
  }
}
