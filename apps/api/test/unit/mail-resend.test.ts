// Gửi mã xác minh qua Resend HTTP API (MAIL_TRANSPORT=resend): không gọi Resend thật, fetch được giả lập.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { MailService } from '../../src/modules/accounts-teams/mail.service.js';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://test',
  REDIS_URL: 'redis://localhost',
  SESSION_SECRET: 'unit-test-secret-0123456789abcdef0123456789',
  MAIL_FROM: 'Bot Arena <no-reply@arena.example>',
} as const;

function setup(status = 200, body: unknown = { id: 'msg_1' }) {
  const cfg = loadConfig({ ...base, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_key' });
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    emailMessage: { create: async ({ data }: { data: Record<string, unknown> }) => created.push(data) },
  };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mail = new MailService({} as any, cfg);
  return { mail, tx, created, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe('gửi email qua Resend', () => {
  it('gọi API Resend đúng người gửi/nhận, có idempotency-key; không lưu mã OTP vào hộp thư', async () => {
    const { mail, tx, created, fetchMock } = setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mail.sendRegistrationCode(tx as any, '23020037@vnu.edu.vn', '493817', 'nonce1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(headers['idempotency-key']).toBe('registration-nonce1');
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      from: 'Bot Arena <no-reply@arena.example>',
      to: ['23020037@vnu.edu.vn'],
      subject: 'Mã xác minh đăng ký Bot Arena',
    });
    expect(payload.text).toContain('493817');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'sent', dedupeKey: 'registration:nonce1' });
    expect(String(created[0]!.text)).not.toContain('493817');
  });

  it('Resend từ chối (tên miền gửi chưa xác minh, khóa sai...) → lỗi có mã ổn định, không ghi hộp thư', async () => {
    const { mail, tx, created } = setup(403, { name: 'validation_error', message: 'domain not verified' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(mail.sendRegistrationCode(tx as any, 'a@vnu.edu.vn', '111111', 'n2')).rejects.toThrow(
      'RESEND_FORBIDDEN',
    );
    expect(created).toHaveLength(0);
  });

  it('cấu hình: resend bắt buộc RESEND_API_KEY; bản chính thức chấp nhận Resend thay cho SMTP', () => {
    expect(() => loadConfig({ ...base, MAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(
      loadConfig({
        ...base,
        ARENA_PROFILE: 'official',
        DEMO_MODE: 'false',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/arena?schema=arena_official',
        REDIS_URL: 'redis://localhost:6379/1',
        QUEUE_PREFIX: 'arena-official',
        MAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_x',
      }).mailTransport,
    ).toBe('resend');
  });
});
