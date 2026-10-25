import type { CSSProperties } from 'react';
import type { Sector } from './WorkspaceVisuals';

type Point = readonly [number, number];
type Route = readonly [Point, Point, Point, Point];
const ROUTES: Record<Sector, readonly Route[]> = {
  bot: [
    [
      [61, 103],
      [101, 103],
      [135, 123],
      [191, 146],
    ],
    [
      [419, 181],
      [380, 181],
      [345, 163],
      [287, 141],
    ],
    [
      [240, 24],
      [240, 44],
      [240, 68],
      [240, 92],
    ],
  ],
  team: [
    [
      [110, 88],
      [174, 88],
      [207, 113],
      [240, 139],
    ],
    [
      [370, 199],
      [306, 199],
      [273, 169],
      [240, 139],
    ],
    [
      [370, 88],
      [306, 88],
      [273, 113],
      [240, 139],
    ],
  ],
  tournament: [
    [
      [107, 64],
      [151, 64],
      [151, 105],
      [205, 105],
    ],
    [
      [373, 187],
      [329, 187],
      [329, 146],
      [275, 146],
    ],
    [
      [240, 211],
      [240, 190],
      [240, 172],
      [240, 154],
    ],
  ],
  rooms: [
    [
      [96, 169],
      [170, 200],
      [240, 225],
      [310, 182],
    ],
    [
      [410, 120],
      [349, 93],
      [288, 66],
      [240, 45],
    ],
    [
      [92, 153],
      [145, 176],
      [197, 198],
      [240, 218],
    ],
  ],
  account: [
    [
      [82, 86],
      [155, 86],
      [174, 107],
      [192, 128],
    ],
    [
      [398, 203],
      [325, 203],
      [307, 182],
      [288, 161],
    ],
    [
      [398, 86],
      [325, 86],
      [307, 107],
      [288, 128],
    ],
  ],
  library: [
    [
      [79, 133],
      [128, 133],
      [145, 145],
      [163, 157],
    ],
    [
      [368, 96],
      [331, 121],
      [305, 121],
      [278, 121],
    ],
    [
      [368, 215],
      [331, 185],
      [305, 185],
      [278, 185],
    ],
  ],
  control: [
    [
      [94, 140],
      [137, 140],
      [162, 140],
      [187, 140],
    ],
    [
      [348, 65],
      [303, 65],
      [287, 86],
      [270, 107],
    ],
    [
      [132, 215],
      [177, 215],
      [193, 194],
      [210, 173],
    ],
  ],
};
function Signal({ route, index }: { route: Route; index: number }) {
  const style = Object.fromEntries(
    route.map(([x, y], i) => [`--signal-${i}`, `translate(${x}px, ${y}px)`]),
  ) as CSSProperties;
  return (
    <g className="tech-signal" style={{ ...style, '--signal-delay': `${index * -1800}ms` } as CSSProperties}>
      <circle r="3" className="tech-signal-dot" />
      <circle r="7" className="tech-signal-ring" />
    </g>
  );
}
export function TechSignals({ variant }: { variant: Sector }) {
  return (
    <g className="tech-field" aria-hidden="true">
      {(variant === 'bot' || variant === 'account' || variant === 'control') && (
        <g className="tech-orbit">
          <circle cx="240" cy="140" r="112" strokeDasharray="32 96 8 72" />
          <circle cx="240" cy="140" r="104" strokeDasharray="6 148 24 92" />
        </g>
      )}
      {ROUTES[variant].map((route, i) => (
        <Signal key={i} route={route} index={i} />
      ))}
    </g>
  );
}

/** Ambient circuitry sits outside the playable surface and never moves real pieces. */
export function HomeTechField() {
  const routes: readonly Route[] = [
    [
      [56, 373],
      [56, 415],
      [130, 450],
      [251, 450],
    ],
    [
      [705, 205],
      [705, 340],
      [647, 414],
      [580, 450],
    ],
    [
      [97, 122],
      [149, 48],
      [189, 14],
      [240, 14],
    ],
  ];
  return (
    <svg
      className="home-tech-scene"
      viewBox="0 0 760 480"
      width="760"
      height="480"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="home-tech-tracks">
        <path d="M56 373v42l74 35h121M705 205v135l-58 74-67 36M97 122l52-74 40-34h51" />
        <path d="M75 367v36l63 29h66M686 231v103l-54 67M112 124l48-64 32-29h32" />
      </g>
      {routes.map((route, i) => (
        <Signal key={i} route={route} index={i} />
      ))}
      <g className="tech-targets">
        <path d="M32 340v-24h24m648-196h24v24M224 464h40v-16m292 0v16h40" />
        <circle cx="56" cy="373" r="5" />
        <circle cx="705" cy="205" r="5" />
      </g>
    </svg>
  );
}
