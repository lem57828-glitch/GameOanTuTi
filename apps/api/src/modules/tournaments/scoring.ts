// Tính kết quả một cặp đấu từ danh sách ván/hiệp — một đường tính duy nhất cho kết quả từ TV4 (MatchCompleted),
// BTC nhập tay và mô phỏng demo. Hàm thuần, có kiểm thử (test/unit/tournament-competition.test.ts).
//
//   swiss    : đúng 2 ván đổi màu; so số ván thắng → thắng/hòa/thua trận (đề xuất Q02).
//   tiebreak : 2 ván; vẫn bằng thì tối đa 2 ván phụ; vẫn bằng thì bốc thăm (luôn phân thắng thua).
//   knockout : đủ 5 hiệp chính, mỗi hiệp thắng 3 / hòa 1 / thua 0; bằng điểm thì đúng 2 hiệp phụ;
//              so tổng 7 hiệp, vẫn bằng thì bốc thăm công khai (thể lệ 2.0 mục 6).
//   semifinal: BO5 — ai thắng 3 ván trước thắng loạt; final: BO7 — thắng 4 ván trước (đặc tả bán kết/chung kết).
//              Ván hòa không tính. Hết số ván tối đa mà chưa ai đủ: hơn số ván thắng thì thắng; bằng nhau thì
//              đấu thêm từng ván (tối đa 2) tới khi có người dẫn; vẫn bằng thì bốc thăm công khai.
import { rng } from '@arena/game-engine';
import { AppError } from '../../core/errors.js';

export type PairingKind = 'swiss' | 'tiebreak' | 'knockout' | 'semifinal' | 'final';
/** Thể thức loạt "best of": bán kết, chung kết. */
export const SERIES: Partial<Record<PairingKind, { bestOf: number; extra: number }>> = {
  semifinal: { bestOf: 5, extra: 2 },
  final: { bestOf: 7, extra: 2 },
};
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1;
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
  semifinal: { main: 5, extra: 2, decisive: true, win: 1, draw: 0 },
  final: { main: 7, extra: 2, decisive: true, win: 1, draw: 0 },
};

const invalid = (message: string) => new AppError('VALIDATION_ERROR', message);

const winsOf = (games: readonly GameOutcome[]) => ({
  a: games.filter((g) => g === 'a').length,
  b: games.filter((g) => g === 'b').length,
});

/** Loạt đã phân định chưa (sau các ván đã chơi). */
function seriesDecided(s: { bestOf: number; extra: number }, games: readonly GameOutcome[]): boolean {
  const w = winsOf(games);
  const need = winsNeeded(s.bestOf);
  if (w.a >= need || w.b >= need) return true;
  if (games.length < s.bestOf) return false;
  return w.a !== w.b || games.length >= s.bestOf + s.extra;
}

function evaluateSeries(
  s: { bestOf: number; extra: number },
  games: readonly GameOutcome[],
  seed: number,
): PairingOutcome {
  for (let i = 0; i < games.length; i++)
    if (seriesDecided(s, games.slice(0, i)))
      throw invalid(`Loạt đã phân định sau ${i} ván; không chơi thêm ván ${i + 1}.`);
  if (!seriesDecided(s, games))
    throw invalid(
      games.length < s.bestOf
        ? `Loạt BO${s.bestOf} chưa phân định: cần chơi tiếp (mới ${games.length} ván).`
        : 'Bằng số ván thắng sau số ván tối đa: cần đấu thêm ván phụ.',
    );
  const w = winsOf(games);
  const base = { scoreA: w.a, scoreB: w.b, winsA: w.a, winsB: w.b, draws: games.length - w.a - w.b };
  if (w.a !== w.b)
    return {
      ...base,
      result: w.a > w.b ? 'a' : 'b',
      decidedBy: games.length > s.bestOf ? 'extra' : 'score',
      lots: null,
    };
  const winner = rng(seed ^ 0x5eed)() < 0.5 ? 'a' : 'b';
  return { ...base, result: winner, decidedBy: 'lots', lots: { winner, seed } };
}

export function evaluatePairing(
  kind: PairingKind,
  games: readonly GameOutcome[],
  seed: number,
): PairingOutcome {
  const series = SERIES[kind];
  if (series) return evaluateSeries(series, games, seed);
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
  // Loạt BO: chơi từng ván một, dừng ngay khi đã phân định.
  const series = SERIES[kind];
  if (series) return seriesDecided(series, games) ? 0 : 1;
  const f = FORMAT[kind];
  if (games.length < f.main) return f.main - games.length;
  if (f.decisive && f.extra > 0) {
    // Bằng điểm sau các ván chính: chơi ĐỦ số ván phụ (không dừng sớm khi một bên đã dẫn).
    const t = games.slice(0, f.main).reduce(
      (acc, g) =>
        g === 'a'
          ? { ...acc, a: acc.a + f.win }
          : g === 'b'
            ? { ...acc, b: acc.b + f.win }
            : { a: acc.a + f.draw, b: acc.b + f.draw },
      { a: 0, b: 0 },
    );
    return t.a === t.b ? Math.max(0, f.main + f.extra - games.length) : 0;
  }
  return 0;
}
