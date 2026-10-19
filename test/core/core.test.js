// Kiểm thử phần lõi dùng chung: migration, phiên đăng nhập, phân quyền, chuẩn lỗi, sự kiện, audit, khung module.
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../helpers').setupApp();
const auth = require('../../server/core/auth');
const events = require('../../server/core/events');
const audit = require('../../server/core/audit');
const { AppError } = require('../../server/core/errors');
const { MODULES } = require('../../server/app');

test('migration của core và 4 module đã chạy, chạy lại không lỗi', () => {
  const names = t.db.all('SELECT module, name FROM _migrations').map((r) => `${r.module}/${r.name}`);
  for (const m of ['core', 'accounts-teams', 'bots-runner', 'tournaments', 'rooms-matches']) assert.ok(names.some((n) => n.startsWith(`${m}/`)), m);
  assert.deepEqual(t.db.migrate('core', require('node:path').join(__dirname, '../../server/core/migrations')), []);
});

test('token phiên: đọc được token hợp lệ, từ chối token giả', () => {
  const tok = auth.issueToken(42);
  assert.equal(auth.readToken(tok), 42);
  assert.equal(auth.readToken(`${tok.split('.')[0]}.giamao`), null);
  assert.equal(auth.readToken('rac'), null);
});

test('phân quyền: chưa đăng nhập 401, sai vai trò 403, đúng vai trò thì vào tới handler (501 khi chưa làm)', async () => {
  const sv = t.user('sv'), tt = t.user('tt', 'referee'), ad = t.user('ad', 'admin');
  assert.equal((await t.call('GET', '/referee/appeals')).status, 401);
  assert.equal((await t.call('GET', '/referee/appeals', { cookie: await t.loginAs(sv) })).status, 403);
  assert.equal((await t.call('GET', '/referee/appeals', { cookie: await t.loginAs(tt) })).status, 501);
  assert.equal((await t.call('POST', '/admin/tournaments', { cookie: await t.loginAs(tt) })).status, 403);
  assert.equal((await t.call('POST', '/admin/tournaments', { cookie: await t.loginAs(ad) })).status, 501);
});

test('chuẩn lỗi: { error: { code, message } }; API chưa làm ghi tên người phụ trách', async () => {
  const r = await t.call('POST', '/accounts/register', { body: {} });
  assert.equal(r.status, 501);
  assert.equal(r.body.error.code, 'NOT_IMPLEMENTED');
  assert.equal(r.body.error.details.owner, 'TV1');
  assert.equal((await t.call('GET', '/khong-ton-tai')).body.error.code, 'NOT_FOUND');
  assert.throws(() => new AppError('MA_LA', 'x'), /chưa đăng ký/);
});

test('phiên: /session trả người dùng, DELETE /session đăng xuất', async () => {
  const id = t.user('phien');
  const cookie = await t.loginAs(id);
  assert.equal((await t.call('GET', '/session', { cookie })).body.user.username, 'phien');
  const r = await fetch(`${t.base}/session`, { method: 'DELETE', headers: { cookie } });
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await t.call('GET', '/session')).body.user, null);
});

test('sự kiện: chỉ phát/nghe loại đã đăng ký, có ghi log, đọc lại được theo mốc id', () => {
  const got = [];
  events.on('stage.opened', (e) => got.push(e.payload.stageId));
  const e = events.emit('stage.opened', { stageId: 7 }, { actorId: 1 });
  assert.deepEqual(got, [7]);
  assert.throws(() => events.emit('loai.la', {}), /chưa đăng ký/);
  assert.ok(events.since(e.id - 1, ['stage.opened']).some((x) => x.payload.stageId === 7));
});

test('audit ghi người, hành động, lý do', () => {
  audit.audit(1, 'test.action', { target: 'pair:1', reason: 'kiểm thử' });
  assert.equal(audit.list({ action: 'test.' })[0].reason, 'kiểm thử');
});

test('khung module: mỗi module có chủ, mọi route có mô tả và quyền hợp lệ, không trùng method+path', () => {
  const seen = new Set();
  for (const m of MODULES) {
    assert.match(m.owner, /^TV[1-4]$/);
    for (const r of m.summary().routes) {
      assert.ok(r.desc, `${r.method} ${r.path} thiếu mô tả`);
      const key = `${r.method} ${r.path}`;
      assert.ok(!seen.has(key), `trùng route ${key}`);
      seen.add(key);
    }
  }
});
