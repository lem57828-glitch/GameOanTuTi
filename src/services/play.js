// Người chơi với bot mẫu để hiểu luật. Không tính điểm giải. Máy chủ quyết định lựa chọn của bot trước khi xem lựa chọn của người.
const db = require('../db');
const rules = require('../rules');
const { UserError } = require('./submissions');

const counterOf = (rs, move) => rs.moves.filter((m) => (rs.beats[m] || []).includes(move));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BOTS = {
  random_bot: (rs) => pick(rs.moves),
  rock_bot: (rs) => rs.moves[0],
  cycle_bot: (rs, h) => rs.moves[h.length % rs.moves.length],
  adaptive_bot: (rs, h) => {
    if (h.length < 3) return pick(rs.moves);
    const counts = {};
    for (const t of h.slice(-20)) counts[t.you] = (counts[t.you] || 0) + 1;
    const guess = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return pick(counterOf(rs, guess)) || pick(rs.moves);
  },
};

const classic = () => db.ruleset(db.get(`SELECT ruleset_id FROM phases WHERE key = 'swiss'`).ruleset_id);

function start(userId, bot) {
  if (!BOTS[bot]) throw new UserError('Bot mẫu không tồn tại');
  const id = db.run('INSERT INTO human_games (user_id, bot) VALUES (?,?)', userId, bot).lastInsertRowid;
  return { id: Number(id), bot, moves: classic().moves, history: [] };
}

function move(userId, gameId, yourMove) {
  const g = db.get('SELECT * FROM human_games WHERE id = ? AND user_id = ?', gameId, userId);
  if (!g) throw new UserError('Không có ván này', 404);
  const rs = classic();
  if (!rs.moves.includes(yourMove)) throw new UserError('Lựa chọn không hợp lệ');
  const history = JSON.parse(g.history);
  if (history.length >= 1000) throw new UserError('Ván đã quá dài, hãy bắt đầu ván mới');
  const botMove = BOTS[g.bot](rs, history);
  const r = rules.judge(rs, yourMove, botMove);
  history.push({ you: yourMove, bot: botMove, r: r === 'a' ? 'W' : r === 'b' ? 'L' : 'D' });
  db.run('UPDATE human_games SET history = ? WHERE id = ?', JSON.stringify(history), g.id);
  return { you: yourMove, bot: botMove, result: history[history.length - 1].r, score: score(history), turns: history.length };
}

function score(h) {
  return { you: h.filter((t) => t.r === 'W').length, bot: h.filter((t) => t.r === 'L').length, draws: h.filter((t) => t.r === 'D').length };
}

module.exports = { start, move, BOTS };
