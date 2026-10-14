// Chạy một trận giữa hai bot. Máy chủ phân xử từng lượt bằng bộ luật trong rules.js.
const { BotProcess } = require('./bot');
const rules = require('../rules');

/**
 * @param {object} o
 * @param {string} o.botA đường dẫn tệp bot A
 * @param {string} o.botB đường dẫn tệp bot B
 * @param {object} o.ruleset { moves, beats }
 * @param {number} o.turns số lượt chính
 * @param {boolean} o.reveal cho bot thấy lựa chọn của đối thủ và kết quả từng lượt
 * @param {boolean} o.decisive bắt buộc phân thắng thua (vòng loại trực tiếp, đấu phụ)
 * @param {number} o.extraTurns số lượt thêm khi hòa (chỉ khi decisive)
 * @param {number} o.seed
 */
async function runMatch(o) {
  const a = new BotProcess(o.botA, 'A');
  const b = new BotProcess(o.botB, 'B');
  const init = { moves: o.ruleset.moves, beats: o.ruleset.beats, turns: o.turns };
  const turns = [];
  try {
    await Promise.all([
      a.start({ ...init, seed: o.seed }),
      b.start({ ...init, seed: (o.seed ^ 0x5bd1e995) >>> 0 }),
    ]);

    const play = async (count, total) => {
      for (let i = 0; i < count; i++) {
        const turn = turns.length;
        const view = (me) => {
          const mine = turns.map((t) => (me === 'a' ? t.a : t.b));
          if (!o.reveal) return { turn, total_turns: total, my_moves: mine, opponent_moves: null, results: null };
          return {
            turn, total_turns: total, my_moves: mine,
            opponent_moves: turns.map((t) => (me === 'a' ? t.b : t.a)),
            results: turns.map((t) => (t.r === 'draw' ? 'D' : t.r === me ? 'W' : 'L')),
          };
        };
        const [ra, rb] = await Promise.all([
          a.dead ? { error: a.deathReason, dead: true } : a.ask(view('a')),
          b.dead ? { error: b.deathReason, dead: true } : b.ask(view('b')),
        ]);
        const ma = ra.move ?? null;
        const mb = rb.move ?? null;
        const t = { a: ma, b: mb, r: rules.judge(o.ruleset, ma, mb) };
        if (ra.error) t.ea = ra.error;
        else if (!o.ruleset.moves.includes(ma)) t.ea = `Lựa chọn không hợp lệ: ${ma}`;
        if (rb.error) t.eb = rb.error;
        else if (!o.ruleset.moves.includes(mb)) t.eb = `Lựa chọn không hợp lệ: ${mb}`;
        turns.push(t);
      }
    };

    await play(o.turns, o.turns);
    let score = rules.tally(turns);
    let result = rules.matchResult(score);
    let decidedBy = 'turns';
    let extraUsed = 0;

    if (o.decisive && result === 'draw' && o.extraTurns > 0) {
      extraUsed = o.extraTurns;
      await play(o.extraTurns, o.turns + o.extraTurns);
      score = rules.tally(turns);
      result = rules.matchResult(score);
      decidedBy = 'extra';
    }
    let lot = null;
    if (o.decisive && result === 'draw') {
      // Bốc thăm có ghi nhận: dùng seed của trận nên tái lập được khi tra soát.
      lot = rules.rng(o.seed ^ 0x9e3779b9)() < 0.5 ? 'a' : 'b';
      result = lot;
      decidedBy = 'lot';
    }
    return { turns, ...score, result, decidedBy, extraUsed, lot, logA: a.log, logB: b.log };
  } finally {
    a.stop();
    b.stop();
  }
}

module.exports = { runMatch };
