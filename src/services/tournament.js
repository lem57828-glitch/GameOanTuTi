// Điều phối giải: khóa phiên bản, vòng Swiss, tranh suất Top 32, nhánh loại trực tiếp, chạy trận.
const db = require('../db');
const config = require('../config');
const queue = require('./queue');
const swiss = require('./swiss');
const { runMatch } = require('../runner/match');
const { newSeed, rng, shuffle } = require('../rules');
const { samplePath, UserError } = require('./submissions');

const KNOCKOUT = ['r32', 'r16', 'qf', 'sf', 'final'];
const nextPhase = (key) => KNOCKOUT[KNOCKOUT.indexOf(key) + 1] || null;
const phase = (key) => db.get('SELECT * FROM phases WHERE key = ?', key);

// ---------------------------------------------------------------- trận đấu

function createMatch(m) {
  const id = Number(db.run(`INSERT INTO matches (kind, phase_key, round_no, series_id, game_no, team_a, team_b, sub_a, sub_b,
      sample_bot, ruleset_id, reveal_opponent, decisive, turns, seed, requested_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  m.kind, m.phase_key ?? null, m.round_no ?? null, m.series_id ?? null, m.game_no ?? null, m.team_a ?? null, m.team_b ?? null,
  m.sub_a ?? null, m.sub_b ?? null, m.sample_bot ?? null, m.ruleset_id, m.reveal ? 1 : 0, m.decisive ? 1 : 0,
  m.games ?? config.match.games, m.seed ?? newSeed(), m.requested_by ?? null).lastInsertRowid);
  // Chạy thử và thách đấu xếp sau thi chính thức và kiểm tra bài.
  if (m.kind !== 'bye') queue.enqueue('match', id, ['practice', 'challenge'].includes(m.kind) ? queue.PRIORITY.practice : queue.PRIORITY.official);
  return id;
}

/** Thực thi một trận. Mỗi lần thực thi là một "run"; kết quả trận bị ghi đè chứ không cộng dồn. */
async function executeMatch(job, workerId) {
  const m = db.get('SELECT * FROM matches WHERE id = ?', job.ref_id);
  if (!m || m.status === 'done') return;
  const attempt = (db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n || 0) + 1;
  const runId = db.run(`INSERT INTO runs (match_id, attempt, status, worker) VALUES (?,?,?,?)`, m.id, attempt, 'running', workerId).lastInsertRowid;
  db.run(`UPDATE matches SET status = 'running' WHERE id = ?`, m.id);

  const pathOf = (subId) => db.get('SELECT path FROM submissions WHERE id = ?', subId).path;
  let res;
  try {
    res = await runMatch({
      botA: pathOf(m.sub_a),
      botB: m.sample_bot ? samplePath(m.sample_bot) : pathOf(m.sub_b),
      ruleset: db.ruleset(m.ruleset_id),
      games: m.turns, // cột `turns` lưu số ván của trận
      maxPlies: config.match.maxPlies,
      decisive: !!m.decisive,
      extraGames: m.decisive ? config.match.extraGames : 0,
      seed: m.seed,
    });
  } catch (e) {
    db.run(`UPDATE runs SET status = 'error', error = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, String(e.message || e), runId);
    db.run(`UPDATE matches SET status = 'queued' WHERE id = ?`, m.id);
    throw e; // lỗi hạ tầng: hàng đợi chạy lại, không ghi điểm
  }

  db.tx(() => {
    db.run(`UPDATE runs SET status = 'done', turns_json = ?, log_a = ?, log_b = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      JSON.stringify(res.games), res.logA, res.logB, runId);
    db.run(`UPDATE matches SET status = 'done', result = ?, wins_a = ?, wins_b = ?, draws = ?, extra_turns_used = ?, decided_by = ?,
        finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    res.result, res.winsA, res.winsB, res.draws, res.extraUsed, res.decidedBy, m.id);
  });
  afterMatch(db.get('SELECT * FROM matches WHERE id = ?', m.id));
}

function afterMatch(m) {
  if (m.series_id) advanceSeries(m.series_id);
  if (m.kind === 'tiebreak') advanceContest();
}

/** Chạy lại trận (ví dụ lỗi hạ tầng, khiếu nại được chấp nhận). Lịch sử run cũ được giữ để truy vết. */
function rerunMatch(matchId, adminId) {
  const m = db.get('SELECT * FROM matches WHERE id = ?', matchId);
  if (!m) throw new UserError('Không có trận này', 404);
  if (m.kind === 'bye') throw new UserError('Không chạy lại lượt nghỉ');
  if (m.series_id && db.get(`SELECT status FROM series WHERE id = ?`, m.series_id).status === 'done') {
    throw new UserError('Cặp đấu đã kết thúc; không chạy lại để tránh làm sai nhánh');
  }
  if (m.kind === 'tiebreak' && m.status === 'done') throw new UserError('Trận tranh suất đã được áp dụng');
  db.run(`UPDATE matches SET status = 'queued', result = NULL, wins_a = NULL, wins_b = NULL, draws = NULL, confirmed = 0 WHERE id = ?`, matchId);
  db.run(`UPDATE jobs SET status = 'cancelled' WHERE type = 'match' AND ref_id = ? AND status = 'queued'`, matchId);
  queue.enqueue('match', matchId, queue.PRIORITY.official);
  db.audit(adminId, 'rerun_match', { match: matchId });
}

/** Chạy lại vòng Swiss gần nhất; không thay đổi cặp đấu, bản bot hay seed. */
function rerunSwissRound(roundNo, adminId) {
  if (!Number.isInteger(roundNo) || roundNo < 1) throw new UserError('Số vòng không hợp lệ');
  return db.tx(() => {
    const last = db.get("SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')").r;
    if (!last) throw new UserError('Chưa có vòng Swiss nào');
    if (phase('swiss').status === 'done' || db.jsonSetting('cut_state')) throw new UserError('Đã chốt sơ loại, không thể chạy lại vòng');
    if (roundNo !== last) throw new UserError('Chỉ được chạy lại vòng Swiss gần nhất vì vòng sau đã dùng kết quả để ghép cặp');
    const matches = db.all("SELECT id, status FROM matches WHERE kind = 'swiss' AND round_no = ?", roundNo);
    if (!matches.length) throw new UserError('Vòng này không có trận để chạy lại');
    const active = db.get(`SELECT COUNT(*) AS n FROM jobs WHERE type = 'match' AND status = 'running'
      AND ref_id IN (SELECT id FROM matches WHERE kind = 'swiss' AND round_no = ?)`, roundNo).n;
    if (active || matches.some((m) => m.status === 'running')) throw new UserError('Vòng còn trận đang chạy, hãy chờ hoàn tất');
    for (const m of matches) {
      db.run(`UPDATE matches SET status = 'queued', result = NULL, wins_a = NULL, wins_b = NULL, draws = NULL,
        extra_turns_used = 0, decided_by = NULL, confirmed = 0, finished_at = NULL WHERE id = ?`, m.id);
      db.run("UPDATE jobs SET status = 'cancelled' WHERE type = 'match' AND ref_id = ? AND status = 'queued'", m.id);
      queue.enqueue('match', m.id, queue.PRIORITY.official);
    }
    db.run("UPDATE matches SET confirmed = 0 WHERE kind = 'bye' AND round_no = ?", roundNo);
    db.audit(adminId, 'rerun_swiss_round', { round: roundNo, matches: matches.length });
    return { round: roundNo, matches: matches.length };
  });
}

// ---------------------------------------------------------------- khóa phiên bản

/** Bắt đầu lại giải, giữ tài khoản, đội, bài nộp và các trận giao hữu. */
function resetTournament(adminId) {
  return db.tx(() => {
    if (db.get("SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'").n ||
        db.get("SELECT COUNT(*) AS n FROM matches WHERE status = 'running'").n) {
      throw new UserError('Còn tác vụ đang chạy, hãy chờ hoàn tất rồi reset giải', 409);
    }
    const official = "SELECT id FROM matches WHERE kind IN ('swiss','bye','tiebreak','knockout')";
    const matches = db.get(`SELECT COUNT(*) AS n FROM matches WHERE id IN (${official})`).n;
    db.run(`DELETE FROM jobs WHERE type = 'match' AND ref_id IN (${official})`);
    db.run(`DELETE FROM runs WHERE match_id IN (${official})`);
    db.run(`UPDATE tickets SET match_id = NULL WHERE match_id IN (${official})`);
    db.run(`DELETE FROM matches WHERE id IN (${official})`);
    db.run('DELETE FROM entries');
    db.run('DELETE FROM series');
    db.run('DELETE FROM final_session');
    db.run('DELETE FROM awards');
    db.run('DELETE FROM certificates');
    db.run("DELETE FROM settings WHERE key IN ('cut_state','qualified')");
    db.run("UPDATE phases SET status = 'pending', locked_at = NULL");
    db.run("UPDATE phases SET ruleset_id = (SELECT ruleset_id FROM phases WHERE key = 'swiss'), reveal_opponent = 1 WHERE key = 'final'");
    // Bản chung kết thuộc luật cũ vẫn được lưu, nhưng mùa mới dùng bản thi thường.
    db.run(`UPDATE teams SET official_submission_id = (
      SELECT s.id FROM submissions s WHERE s.team_id = teams.id AND s.phase_key = 'main' AND s.status = 'valid'
      ORDER BY s.version DESC LIMIT 1
    ) WHERE official_submission_id IN (SELECT id FROM submissions WHERE phase_key = 'final')`);
    db.setSetting('current_phase', 'swiss');
    db.setSetting('teams_open', 'true');
    db.setSetting('submissions_open', 'true');
    db.audit(adminId, 'reset_tournament', { matches });
    return { ok: true, matches };
  });
}

/** Khóa phiên bản thi của từng đội cho giai đoạn. Sau khóa, đổi bản không ảnh hưởng giai đoạn này. */
function lockPhase(key, adminId) {
  const p = phase(key);
  if (!p) throw new UserError('Giai đoạn không tồn tại', 404);
  if (p.status !== 'pending') throw new UserError('Giai đoạn đã khóa');
  let teams;
  if (key === 'swiss') {
    teams = db.all(`SELECT t.id, t.official_submission_id AS sub FROM teams t
      JOIN submissions s ON s.id = t.official_submission_id AND s.status = 'valid' WHERE t.withdrawn = 0`);
  } else {
    if (key === 'final') {
      const fsn = db.get('SELECT * FROM final_session WHERE id = 1');
      if (!fsn || fsn.status !== 'ended') throw new UserError('Phiên chung kết chưa kết thúc');
    }
    const ids = db.all(`SELECT team_a AS id FROM series WHERE phase_key = ? AND team_a IS NOT NULL
      UNION SELECT team_b FROM series WHERE phase_key = ? AND team_b IS NOT NULL`, key, key).map((r) => r.id);
    if (!ids.length) throw new UserError('Chưa có đội nào trong giai đoạn này');
    teams = ids.map((id) => {
      const t = db.get(`SELECT t.official_submission_id AS sub, s.status FROM teams t LEFT JOIN submissions s ON s.id = t.official_submission_id WHERE t.id = ?`, id);
      // Không có bản hợp lệ mới thì giữ bản đã khóa ở giai đoạn trước.
      const prev = db.get(`SELECT submission_id FROM entries WHERE team_id = ? ORDER BY rowid DESC LIMIT 1`, id);
      return { id, sub: t.status === 'valid' ? t.sub : prev && prev.submission_id };
    }).filter((t) => t.sub);
  }
  if (key === 'swiss' && teams.length < 2) throw new UserError('Cần ít nhất 2 đội có bot hợp lệ');
  db.tx(() => {
    for (const t of teams) db.run('INSERT OR REPLACE INTO entries (phase_key, team_id, submission_id) VALUES (?,?,?)', key, t.id, t.sub);
    db.run(`UPDATE phases SET status = 'locked', locked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = ?`, key);
    db.setSetting('current_phase', key);
  });
  db.audit(adminId, 'lock_phase', { phase: key, teams: teams.length });
  return teams.length;
}

const entryOf = (key, teamId) => db.get('SELECT submission_id FROM entries WHERE phase_key = ? AND team_id = ?', key, teamId)?.submission_id;

// ---------------------------------------------------------------- Swiss

function swissData({ confirmedOnly = false } = {}) {
  const teamIds = db.all(`SELECT team_id FROM entries WHERE phase_key = 'swiss'`).map((r) => r.team_id);
  const cond = confirmedOnly ? 'AND confirmed = 1' : '';
  const games = db.all(`SELECT team_a AS a, team_b AS b, result, wins_a AS winsA, wins_b AS winsB FROM matches
    WHERE kind = 'swiss' AND status = 'done' ${cond}`);
  const byes = db.all(`SELECT team_a FROM matches WHERE kind = 'bye' AND phase_key = 'swiss' ${cond}`).map((r) => r.team_a);
  return { teamIds, games, byes };
}

function swissStandings() {
  const { teamIds, games, byes } = swissData();
  const rows = swiss.standings(teamIds, games, byes);
  const names = new Map(db.all('SELECT id, name FROM teams').map((t) => [t.id, t.name]));
  const pending = db.get(`SELECT COUNT(*) AS n FROM matches WHERE phase_key = 'swiss' AND kind IN ('swiss','bye') AND confirmed = 0`).n;
  const round = db.get(`SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')`).r || 0;
  return {
    round,
    totalRounds: Number(db.setting('swiss_rounds')),
    provisional: pending > 0,
    rows: rows.map((r) => ({ ...r, name: names.get(r.teamId), opponents: undefined })),
    cut: db.jsonSetting('cut_state'),
    qualified: db.jsonSetting('qualified'),
  };
}

function startSwissRound(adminId) {
  const p = phase('swiss');
  if (p.status === 'pending') throw new UserError('Cần khóa phiên bản Swiss trước');
  if (p.status === 'done') throw new UserError('Sơ loại đã kết thúc');
  const last = db.get(`SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')`).r || 0;
  const total = Number(db.setting('swiss_rounds'));
  if (last >= total) throw new UserError(`Đã đủ ${total} vòng`);
  if (last && db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind IN ('swiss','bye') AND round_no = ? AND confirmed = 0`, last).n) {
    throw new UserError(`Vòng ${last} chưa được xác nhận`);
  }
  const roundNo = last + 1;
  const { teamIds, games, byes } = swissData({ confirmedOnly: true });
  const rows = swiss.standings(teamIds, games, byes);
  const played = new Set(games.map((g) => swiss.pairKey(g.a, g.b)));
  const byeCounts = new Map();
  for (const id of byes) byeCounts.set(id, (byeCounts.get(id) || 0) + 1);
  const seed = newSeed();
  const plan = swiss.pairRound(rows, played, byeCounts, seed, roundNo);
  const { ruleset_id, reveal_opponent } = p;

  db.tx(() => {
    for (const [a, b] of plan.pairs) {
      createMatch({ kind: 'swiss', phase_key: 'swiss', round_no: roundNo, team_a: a, team_b: b,
        sub_a: entryOf('swiss', a), sub_b: entryOf('swiss', b), ruleset_id, reveal: reveal_opponent });
    }
    if (plan.bye) {
      db.run(`INSERT INTO matches (kind, phase_key, round_no, team_a, ruleset_id, turns, seed, status, result, wins_a, wins_b, draws)
        VALUES ('bye','swiss',?,?,?,0,?, 'done','a',0,0,0)`, roundNo, plan.bye, ruleset_id, seed);
    }
    db.run(`UPDATE phases SET status = 'running' WHERE key = 'swiss'`);
  });
  db.audit(adminId, 'swiss_round', { round: roundNo, seed, pairs: plan.pairs.length, bye: plan.bye, rematches: plan.rematches });
  return { round: roundNo, pairs: plan.pairs.length, bye: plan.bye, rematches: plan.rematches, seed };
}

/** Xác nhận kết quả vòng: bảng điểm chuyển từ "tạm" sang "đã xác nhận". */
function confirmRound(roundNo, adminId) {
  const notDone = db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind = 'swiss' AND round_no = ? AND status != 'done'`, roundNo).n;
  if (notDone) throw new UserError(`Còn ${notDone} trận chưa xong`);
  db.run(`UPDATE matches SET confirmed = 1 WHERE kind IN ('swiss','bye') AND round_no = ?`, roundNo);
  db.audit(adminId, 'confirm_round', { round: roundNo });
}

// ---------------------------------------------------------------- Top 32 và tranh suất

function finishSwiss(adminId) {
  const total = Number(db.setting('swiss_rounds'));
  const last = db.get(`SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')`).r || 0;
  if (last < total) throw new UserError(`Mới xong ${last}/${total} vòng`);
  if (db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind IN ('swiss','bye') AND confirmed = 0`).n) throw new UserError('Còn vòng chưa xác nhận');
  if (db.jsonSetting('cut_state')) throw new UserError('Đã chốt sơ loại');

  const { teamIds, games, byes } = swissData({ confirmedOnly: true });
  const rows = swiss.standings(teamIds, games, byes);
  const cut = swiss.cutLine(rows);
  const seed = newSeed();
  db.tx(() => {
    db.run(`UPDATE phases SET status = 'done' WHERE key = 'swiss'`);
    db.setSetting('cut_state', JSON.stringify({ seed, qualified: cut.qualified, contest: cut.contested, step: 0, history: [] }));
  });
  db.audit(adminId, 'finish_swiss', { qualified: cut.qualified.length, contested: cut.contested });
  advanceContest();
}

/** Bước kế tiếp của tranh suất ranh giới; khi xong thì xếp hạt giống và lập nhánh 32. */
function advanceContest() {
  const st = db.jsonSetting('cut_state');
  if (!st || st.done) return;
  const step = st.history[st.history.length - 1];
  if (step && !step.applied) {
    const ms = db.all(`SELECT * FROM matches WHERE kind = 'tiebreak' AND round_no = ?`, 1000 + st.step);
    if (ms.some((m) => m.status !== 'done')) return;
    const winners = ms.map((m) => (m.result === 'a' ? m.team_a : m.team_b));
    const r = swiss.applyContest(step, winners, st.contest.slots);
    st.qualified.push(...r.qualified);
    step.applied = true;
    step.winners = winners;
    st.contest = r.group.length ? { group: r.group, slots: r.slots } : null;
  }
  if (st.contest && st.contest.slots > 0 && st.contest.group.length > st.contest.slots) {
    st.step++;
    const plan = swiss.contestStep(st.contest.group, st.contest.slots, st.seed + st.step, st.history.some((h) => h.mode === 'group-round'));
    st.history.push({ ...plan, step: st.step, applied: false });
    const p = phase('swiss');
    db.tx(() => {
      db.setSetting('cut_state', JSON.stringify(st));
      for (const [a, b] of plan.pairs) {
        createMatch({ kind: 'tiebreak', phase_key: 'swiss', round_no: 1000 + st.step, team_a: a, team_b: b,
          sub_a: entryOf('swiss', a), sub_b: entryOf('swiss', b), ruleset_id: p.ruleset_id, reveal: p.reveal_opponent, decisive: true });
      }
    });
    return;
  }
  if (st.contest && st.contest.slots > 0) st.qualified.push(...st.contest.group); // nhóm vừa khít số suất
  st.contest = null;
  st.done = true;
  db.setSetting('cut_state', JSON.stringify(st));
  buildBracket(st);
}

function buildBracket(st) {
  const { teamIds, games, byes } = swissData({ confirmedOnly: true });
  const rows = swiss.standings(teamIds, games, byes);
  const rank = new Map(rows.map((r, i) => [r.teamId, i]));
  // Bằng hoàn toàn trong Top 32: bốc thăm có ghi nhận (seed) để phân hạt giống, không đấu thêm.
  const lot = new Map(shuffle(st.qualified, rng(st.seed)).map((id, i) => [id, i]));
  const qualified = st.qualified.slice().sort((a, b) => {
    const ra = rows[rank.get(a)], rb = rows[rank.get(b)];
    return swiss.compare(ra, rb) || lot.get(a) - lot.get(b);
  });
  db.setSetting('qualified', JSON.stringify(qualified));
  const size = 32;
  const order = swiss.seedOrder(size);
  db.tx(() => {
    for (let slot = 0; slot < size / 2; slot++) {
      const sa = order[2 * slot], sb = order[2 * slot + 1];
      db.run(`INSERT OR REPLACE INTO series (phase_key, slot, team_a, team_b, seed_a, seed_b, status) VALUES ('r32',?,?,?,?,?, 'pending')`,
        slot, qualified[sa - 1] ?? null, qualified[sb - 1] ?? null, sa, sb);
    }
  });
}

// ---------------------------------------------------------------- vòng loại trực tiếp

function startPhase(key, adminId) {
  if (!KNOCKOUT.includes(key)) throw new UserError('Không phải vòng loại trực tiếp');
  const p = phase(key);
  if (p.status === 'pending') lockPhase(key, adminId);
  else if (p.status !== 'locked') throw new UserError('Giai đoạn đã chạy');
  const list = db.all(`SELECT * FROM series WHERE phase_key = ? ORDER BY slot`, key);
  db.run(`UPDATE phases SET status = 'running' WHERE key = ?`, key);
  for (const s of list) {
    if (s.team_a == null || s.team_b == null) {
      // Không đủ đối thủ (ít hơn 32 đội hợp lệ): đội còn lại đi tiếp.
      db.run(`UPDATE series SET winner = ?, status = 'done' WHERE id = ?`, s.team_a ?? s.team_b, s.id);
    } else {
      db.run(`UPDATE series SET status = 'running' WHERE id = ?`, s.id);
      scheduleGame(s, 1);
    }
  }
  db.audit(adminId, 'start_phase', { phase: key });
  checkPhaseDone(key);
}

function scheduleGame(s, gameNo) {
  const p = phase(s.phase_key);
  createMatch({ kind: 'knockout', phase_key: s.phase_key, round_no: gameNo, series_id: s.id, game_no: gameNo,
    team_a: s.team_a, team_b: s.team_b, sub_a: entryOf(s.phase_key, s.team_a), sub_b: entryOf(s.phase_key, s.team_b),
    ruleset_id: p.ruleset_id, reveal: p.reveal_opponent, decisive: true });
}

function advanceSeries(seriesId) {
  const s = db.get('SELECT * FROM series WHERE id = ?', seriesId);
  if (s.status === 'done') return;
  const p = phase(s.phase_key);
  const games = db.all('SELECT * FROM matches WHERE series_id = ? ORDER BY game_no', seriesId);
  if (games.some((g) => g.status !== 'done')) return;
  const wa = games.filter((g) => g.result === 'a').length;
  const wb = games.filter((g) => g.result === 'b').length;
  const need = Math.floor(p.best_of / 2) + 1;
  const finished = p.play_all ? games.length >= p.best_of : (wa >= need || wb >= need);
  if (!finished) return scheduleGame(s, games.length + 1);
  const winner = wa > wb ? s.team_a : s.team_b; // mọi trận đều phân thắng thua nên không thể bằng
  db.run(`UPDATE series SET winner = ?, status = 'done' WHERE id = ?`, winner, s.id);
  checkPhaseDone(s.phase_key);
}

function checkPhaseDone(key) {
  const list = db.all('SELECT * FROM series WHERE phase_key = ? ORDER BY slot', key);
  if (!list.length || list.some((s) => s.status !== 'done')) return;
  db.run(`UPDATE phases SET status = 'done' WHERE key = ?`, key);
  const next = nextPhase(key);
  if (!next) return;
  db.tx(() => {
    for (let j = 0; j < list.length / 2; j++) {
      const a = list[2 * j], b = list[2 * j + 1];
      db.run(`INSERT OR REPLACE INTO series (phase_key, slot, team_a, team_b, seed_a, seed_b, status) VALUES (?,?,?,?,?,?, 'pending')`,
        next, j, a.winner, b.winner, seedOf(a, a.winner), seedOf(b, b.winner));
    }
  });
}
const seedOf = (s, team) => (team == null ? null : team === s.team_a ? s.seed_a : s.seed_b);

function bracket() {
  const names = new Map(db.all('SELECT id, name FROM teams').map((t) => [t.id, t.name]));
  return KNOCKOUT.map((key) => {
    const p = phase(key);
    return {
      key, title: p.title, status: p.status, bestOf: p.best_of, playAll: !!p.play_all,
      series: db.all('SELECT * FROM series WHERE phase_key = ? ORDER BY slot', key).map((s) => ({
        ...s, name_a: names.get(s.team_a) ?? null, name_b: names.get(s.team_b) ?? null,
        games: db.all(`SELECT id, game_no, status, result, wins_a, wins_b, draws, decided_by FROM matches WHERE series_id = ? ORDER BY game_no`, s.id),
      })),
    };
  });
}

// ---------------------------------------------------------------- luyện tập

function requestPractice({ user, team, sampleBot, submissionId }) {
  if (db.setting('practice_open') !== 'true') throw new UserError('Đang tạm khóa chạy thử', 403);
  const sub = db.get(`SELECT * FROM submissions WHERE id = ? AND team_id = ?`, submissionId || team.official_submission_id, team.id);
  if (!sub) throw new UserError('Chọn một phiên bản bot của đội');
  if (sub.status !== 'valid') throw new UserError('Phiên bản này chưa hợp lệ');
  const active = db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind = 'practice' AND team_a = ? AND status IN ('queued','running')`, team.id).n;
  if (active) throw new UserError('Đội đang có một trận chạy thử, chờ xong rồi gửi tiếp', 429);
  const today = db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind = 'practice' AND team_a = ? AND date(created_at) = date('now')`, team.id).n;
  if (today >= config.limits.practicePerDay) throw new UserError(`Đã dùng hết ${config.limits.practicePerDay} trận chạy thử hôm nay`, 429);
  // Chạy thử dùng đúng luật và quyền dữ liệu của giai đoạn bot sẽ thi.
  const p = phase(sub.phase_key === 'final' ? 'final' : 'swiss');
  return createMatch({ kind: 'practice', team_a: team.id, sub_a: sub.id, sample_bot: sampleBot,
    ruleset_id: p.ruleset_id, reveal: p.reveal_opponent, requested_by: user.id });
}

module.exports = {
  resetTournament,
  rerunSwissRound,
  KNOCKOUT, createMatch, executeMatch, rerunMatch, lockPhase, swissStandings, startSwissRound, confirmRound,
  finishSwiss, advanceContest, startPhase, advanceSeries, bracket, requestPractice,
};
