// Bộ kiểm thử offline phát cho thí sinh (offline-kit/arena_offline.py) phải chơi đúng luật của hệ thống:
// cùng seed và cùng bot dựng sẵn → cùng từng nước đi, cùng kết quả. Bỏ qua nếu máy không có Python.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PieceType } from '@arena/contracts';
import { FINAL_RULESET_ID, SEMIFINAL_RULESET_ID, STANDARD_RULESET_ID, getRuleset, simulate } from '../src/index.js';

const KIT = fileURLToPath(new URL('../../../offline-kit/arena_offline.py', import.meta.url));
const PY = process.env.PYTHON_CMD ?? 'python';
const hasPython = spawnSync(PY, ['--version']).status === 0;

const CASES: Array<[string, string, string, string, PieceType, PieceType]> = [
  ['standard', STANDARD_RULESET_ID, 'rusher', 'greedy', 'PAPER', 'ROCK'],
  ['semifinal', SEMIFINAL_RULESET_ID, 'rusher', 'greedy', 'SCISSORS', 'PAPER'],
  ['semifinal', SEMIFINAL_RULESET_ID, 'random', 'rusher', 'ROCK', 'ROCK'],
  ['final', FINAL_RULESET_ID, 'greedy', 'rusher', 'ROCK', 'SCISSORS'],
  ['final', FINAL_RULESET_ID, 'random', 'random', 'PAPER', 'PAPER'],
];

describe.skipIf(!hasPython)('bộ kiểm thử offline khớp engine hệ thống', () => {
  for (const [name, id, blue, pink, eb, ep] of CASES) {
    it(`${name}: ${blue} vs ${pink}`, () => {
      for (const seed of [3, 99, 2024]) {
        const out = spawnSync(
          PY,
          [
            KIT,
            '--simulate-json',
            '--ruleset',
            name,
            '--blue',
            blue,
            '--pink',
            pink,
            '--seed',
            String(seed),
            '--extra-blue',
            eb,
            '--extra-pink',
            ep,
          ],
          { encoding: 'utf8' },
        );
        expect(out.status, out.stderr).toBe(0);
        const py = JSON.parse(out.stdout) as { moves: unknown[]; end: unknown };
        const ts = simulate(getRuleset(id, { blue: eb, pink: ep }), { blue, pink }, seed);
        expect(py.moves).toEqual(ts.moves);
        expect(py.end).toEqual(ts.end);
      }
    });
  }
});
