// Kiểm thử luật OTTv2 (hàm thuần).
const test = require('node:test');
const assert = require('node:assert/strict');
const board = require('../src/game/board');

const RS = { moves: ['ROCK', 'PAPER', 'SCISSORS'], beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] } };
const P = (side, type) => ({ side, type });
/** Dựng thế cờ tùy ý; mặc định mỗi bên còn đủ ba loại ở góc xa để không kích hoạt điều kiện "ăn hết một loại". */
function pos(pieces, toMove = 'blue', withReserves = true) {
  const base = withReserves ? {
    A3: P('blue', 'ROCK'), A4: P('blue', 'PAPER'), A5: P('blue', 'SCISSORS'),
    I7: P('pink', 'ROCK'), I6: P('pink', 'PAPER'), I5: P('pink', 'SCISSORS'),
  } : {};
  const state = { pieces: { ...base, ...pieces }, toMove, ply: 0, maxPlies: 200, seen: {}, history: [] };
  state.seen[board.positionKey(state)] = 1;
  return state;
}

test('thế cờ ban đầu: mỗi bên 3 búa, 4 bao, 3 kéo, đối xứng tâm, Xanh đi trước', () => {
  const g = board.newGame();
  const c = { blue: {}, pink: {} };
  for (const p of Object.values(g.pieces)) c[p.side][p.type] = (c[p.side][p.type] || 0) + 1;
  assert.deepEqual(c.blue, { PAPER: 4, SCISSORS: 3, ROCK: 3 });
  assert.deepEqual(c.pink, c.blue);
  assert.equal(g.toMove, 'blue');
  assert.deepEqual(g.pieces.B5, P('blue', 'PAPER'));
  assert.deepEqual(g.pieces.H5, P('pink', 'PAPER'));
  assert.deepEqual(g.pieces.F8, P('pink', 'ROCK'));
  assert.equal(g.pieces.A1, undefined);
  assert.equal(g.pieces.I9, undefined);
});

test('đi 1 ô theo 8 hướng, không ra ngoài bàn', () => {
  const s = pos({ E5: P('blue', 'ROCK') }, 'blue', false);
  const to = board.legalMoves(RS, s).filter((m) => m.from === 'E5').map((m) => m.to).sort();
  assert.deepEqual(to, ['D4', 'D5', 'D6', 'E4', 'E6', 'F4', 'F5', 'F6']);
  const corner = pos({ A1: P('blue', 'ROCK') }, 'blue', false);
  assert.deepEqual(board.legalMoves(RS, corner).map((m) => m.to).sort(), ['A2', 'B1', 'B2']);
});

test('ăn quân bị khắc; quân mình, cùng loại và quân mạnh hơn đều chặn', () => {
  const s = pos({
    E5: P('blue', 'ROCK'),
    E6: P('pink', 'SCISSORS'), // búa ăn kéo
    F6: P('pink', 'ROCK'),     // cùng loại: chặn
    F5: P('pink', 'PAPER'),    // bao mạnh hơn búa: chặn
    D5: P('blue', 'PAPER'),    // quân mình: chặn
  });
  const moves = board.legalMoves(RS, s).filter((m) => m.from === 'E5');
  const to = Object.fromEntries(moves.map((m) => [m.to, m.capture]));
  assert.equal(to.E6, 'SCISSORS');
  assert.ok(!('F6' in to));
  assert.ok(!('F5' in to));
  assert.ok(!('D5' in to));
  assert.equal(to.D4, null);
});

test('áp nước: ăn quân, đổi lượt, ghi lịch sử', () => {
  const s = pos({ E5: P('blue', 'ROCK'), E6: P('pink', 'SCISSORS') });
  const mv = board.findLegal(RS, s, board.parseMove('E5-E6'));
  const { state, end } = board.applyMove(RS, s, mv);
  assert.deepEqual(state.pieces.E6, P('blue', 'ROCK'));
  assert.equal(state.pieces.E5, undefined);
  assert.equal(state.toMove, 'pink');
  assert.equal(state.history[0].capture, 'SCISSORS');
  assert.equal(end, null);
  assert.equal(s.pieces.E5.type, 'ROCK', 'trạng thái cũ không bị sửa');
});

test('thắng khi đưa quân vào ô đích (Xanh I9, Hồng A1)', () => {
  const s = pos({ H8: P('blue', 'PAPER') });
  const r = board.applyMove(RS, s, board.findLegal(RS, s, { from: 'H8', to: 'I9' }));
  assert.deepEqual(r.end, { winner: 'blue', reason: 'goal' });
  const p = pos({ B2: P('pink', 'ROCK') }, 'pink');
  const r2 = board.applyMove(RS, p, board.findLegal(RS, p, { from: 'B2', to: 'A1' }));
  assert.equal(r2.end.winner, 'pink');
  // Quân Xanh đứng ở A1 (góc nhà mình) không phải là thắng.
  const b = pos({ B2: P('blue', 'ROCK') });
  assert.equal(board.applyMove(RS, b, board.findLegal(RS, b, { from: 'B2', to: 'A1' })).end, null);
});

test('thắng khi ăn hết một loại quân của đối phương', () => {
  const s = pos({ E5: P('blue', 'ROCK'), E6: P('pink', 'SCISSORS'), A3: P('blue', 'ROCK') }, 'blue', false);
  Object.assign(s.pieces, { A4: P('blue', 'PAPER'), A5: P('blue', 'SCISSORS'), I7: P('pink', 'ROCK'), I6: P('pink', 'PAPER') });
  const r = board.applyMove(RS, s, board.findLegal(RS, s, { from: 'E5', to: 'E6' }));
  assert.equal(r.end.winner, 'blue');
  assert.equal(r.end.reason, 'eliminate');
  assert.equal(r.end.type, 'SCISSORS');
});

test('bên tới lượt hết nước đi thì thua', () => {
  // Búa Hồng duy nhất ở I1 bị vây: bao Xanh (mạnh hơn) và búa Xanh (cùng loại) chặn cả ba ô xung quanh.
  const s = pos({ I1: P('pink', 'ROCK'), I2: P('blue', 'PAPER'), H2: P('blue', 'ROCK'), H1: P('blue', 'PAPER'), A5: P('blue', 'SCISSORS') }, 'pink', false);
  assert.equal(board.legalMoves(RS, s, 'pink').length, 0);
  // Chỉ xét loại quân Hồng còn có, để không kích hoạt điều kiện "ăn hết một loại".
  assert.deepEqual(board.checkEnd({ moves: ['ROCK'], beats: RS.beats }, s, 'blue'), { winner: 'blue', reason: 'no_moves' });
});

test('lặp thế cờ 3 lần: phân định theo số quân', () => {
  let s = pos({ E5: P('blue', 'ROCK'), E2: P('blue', 'PAPER') });
  const seq = ['E5-E4', 'I7-H7', 'E4-E5', 'H7-I7', 'E5-E4', 'I7-H7', 'E4-E5', 'H7-I7'];
  let end = null;
  for (const t of seq) {
    const out = board.applyMove(RS, s, board.findLegal(RS, s, board.parseMove(t)));
    s = out.state;
    end = out.end;
    if (end) break;
  }
  assert.ok(end, 'kết thúc vì lặp');
  assert.equal(end.reason, 'repetition');
  assert.equal(end.winner, 'blue', 'Xanh còn 5 quân, Hồng 3 quân');
});

test('hết giới hạn nước: số quân bằng nhau là hòa', () => {
  const s = pos({});
  s.maxPlies = 1;
  const out = board.applyMove(RS, s, board.findLegal(RS, s, { from: 'A3', to: 'B3' }));
  assert.equal(out.end.reason, 'max_plies');
  assert.equal(out.end.winner, null);
});

test('đọc nước đi bot trả về ở nhiều dạng', () => {
  assert.deepEqual(board.parseMove({ from: 'b4', to: 'C5' }), { from: 'B4', to: 'C5' });
  assert.deepEqual(board.parseMove(['B4', 'C5']), { from: 'B4', to: 'C5' });
  assert.deepEqual(board.parseMove('B4-C5'), { from: 'B4', to: 'C5' });
  assert.deepEqual(board.parseMove('b4c5'), { from: 'B4', to: 'C5' });
  assert.equal(board.parseMove('Z9-Z9'), null);
  assert.equal(board.parseMove(42), null);
  assert.equal(board.parseMove(null), null);
});

test('luật chung kết đổi bảng khắc chế được áp dụng', () => {
  const REV = { moves: RS.moves, beats: { ROCK: ['PAPER'], PAPER: ['SCISSORS'], SCISSORS: ['ROCK'] } };
  const s = pos({ E5: P('blue', 'ROCK'), E6: P('pink', 'PAPER'), F6: P('pink', 'SCISSORS') });
  const to = board.legalMoves(REV, s).filter((m) => m.from === 'E5').map((m) => m.to);
  assert.ok(to.includes('E6'), 'búa ăn bao theo luật mới');
  assert.ok(!to.includes('F6'), 'kéo giờ mạnh hơn búa');
});
