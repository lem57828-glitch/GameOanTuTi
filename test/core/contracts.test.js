// Kiểm thử hợp đồng giữa các module (core/contracts.js) và các hàm giao diện đã viết sẵn.
// Khi đổi hợp đồng, cập nhật test này cùng lúc với docs/CONTRACTS.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../helpers').setupApp();
const c = require('../../server/core/contracts');
const accounts = require('../../server/modules/accounts-teams/service');
const bots = require('../../server/modules/bots-runner/service');
const tournaments = require('../../server/modules/tournaments/service');

const goodRequest = () => ({
  requestKey: 'match:1/game:1/run:1', blueBotVersionId: 1, pinkBotVersionId: 2, rulesetId: 1, seed: 123,
  limits: { cpuMsPerMove: 200, wallMsPerMove: 1000, startupMs: 3000, maxPlies: 200, maxErrors: 3 },
});

test('GameRequest: hợp lệ và các lỗi thường gặp', () => {
  assert.deepEqual(c.validateGameRequest(goodRequest()), []);
  assert.ok(c.validateGameRequest({ ...goodRequest(), requestKey: '' }).length);
  assert.ok(c.validateGameRequest({ ...goodRequest(), blueExtraType: 'LIZARD' }).length);
  assert.ok(c.validateGameRequest({ ...goodRequest(), limits: {} }).length);
});

test('GameResult và MatchCompleted', () => {
  assert.deepEqual(c.validateGameResult({ requestKey: 'k', winner: null, reason: 'max_plies', plies: 200, pieces: { blue: 5, pink: 5 }, moves: [] }), []);
  assert.ok(c.validateGameResult({ requestKey: 'k', winner: 'green', reason: 'goal', plies: 1, pieces: { blue: 1, pink: 1 }, moves: [] }).length);
  const games = Array.from({ length: 5 }, (_, i) => ({ no: i + 1, extra: false, winnerTeam: 1, pointsA: 3, pointsB: 0 }));
  assert.deepEqual(c.validateMatchCompleted({ pairId: 1, matchId: 1, resultVersion: 1, games, pointsA: 15, pointsB: 0, winnerTeam: 1, decidedBy: 'points' }), []);
  assert.ok(c.validateMatchCompleted({ pairId: 1, matchId: 1, resultVersion: 1, games: games.slice(0, 4), winnerTeam: 1, decidedBy: 'points' }).length);
});

test('bots-runner.requestGame: kiểm tra hợp đồng và chống chạy trùng theo requestKey', () => {
  const a = bots.requestGame(goodRequest());
  const b = bots.requestGame(goodRequest());
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.jobId, b.jobId);
  assert.equal(bots.gameStatus('match:1/game:1/run:1').status, 'queued');
  assert.throws(() => bots.requestGame({ requestKey: 'x' }), (e) => e.code === 'VALIDATION');
});

test('giao diện accounts-teams: teamOf, isCaptain, members, notify', () => {
  const tid = Number(t.db.run(`INSERT INTO tournaments (name) VALUES ('g')`).lastInsertRowid);
  const cap = t.user('cap'), mem = t.user('mem');
  const team = Number(t.db.run('INSERT INTO teams (tournament_id, name, name_key, captain_id, invite_code) VALUES (?,?,?,?,?)', tid, 'Đội A', 'doi a', cap, 'X1').lastInsertRowid);
  for (const u of [cap, mem]) t.db.run('INSERT INTO team_members (team_id, user_id, tournament_id) VALUES (?,?,?)', team, u, tid);
  assert.equal(accounts.teamOf(mem, tid).id, team);
  assert.equal(accounts.isCaptain(cap, team), true);
  assert.equal(accounts.isCaptain(mem, team), false);
  assert.equal(accounts.members(team).length, 2);
  assert.equal(accounts.notify({ teamId: team, kind: 'test', title: 'Xin chào' }), 2);
  assert.equal(tournaments.currentTournament().id, tid);
});
