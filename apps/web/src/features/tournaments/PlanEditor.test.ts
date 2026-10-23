import { describe, expect, it } from 'vitest';
import { checkPlan, defaultTargets, type PlanRow } from './PlanEditor';

const rows = (targets: string[], rounds = '3'): PlanRow[] => targets.map((t, i) => ({ name: `Mức ${i + 1}`, target: t, rounds }));

describe('PlanEditor', () => {
  it('gợi ý giảm dần và luôn kết thúc ở 32', () => {
    expect(defaultTargets(1, 40)).toEqual([32]);
    expect(defaultTargets(4, 1000)).toEqual([500, 200, 100, 32]);
    const six = defaultTargets(6, 1000);
    expect(six).toHaveLength(6);
    expect(six.at(-1)).toBe(32);
    six.slice(1).forEach((v, i) => expect(v).toBeLessThan(six[i]!));
  });

  it('kế hoạch hợp lệ', () => {
    expect(checkPlan(rows(['500', '200', '100', '32']), 1200).valid).toBe(true);
  });

  it('báo lỗi đúng dòng: không giảm dần, mức cuối khác 32, số vòng sai', () => {
    const c = checkPlan([...rows(['200', '300']), { name: 'x', target: '40', rounds: '0' }], 1000);
    expect(c.valid).toBe(false);
    expect(c.rows[1]!.target).toMatch(/nhỏ hơn mức trước/);
    expect(c.rows[2]!.target).toMatch(/32/);
    expect(c.rows[2]!.rounds).toBeDefined();
  });

  it('cảnh báo (không chặn) mức giữ lại nhiều hơn số đội đang có', () => {
    const c = checkPlan(rows(['100', '32']), 60);
    expect(c.valid).toBe(true);
    expect(c.rows[0]!.warning).toMatch(/bỏ qua/);
  });
});
