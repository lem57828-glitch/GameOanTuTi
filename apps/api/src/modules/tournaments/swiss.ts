// Logic Swiss / cắt suất / hạt giống dạng hàm thuần (không đọc database) để kiểm thử độc lập.
// Căn cứ: docs/DAC_TA_TONG_HOP_VA_PHAN_CONG_4_NGUOI.md mục 5 (sơ loại chia mức) và 6.1 (cây 32 → 4).
// Các tham số còn chờ BTC chốt (Q02–Q05) được ghi trong docs/DECISIONS.md; giá trị ở đây là đề xuất.
import { rng } from '@arena/game-engine';

/** Điểm trận sơ loại: thắng 3, hòa 1, thua 0; lượt nghỉ (bye) tính như thắng (đề xuất, Q03). */
export const SWISS_POINTS = { win: 3, draw: 1, loss: 0, bye: 3 } as const;

export interface SwissGame {
  a: string;
  b: string;
  result: 'a' | 'b' | 'draw';
  /** Số ván thắng của mỗi bên trong trận (dùng cho hiệu số ván). */
  winsA: number;
  winsB: number;
}

export interface StandingRow {
  teamId: string;
  points: number;
  played: number;
  w: number;
  d: number;
  l: number;
  byes: number;
  /** Hiệu số ván thắng – thua. */
  diff: number;
  /** Điểm trung bình của các đối thủ đã gặp (tiêu chí phụ 1). */
  oppAvg: number;
  opponents: string[];
  rank: number;
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Thứ tự: điểm → ĐTB đối thủ → hiệu số ván. Bằng hoàn toàn → cùng hạng (không phân bằng id đội). */
export function compare(x: StandingRow, y: StandingRow): number {
  return y.points - x.points || y.oppAvg - x.oppAvg || y.diff - x.diff;
}

export function standings(
  teamIds: readonly string[],
  games: readonly SwissGame[],
  byes: readonly string[],
): StandingRow[] {
  const s = new Map<string, StandingRow>(
    teamIds.map((id) => [
      id,
      {
        teamId: id,
        points: 0,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        byes: 0,
        diff: 0,
        oppAvg: 0,
        opponents: [],
        rank: 0,
      },
    ]),
  );
  for (const g of games) {
    const A = s.get(g.a);
    const B = s.get(g.b);
    if (!A || !B) continue;
    A.played++;
    B.played++;
    A.opponents.push(g.b);
    B.opponents.push(g.a);
    A.diff += g.winsA - g.winsB;
    B.diff += g.winsB - g.winsA;
    if (g.result === 'a') {
      A.points += SWISS_POINTS.win;
      A.w++;
      B.points += SWISS_POINTS.loss;
      B.l++;
    } else if (g.result === 'b') {
      B.points += SWISS_POINTS.win;
      B.w++;
      A.points += SWISS_POINTS.loss;
      A.l++;
    } else {
      A.points += SWISS_POINTS.draw;
      B.points += SWISS_POINTS.draw;
      A.d++;
      B.d++;
    }
  }
  for (const id of byes) {
    const T = s.get(id);
    if (T) {
      T.points += SWISS_POINTS.bye;
      T.byes++;
    }
  }
  for (const T of s.values()) {
    T.oppAvg = T.opponents.length
      ? Math.round((T.opponents.reduce((sum, o) => sum + s.get(o)!.points, 0) / T.opponents.length) * 1000) /
        1000
      : 0;
  }
  const rows = [...s.values()].sort(compare);
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || compare(rows[i - 1]!, r) !== 0) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}

export interface RoundPlan {
  pairs: Array<[string, string]>;
  bye: string | null;
  /** Số cặp tái đấu buộc phải chấp nhận (0 nếu tránh được). BTC thấy con số này trong audit. */
  rematches: number;
}

/**
 * Ghép một vòng Swiss. Vòng 1 bốc thăm theo seed; các vòng sau ghép đội gần điểm, tránh tái đấu nếu có thể.
 * Số đội lẻ: bye cho đội ít bye nhất, rồi ít điểm nhất. Cùng seed → cùng kết quả (tái lập được).
 */
export function pairRound(
  rows: readonly Pick<StandingRow, 'teamId' | 'points'>[],
  played: ReadonlySet<string>,
  byeCounts: ReadonlyMap<string, number>,
  seed: number,
  roundNo: number,
): RoundPlan {
  const rand = rng(seed);
  let order: string[];
  if (roundNo === 1)
    order = shuffle(
      rows.map((r) => r.teamId),
      rand,
    );
  else {
    const groups = new Map<number, string[]>();
    for (const r of rows) {
      if (!groups.has(r.points)) groups.set(r.points, []);
      groups.get(r.points)!.push(r.teamId);
    }
    order = [...groups.keys()].sort((a, b) => b - a).flatMap((p) => shuffle(groups.get(p)!, rand));
  }
  const met = (a: string, b: string) => played.has(pairKey(a, b));

  let candidates: Array<string | null> = [null];
  if (order.length % 2 === 1) {
    const pts = new Map(rows.map((r) => [r.teamId, r.points]));
    const pos = new Map(order.map((id, i) => [id, i]));
    candidates = order
      .slice()
      .sort(
        (a, b) =>
          (byeCounts.get(a) ?? 0) - (byeCounts.get(b) ?? 0) ||
          pts.get(a)! - pts.get(b)! ||
          pos.get(b)! - pos.get(a)!,
      );
  }
  const first = candidates[0];
  const minByes = first == null ? 0 : (byeCounts.get(first) ?? 0);
  for (const bye of candidates) {
    if (bye != null && (byeCounts.get(bye) ?? 0) > minByes) break;
    const pairs = solve(
      order.filter((id) => id !== bye),
      met,
      20000,
    );
    if (pairs) return { pairs, bye, rematches: 0 };
  }
  // Không tránh được hoàn toàn: ghép tham lam, chấp nhận ít tái đấu nhất và báo số lượng.
  const bye = candidates[0] ?? null;
  const pairs: Array<[string, string]> = [];
  let rematches = 0;
  const left = order.filter((id) => id !== bye);
  while (left.length) {
    const a = left.shift()!;
    let j = left.findIndex((b) => !met(a, b));
    if (j < 0) {
      j = 0;
      rematches++;
    }
    pairs.push([a, left.splice(j, 1)[0]!]);
  }
  return { pairs, bye, rematches };
}

function solve(
  order: string[],
  met: (a: string, b: string) => boolean,
  budget: number,
): Array<[string, string]> | null {
  let n = budget;
  const out: Array<[string, string]> = [];
  const go = (left: string[]): boolean => {
    if (!left.length) return true;
    if (--n < 0) return false;
    const [a, ...rest] = left;
    for (let j = 0; j < rest.length; j++) {
      if (met(a!, rest[j]!)) continue;
      out.push([a!, rest[j]!]);
      if (go(rest.slice(0, j).concat(rest.slice(j + 1)))) return true;
      out.pop();
    }
    return false;
  };
  return go(order) ? out : null;
}

export interface CutResult {
  qualified: string[];
  contested: { group: string[]; slots: number } | null;
}

/** Chọn N đội đầu. Nhóm bằng hoàn toàn vắt qua vị trí N → tranh suất, không tự loại theo id đội (Q04). */
export function cutLine(rows: readonly StandingRow[], n: number): CutResult {
  if (rows.length <= n) return { qualified: rows.map((r) => r.teamId), contested: null };
  const last = rows[n - 1]!;
  const next = rows[n]!;
  if (compare(last, next) !== 0) return { qualified: rows.slice(0, n).map((r) => r.teamId), contested: null };
  const group = rows.filter((r) => compare(r, last) === 0).map((r) => r.teamId);
  const above = rows.filter((r) => compare(r, last) < 0).map((r) => r.teamId);
  return { qualified: above, contested: { group, slots: n - above.length } };
}

export interface ContestStep {
  mode: 'knockout' | 'group-round';
  pairs: Array<[string, string]>;
  free: string[];
}

/**
 * Một bước tranh suất. Nhóm ≤ 10 đội: loại trực tiếp rút gọn (cần K − S trận, đội dư được miễn theo bốc thăm).
 * Nhóm > 10 đội: thêm đúng một vòng trong nhóm, rồi chỉ xử lý phần còn vắt qua ranh giới.
 */
export function contestStep(
  group: readonly string[],
  slots: number,
  seed: number,
  groupRoundUsed: boolean,
): ContestStep {
  const order = shuffle(group, rng(seed));
  const K = order.length;
  if (K > 10 && !groupRoundUsed) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i + 1 < K; i += 2) pairs.push([order[i]!, order[i + 1]!]);
    return { mode: 'group-round', pairs, free: K % 2 ? [order[K - 1]!] : [] };
  }
  const m = Math.min(K - slots, Math.floor(K / 2));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < m; i++) pairs.push([order[2 * i]!, order[2 * i + 1]!]);
  return { mode: 'knockout', pairs, free: order.slice(2 * m) };
}

/** Áp kết quả một bước tranh suất. Trả về đội vừa giành suất và nhóm còn phải tranh tiếp. */
export function applyContest(
  step: ContestStep,
  winners: readonly string[],
  slots: number,
): { qualified: string[]; group: string[]; slots: number } {
  const losers = step.pairs.map(([a, b]) => (winners.includes(a) ? b : a));
  const advanced = [...winners, ...step.free];
  if (step.mode === 'knockout') {
    if (advanced.length <= slots) return { qualified: advanced, group: [], slots: slots - advanced.length };
    return { qualified: [], group: advanced, slots };
  }
  if (advanced.length <= slots) {
    const rest = slots - advanced.length;
    return rest === 0
      ? { qualified: advanced, group: [], slots: 0 }
      : { qualified: advanced, group: losers, slots: rest };
  }
  return { qualified: [], group: advanced, slots };
}

/** Thứ tự hạt giống chuẩn cho nhánh 2^k đội: 1 gặp N, 2 gặp N−1…; hạt giống cao chỉ gặp nhau muộn. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** Đề xuất các mức theo số đội (mục 5.1): 1000 → 500 → 200 → 100 → 32, bỏ mức không cần. */
export function suggestTargets(teamCount: number, cut = 32): number[] {
  const targets = [500, 200, 100].filter((t) => t < teamCount);
  targets.push(cut);
  return targets;
}
