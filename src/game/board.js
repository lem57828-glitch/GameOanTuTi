// Luật OTTv2: bàn cờ 9×9, mỗi bên 10 quân búa/kéo/bao, đi 1 ô theo 8 hướng.
// Hàm thuần (không truy cập CSDL) để máy chủ, bot mẫu JS và kiểm thử dùng chung.
//
// - Chỉ được đi vào ô trống hoặc ô có quân đối phương mà quân mình khắc (ăn quân đó).
//   Quân mình, quân đối phương cùng loại và quân đối phương mạnh hơn đều chặn đường.
// - Thắng: đưa quân vào ô đích (Xanh → I9, Hồng → A1) hoặc ăn hết một loại quân của đối phương.
// - Bên tới lượt không còn nước hợp lệ thì thua.
// - Lặp cùng thế cờ 3 lần hoặc hết giới hạn nước: bên còn nhiều quân hơn thắng, bằng nhau là hòa.

const COLS = 'ABCDEFGHI';
const SIZE = 9;
const SIDES = ['blue', 'pink'];
const OTHER = { blue: 'pink', pink: 'blue' };
const GOAL = { blue: 'I9', pink: 'A1' };
const SIDE_VI = { blue: 'Xanh', pink: 'Hồng' };
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

const sq = (c, r) => `${COLS[c]}${r + 1}`;
function parseSq(s) {
  const m = /^([A-I])([1-9])$/.exec(String(s || '').trim().toUpperCase());
  return m ? [COLS.indexOf(m[1]), Number(m[2]) - 1] : null;
}

// Thế cờ ban đầu của Xanh (góc A1); Hồng đối xứng tâm qua E5.
const BLUE_SETUP = {
  B5: 'PAPER', C5: 'SCISSORS',
  B4: 'ROCK', C4: 'PAPER', D4: 'SCISSORS',
  C3: 'ROCK', D3: 'PAPER', E3: 'SCISSORS',
  D2: 'ROCK', E2: 'PAPER',
};
const rotate = (s) => { const [c, r] = parseSq(s); return sq(SIZE - 1 - c, SIZE - 1 - r); };

function initialPieces() {
  const pieces = {};
  for (const [s, type] of Object.entries(BLUE_SETUP)) {
    pieces[s] = { side: 'blue', type };
    pieces[rotate(s)] = { side: 'pink', type };
  }
  return pieces;
}

function newGame(maxPlies = 200) {
  const state = { pieces: initialPieces(), toMove: 'blue', ply: 0, maxPlies, seen: {}, history: [] };
  state.seen[positionKey(state)] = 1;
  return state;
}

function positionKey(state) {
  return `${state.toMove}|${Object.keys(state.pieces).sort().map((s) => `${s}${state.pieces[s].side[0]}${state.pieces[s].type[0]}`).join(',')}`;
}

const beats = (rs, attacker, defender) => (rs.beats[attacker] || []).includes(defender);

function legalMoves(rs, state, side = state.toMove) {
  const out = [];
  for (const [from, p] of Object.entries(state.pieces)) {
    if (p.side !== side) continue;
    const [c, r] = parseSq(from);
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= SIZE || nr >= SIZE) continue;
      const to = sq(nc, nr);
      const target = state.pieces[to];
      if (!target) out.push({ from, to, capture: null });
      else if (target.side !== side && beats(rs, p.type, target.type)) out.push({ from, to, capture: target.type });
    }
  }
  return out;
}

/** Chuẩn hóa nước đi bot trả về: {"from":"B4","to":"C5"} | ["B4","C5"] | "B4-C5" | "B4C5". */
function parseMove(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) v = [v.from, v.to];
  if (Array.isArray(v) && v.length === 2) {
    const from = String(v[0] ?? '').trim().toUpperCase(), to = String(v[1] ?? '').trim().toUpperCase();
    return parseSq(from) && parseSq(to) ? { from, to } : null;
  }
  if (typeof v === 'string') {
    const m = /^\s*([A-Ia-i][1-9])\s*[-–>,\s]*\s*([A-Ia-i][1-9])\s*$/.exec(v);
    return m ? { from: m[1].toUpperCase(), to: m[2].toUpperCase() } : null;
  }
  return null;
}

function findLegal(rs, state, mv) {
  if (!mv) return null;
  return legalMoves(rs, state).find((m) => m.from === mv.from && m.to === mv.to) || null;
}

function countPieces(state) {
  const n = { blue: 0, pink: 0 };
  for (const p of Object.values(state.pieces)) n[p.side]++;
  return n;
}

/** Áp một nước hợp lệ (đã lấy từ legalMoves) và trả về trạng thái mới cùng kết quả ván nếu đã kết thúc. */
function applyMove(rs, state, mv) {
  const side = state.toMove;
  const pieces = { ...state.pieces };
  const moving = pieces[mv.from];
  delete pieces[mv.from];
  pieces[mv.to] = moving;
  const next = {
    ...state, pieces, toMove: OTHER[side], ply: state.ply + 1, seen: { ...state.seen },
    history: [...state.history, { side, from: mv.from, to: mv.to, type: moving.type, capture: mv.capture }],
  };
  const key = positionKey(next);
  next.seen[key] = (next.seen[key] || 0) + 1;
  return { state: next, end: checkEnd(rs, next, side, key) };
}

/** Kiểm tra kết thúc sau khi `mover` vừa đi. Thứ tự: tới đích → ăn hết một loại → đối phương hết nước → lặp 3 lần → hết giới hạn. */
function checkEnd(rs, state, mover, key) {
  const opp = OTHER[mover];
  const atGoal = state.pieces[GOAL[mover]];
  if (atGoal && atGoal.side === mover) return { winner: mover, reason: 'goal' };
  for (const type of rs.moves) {
    if (!Object.values(state.pieces).some((p) => p.side === opp && p.type === type)) return { winner: mover, reason: 'eliminate', type };
  }
  if (!legalMoves(rs, state, opp).length) return { winner: mover, reason: 'no_moves' };
  if (state.seen[key || positionKey(state)] >= 3) return adjudicate(state, 'repetition');
  if (state.ply >= state.maxPlies) return adjudicate(state, 'max_plies');
  return null;
}

function adjudicate(state, reason) {
  const n = countPieces(state);
  return { winner: n.blue > n.pink ? 'blue' : n.pink > n.blue ? 'pink' : null, reason, pieces: n };
}

const REASON_VI = {
  goal: 'đưa quân vào ô đích',
  eliminate: 'ăn hết một loại quân của đối phương',
  no_moves: 'đối phương hết nước đi',
  repetition: 'lặp thế cờ 3 lần, phân định theo số quân',
  max_plies: 'hết giới hạn nước, phân định theo số quân',
  errors: 'đối phương lỗi 3 lần trong ván',
  crash: 'đối phương bị dừng (lỗi khởi động, thoát hoặc quá giờ)',
};

module.exports = {
  COLS, SIZE, SIDES, OTHER, GOAL, SIDE_VI, BLUE_SETUP, REASON_VI,
  sq, parseSq, initialPieces, newGame, legalMoves, parseMove, findLegal, applyMove, checkEnd, adjudicate, countPieces, positionKey,
};
