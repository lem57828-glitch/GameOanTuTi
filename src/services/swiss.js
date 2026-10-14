// Logic Swiss thuần (không truy cập CSDL) để kiểm thử độc lập.
const config = require('../config');
const { rng, shuffle } = require('../rules');

/**
 * @param {number[]} teamIds đội tham gia sơ loại
 * @param {Array<{a:number,b:number,result:'a'|'b'|'draw',winsA:number,winsB:number}>} games trận Swiss đã có kết quả
 * @param {number[]} byes danh sách đội nhận bye (mỗi phần tử một lần bye)
 */
function standings(teamIds, games, byes) {
  const P = config.swiss;
  const s = new Map(teamIds.map((id) => [id, { teamId: id, points: 0, played: 0, w: 0, d: 0, l: 0, byes: 0, diff: 0, opponents: [] }]));
  for (const g of games) {
    const A = s.get(g.a), B = s.get(g.b);
    if (!A || !B) continue;
    A.played++; B.played++;
    A.opponents.push(g.b); B.opponents.push(g.a);
    A.diff += g.winsA - g.winsB; B.diff += g.winsB - g.winsA;
    if (g.result === 'a') { A.points += P.win; A.w++; B.points += P.loss; B.l++; }
    else if (g.result === 'b') { B.points += P.win; B.w++; A.points += P.loss; A.l++; }
    else { A.points += P.draw; B.points += P.draw; A.d++; B.d++; }
  }
  for (const id of byes) {
    const T = s.get(id);
    if (T) { T.points += P.bye; T.byes++; }
  }
  // Điểm phụ 1: điểm trung bình cuối cùng của các đối thủ thực sự đã gặp (bye không tính là đối thủ).
  for (const T of s.values()) {
    T.oppAvg = T.opponents.length
      ? Math.round((T.opponents.reduce((sum, o) => sum + s.get(o).points, 0) / T.opponents.length) * 1000) / 1000
      : 0;
  }
  const rows = [...s.values()].sort(compare);
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || compare(rows[i - 1], r) !== 0) rank = i + 1;
    r.rank = rank; // đội bằng hoàn toàn mọi tiêu chí có cùng hạng
  });
  return rows;
}

function compare(x, y) {
  return y.points - x.points || y.oppAvg - x.oppAvg || y.diff - x.diff;
}
const sameKey = (x, y) => compare(x, y) === 0;

/**
 * Ghép một vòng Swiss.
 * Vòng 1 bốc thăm theo seed. Các vòng sau ghép đội gần điểm, tránh tái đấu khi có thể.
 * Số đội lẻ: bye cho đội ít điểm nhất chưa từng nhận bye.
 * @returns {{pairs:Array<[number,number]>, bye:number|null, rematches:number}}
 */
function pairRound(rows, playedPairs, byeCounts, seed, roundNo) {
  const rand = rng(seed);
  // Trộn trong từng nhóm điểm để tránh ghép cứng theo thứ tự đăng ký.
  let order;
  if (roundNo === 1) order = shuffle(rows.map((r) => r.teamId), rand);
  else {
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.points)) groups.set(r.points, []);
      groups.get(r.points).push(r.teamId);
    }
    order = [...groups.keys()].sort((a, b) => b - a).flatMap((p) => shuffle(groups.get(p), rand));
  }

  const met = (a, b) => playedPairs.has(pairKey(a, b));
  // Ứng viên bye theo thứ tự ưu tiên: ít bye nhất, rồi ít điểm nhất, rồi xếp dưới hơn.
  // Thử lần lượt để không buộc tái đấu chỉ vì chọn bye trước.
  let candidates = [null];
  if (order.length % 2 === 1) {
    const pts = new Map(rows.map((r) => [r.teamId, r.points]));
    const pos = new Map(order.map((id, i) => [id, i]));
    candidates = order.slice().sort((a, b) => (byeCounts.get(a) || 0) - (byeCounts.get(b) || 0)
      || pts.get(a) - pts.get(b) || pos.get(b) - pos.get(a));
  }
  const minByes = candidates[0] == null ? 0 : (byeCounts.get(candidates[0]) || 0);
  for (const bye of candidates) {
    if (bye != null && (byeCounts.get(bye) || 0) > minByes) break; // không cho bye lần hai khi còn đội chưa nghỉ
    const pairs = solve(order.filter((id) => id !== bye), met, 20000);
    if (pairs) return { pairs, bye, rematches: 0 };
  }

  // Không tránh được tái đấu hoàn toàn: ghép tham lam với bye ưu tiên nhất, chấp nhận ít tái đấu nhất có thể.
  const bye = candidates[0];
  const pairs = [];
  let rematches = 0;
  const left = order.filter((id) => id !== bye);
  while (left.length) {
    const a = left.shift();
    let j = left.findIndex((b) => !met(a, b));
    if (j < 0) { j = 0; rematches++; }
    pairs.push([a, left.splice(j, 1)[0]]);
  }
  return { pairs, bye, rematches };
}

// Quay lui: ghép đội đầu danh sách với đội gần nhất chưa gặp.
function solve(order, met, budget) {
  const counter = { n: budget };
  const out = [];
  const go = (left) => {
    if (!left.length) return true;
    if (--counter.n < 0) return false;
    const [a, ...rest] = left;
    for (let j = 0; j < rest.length; j++) {
      if (met(a, rest[j])) continue;
      out.push([a, rest[j]]);
      if (go(rest.slice(0, j).concat(rest.slice(j + 1)))) return true;
      out.pop();
    }
    return false;
  };
  return go(order) ? out : null;
}

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Xác định Top N sau Swiss. Nếu nhóm bằng hoàn toàn vắt qua vị trí N thì trả về nhóm cần tranh suất.
 * @returns {{qualified:number[], contested:null|{group:number[], slots:number}}}
 */
function cutLine(rows, n = config.swiss.cut) {
  if (rows.length <= n) return { qualified: rows.map((r) => r.teamId), contested: null };
  const last = rows[n - 1], next = rows[n];
  if (!sameKey(last, next)) return { qualified: rows.slice(0, n).map((r) => r.teamId), contested: null };
  const group = rows.filter((r) => sameKey(r, last)).map((r) => r.teamId);
  const above = rows.filter((r) => compare(r, last) < 0).map((r) => r.teamId);
  return { qualified: above, contested: { group, slots: n - above.length } };
}

/**
 * Một bước tranh suất ở ranh giới. Trận ở đây luôn phân thắng thua (đấu phụ rồi bốc thăm).
 * Nhóm tối đa 10 đội: loại trực tiếp rút gọn, cần K-S trận, đội còn lại được miễn đấu theo bốc thăm.
 * Nhóm trên 10 đội: thêm đúng một vòng trong nhóm trước, rồi chỉ xử lý phần còn vắt qua ranh giới.
 * @returns {{mode:'knockout'|'group-round', pairs:Array<[number,number]>, free:number[]}}
 */
function contestStep(group, slots, seed, groupRoundUsed = false) {
  const order = shuffle(group, rng(seed));
  const K = order.length;
  if (K > 10 && !groupRoundUsed) {
    const pairs = [];
    for (let i = 0; i + 1 < K; i += 2) pairs.push([order[i], order[i + 1]]);
    return { mode: 'group-round', pairs, free: K % 2 ? [order[K - 1]] : [] };
  }
  const m = Math.min(K - slots, Math.floor(K / 2));
  const pairs = [];
  for (let i = 0; i < m; i++) pairs.push([order[2 * i], order[2 * i + 1]]);
  return { mode: 'knockout', pairs, free: order.slice(2 * m) };
}

/**
 * Áp kết quả một bước tranh suất. winners: đội thắng từng cặp.
 * @returns {{qualified:number[], group:number[], slots:number}} qualified là đội vừa giành suất ở bước này
 */
function applyContest(step, winners, slots) {
  const losers = step.pairs.map(([a, b]) => (winners.includes(a) ? b : a));
  const advanced = [...winners, ...step.free];
  if (step.mode === 'knockout') {
    if (advanced.length <= slots) return { qualified: advanced, group: [], slots: slots - advanced.length };
    return { qualified: [], group: advanced, slots };
  }
  // Vòng thêm trong nhóm: nếu đội thắng (và đội miễn) vừa đủ suất thì lấy hết, phần thua tranh suất còn lại.
  if (advanced.length <= slots) {
    const rest = slots - advanced.length;
    return rest === 0 ? { qualified: advanced, group: [], slots: 0 } : { qualified: advanced, group: losers, slots: rest };
  }
  return { qualified: [], group: advanced, slots };
}

/** Thứ tự hạt giống chuẩn cho nhánh 2^k đội: 1 gặp N, 2 gặp N-1... và hạt giống cao chỉ gặp nhau muộn. */
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

module.exports = { standings, compare, pairRound, pairKey, cutLine, contestStep, applyContest, seedOrder };
