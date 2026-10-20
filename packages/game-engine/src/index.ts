// @arena/game-engine — logic cờ dạng hàm thuần: nhận trạng thái + nước đi, trả trạng thái/kết quả mới.
// Không gọi mạng, database hay Socket.IO (đặc tả M0 mục 8).
//
// RULESET DEMO `demo-ottv2-0`: chỉ dùng cho mô phỏng ở M0. Không phải luật thi chính thức.
// Các điểm còn chờ chốt (DECISIONS: Q06 quân thứ 10, Q07 ô xuất phát, luật lặp/hết giờ) KHÔNG được mô hình hóa ở đây.
import type { Board, MoveRecord, PieceType, Side } from '@arena/contracts';

export const DEMO_RULESET_ID = 'demo-ottv2-0';
export const COLS = 'ABCDEFGHI';
export const SIZE = 9;

export interface Ruleset {
  id: string;
  /** Loại quân của dòng → các loại nó ăn được. */
  beats: Record<PieceType, PieceType[]>;
  goals: Record<Side, string>;
  setup: Board;
}

const OTHER: Record<Side, Side> = { blue: 'pink', pink: 'blue' };
export const otherSide = (s: Side): Side => OTHER[s];

export const square = (c: number, r: number): string => `${COLS[c]}${r + 1}`;
export function parseSquare(s: string): [number, number] | null {
  const m = /^([A-I])([1-9])$/.exec(s);
  return m ? [COLS.indexOf(m[1]!), Number(m[2]) - 1] : null;
}

/** Bố trí demo: mỗi bên 10 quân (3 Búa, 4 Bao, 3 Kéo), Xanh ở góc A1, Hồng đối xứng tâm. */
function demoSetup(): Board {
  const blue: Record<string, PieceType> = {
    B5: 'PAPER',
    C5: 'SCISSORS',
    B4: 'ROCK',
    C4: 'PAPER',
    D4: 'SCISSORS',
    C3: 'ROCK',
    D3: 'PAPER',
    E3: 'SCISSORS',
    D2: 'ROCK',
    E2: 'PAPER',
  };
  const board: Board = {};
  for (const [s, type] of Object.entries(blue)) {
    const [c, r] = parseSquare(s)!;
    board[s] = { side: 'blue', type };
    board[square(SIZE - 1 - c, SIZE - 1 - r)] = { side: 'pink', type };
  }
  return board;
}

export const DEMO_RULESET: Ruleset = {
  id: DEMO_RULESET_ID,
  beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] },
  goals: { blue: 'I9', pink: 'A1' },
  setup: demoSetup(),
};

export function getRuleset(id: string): Ruleset {
  if (id === DEMO_RULESET_ID) return DEMO_RULESET;
  throw new Error(`Ruleset chưa được hỗ trợ: ${id}`);
}

export interface GameState {
  rulesetId: string;
  board: Board;
  toMove: Side;
  ply: number;
  maxPlies: number;
  history: MoveRecord[];
}

export type EndReason = 'goal' | 'eliminate' | 'no_moves' | 'max_plies';
export interface GameEnd {
  winner: Side | null;
  reason: EndReason;
}

export interface LegalMove {
  from: string;
  to: string;
  capture: PieceType | null;
}

export function newGame(rules: Ruleset, maxPlies: number): GameState {
  return { rulesetId: rules.id, board: { ...rules.setup }, toMove: 'blue', ply: 0, maxPlies, history: [] };
}

const DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** Nước hợp lệ: đi 1 ô theo 8 hướng, vào ô trống hoặc ăn quân đối phương bị khắc. */
export function legalMoves(rules: Ruleset, state: GameState, side: Side = state.toMove): LegalMove[] {
  const out: LegalMove[] = [];
  for (const [from, p] of Object.entries(state.board)) {
    if (p.side !== side) continue;
    const [c, r] = parseSquare(from)!;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= SIZE || nr >= SIZE) continue;
      const to = square(nc, nr);
      const target = state.board[to];
      if (!target) out.push({ from, to, capture: null });
      else if (target.side !== side && rules.beats[p.type].includes(target.type))
        out.push({ from, to, capture: target.type });
    }
  }
  return out;
}

export function countPieces(board: Board): Record<Side, number> {
  const n: Record<Side, number> = { blue: 0, pink: 0 };
  for (const p of Object.values(board)) n[p.side]++;
  return n;
}

/** Áp một nước. Ném lỗi nếu nước không hợp lệ. Trả về trạng thái mới (không sửa trạng thái cũ) và kết thúc nếu có. */
export function applyMove(
  rules: Ruleset,
  state: GameState,
  move: { from: string; to: string },
): { state: GameState; end: GameEnd | null; record: MoveRecord } {
  const legal = legalMoves(rules, state).find((m) => m.from === move.from && m.to === move.to);
  if (!legal) throw new Error(`Nước không hợp lệ: ${move.from}-${move.to}`);
  const side = state.toMove;
  const board = { ...state.board };
  const piece = board[legal.from]!;
  delete board[legal.from];
  board[legal.to] = piece;
  const record: MoveRecord = {
    ply: state.ply + 1,
    side,
    from: legal.from,
    to: legal.to,
    type: piece.type,
    capture: legal.capture,
  };
  const next: GameState = {
    ...state,
    board,
    toMove: otherSide(side),
    ply: state.ply + 1,
    history: [...state.history, record],
  };
  return { state: next, end: checkEnd(rules, next, side), record };
}

/** Thứ tự kiểm tra sau nước của `mover`: tới đích → ăn hết một loại → đối phương hết nước → hết giới hạn nước. */
export function checkEnd(rules: Ruleset, state: GameState, mover: Side): GameEnd | null {
  const opp = otherSide(mover);
  const atGoal = state.board[rules.goals[mover]];
  if (atGoal && atGoal.side === mover) return { winner: mover, reason: 'goal' };
  for (const type of Object.keys(rules.beats) as PieceType[]) {
    if (!Object.values(state.board).some((p) => p.side === opp && p.type === type))
      return { winner: mover, reason: 'eliminate' };
  }
  if (legalMoves(rules, state, opp).length === 0) return { winner: mover, reason: 'no_moves' };
  if (state.ply >= state.maxPlies) {
    const n = countPieces(state.board);
    return { winner: n.blue > n.pink ? 'blue' : n.pink > n.blue ? 'pink' : null, reason: 'max_plies' };
  }
  return null;
}

/** Dựng lại bàn cờ từ danh sách nước (dùng cho snapshot/replay). */
export function replay(
  rules: Ruleset,
  moves: Array<{ from: string; to: string }>,
  maxPlies: number,
): GameState {
  let state = newGame(rules, maxPlies);
  for (const m of moves) state = applyMove(rules, state, m).state;
  return state;
}

// ---------------------------------------------------------------- RNG có seed và bot mô phỏng tin cậy

/** mulberry32: cùng seed → cùng chuỗi số, để retry cho đúng diễn biến cũ. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DemoPolicy = (rules: Ruleset, state: GameState, rand: () => number) => LegalMove;

const pick = <T>(arr: T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)]!;
const dist = (a: string, b: string) => {
  const [ac, ar] = parseSquare(a)!,
    [bc, br] = parseSquare(b)!;
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
};

/** Bot mô phỏng do hệ thống viết (không phải mã sinh viên). */
export const DEMO_POLICIES: Record<string, DemoPolicy> = {
  random: (rules, state, rand) => pick(legalMoves(rules, state), rand),
  greedy: (rules, state, rand) => {
    const moves = legalMoves(rules, state);
    const caps = moves.filter((m) => m.capture);
    return pick(caps.length ? caps : moves, rand);
  },
  rusher: (rules, state, rand) => {
    const moves = legalMoves(rules, state);
    const goal = rules.goals[state.toMove];
    const best = Math.min(...moves.map((m) => dist(m.to, goal)));
    return pick(
      moves.filter((m) => dist(m.to, goal) === best),
      rand,
    );
  },
};

export interface SimulationResult {
  moves: MoveRecord[];
  end: GameEnd;
  finalBoard: Board;
}

/** Chạy trọn một ván mô phỏng. Hoàn toàn xác định theo seed. */
export function simulate(
  rules: Ruleset,
  policies: Record<Side, string>,
  seed: number,
  maxPlies: number,
): SimulationResult {
  const rand = rng(seed);
  let state = newGame(rules, maxPlies);
  for (;;) {
    const policy = DEMO_POLICIES[policies[state.toMove]];
    if (!policy) throw new Error(`Bot mô phỏng không tồn tại: ${policies[state.toMove]}`);
    const out = applyMove(rules, state, policy(rules, state, rand));
    state = out.state;
    if (out.end) return { moves: state.history, end: out.end, finalBoard: state.board };
  }
}
