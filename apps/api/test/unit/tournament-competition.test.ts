import { describe, expect, it } from 'vitest';
import { evaluatePairing, gamesNeeded } from '../../src/modules/tournaments/scoring.js';
import {
  applyContest,
  contestStep,
  cutLine,
  pairKey,
  pairRound,
  seedOrder,
  standings,
  suggestTargets,
  type SwissGame,
} from '../../src/modules/tournaments/swiss.js';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${String(i + 1).padStart(2, '0')}`);

describe('bảng xếp hạng Swiss', () => {
  it('thắng 3, hòa 1, thua 0, bye 3; tiêu chí phụ ĐTB đối thủ rồi hiệu số ván; bằng hoàn toàn cùng hạng', () => {
    const games: SwissGame[] = [
      { a: 't01', b: 't02', result: 'a', winsA: 2, winsB: 0 },
      { a: 't03', b: 't04', result: 'draw', winsA: 1, winsB: 1 },
    ];
    const rows = standings(teams(5), games, ['t05']);
    const by = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    expect(by.t01!.points).toBe(3);
    expect(by.t05!.points).toBe(3);
    expect(by.t03!.points).toBe(1);
    expect(by.t02!.points).toBe(0);
    expect(by.t01!.diff).toBe(2);
    // t01 có đối thủ (0 điểm) nên ĐTB đối thủ 0 = t05 (không có đối thủ) → phân bằng hiệu số.
    expect(rows[0]!.teamId).toBe('t01');
    expect(by.t03!.rank).toBe(by.t04!.rank);
  });
});

describe('ghép cặp Swiss', () => {
  it('cùng seed cho cùng kết quả; số lẻ thì đúng một bye cho đội chưa nghỉ', () => {
    const rows = teams(7).map((teamId) => ({ teamId, points: 0 }));
    const a = pairRound(rows, new Set(), new Map(), 42, 1);
    const b = pairRound(rows, new Set(), new Map(), 42, 1);
    expect(a).toEqual(b);
    expect(a.pairs).toHaveLength(3);
    expect(a.bye).not.toBeNull();
    const second = pairRound(rows, new Set(), new Map([[a.bye!, 1]]), 43, 2);
    expect(second.bye).not.toBe(a.bye);
  });

  it('tránh tái đấu khi còn cách ghép; báo số tái đấu khi buộc phải lặp', () => {
    const rows = teams(4).map((teamId) => ({ teamId, points: 0 }));
    const played = new Set([pairKey('t01', 't02'), pairKey('t03', 't04')]);
    const plan = pairRound(rows, played, new Map(), 7, 2);
    expect(plan.rematches).toBe(0);
    for (const [x, y] of plan.pairs) expect(played.has(pairKey(x, y))).toBe(false);
    const all = new Set([
      pairKey('t01', 't02'),
      pairKey('t01', 't03'),
      pairKey('t01', 't04'),
      pairKey('t02', 't03'),
      pairKey('t02', 't04'),
      pairKey('t03', 't04'),
    ]);
    expect(pairRound(rows, all, new Map(), 7, 4).rematches).toBe(2);
  });
});

describe('cắt suất và tranh suất', () => {
  it('nhóm bằng hoàn toàn vắt qua ranh giới phải tranh suất, không loại theo id', () => {
    const games: SwissGame[] = [
      { a: 't01', b: 't02', result: 'a', winsA: 2, winsB: 0 },
      { a: 't03', b: 't04', result: 'a', winsA: 2, winsB: 0 },
    ];
    const rows = standings(teams(4), games, []);
    expect(cutLine(rows, 2).contested).toBeNull();
    const cut = cutLine(rows, 1);
    expect(cut.qualified).toEqual([]);
    expect(cut.contested).toEqual({ group: expect.arrayContaining(['t01', 't03']), slots: 1 });
  });

  it('một bước tranh suất loại trực tiếp đủ chọn đúng số suất', () => {
    const group = ['t01', 't02', 't03', 't04', 't05'];
    const step = contestStep(group, 2, 9, false);
    expect(step.mode).toBe('knockout');
    expect(step.pairs).toHaveLength(2);
    const r = applyContest(
      step,
      step.pairs.map(([a]) => a),
      2,
    );
    // 2 đội thắng + 1 đội miễn = 3 > 2 suất → còn tranh tiếp trong nhóm 3 đội.
    expect(r.group).toHaveLength(3);
    const step2 = contestStep(r.group, 2, 10, false);
    const r2 = applyContest(
      step2,
      step2.pairs.map(([a]) => a),
      2,
    );
    expect(r2.qualified).toHaveLength(2);
    expect(r2.group).toHaveLength(0);
  });

  it('nhóm trên 10 đội thêm một vòng trong nhóm trước', () => {
    expect(contestStep(teams(12), 3, 1, false).mode).toBe('group-round');
    expect(contestStep(teams(12), 3, 1, true).mode).toBe('knockout');
  });
});

describe('hạt giống và kế hoạch mức', () => {
  it('cây 32: hạt giống 1 gặp 32, 1 và 2 ở hai nửa nhánh', () => {
    const order = seedOrder(32);
    expect(order.slice(0, 2)).toEqual([1, 32]);
    expect(new Set(order).size).toBe(32);
    expect(order.indexOf(2)).toBeGreaterThanOrEqual(16);
  });
  it('đề xuất mức: 1000 → 500 → 200 → 100 → 32; 180 đội → 100 → 32', () => {
    expect(suggestTargets(1000)).toEqual([500, 200, 100, 32]);
    expect(suggestTargets(180)).toEqual([100, 32]);
    expect(suggestTargets(40)).toEqual([32]);
  });
});

describe('tính kết quả cặp đấu', () => {
  it('sơ loại: 2 ván, hòa trận khi bằng số ván thắng', () => {
    expect(evaluatePairing('swiss', ['a', 'b'], 1).result).toBe('draw');
    expect(evaluatePairing('swiss', ['a', null], 1).result).toBe('a');
    expect(() => evaluatePairing('swiss', ['a'], 1)).toThrow(/2 ván/);
  });

  it('loại trực tiếp: 5 hiệp 3–1–0; bằng điểm buộc đúng 2 hiệp phụ; vẫn bằng thì bốc thăm theo seed', () => {
    const win = evaluatePairing('knockout', ['a', 'a', 'b', null, null], 5);
    expect(win).toMatchObject({ result: 'a', scoreA: 8, scoreB: 5, decidedBy: 'score' });
    const tied = ['a', 'a', 'b', 'b', null] as const;
    expect(gamesNeeded('knockout', [...tied])).toBe(2);
    expect(() => evaluatePairing('knockout', [...tied], 5)).toThrow(/hiệp phụ/);
    expect(evaluatePairing('knockout', [...tied, 'b', null], 5)).toMatchObject({
      result: 'b',
      decidedBy: 'extra',
    });
    const lots = evaluatePairing('knockout', [...tied, 'a', 'b'], 5);
    expect(lots.decidedBy).toBe('lots');
    expect(evaluatePairing('knockout', [...tied, 'a', 'b'], 5).result).toBe(lots.result);
    expect(() => evaluatePairing('knockout', ['a', 'a', 'a', 'a', 'a', 'b', 'b'], 5)).toThrow(/bằng điểm/);
  });
});
