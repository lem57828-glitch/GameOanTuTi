// Kiểm thử logic thuần: luật, Swiss, bằng điểm ở ranh giới, nhánh hạt giống.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/rules');
const swiss = require('../src/services/swiss');

const RPS = { moves: ['ROCK', 'PAPER', 'SCISSORS'], beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] } };

test('phân xử lượt: thắng, hòa, lựa chọn sai', () => {
  assert.equal(rules.judge(RPS, 'ROCK', 'SCISSORS'), 'a');
  assert.equal(rules.judge(RPS, 'ROCK', 'PAPER'), 'b');
  assert.equal(rules.judge(RPS, 'PAPER', 'PAPER'), 'draw');
  assert.equal(rules.judge(RPS, 'LIZARD', 'ROCK'), 'b', 'lựa chọn ngoài luật thua');
  assert.equal(rules.judge(RPS, null, 'ROCK'), 'b', 'lỗi/quá giờ thua');
  assert.equal(rules.judge(RPS, null, 'FOO'), 'draw', 'cả hai sai là hòa');
});

test('kết quả trận: nhiều lượt thắng hơn thì thắng, bằng nhau hòa', () => {
  assert.equal(rules.matchResult({ winsA: 40, winsB: 39 }), 'a');
  assert.equal(rules.matchResult({ winsA: 30, winsB: 30 }), 'draw');
  assert.deepEqual(rules.tally([{ r: 'a' }, { r: 'b' }, { r: 'draw' }, { r: 'a' }]), { winsA: 2, winsB: 1, draws: 1 });
});

test('kiểm tra bộ luật chung kết', () => {
  assert.equal(rules.validateRuleset(RPS), null);
  assert.match(rules.validateRuleset({ moves: ['A', 'B'], beats: { A: ['B'], B: ['A'] } }), /lẫn nhau/);
  assert.match(rules.validateRuleset({ moves: ['A', 'A'], beats: {} }), /trùng/);
  assert.match(rules.validateRuleset({ moves: ['A', 'B'], beats: { A: ['C'] } }), /lạ/);
});

test('bảng điểm Swiss: 3/1/0, bye 3 điểm không tính đối thủ và hiệu số', () => {
  const games = [
    { a: 1, b: 2, result: 'a', winsA: 50, winsB: 30 },
    { a: 3, b: 4, result: 'draw', winsA: 40, winsB: 40 },
  ];
  const rows = swiss.standings([1, 2, 3, 4, 5], games, [5]);
  const by = Object.fromEntries(rows.map((r) => [r.teamId, r]));
  assert.equal(by[1].points, 3);
  assert.equal(by[2].points, 0);
  assert.equal(by[3].points, 1);
  assert.equal(by[5].points, 3);
  assert.equal(by[5].diff, 0);
  assert.equal(by[5].oppAvg, 0, 'bye không phải đối thủ 0 điểm');
  assert.equal(by[1].diff, 20);
  // Đội 1 và 5 cùng 3 điểm; đội 1 gặp đối thủ 0 điểm, đội 5 không gặp ai -> bằng ĐTB, hiệu số phân định.
  assert.ok(rows.findIndex((r) => r.teamId === 1) < rows.findIndex((r) => r.teamId === 5));
});

test('đội bằng hoàn toàn mọi tiêu chí có cùng hạng', () => {
  const rows = swiss.standings([1, 2, 3, 4], [
    { a: 1, b: 2, result: 'a', winsA: 10, winsB: 0 },
    { a: 3, b: 4, result: 'a', winsA: 10, winsB: 0 },
  ], []);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1);
  assert.equal(rows[2].rank, 3);
});

test('ghép Swiss: tránh tái đấu, số lẻ thì bye cho đội chưa từng nghỉ', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const games = [];
  const byes = [];
  const played = new Set();
  const byeCounts = new Map();
  for (let round = 1; round <= 5; round++) {
    const rows = swiss.standings(ids, games, byes);
    const plan = swiss.pairRound(rows, played, byeCounts, 1000 + round, round);
    assert.equal(plan.pairs.length, 5);
    assert.equal(plan.rematches, 0);
    assert.ok(plan.bye);
    assert.equal(byeCounts.get(plan.bye) || 0, 0, 'không đội nào nhận bye hai lần khi còn đội chưa nghỉ');
    const seen = new Set([plan.bye]);
    for (const [a, b] of plan.pairs) {
      assert.ok(!seen.has(a) && !seen.has(b), 'mỗi đội một trận mỗi vòng');
      seen.add(a); seen.add(b);
      assert.ok(!played.has(swiss.pairKey(a, b)), `tái đấu ${a}-${b} ở vòng ${round}`);
      played.add(swiss.pairKey(a, b));
      games.push({ a, b, result: a < b ? 'a' : 'b', winsA: 1, winsB: 0 });
    }
    byes.push(plan.bye);
    byeCounts.set(plan.bye, 1);
  }
});

test('tái đấu không tránh được thì được ghép và báo số lần tái đấu', () => {
  const rows = swiss.standings([1, 2, 3, 4], [], []);
  const all = new Set(['1-2', '1-3', '1-4', '2-3', '2-4', '3-4']);
  const plan = swiss.pairRound(rows, all, new Map(), 3, 4);
  assert.equal(plan.pairs.length, 2);
  assert.equal(plan.rematches, 2);
});

test('bye ưu tiên đội ít điểm nhất khi không ảnh hưởng tái đấu', () => {
  const rows = swiss.standings([1, 2, 3, 4, 5], [
    { a: 1, b: 2, result: 'a', winsA: 1, winsB: 0 },
    { a: 3, b: 4, result: 'a', winsA: 1, winsB: 0 },
  ], [5]);
  const plan = swiss.pairRound(rows, new Set(['1-2', '3-4']), new Map([[5, 1]]), 9, 2);
  assert.ok([2, 4].includes(plan.bye), 'đội 0 điểm chưa nghỉ nhận bye');
});

test('ghép Swiss số chẵn: không bye; vòng 1 tái lập được theo seed', () => {
  const rows = swiss.standings([1, 2, 3, 4, 5, 6], [], []);
  const p1 = swiss.pairRound(rows, new Set(), new Map(), 42, 1);
  const p2 = swiss.pairRound(rows, new Set(), new Map(), 42, 1);
  assert.equal(p1.bye, null);
  assert.deepEqual(p1.pairs, p2.pairs);
});

test('ranh giới Top 32: không bằng điểm thì lấy thẳng 32 đội', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ teamId: i + 1, points: 40 - i, oppAvg: 0, diff: 0 }));
  const cut = swiss.cutLine(rows);
  assert.equal(cut.qualified.length, 32);
  assert.equal(cut.contested, null);
});

test('ranh giới Top 32: nhóm bằng hoàn toàn vắt qua vị trí 32', () => {
  const rows = [];
  for (let i = 1; i <= 27; i++) rows.push({ teamId: i, points: 100 - i, oppAvg: 0, diff: 0 });
  for (let i = 28; i <= 37; i++) rows.push({ teamId: i, points: 10, oppAvg: 5, diff: 3 }); // 10 đội bằng nhau
  for (let i = 38; i <= 45; i++) rows.push({ teamId: i, points: 1, oppAvg: 0, diff: 0 });
  const cut = swiss.cutLine(rows);
  assert.equal(cut.qualified.length, 27);
  assert.equal(cut.contested.group.length, 10);
  assert.equal(cut.contested.slots, 5);
});

test('ít hơn hoặc bằng 32 đội: không loại ai', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ teamId: i + 1, points: 0, oppAvg: 0, diff: 0 }));
  assert.equal(swiss.cutLine(rows).qualified.length, 20);
});

/** Mô phỏng toàn bộ quá trình tranh suất, trả về số trận và đội giành suất. */
function simulateContest(K, S) {
  let group = Array.from({ length: K }, (_, i) => i + 1);
  let slots = S, matches = 0, step = 0, usedGroupRound = false;
  const qualified = [];
  while (group.length > slots && slots > 0) {
    const plan = swiss.contestStep(group, slots, 7 + step++, usedGroupRound);
    if (plan.mode === 'group-round') usedGroupRound = true;
    matches += plan.pairs.length;
    const winners = plan.pairs.map(([a, b]) => Math.min(a, b));
    const r = swiss.applyContest(plan, winners, slots);
    qualified.push(...r.qualified);
    group = r.group; slots = r.slots;
  }
  if (slots > 0) qualified.push(...group);
  return { matches, qualified };
}

test('tranh suất 10 đội / 5 suất: 5 cặp, thêm 5 trận', () => {
  const plan = swiss.contestStep(Array.from({ length: 10 }, (_, i) => i + 1), 5, 1);
  assert.equal(plan.mode, 'knockout');
  assert.equal(plan.pairs.length, 5);
  assert.equal(plan.free.length, 0);
  const sim = simulateContest(10, 5);
  assert.equal(sim.matches, 5);
  assert.equal(sim.qualified.length, 5);
});

test('tranh suất 7 đội / 3 suất (K-S trận, có miễn đấu): đúng 4 trận', () => {
  const sim = simulateContest(7, 3);
  assert.equal(sim.matches, 4);
  assert.equal(sim.qualified.length, 3);
  assert.equal(new Set(sim.qualified).size, 3);
});

test('tranh suất 50 đội / 32 suất (ví dụ trong đề án): 1 vòng thêm 25 trận + 18 trận loại = 43', () => {
  const first = swiss.contestStep(Array.from({ length: 50 }, (_, i) => i + 1), 32, 1);
  assert.equal(first.mode, 'group-round');
  assert.equal(first.pairs.length, 25);
  const sim = simulateContest(50, 32);
  assert.equal(sim.matches, 43);
  assert.equal(sim.qualified.length, 32);
  assert.equal(new Set(sim.qualified).size, 32);
});

test('tranh suất nhiều cỡ nhóm luôn ra đúng số suất', () => {
  for (let K = 2; K <= 60; K++) {
    for (const S of [1, Math.floor(K / 2), K - 1]) {
      if (S < 1 || S >= K) continue;
      const sim = simulateContest(K, S);
      assert.equal(sim.qualified.length, S, `K=${K} S=${S}`);
      assert.equal(new Set(sim.qualified).size, S);
    }
  }
});

test('thứ tự hạt giống nhánh 32', () => {
  const o = swiss.seedOrder(32);
  assert.equal(o.length, 32);
  assert.deepEqual(o.slice(0, 4), [1, 32, 16, 17]);
  assert.deepEqual([...o].sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1));
  for (let i = 0; i < 32; i += 2) assert.equal(o[i] + o[i + 1], 33);
  // Hạt giống 1 và 2 ở hai nửa nhánh khác nhau.
  assert.ok(o.indexOf(1) < 16 && o.indexOf(2) >= 16);
});
