// Người chơi một ván OTTv2 với bot mẫu theo đúng luật thi (giới hạn nước, lặp thế cờ, đích, ăn hết một loại).
// Không tính điểm giải. Máy chủ kiểm tra mọi nước và tự đi cho bot.
const db = require('../db');
const config = require('../config');
const board = require('../game/board');
const { UserError } = require('./submissions');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const xy = (s) => board.parseSq(s);
const dist = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); };

// Cùng logic với các tệp sample-bots/*.py.
const BOTS = {
  random_bot: (s) => pick(s.legal_moves),
  greedy_bot: (s) => { const c = s.legal_moves.filter((m) => m.capture); return pick(c.length ? c : s.legal_moves); },
  rusher_bot: (s) => {
    const best = Math.min(...s.legal_moves.map((m) => dist(m.to, s.my_goal)));
    return pick(s.legal_moves.filter((m) => dist(m.to, s.my_goal) === best));
  },
  smart_bot: (s) => {
    const win = s.legal_moves.find((m) => m.to === s.my_goal);
    if (win) return win;
    const attacked = (square, type, b) => {
      const [x, y] = xy(square);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx > 8 || y + dy > 8) continue;
        const p = b[board.sq(x + dx, y + dy)];
        if (p && p.side !== s.me && (s.beats[p.type] || []).includes(type)) return true;
      }
      return false;
    };
    const score = (m) => {
      const type = s.board[m.from].type;
      const after = { ...s.board };
      delete after[m.from];
      after[m.to] = { side: s.me, type };
      let v = 0;
      if (m.capture) v += 30 + Math.max(0, 4 - dist(m.to, s.opponent_goal)) * 10;
      if (attacked(m.to, type, after)) v -= 25;
      v += (dist(m.from, s.my_goal) - dist(m.to, s.my_goal)) * 5;
      return v + Math.random();
    };
    return s.legal_moves.reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

function phaseRuleset(teamId) {
  const fsn = db.get('SELECT status FROM final_session WHERE id = 1');
  const finalist = teamId && db.get(`SELECT 1 FROM series WHERE phase_key = 'final' AND (team_a = ? OR team_b = ?)`, teamId, teamId);
  const key = finalist && fsn && fsn.status !== 'draft' ? 'final' : 'swiss';
  return db.get('SELECT title, ruleset_id FROM phases WHERE key = ?', key);
}

/** Dựng lại ván từ danh sách nước đã lưu. */
function replay(g) {
  const rs = db.ruleset(g.ruleset_id);
  let state = board.newGame(g.turns);
  let end = null;
  for (const m of JSON.parse(g.history)) {
    const out = board.applyMove(rs, state, board.findLegal(rs, state, m));
    state = out.state;
    end = out.end;
  }
  return { rs, state, end };
}

function view(g) {
  const { rs, state, end } = replay(g);
  const human = g.color;
  const result = end ? (end.winner == null ? 'D' : end.winner === human ? 'W' : 'L') : null;
  return {
    id: g.id, bot: g.bot, color: human, botColor: board.OTHER[human],
    ruleset: { name: rs.name, moves: rs.moves, beats: rs.beats },
    pieces: state.pieces, toMove: state.toMove, ply: state.ply, maxPlies: state.maxPlies,
    history: state.history, counts: board.countPieces(state),
    legal: !end && state.toMove === human ? board.legalMoves(rs, state) : [],
    end, result, goals: board.GOAL,
    repetitions: Math.max(...Object.values(state.seen)),
  };
}

function botTurn(g) {
  const { rs, state, end } = replay(g);
  if (end || state.toMove !== board.OTHER[g.color]) return g;
  const me = state.toMove;
  const mv = BOTS[g.bot]({
    me, my_goal: board.GOAL[me], opponent_goal: board.GOAL[board.OTHER[me]], beats: rs.beats,
    board: state.pieces, legal_moves: board.legalMoves(rs, state),
  });
  const history = [...JSON.parse(g.history), { from: mv.from, to: mv.to }];
  db.run('UPDATE human_games SET history = ? WHERE id = ?', JSON.stringify(history), g.id);
  return { ...g, history: JSON.stringify(history) };
}

function start(userId, teamId, bot, color) {
  if (!BOTS[bot]) throw new UserError('Bot mẫu không tồn tại');
  if (!['blue', 'pink'].includes(color)) throw new UserError('Chọn màu Xanh hoặc Hồng');
  const p = phaseRuleset(teamId);
  const id = db.run('INSERT INTO human_games (user_id, bot, ruleset_id, turns, color) VALUES (?,?,?,?,?)',
    userId, bot, p.ruleset_id, config.match.maxPlies, color).lastInsertRowid;
  // Người cầm Hồng thì bot (Xanh) đi trước.
  return { ...view(botTurn(db.get('SELECT * FROM human_games WHERE id = ?', id))), phase: p.title };
}

/** Ván dở dang gần nhất để chơi tiếp sau khi tải lại trang. */
function current(userId) {
  const g = db.get('SELECT * FROM human_games WHERE user_id = ? AND color IS NOT NULL ORDER BY id DESC LIMIT 1', userId);
  if (!g) return null;
  const v = view(g);
  return v.end ? null : v;
}

function move(userId, gameId, mv) {
  const g = db.get('SELECT * FROM human_games WHERE id = ? AND user_id = ?', gameId, userId);
  if (!g || !g.color) throw new UserError('Không có ván này', 404);
  const { rs, state, end } = replay(g);
  if (end) throw new UserError('Ván đã kết thúc, hãy bắt đầu ván mới');
  if (state.toMove !== g.color) throw new UserError('Chưa tới lượt bạn');
  const legal = board.findLegal(rs, state, board.parseMove(mv));
  if (!legal) throw new UserError('Nước đi không hợp lệ');
  const history = [...JSON.parse(g.history), { from: legal.from, to: legal.to }];
  db.run('UPDATE human_games SET history = ? WHERE id = ?', JSON.stringify(history), g.id);
  return view(botTurn({ ...g, history: JSON.stringify(history) }));
}

function abandon(userId, gameId) {
  db.run('DELETE FROM human_games WHERE id = ? AND user_id = ?', gameId, userId);
}

module.exports = { start, current, move, abandon, BOTS };
