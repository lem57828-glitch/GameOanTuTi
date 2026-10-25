export type LedVariant =
  | 'header'
  | 'home'
  | 'bot'
  | 'team'
  | 'tournament'
  | 'rooms'
  | 'room-card'
  | 'replay'
  | 'account'
  | 'library'
  | 'control';
export type LedPoint = readonly [number, number];
export type LedPath = { points: LedPoint[]; lane: number; offset: number };
export type LedCell = { start: LedPoint; end: LedPoint; position: number; lane: number; path: number };

export const ledWrap = (value: number) => ((value % 1) + 1) % 1;
export function ledSeed(value: string) {
  return (
    Array.from(value).reduce(
      (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
      2166136261,
    ) / 4294967296
  );
}

/** Bounded paths. Sector paths use the existing illustration's coordinates. */
export function ledPaths(variant: LedVariant, width: number, height: number, radius: number): LedPath[] {
  const paths: LedPath[] = [];
  const add = (points: LedPoint[], lane = 0, offset = paths.length * 0.173) =>
    paths.push({ points, lane, offset });
  const art = (points: LedPoint[], lane = paths.length % 2) =>
    add(
      points.map(([x, y]) => [(x / 480) * width, (y / 280) * height]),
      lane,
    );
  const arc = (cx: number, cy: number, rx: number, ry: number, start: number, end: number) =>
    Array.from({ length: 41 }, (_, index): LedPoint => {
      const angle = start + ((end - start) * index) / 40;
      return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
    });
  const inset = Math.min(8, width / 8, height / 8);
  const x = inset,
    y = inset,
    w = width - 2 * inset,
    h = height - 2 * inset;
  const r = Math.max(1, Math.min(radius - inset, w / 4, h / 4));
  const topLeft = arc(x + r, y + r, r, r, Math.PI, Math.PI * 1.5);
  const topRight = arc(x + w - r, y + r, r, r, -Math.PI / 2, 0);
  const bottomRight = arc(x + w - r, y + h - r, r, r, 0, Math.PI / 2);
  const bottomLeft = arc(x + r, y + h - r, r, r, Math.PI / 2, Math.PI);
  switch (variant) {
    case 'header':
      add([
        [-16, height / 2],
        [width + 16, height / 2],
      ]);
      break;
    case 'home':
      add([[x, y + h * 0.3], ...topLeft, [x + w * 0.34, y]], 0);
      add([[x + w * 0.66, y], ...topRight, [x + w, y + h * 0.3]], 1);
      add([[x + w, y + h * 0.7], ...bottomRight, [x + w * 0.66, y + h]], 0);
      add([[x + w * 0.34, y + h], ...bottomLeft, [x, y + h * 0.7]], 1);
      break;
    case 'room-card':
      add([[x, y + h * 0.24], ...topLeft, [x + Math.min(72, w * 0.22), y]], 0);
      add([[x + w, y + h * 0.76], ...bottomRight, [x + w - Math.min(72, w * 0.22), y + h]], 1);
      break;
    case 'replay':
      add([...topLeft, ...topRight, [x + w, y + h / 2]], 0, 0);
      add([...bottomRight, ...bottomLeft, [x, y + h / 2]], 1, 0.41);
      break;
    case 'bot':
      art(
        [
          [61, 103],
          [101, 103],
          [135, 123],
          [207, 109],
        ],
        0,
      );
      art(
        [
          [419, 103],
          [380, 103],
          [345, 123],
          [273, 109],
        ],
        1,
      );
      art(
        [
          [61, 181],
          [103, 181],
          [135, 163],
          [210, 126],
        ],
        1,
      );
      art(
        [
          [419, 181],
          [380, 181],
          [345, 163],
          [270, 126],
        ],
        0,
      );
      art(
        [
          [240, 24],
          [240, 44],
          [240, 68],
          [240, 84],
        ],
        0,
      );
      break;
    case 'team':
      art(arc(240, 140, 76, 92, -0.9, 0.9), 0);
      art(arc(240, 140, 76, 92, Math.PI - 0.9, Math.PI + 0.9), 1);
      art(
        [
          [110, 88],
          [174, 88],
          [204, 110],
        ],
        0,
      );
      art(
        [
          [370, 199],
          [306, 199],
          [276, 171],
        ],
        1,
      );
      break;
    case 'tournament':
      art(
        [
          [107, 64],
          [151, 64],
          [151, 105],
          [205, 105],
          [205, 125],
          [225, 125],
        ],
        0,
      );
      art(
        [
          [107, 187],
          [151, 187],
          [151, 146],
          [205, 146],
          [205, 125],
          [225, 125],
        ],
        1,
      );
      art(
        [
          [373, 64],
          [329, 64],
          [329, 105],
          [275, 105],
          [275, 125],
          [255, 125],
        ],
        1,
      );
      art(
        [
          [373, 187],
          [329, 187],
          [329, 146],
          [275, 146],
          [275, 125],
          [255, 125],
        ],
        0,
      );
      break;
    case 'rooms':
      art(
        [
          [76, 156],
          [240, 246],
          [404, 144],
        ],
        0,
      );
      art(
        [
          [404, 112],
          [240, 40],
          [76, 142],
        ],
        1,
      );
      break;
    case 'account':
      art(
        [
          [175, 78],
          [240, 48],
          [305, 78],
          [305, 153],
          ...arc(240, 153, 65, 74, 0, Math.PI).slice(1),
          [175, 78],
        ],
        0,
      );
      art(
        [
          [82, 86],
          [155, 86],
          [192, 128],
        ],
        1,
      );
      art(
        [
          [398, 203],
          [325, 203],
          [288, 161],
        ],
        1,
      );
      break;
    case 'library':
      art(
        [
          [79, 133],
          [128, 133],
          [163, 157],
        ],
        0,
      );
      art(
        [
          [368, 96],
          [331, 121],
          [278, 121],
        ],
        1,
      );
      for (let line = 0; line < 5; line++)
        art(
          [
            [184, 99 + line * 16],
            [line % 2 ? 256 : 236, 99 + line * 16],
          ],
          line % 2,
        );
      break;
    case 'control':
      art(
        [
          [94, 140],
          [162, 140],
          [187, 140],
        ],
        0,
      );
      art(
        [
          [386, 140],
          [318, 140],
          [293, 140],
        ],
        1,
      );
      art(
        [
          [132, 65],
          [177, 65],
          [210, 107],
        ],
        0,
      );
      art(
        [
          [348, 215],
          [303, 215],
          [270, 173],
        ],
        1,
      );
      art(
        [
          [240, 65],
          [240, 90],
        ],
        0,
      );
      art(
        [
          [240, 215],
          [240, 190],
        ],
        1,
      );
      break;
  }
  return paths;
}

/** Equal-distance sampling keeps speed smooth through bends and across aspect ratios. */
export function ledCells(paths: LedPath[], gap: number): LedCell[] {
  return paths.flatMap(({ points, lane }, path) => {
    const lengths = points
      .slice(1)
      .map((point, i) => Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]));
    const length = lengths.reduce((sum, part) => sum + part, 0);
    if (length <= 0) return [];
    const pointAt = (distance: number): LedPoint => {
      let remaining = distance;
      for (let i = 0; i < lengths.length; i++) {
        const segment = lengths[i]!;
        if (segment > 0 && (remaining <= segment || i === lengths.length - 1)) {
          const a = points[i]!,
            b = points[i + 1]!;
          const t = Math.min(1, remaining / segment);
          return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
        remaining -= segment;
      }
      return points[points.length - 1]!;
    };
    const count = Math.max(2, Math.ceil(length / Math.max(4, gap)));
    return Array.from({ length: count }, (_, i) => ({
      start: pointAt(((i + 0.05) / count) * length),
      end: pointAt(((i + 0.75) / count) * length),
      position: i / count,
      lane,
      path,
    }));
  });
}
