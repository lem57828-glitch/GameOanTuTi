import type { Board, MoveRecord } from '@arena/contracts';

/** Animate only an exact, single move between two received boards, including captures.
 * A seek, snapshot jump, initial load or correction must appear immediately. */
export function boardMoveOffset(
  previous: Board | null,
  next: Board,
  move?: Pick<MoveRecord, 'from' | 'to'> | null,
) {
  if (
    !previous ||
    !move ||
    move.from === move.to ||
    !/^[A-I][1-9]$/.test(move.from) ||
    !/^[A-I][1-9]$/.test(move.to)
  )
    return null;
  const source = previous[move.from];
  const target = next[move.to];
  if (!source || !target || next[move.from] || source.side !== target.side || source.type !== target.type)
    return null;
  for (const square of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (square === move.from || square === move.to) continue;
    const a = previous[square],
      b = next[square];
    if (a?.side !== b?.side || a?.type !== b?.type) return null;
  }
  // The glyph is 78% of a grid cell; percentages here are relative to its own box.
  const cell = 100 / 0.78;
  return {
    x: (move.from.charCodeAt(0) - move.to.charCodeAt(0)) * cell,
    y: (Number(move.to[1]) - Number(move.from[1])) * cell,
  };
}
