// Chạy trận OTTv2 giữa hai bot. Một trận = các ván đổi màu; máy chủ kiểm tra từng nước bằng src/game/board.js.
const { BotProcess } = require('./bot');
const board = require('../game/board');
const rules = require('../rules');
const config = require('../config');

/**
 * Một ván. Bot nhận trạng thái bàn cờ và danh sách nước hợp lệ, trả về một nước.
 * Nước sai / lỗi / quá CPU: hệ thống đi thay một nước hợp lệ ngẫu nhiên (theo seed) và ghi lỗi;
 * lỗi thứ maxErrors trong ván thì thua kỹ thuật. Bot bị dừng (crash, quá 1 giây) thì thua ván ngay.
 */
async function playGame({ botBlue, botPink, ruleset, maxPlies, seed, logs }) {
  const rand = rules.rng(seed);
  const procs = { blue: new BotProcess(botBlue, 'blue'), pink: new BotProcess(botPink, 'pink') };
  const info = (side) => ({
    me: side, opponent: board.OTHER[side], my_goal: board.GOAL[side], opponent_goal: board.GOAL[board.OTHER[side]],
    types: ruleset.moves, beats: ruleset.beats, max_plies: maxPlies,
  });
  let state = board.newGame(maxPlies);
  const moves = [];
  const errors = { blue: 0, pink: 0 };
  let end = null;
  try {
    await Promise.all(board.SIDES.map((side, i) => procs[side].start({ seed: (seed + i * 7919) >>> 0, info: info(side) })));
    while (!end) {
      const side = state.toMove;
      const bot = procs[side];
      const legal = board.legalMoves(ruleset, state);
      const pieces = Object.entries(state.pieces).map(([square, p]) => ({ square, ...p }));
      const res = bot.dead ? { error: bot.deathReason, dead: true } : await bot.ask({
        ply: state.ply,
        board: state.pieces,
        my_pieces: pieces.filter((p) => p.side === side).map(({ square, type }) => ({ square, type })),
        opponent_pieces: pieces.filter((p) => p.side !== side).map(({ square, type }) => ({ square, type })),
        legal_moves: legal,
        history: state.history,
      });
      if (res.dead || bot.dead) {
        moves.push({ side, err: res.error || bot.deathReason });
        end = { winner: board.OTHER[side], reason: 'crash' };
        break;
      }
      let mv = res.error ? null : board.findLegal(ruleset, state, board.parseMove(res.move));
      let err = null;
      if (!mv) {
        err = res.error || `Nước không hợp lệ: ${JSON.stringify(res.move)}`;
        errors[side]++;
        if (errors[side] >= config.limits.maxErrors) {
          moves.push({ side, err });
          end = { winner: board.OTHER[side], reason: 'errors' };
          break;
        }
        mv = legal[Math.floor(rand() * legal.length)];
      }
      const out = board.applyMove(ruleset, state, mv);
      state = out.state;
      const rec = { side, from: mv.from, to: mv.to, type: state.pieces[mv.to].type };
      if (mv.capture) rec.capture = mv.capture;
      if (err) { rec.err = err; rec.auto = true; }
      moves.push(rec);
      end = out.end;
    }
  } finally {
    procs.blue.stop();
    procs.pink.stop();
    logs.blue = procs.blue.log;
    logs.pink = procs.pink.log;
  }
  return { winner: end.winner, reason: end.reason, plies: state.ply, pieces: board.countPieces(state), moves, errors };
}

/**
 * Một trận giữa bot A và bot B: các ván đổi màu (ván chẵn A cầm Xanh). Thắng ván 1 điểm, hòa 0,5.
 * Nhiều điểm ván hơn thắng trận. Trận loại trực tiếp hòa thì đấu thêm `extraGames` ván, vẫn hòa thì bốc thăm theo seed.
 */
async function runMatch(o) {
  const games = [];
  let logA = '', logB = '';
  const play = async (count) => {
    for (let i = 0; i < count; i++) {
      const n = games.length;
      const aBlue = n % 2 === 0;
      const logs = {};
      const g = await playGame({
        botBlue: aBlue ? o.botA : o.botB, botPink: aBlue ? o.botB : o.botA,
        ruleset: o.ruleset, maxPlies: o.maxPlies, seed: (o.seed + n * 104729) >>> 0, logs,
      });
      const a = aBlue ? 'blue' : 'pink';
      games.push({ blue: aBlue ? 'a' : 'b', ...g, result: g.winner == null ? 'draw' : g.winner === a ? 'a' : 'b' });
      logA += `===== Ván ${n + 1} (cầm ${board.SIDE_VI[a]}) =====\n${logs[a] || ''}`;
      logB += `===== Ván ${n + 1} (cầm ${board.SIDE_VI[board.OTHER[a]]}) =====\n${logs[board.OTHER[a]] || ''}`;
    }
  };
  await play(o.games);
  let score = rules.tally(games.map((g) => ({ r: g.result })));
  let result = rules.matchResult(score);
  let decidedBy = 'games';
  let extraUsed = 0;
  if (o.decisive && result === 'draw' && o.extraGames > 0) {
    extraUsed = o.extraGames;
    await play(o.extraGames);
    score = rules.tally(games.map((g) => ({ r: g.result })));
    result = rules.matchResult(score);
    decidedBy = 'extra';
  }
  let lot = null;
  if (o.decisive && result === 'draw') {
    lot = rules.rng(o.seed ^ 0x9e3779b9)() < 0.5 ? 'a' : 'b';
    result = lot;
    decidedBy = 'lot';
  }
  return { games, ...score, result, decidedBy, extraUsed, lot, logA, logB };
}

module.exports = { runMatch, playGame };
