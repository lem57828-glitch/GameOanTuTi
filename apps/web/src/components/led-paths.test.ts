import { describe, expect, it } from 'vitest';
import { ledCells, ledPaths, type LedVariant } from './led-paths';

const variants: LedVariant[] = [
  'home',
  'bot',
  'team',
  'tournament',
  'rooms',
  'room-card',
  'replay',
  'account',
  'library',
  'control',
];

describe('bounded LED geometry', () => {
  it.each(variants)(
    '%s fits both compact and wide containers without drawing through unrelated content',
    (variant) => {
      for (const [width, height] of [
        [88, 52],
        [320, 187],
        [760, 480],
      ]) {
        const cells = ledCells(ledPaths(variant, width!, height!, 12), 8);
        expect(cells.length).toBeGreaterThan(1);
        for (const cell of cells) {
          for (const [x, y] of [cell.start, cell.end]) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(width!);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(height!);
          }
          // A short cell must not jump across a corner or across disconnected branches.
          expect(Math.hypot(cell.end[0] - cell.start[0], cell.end[1] - cell.start[1])).toBeLessThanOrEqual(8);
        }
      }
    },
  );
  it('handles empty or collapsed paths without leaving invalid coordinates', () => {
    expect(ledCells([], 8)).toEqual([]);
    expect(
      ledCells(
        [
          {
            points: [
              [4, 4],
              [4, 4],
            ],
            lane: 0,
            offset: 0,
          },
        ],
        8,
      ),
    ).toEqual([]);
  });
});
