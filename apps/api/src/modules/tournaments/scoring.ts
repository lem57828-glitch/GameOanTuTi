// Tính kết quả một cặp đấu từ danh sách ván/hiệp — một đường tính duy nhất cho kết quả từ TV4 (MatchCompleted),
// BTC nhập tay và mô phỏng demo. Hàm thuần, có kiểm thử (test/unit/tournament-competition.test.ts).
//
//   swiss    : đúng 2 ván đổi màu; so số ván thắng → thắng/hòa/thua trận (đề xuất Q02).
//   tiebreak : 2 ván; vẫn bằng thì tối đa 2 ván phụ; vẫn bằng thì bốc thăm (luôn phân thắng thua).
//   knockout : đủ 5 hiệp chính, mỗi hiệp thắng 3 / hòa 1 / thua 0; bằng điểm thì đúng 2 hiệp phụ;
//              so tổng 7 hiệp, vẫn bằng thì bốc thăm công khai (thể lệ 2.0 mục 6).
import { rng } from '@arena/game-engine';
import { AppError } from '../../core/errors.js';

export type PairingKind = 'swiss' | 'tiebreak' | 'knockout';
/** Kết quả một ván/hiệp: 'a' | 'b' thắng, null = hòa. */
export type GameOutcome = 'a' | 'b' | null;

export interface PairingOutcome {
  result: 'a' | 'b' | 'draw';
  scoreA: number;
  scoreB: number;
  winsA: number;
  winsB: number;
  draws: number;
  decidedBy: 'score' | 'extra' | 'lots';
  /** Có giá trị khi phải bốc thăm: kết quả được tính từ seed của cặp, ghi lại để công khai. */
  lots: { winner: 'a' | 'b'; seed: number } | null;
}

export const FORMAT: Record<
  PairingKind,
  { main: number; extra: number; decisive: boolean; win: number; draw: number }
> = {
  swiss: { main: 2, extra: 0, decisive: false, win: 1, draw: 0 },
  tiebreak: { main: 2, extra: 2, decisive: true, win: 1, draw: 0 },
  knockout: { main: 5, extra: 2, decisive: true, win: 3, draw: 1 },
};

const invalid = (message: string) => new AppError('VALIDATION_ERROR', message);

export function evaluatePairing(
  kind: PairingKind,
  games: readonly GameOutcome[],
  seed: number,
): PairingOutcome {
  const f = FORMAT[kind];
  const tally = (list: readonly GameOutcome[]) => {
    let a = 0;
    let b = 0;
    let wa = 0;
    let wb = 0;
    let d = 0;
    for (const g of list) {
      if (g === 'a') {
        a += f.win;
        wa++;
      } else if (g === 'b') {
        b += f.win;
        wb++;
      } else {
        a += f.draw;
        b += f.draw;
        d++;
      }
    }
    return { a, b, wa, wb, d };
  };
  if (games.length < f.main) throw invalid(`Cần đủ ${f.main} ván/hiệp chính, mới có ${games.length}.`);
  const main = tally(games.slice(0, f.main));
  const tiedAfterMain = main.a === main.b;
  if (games.length > f.main) {
    if (!f.decisive || !tiedAfterMain)
      throw invalid('Chỉ chơi ván/hiệp phụ khi bằng điểm sau các ván/hiệp chính.');
    if (games.length !== f.main + f.extra) throw invalid(`Phải chơi đúng ${f.extra} ván/hiệp phụ.`);
  } else if (f.decisive && tiedAfterMain && f.extra > 0) {
    throw invalid(`Bằng điểm sau ${f.main} ván/hiệp chính: cần thêm đúng ${f.extra} ván/hiệp phụ.`);
  }
  const all = tally(games);
  const base = { scoreA: all.a, scoreB: all.b, winsA: all.wa, winsB: all.wb, draws: all.d };
  if (all.a !== all.b) {
    return {
      ...base,
      result: all.a > all.b ? 'a' : 'b',
      decidedBy: games.length > f.main ? 'extra' : 'score',
      lots: null,
    };
  }
  if (!f.decisive) return { ...base, result: 'draw', decidedBy: 'score', lots: null };
  // Bốc thăm: xác định theo seed của cặp → kiểm tra lại được, không phụ thuộc người thao tác.
  const winner = rng(seed ^ 0x5eed)() < 0.5 ? 'a' : 'b';
  return { ...base, result: winner, decidedBy: 'lots', lots: { winner, seed } };
}

/** Số ván/hiệp cần chơi tiếp theo trạng thái hiện tại (dùng cho mô phỏng và giao diện nhập tay). */
export function gamesNeeded(kind: PairingKind, games: readonly GameOutcome[]): number {
  const f = FORMAT[kind];
  if (games.length < f.main) return f.main - games.length;
  if (games.length === f.main && f.decisive && f.extra > 0) {
    const t = games.reduce(
      (acc, g) =>
        g === 'a'
          ? { ...acc, a: acc.a + f.win }
          : g === 'b'
            ? { ...acc, b: acc.b + f.win }
            : { a: acc.a + f.draw, b: acc.b + f.draw },
      { a: 0, b: 0 },
    );
    return t.a === t.b ? f.extra : 0;
  }
  return 0;
}
