import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/core/prisma.service.js';
import { loadConfig } from '../../src/core/config.js';
import { IdentityService } from '../../src/modules/accounts-teams/identity.service.js';
import { MailService } from '../../src/modules/accounts-teams/mail.service.js';
import { CompleteRegistrationRequest } from '@arena/contracts';

const db = new PrismaService();
const cfg = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  MAIL_TRANSPORT: 'local',
  EMAIL_ALLOWED_DOMAINS: 'vnu.edu.vn',
});
const mail = new MailService(db, cfg);
const service = new IdentityService(db, mail, cfg);
const prefix = `otp-${randomUUID()}`;
const emails: string[] = [];
const ids: string[] = [];
const data = (email: string, verificationCode: string) => ({
  fullName: 'Nguyễn An',
  className: 'CNTT01',
  faculty: 'CNTT',
  email,
  password: 'Password-123',
  verificationCode,
});
async function sentCode(email: string) {
  const message = await db.emailMessage.findFirstOrThrow({
    where: { to: email, subject: 'Mã xác minh đăng ký Bot Arena' },
    orderBy: { createdAt: 'desc' },
  });
  return message.text.match(/\b(\d{6})\b/)![1]!;
}
afterAll(async () => {
  await db.authToken.deleteMany({ where: { accountId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.account.deleteMany({ where: { id: { in: ids } } });
  await db.registrationCode.deleteMany({ where: { email: { in: emails } } });
  await db.emailMessage.deleteMany({ where: { to: { in: emails } } });
  await db.$disconnect();
});
describe('pre-registration email code', () => {
  it('requires a six-digit code and does not accept an injected student ID or role', () => {
    const input = data('24020328@vnu.edu.vn', '123456');
    expect(CompleteRegistrationRequest.safeParse(input).success).toBe(true);
    for (const extra of [
      { verificationCode: '' },
      { verificationCode: '12345' },
      { verificationCode: 'abcdef' },
      { studentId: 'FAKE' },
      { role: 'admin' },
    ])
      expect(CompleteRegistrationRequest.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it('does not create an account before the correct code, then creates a verified account only once', async () => {
    const email = `${prefix}-a@vnu.edu.vn`;
    emails.push(email);
    await expect(service.register(data(email, '123456'))).rejects.toThrow('hết hạn');
    const response = await service.requestRegistrationCode(email);
    expect(Date.parse(response.expiresAt) - Date.parse(response.serverTime)).toBe(120000);
    expect(await db.account.count({ where: { email } })).toBe(0);
    const code = await sentCode(email);
    expect(code).toMatch(/^\d{6}$/);
    const record = await db.registrationCode.findUniqueOrThrow({ where: { email } });
    expect(record.codeHash).not.toBe(code);
    await expect(service.requestRegistrationCode(email)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(service.register(data(email, code === '000000' ? '999999' : '000000'))).rejects.toThrow(
      'không đúng',
    );
    expect(await db.account.count({ where: { email } })).toBe(0);
    const id = await service.register(data(email, code));
    ids.push(id);
    const account = await db.account.findUniqueOrThrow({ where: { id } });
    expect(account.emailVerifiedAt).not.toBeNull();
    expect(account.studentId).toBe(email.split('@')[0]!.toUpperCase());
    await expect(service.register(data(email, code))).rejects.toThrow('hết hạn');
    expect(await db.account.count({ where: { email } })).toBe(1);
  });
  it('expires after 120 seconds and invalidates the old code on resend', async () => {
    const email = `${prefix}-b@vnu.edu.vn`;
    emails.push(email);
    await service.requestRegistrationCode(email);
    const old = await sentCode(email);
    await db.registrationCode.update({ where: { email }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(service.register(data(email, old))).rejects.toThrow('hết hạn');
    await service.requestRegistrationCode(email);
    const latest = await sentCode(email);
    if (latest !== old) await expect(service.register(data(email, old))).rejects.toThrow('không đúng');
    const results = await Promise.allSettled([
      service.register(data(email, latest)),
      service.register(data(email, latest)),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    for (const r of fulfilled) if (r.status === 'fulfilled') ids.push(r.value);
    expect(await db.account.count({ where: { email } })).toBe(1);
  });
  it('persists wrong attempts and blocks guessing after five failures', async () => {
    const email = `${prefix}-c@vnu.edu.vn`;
    emails.push(email);
    await service.requestRegistrationCode(email);
    const code = await sentCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(service.register(data(email, wrong))).rejects.toThrow('không đúng');
    expect((await db.registrationCode.findUniqueOrThrow({ where: { email } })).attempts).toBe(5);
    await expect(service.register(data(email, code))).rejects.toThrow('5 lần');
    expect(await db.account.count({ where: { email } })).toBe(0);
  });
  it('does not leave a usable challenge when email delivery fails', async () => {
    const email = `${prefix}-d@vnu.edu.vn`;
    emails.push(email);
    const spy = vi.spyOn(mail, 'sendRegistrationCode').mockRejectedValueOnce(new Error('SMTP failure'));
    try {
      await expect(service.requestRegistrationCode(email)).rejects.toThrow('Không gửi được');
      expect(await db.registrationCode.findUnique({ where: { email } })).toBeNull();
      expect(await db.account.count({ where: { email } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
