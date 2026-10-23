// Local browser regression test with an isolated PostgreSQL schema and local mail only.
// node --env-file=.env tests/tv1-browser.cjs
const { chromium, expect } = require('@playwright/test');
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stamp = Date.now();
const schema = `otp_e2e_${stamp}`;
const adminDb = new PrismaClient();
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const origin = 'http://localhost:5173';
const apiBase = 'http://localhost:3315/api/v1';
const emails = [`240${stamp}0@vnu.edu.vn`, `240${stamp}1@vnu.edu.vn`];
let browser;
let server;
let logs = '';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function code(email) {
  const mail = await db.emailMessage.findFirstOrThrow({
    where: { to: email, subject: 'Mã xác minh đăng ký Bot Arena' },
    orderBy: { createdAt: 'desc' },
  });
  return mail.text.match(/\b(\d{6})\b/)[1];
}
async function request(page, route, method = 'GET', data) {
  const res = await page.request.fetch(apiBase + route, { method, data, headers: { origin } });
  return { status: res.status(), body: await res.json() };
}
async function login(page, email, password = 'Browser-password-123') {
  await page.goto(origin + '/login?next=/profile');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/profile');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
async function newPage() {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.accept());

  await page.route('**/api/v1/**', async (route) => {
    const target = new URL(route.request().url());
    target.port = '3315';
    await route.fulfill({ response: await route.fetch({ url: target.toString() }) });
  });
  return page;
}
async function personal(page) {
  for (const [label, value] of Object.entries({
    'Họ tên': 'Nguyễn Thí Sinh',
    Lớp: 'CNTT01',
    Khoa: 'Công nghệ thông tin',
    'Mật khẩu (≥ 8 ký tự)': 'Browser-password-123',
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
}
(async () => {
  try {
    await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      API_PORT: '3315',
      WEB_ORIGIN: origin,
      MAIL_TRANSPORT: 'local',
      EMAIL_ALLOWED_DOMAINS: 'vnu.edu.vn',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      QUEUE_PREFIX: `otp-e2e-${stamp}`,
    };
    const migration = spawnSync(
      process.execPath,
      [
        path.join(root, 'apps/api/node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        path.join(root, 'apps/api/prisma/schema.prisma'),
      ],
      { cwd: root, env, encoding: 'utf8', windowsHide: true },
    );
    if (migration.status !== 0) throw Error(migration.stderr || 'Test migration failed');
    await db.tournament.create({ data: { name: 'Giải kiểm thử riêng', status: 'registration' } });
    server = spawn(process.execPath, [path.join(root, 'apps/api/dist/main.js')], {
      cwd: root,
      env,
      windowsHide: true,
    });
    server.stdout.on('data', (d) => {
      logs += d;
    });
    server.stderr.on('data', (d) => {
      logs += d;
    });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready = (await fetch(apiBase + '/health')).ok;
      } catch {
        /* API is still starting. */
      }
      if (ready) break;
      await pause(200);
    }
    if (!ready) throw Error('Test API did not start: ' + logs.slice(-1200));
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const a = await newPage();
    const b = await newPage();
    await a.clock.install();
    await a.goto(origin + '/');
    await expect(a.getByRole('link', { name: 'Đăng ký tham gia', exact: true })).toBeVisible();
    await a.goto(origin + '/register');
    await expect(a.getByRole('heading', { name: 'Tạo tài khoản', exact: true })).toBeVisible();
    await expect(a.getByLabel('MSSV', { exact: true })).toHaveCount(0);
    await personal(a);
    await a.getByLabel('Email trường', { exact: true }).fill(emails[0]);
    await expect(a.getByRole('button', { name: 'Đăng ký', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    await expect(a.getByText(/Mã còn hiệu lực: (?:11[0-9]|120) giây/)).toBeVisible();
    if (await db.account.count({ where: { email: emails[0] } }))
      throw Error('Account created before verification');
    const first = await code(emails[0]);
    await a.getByLabel('Mã xác minh email', { exact: true }).fill(first === '000000' ? '999999' : '000000');
    await a.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await expect(a.getByRole('alert')).toContainText('Mã xác minh không đúng');
    await db.registrationCode.update({
      where: { email: emails[0] },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await a.clock.fastForward(120000);
    await expect(a.getByRole('button', { name: 'Gửi lại mã', exact: true })).toBeEnabled();
    await expect(a.getByRole('button', { name: 'Đăng ký', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await expect(a.getByText(/Mã còn hiệu lực: (?:11[0-9]|120) giây/)).toBeVisible();
    const latest = await code(emails[0]);
    await a.clock.fastForward(5000);
    await a.reload();
    await expect(a.getByText(/Mã còn hiệu lực: 1[01][0-9] giây/)).toBeVisible();
    await personal(a);
    await a.getByLabel('Mã xác minh email', { exact: true }).fill(latest);
    fs.mkdirSync('test-results/registration', { recursive: true });
    await a.screenshot({ path: 'test-results/registration/form.png', fullPage: true });
    await a.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await a.waitForURL('**/login?registered=1');
    const account = await db.account.findUniqueOrThrow({ where: { email: emails[0] } });
    if (!account.emailVerifiedAt || account.studentId !== emails[0].split('@')[0])
      throw Error('Account not verified or wrong student ID');
    await login(a, emails[0]);
    await expect(a.getByText('Đã xác minh', { exact: true })).toBeVisible();
    await a.goto(origin + '/');
    await expect(a.getByRole('link', { name: 'Đăng ký tham gia', exact: true })).toHaveCount(0);
    let response = await request(b, '/auth/registration-code', 'POST', { email: emails[1] });
    if (response.status !== 200) throw Error(JSON.stringify(response));
    response = await request(b, '/auth/register', 'POST', {
      fullName: 'Thí sinh B',
      email: emails[1],
      className: 'CNTT01',
      faculty: 'CNTT',
      password: 'Browser-password-123',
      verificationCode: await code(emails[1]),
    });
    if (response.status !== 201) throw Error(JSON.stringify(response));
    await login(b, emails[1]);
    await a.goto(origin + '/team');
    await a.getByLabel('Tên đội', { exact: true }).fill('Đội kiểm thử OTP');
    await a.getByRole('button', { name: 'Lập đội', exact: true }).click();
    await expect(a.getByText('1/4 thành viên', { exact: true })).toBeVisible();
    if (await db.emailMessage.count({ where: { to: emails[0], dedupeKey: { startsWith: 'team-created:' } } }))
      throw Error('Team creation sent an activity email');
    const team = await db.team.findFirstOrThrow({ where: { captainId: account.id } });
    if ((await request(a, '/teams/mine', 'PATCH', { name: 'Renamed' })).status !== 404)
      throw Error('Rename endpoint is still active');
    for (const label of ['Gửi lời mời', 'Tạo mã tham gia mới', 'Chốt đội hình', 'Đổi tên đội'])
      await expect(a.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    for (const route of ['/teams/mine/invitations', '/teams/mine/rotate-code', '/teams/mine/lock'])
      if ((await request(a, route, 'POST', { email: emails[1] })).status !== 404)
        throw Error(`Removed endpoint remains active: ${route}`);
    if ((await request(a, '/team-invitations')).status !== 404)
      throw Error('Invitations endpoint remains active');
    await b.goto(origin + '/team');
    await b.getByLabel('Mã đội', { exact: true }).fill(team.joinCode);
    await b.getByRole('button', { name: 'Tham gia đội', exact: true }).click();
    await expect(b.getByText('2/4 thành viên', { exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: 'Chuyển đội trưởng', exact: true })).toHaveCount(0);
    await b.getByRole('button', { name: 'Rời đội', exact: true }).click();
    await expect(b.getByRole('heading', { name: 'Tham gia đội', exact: true })).toBeVisible();
    await b.getByLabel('Mã đội', { exact: true }).fill(team.joinCode);
    await b.getByRole('button', { name: 'Tham gia đội', exact: true }).click();
    await expect(b.getByText('2/4 thành viên', { exact: true })).toBeVisible();
    await expect(a.getByText('2/4 thành viên', { exact: true })).toBeVisible({ timeout: 12000 });
    await a.getByRole('button', { name: 'Chuyển đội trưởng', exact: true }).click();
    await b.reload();
    await expect(b.getByRole('button', { name: 'Chuyển đội trưởng', exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Loại thành viên', exact: true }).click();
    await expect(b.getByText('1/4 thành viên', { exact: true })).toBeVisible();
    if ((await db.team.findUniqueOrThrow({ where: { id: team.id } })).joinCode !== team.joinCode)
      throw Error('Team code unexpectedly changed');
    if ((await request(b, '/admin/accounts')).status !== 403) throw Error('Student admin access not blocked');
    await a.goto(origin + '/forgot-password');
    await a.getByLabel('Email', { exact: true }).fill(emails[0]);
    await a.getByRole('button', { name: 'Gửi liên kết', exact: true }).click();
    await expect(
      a.getByText('Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi.', { exact: true }),
    ).toBeVisible();
    await a.goto(origin + '/mailbox');
    await a.getByRole('link', { name: 'Mở liên kết đặt lại mật khẩu' }).first().click();
    await a.getByLabel('Mật khẩu mới', { exact: true }).fill('Changed-browser-123');
    await a.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
    await expect(a.getByText('Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.', { exact: true })).toBeVisible();
    if ((await request(a, '/profile')).status !== 401) throw Error('Old session not revoked');
    await b.goto(origin + '/register');
    await b.setViewportSize({ width: 390, height: 844 });
    await expect(b.locator('h1')).toBeVisible();
    if (await b.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw Error('Mobile overflow');
    await b.screenshot({ path: 'test-results/registration/mobile.png', fullPage: true });
    console.log(
      'PASS: registration layout; 6-digit OTP; no account before verification; incorrect code; 120-second countdown and expiry; resend; reload persistence; verified account/MSSV; login; code-only joining, leave/transfer/removal and deleted endpoints; authorization; password reset; mobile. No real email sent.',
    );
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.kill();
      await Promise.race([new Promise((r) => server.once('exit', r)), pause(3000)]);
    }
    await db.$disconnect();
    if (/^otp_e2e_\d+$/.test(schema))
      await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminDb.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
