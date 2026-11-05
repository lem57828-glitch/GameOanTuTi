// Gửi mã xác minh qua Gmail API (MAIL_TRANSPORT=gmail_api): không gọi Google thật, fetch được giả lập.
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { MailService, buildMime } from '../../src/modules/accounts-teams/mail.service.js';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'unit-test-secret-0123456789abcdef0123456789',
  MAIL_FROM: 'Ban tổ chức <noreply@khac.example>',
} as const;
const gmailEnv = {
  MAIL_TRANSPORT: 'gmail_api',
  GMAIL_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GMAIL_CLIENT_SECRET: 'csecret',
  GMAIL_REFRESH_TOKEN: '1//refresh',
  GMAIL_SENDER_EMAIL: 'btc.arena.ai@gmail.com',
} as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(responses: Response[]) {
  const cfg = loadConfig({ ...base, ...gmailEnv });
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    emailMessage: { create: async ({ data }: { data: Record<string, unknown> }) => created.push(data) },
  };
  const fetchMock = vi.fn(async () => responses.shift() ?? json({}, 500));
  vi.stubGlobal('fetch', fetchMock);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mail = new MailService({} as any, cfg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { mail, tx: tx as any, created, fetchMock };
}

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('gửi email qua Gmail API', () => {
  it('đổi refresh token lấy access token, gửi thư MIME UTF-8, dùng lại token cho thư sau', async () => {
    const { mail, tx, created, fetchMock } = setup([
      json({ access_token: 'ya29.tok', expires_in: 3600 }),
      json({ id: 'm1' }),
      json({ id: 'm2' }),
    ]);
    await mail.sendRegistrationCode(tx, '23020037@vnu.edu.vn', '493817', 'n1');
    await mail.sendRegistrationCode(tx, '23020038@vnu.edu.vn', '111222', 'n2');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(calls[0]![1].body));
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('1//refresh');
    expect(calls[1]![0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect((calls[1]![1].headers as Record<string, string>).authorization).toBe('Bearer ya29.tok');
    const mime = decode(JSON.parse(String(calls[1]![1].body)).raw);
    expect(mime).toContain('To: 23020037@vnu.edu.vn');
    expect(mime).toContain(
      `Subject: =?UTF-8?B?${Buffer.from('Mã xác minh đăng ký Bot Arena').toString('base64')}?=`,
    );
    expect(mime).toContain(
      `From: =?UTF-8?B?${Buffer.from('Ban tổ chức').toString('base64')}?= <btc.arena.ai@gmail.com>`,
    );
    const bodyB64 = mime.split('\r\n\r\n')[1]!.replace(/\r\n/g, '');
    expect(Buffer.from(bodyB64, 'base64').toString('utf8')).toContain('493817');
    expect(created).toHaveLength(2);
    expect(String(created[0]!.text)).not.toContain('493817');
  });

  it('access token bị từ chối (401) → làm mới một lần rồi gửi lại', async () => {
    const { mail, tx, fetchMock } = setup([
      json({ access_token: 'old', expires_in: 3600 }),
      json({ error: { status: 'UNAUTHENTICATED' } }, 401),
      json({ access_token: 'new', expires_in: 3600 }),
      json({ id: 'm1' }),
    ]);
    await mail.sendRegistrationCode(tx, 'a@vnu.edu.vn', '123456', 'n3');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refresh token bị thu hồi → GMAIL_TOKEN_REVOKED, không ghi hộp thư', async () => {
    const { mail, tx, created } = setup([json({ error: 'invalid_grant' }, 400)]);
    await expect(mail.sendRegistrationCode(tx, 'a@vnu.edu.vn', '1', 'n4')).rejects.toThrow(
      'GMAIL_TOKEN_REVOKED',
    );
    expect(created).toHaveLength(0);
  });

  it('cấu hình gmail_api bắt buộc đủ 4 biến, người gửi hợp lệ; chặn chèn header qua xuống dòng', () => {
    expect(() => loadConfig({ ...base, MAIL_TRANSPORT: 'gmail_api', GMAIL_CLIENT_ID: 'x' })).toThrow(
      /GMAIL_/,
    );
    const { GMAIL_SENDER_EMAIL: _omit, ...noSender } = gmailEnv;
    expect(() => loadConfig({ ...base, ...noSender })).toThrow(/GMAIL_SENDER_EMAIL/);
    expect(() => loadConfig({ ...base, ...gmailEnv, GMAIL_SENDER_EMAIL: 'khong-phai-email' })).toThrow(
      /GMAIL_SENDER_EMAIL/,
    );
    expect(() => loadConfig({ ...base, MAIL_TRANSPORT: 'gmail' })).toThrow();
    expect(() =>
      buildMime({ from: 'a@b.c', to: 'x@y.z\r\nBcc: e@f.g', subject: 's', text: 't', id: 'i' }),
    ).toThrow('GMAIL_INVALID');
  });

  it('thư xác minh email / đặt lại mật khẩu (hàng đợi) cũng gửi qua Gmail API; lỗi → thử lại, không ghi credentials', async () => {
    const cfg = loadConfig({ ...base, ...gmailEnv });
    const rows = [
      { id: 'e1', to: 'a@vnu.edu.vn', subject: 'Khôi phục mật khẩu Bot Arena', text: 'link', attempts: 0 },
      { id: 'e2', to: 'b@vnu.edu.vn', subject: 'Xác minh email Bot Arena', text: 'link', attempts: 0 },
    ];
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ $queryRaw: async () => rows, emailMessage: { update: async () => ({}) } }),
      emailMessage: {
        update: async ({ data }: { data: Record<string, unknown> }) => updates.push(data),
      },
    };
    const responses = [
      json({ access_token: 'tok', expires_in: 3600 }),
      json({ id: 'm1' }),
      json({ error: { status: 'RESOURCE_EXHAUSTED' } }, 429),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new MailService(db as any, cfg).drain();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(updates[0]).toMatchObject({ status: 'sent', lastError: null });
    expect(updates[1]).toMatchObject({ status: 'pending' });
    expect(String(updates[1]!.lastError)).toContain('GMAIL_RATE_LIMITED');
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/csecret|1\/\/refresh|tok\b/);
  });
});
