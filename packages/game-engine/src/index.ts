// @arena/game-engine — logic cờ dạng hàm thuần: nhận trạng thái + nước đi, trả trạng thái/kết quả mới.
// Không gọi mạng, database hay Socket.IO (đặc tả M0 mục 8).
//
// TV2 — Gói việc 2: Bàn cờ 9x9, 10 quân xuất phát (chuẩn hóa quân thứ 10),
// luật lặp thế cờ 3 lần (threefold repetition), luật 200 nước, và chuẩn hóa dữ liệu cho bot Python.
import {
  Board as BoardSchema,
  PieceType as PieceTypeSchema,
  type Board,
  type MoveRecord,
  type PieceType,
  type Side,
} from '@arena/contracts';

export const DEMO_RULESET_ID = 'demo-ottv2-0';
export const STANDARD_RULESET_ID = 'standard-32-4';
export const COLS = 'ABCDEFGHI';
export const SIZE = 9;
export const STANDARD_MAX_PLIES = 200;
export const STANDARD_LIMITS = {
  cpuMsPerMove: 200,
  wallMsPerMove: 1000,
  startupMs: 3000,
  maxPlies: STANDARD_MAX_PLIES,
  maxErrorsPerGame: 3,
} as const;
const copyBoard = (board: Board): Board =>
  Object.fromEntries(Object.entries(board).map(([sq, piece]) => [sq, { ...piece }]));

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

/**
 * Tạo bàn cờ xuất phát chuẩn 10 quân cho vòng 32→4 (dựa trên sơ đồ chiến thuật đã chốt).
 * - Phe Xanh:
 *   + Hàng 1: B1, C1, D1 (3 ô)
 *   + Cột A: A2, A3, A4 (3 ô)
 *   + Khối trung tâm 2x2: B2, C2, B3, C3 (4 ô chứa quân tùy chọn thứ 10)
 * - Phe Hồng: Đối xứng tâm qua ô E5 (Hàng 9, Cột I, và Khối trung tâm G7, H7, G8, H8)
 */
export function createStandardBoard(blueExtra: PieceType = 'PAPER', pinkExtra: PieceType = 'PAPER'): Board {
  PieceTypeSchema.parse(blueExtra);
  PieceTypeSchema.parse(pinkExtra);
  const board: Board = {};

  // Hàm phụ trợ gán 10 quân cho một bên
  const assignSide = (
    side: Side,
    extra: PieceType,
    coords: {
      center: string[]; // 4 ô trung tâm
      rowEdge: string[]; // 3 ô hàng ngang
      colEdge: string[]; // 3 ô hàng dọc
    },
  ) => {
    // 4 ô trung tâm nhận loại quân thứ 10
    for (const sq of coords.center) {
      board[sq] = { side, type: extra };
    }

    // 2 bên rìa nhận 2 loại quân còn lại (mỗi loại 3 quân)
    if (extra === 'PAPER') {
      // Trung tâm là 4 BAO -> Hàng ngang là 3 KÉO, Hàng dọc là 3 BÚA
      for (const sq of coords.rowEdge) board[sq] = { side, type: 'SCISSORS' };
      for (const sq of coords.colEdge) board[sq] = { side, type: 'ROCK' };
    } else if (extra === 'SCISSORS') {
      // Trung tâm là 4 KÉO -> Hàng ngang là 3 BAO, Hàng dọc là 3 BÚA
      for (const sq of coords.rowEdge) board[sq] = { side, type: 'PAPER' };
      for (const sq of coords.colEdge) board[sq] = { side, type: 'ROCK' };
    } else {
      // Trung tâm là 4 BÚA -> Hàng ngang là 3 KÉO, Hàng dọc là 3 BAO
      for (const sq of coords.rowEdge) board[sq] = { side, type: 'SCISSORS' };
      for (const sq of coords.colEdge) board[sq] = { side, type: 'PAPER' };
    }
  };

  // 1. Bố trí Phe Xanh (Blue) quanh góc A1
  assignSide('blue', blueExtra, {
    center: ['B2', 'C2', 'B3', 'C3'],
    rowEdge: ['B1', 'C1', 'D1'],
    colEdge: ['A2', 'A3', 'A4'],
  });

  // 2. Bố trí Phe Hồng (Pink) quanh góc I9 (Đối xứng tâm)
  assignSide('pink', pinkExtra, {
    center: ['G7', 'H7', 'G8', 'H8'],
    rowEdge: ['F9', 'G9', 'H9'],
    colEdge: ['I6', 'I7', 'I8'],
  });

  return board;
}

/** Bố trí demo M0 cũ: mỗi bên 10 quân (3 Búa, 4 Bao, 3 Kéo). Giữ nguyên để tương thích test cũ. */
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

export const STANDARD_RULESET: Ruleset = {
  id: STANDARD_RULESET_ID,
  beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] },
  goals: { blue: 'I9', pink: 'A1' },
  setup: createStandardBoard('PAPER', 'PAPER'),
};

export function getRuleset(
  id: string,
  choices?: { blue?: PieceType | null; pink?: PieceType | null },
): Ruleset {
  if (id === DEMO_RULESET_ID) return DEMO_RULESET;
  if (id === STANDARD_RULESET_ID) {
    const blueExtra = choices?.blue ?? 'PAPER';
    const pinkExtra = choices?.pink ?? 'PAPER';
    return {
      ...STANDARD_RULESET,
      setup: createStandardBoard(blueExtra, pinkExtra),
    };
  }
  throw new Error(`Ruleset chưa được hỗ trợ: ${id}`);
}

export interface GameState {
  rulesetId: string;
  board: Board;
  toMove: Side;
  ply: number;
  maxPlies: number;
  history: MoveRecord[];
  end?: GameEnd | null;
  /** Bộ đếm tần suất xuất hiện của các thế cờ để phát hiện lặp lại lần thứ 3 (Threefold Repetition). */
  repetitionHistory?: string[];
}

export type EndReason = 'goal' | 'eliminate' | 'no_moves' | 'repetition' | 'max_plies';
export interface GameEnd {
  winner: Side | null;
  reason: EndReason;
}

export interface LegalMove {
  from: string;
  to: string;
  capture: PieceType | null;
}

/**
 * Tính chữ ký duy nhất cho trạng thái bàn cờ + lượt đi (Board Signature).
 * Dùng để phát hiện lặp lại thế cờ lần thứ 3.
 */
export function getBoardSignature(board: Board, toMove: Side): string {
  const pieces = Object.entries(board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}:${p.side[0]}:${p.type[0]}`)
    .join(';');
  return `${toMove[0]}|${pieces}`;
}

export function newGame(rules: Ruleset, maxPlies = 200): GameState {
  if (
    !Number.isInteger(maxPlies) ||
    maxPlies < 1 ||
    maxPlies > (rules.id === STANDARD_RULESET_ID ? STANDARD_MAX_PLIES : 2000)
  )
    throw new Error('Giới hạn nước không hợp lệ.');
  const initBoard = copyBoard(BoardSchema.parse(rules.setup));
  const sig = getBoardSignature(initBoard, 'blue');
  return {
    rulesetId: rules.id,
    board: initBoard,
    toMove: 'blue',
    ply: 0,
    maxPlies,
    history: [],
    end: null,
    repetitionHistory: [sig],
  };
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
  if (state.end) throw new Error('Ván đã kết thúc, không thể đi thêm.');
  const legal = legalMoves(rules, state).find((m) => m.from === move.from && m.to === move.to);
  if (!legal) throw new Error(`Nước không hợp lệ: ${move.from}-${move.to}`);
  const side = state.toMove;
  const board = copyBoard(state.board);
  const piece = board[legal.from]!;
  delete board[legal.from];
  board[legal.to] = piece;
  const nextSide = otherSide(side);

  const record: MoveRecord = {
    ply: state.ply + 1,
    side,
    from: legal.from,
    to: legal.to,
    type: piece.type,
    capture: legal.capture,
  };

  // Tính chữ ký thế cờ và kiểm tra lặp lại lần 3
  const currentSig = getBoardSignature(board, nextSide);
  const repHistory = [...(state.repetitionHistory ?? []), currentSig];

  const next: GameState = {
    ...state,
    board,
    toMove: nextSide,
    ply: state.ply + 1,
    history: [...state.history, record],
    repetitionHistory: repHistory,
  };

  const end = checkEnd(rules, next, side);
  next.end = end;
  return { state: next, end, record };
}

/**
 * Thứ tự kiểm tra sau nước của `mover`:
 * 1. Tới đích -> thắng ngay.
 * 2. Ăn hết một loại quân đối phương -> thắng ngay.
 * 3. Đối phương hết nước đi -> thua ngay.
 * 4. Lặp lại thế cờ lần thứ 3 -> phân xử theo số quân.
 * 5. Hết 200 nước tổng -> phân xử theo số quân.
 */
export function checkEnd(rules: Ruleset, state: GameState, mover: Side): GameEnd | null {
  const opp = otherSide(mover);
  const atGoal = state.board[rules.goals[mover]];
  if (atGoal && atGoal.side === mover) return { winner: mover, reason: 'goal' };

  for (const type of Object.keys(rules.beats) as PieceType[]) {
    if (!Object.values(state.board).some((p) => p.side === opp && p.type === type))
      return { winner: mover, reason: 'eliminate' };
  }

  if (legalMoves(rules, state, opp).length === 0) return { winner: mover, reason: 'no_moves' };

  // Kiểm tra lặp lại thế cờ lần thứ 3 (Threefold Repetition)
  if (state.repetitionHistory) {
    const latestSig = state.repetitionHistory[state.repetitionHistory.length - 1];
    let occurrences = 0;
    for (const sig of state.repetitionHistory) {
      if (sig === latestSig) occurrences++;
    }
    if (occurrences >= 3) {
      const n = countPieces(state.board);
      const winner = n.blue > n.pink ? 'blue' : n.pink > n.blue ? 'pink' : null;
      return { winner, reason: 'repetition' };
    }
  }

  // Kiểm tra giới hạn 200 nước
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
  maxPlies = 200,
): GameState {
  let state = newGame(rules, maxPlies);
  for (const m of moves) state = applyMove(rules, state, m).state;
  return state;
}

// ---------------------------------------------------------------- Giao diện chuẩn cho Bot Python (TV2)

export interface PythonBotState {
  seed?: number;
  protocol_version?: 1;
  ruleset_id?: string;
  board_size?: number;
  goals?: Record<Side, string>;
  max_plies?: number;
  my_side: Side;
  turn: number;
  ply: number;
  board: Record<string, { side: Side; type: PieceType }>;
  pieces_left: Record<Side, number>;
  legal_moves: Array<{ from: string; to: string; capture: PieceType | null }>;
  last_move: MoveRecord | null;
}

/**
 * Đóng gói dữ liệu bàn cờ thành định dạng JSON chuẩn cho hàm `make_move(state)` của Bot Python.
 * Có sẵn danh sách `legal_moves` để bot không bao giờ bị phạm luật nếu chọn từ danh sách này.
 */
export function toPythonState(rules: Ruleset, state: GameState, side: Side = state.toMove): PythonBotState {
  return {
    protocol_version: 1,
    ruleset_id: rules.id,
    board_size: SIZE,
    goals: { ...rules.goals },
    max_plies: state.maxPlies,
    my_side: side,
    turn: Math.floor(state.ply / 2) + 1,
    ply: state.ply,
    board: copyBoard(state.board),
    pieces_left: countPieces(state.board),
    legal_moves: legalMoves(rules, state, side),
    last_move: state.history.length ? { ...state.history[state.history.length - 1]! } : null,
  };
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

/** Bot mô phỏng do hệ thống viết (dùng cho test và demo). */
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
  maxPlies = 200,
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
