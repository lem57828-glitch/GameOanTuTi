import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  /** Access token Gmail (sống ~1 giờ) giữ trong bộ nhớ, làm mới bằng refresh token khi sắp hết hạn. */
  private gmailToken?: { value: string; expiresAt: number };
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}
  url(path: string) {
    return `${this.cfg.webOrigins[0]}${path}`;
  }
  async enqueue(tx: Tx, to: string, subject: string, text: string, dedupeKey: string) {
    await tx.emailMessage.upsert({
      where: { dedupeKey },
      create: {
        to,
        subject,
        text,
        dedupeKey,
        ...(this.cfg.mailTransport === 'local' ? { status: 'local', sentAt: new Date() } : {}),
      },
      update: {},
    });
  }
  private transport() {
    return nodemailer.createTransport({
      host: this.cfg.smtpHost,
      port: this.cfg.smtpPort,
      secure: this.cfg.smtpSecure,
      requireTLS: !this.cfg.smtpSecure,
      auth: this.cfg.smtpUser
        ? { user: this.cfg.smtpUser, pass: this.cfg.smtpPassword?.replace(/\s/g, '') }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  async sendRegistrationCode(tx: Tx, email: string, code: string, nonce: string) {
    const subject = 'Mã xác minh đăng ký Bot Arena';
    const text = `Mã xác minh của bạn là: ${code}\nMã có hiệu lực trong 120 giây và chỉ dùng một lần. Không chia sẻ mã này với người khác.\nNếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.`;
    if (this.cfg.mailTransport === 'local') {
      await tx.emailMessage.create({
        data: {
          to: email,
          subject,
          text,
          dedupeKey: `registration:${nonce}`,
          status: 'local',
          sentAt: new Date(),
        },
      });
      return;
    }
    await this.deliver({ to: email, subject, text, id: `registration-${nonce}` });
    // Do not store live OTPs in the email outbox or retry them after they have expired.
    await tx.emailMessage.create({
      data: {
        to: email,
        subject,
        text: 'Mã xác minh dùng một lần, có hiệu lực 120 giây.',
        dedupeKey: `registration:${nonce}`,
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  /** Gửi một thư thật qua SMTP, Resend hoặc Gmail API. Ném lỗi có mã ổn định (SMTP_* / RESEND_* / GMAIL_*). */
  private async deliver(mail: { to: string; subject: string; text: string; id: string }) {
    if (this.cfg.mailTransport === 'resend') return this.sendViaResend(mail);
    if (this.cfg.mailTransport === 'gmail_api') return this.sendViaGmail(mail);
    if (!this.cfg.smtpHost || !this.cfg.smtpUser || !this.cfg.smtpPassword?.trim())
      throw new Error('SMTP_NOT_CONFIGURED');
    const transport = this.transport();
    try {
      const result = await transport.sendMail({
        from: this.cfg.mailFrom,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        messageId: `<${mail.id}@bot-arena>`,
      });
      if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
    } finally {
      transport.close();
    }
  }

  /**
   * Resend HTTP API: gửi qua HTTPS (cổng 443) nên không bị nền tảng chặn cổng SMTP. Idempotency-Key theo id thư để
   * lần thử lại không gửi trùng. MAIL_FROM phải thuộc tên miền đã xác minh trên Resend; địa chỉ thử nghiệm
   * onboarding@resend.dev chỉ gửi được tới email của chính chủ tài khoản Resend.
   */
  private async sendViaResend(mail: { to: string; subject: string; text: string; id: string }) {
    if (!this.cfg.resendApiKey) throw new Error('RESEND_NOT_CONFIGURED');
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.cfg.resendApiKey}`,
          'content-type': 'application/json',
          'idempotency-key': mail.id,
        },
        body: JSON.stringify({
          from: this.cfg.mailFrom,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('RESEND_UNREACHABLE');
    }
    if (res.ok) return;
    // Chỉ ghi mã lỗi của Resend (vd. validation_error, missing_api_key) — không ghi khóa API hay nội dung thư.
    const body = (await res.json().catch(() => null)) as { name?: string } | null;
    this.log.warn(`Resend từ chối thư (HTTP ${res.status}${body?.name ? `, ${body.name}` : ''}).`);
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'RESEND_FORBIDDEN'
        : res.status === 422
          ? 'RESEND_INVALID'
          : res.status === 429
            ? 'RESEND_RATE_LIMITED'
            : 'RESEND_FAILED',
    );
  }

  /** Đổi refresh token lấy access token (OAuth2 của Google, HTTPS). Lỗi invalid_grant = token bị thu hồi/hết hạn. */
  private async gmailAccessToken(): Promise<string> {
    const g = this.cfg.gmail;
    if (!g) throw new Error('GMAIL_NOT_CONFIGURED');
    if (this.gmailToken && this.gmailToken.expiresAt > Date.now() + 60_000) return this.gmailToken.value;
    let res: Response;
    try {
      res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: g.clientId,
          client_secret: g.clientSecret,
          refresh_token: g.refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('GMAIL_UNREACHABLE');
    }
    const body = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    } | null;
    if (!res.ok || !body?.access_token) {
      // Chỉ ghi mã lỗi OAuth (invalid_grant, invalid_client...), không ghi client secret/refresh token.
      this.log.warn(
        `Google từ chối cấp access token (HTTP ${res.status}${body?.error ? `, ${body.error}` : ''}).`,
      );
      throw new Error(
        body?.error === 'invalid_grant'
          ? 'GMAIL_TOKEN_REVOKED'
          : body?.error === 'invalid_client' || body?.error === 'unauthorized_client'
            ? 'GMAIL_CLIENT_INVALID'
            : 'GMAIL_AUTH_FAILED',
      );
    }
    this.gmailToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  /**
   * Gmail API users.messages.send qua HTTPS (cổng 443), scope gmail.send. Người gửi là GMAIL_SENDER_EMAIL (tài khoản đã
   * cấp quyền hoặc alias của nó); tên hiển thị lấy từ MAIL_FROM nếu có.
   */
  private async sendViaGmail(mail: { to: string; subject: string; text: string; id: string }) {
    const raw = buildMime({ from: gmailFrom(this.cfg.mailFrom, this.cfg.gmail!.senderEmail), ...mail });
    for (let attempt = 0; ; attempt++) {
      const token = await this.gmailAccessToken();
      let res: Response;
      try {
        res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new Error('GMAIL_UNREACHABLE');
      }
      if (res.ok) return;
      // Access token bị thu hồi giữa chừng: bỏ token đệm và thử lại một lần với token mới.
      if (res.status === 401 && attempt === 0) {
        this.gmailToken = undefined;
        continue;
      }
      const body = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
      this.log.warn(
        `Gmail API từ chối thư (HTTP ${res.status}${body?.error?.status ? `, ${body.error.status}` : ''}).`,
      );
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'GMAIL_FORBIDDEN'
          : res.status === 400
            ? 'GMAIL_INVALID'
            : res.status === 429
              ? 'GMAIL_RATE_LIMITED'
              : 'GMAIL_FAILED',
      );
    }
  }

  async drain() {
    const rows = await this.db.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        { id: string; to: string; subject: string; text: string; attempts: number }[]
      >`SELECT * FROM "EmailMessage" WHERE status IN ('pending','sending') AND "dedupeKey" LIKE 'auth:%' AND "availableAt" <= now() ORDER BY "createdAt" LIMIT 10 FOR UPDATE SKIP LOCKED`;
      for (const row of claimed)
        await tx.emailMessage.update({
          where: { id: row.id },
          data: { status: 'sending', attempts: { increment: 1 }, availableAt: new Date(Date.now() + 120000) },
        });
      return claimed;
    });
    const live = this.cfg.mailTransport !== 'local';
    for (const row of rows) {
      try {
        if (live) await this.deliver({ to: row.to, subject: row.subject, text: row.text, id: row.id });
        await this.db.emailMessage.update({
          where: { id: row.id },
          data: { status: live ? 'sent' : 'local', sentAt: new Date(), lastError: null },
        });
      } catch (e) {
        const reason =
          e instanceof Error && /^(SMTP|RESEND|GMAIL)_[A-Z_]+$/.test(e.message) ? e.message : 'SEND_FAILED';
        this.log.warn(`Không gửi được email ${row.id} (${reason}); sẽ thử lại theo lịch.`);
        await this.db.emailMessage.update({
          where: { id: row.id },
          data: {
            status: row.attempts >= 4 ? 'failed' : 'pending',
            lastError: `Không gửi được qua ${TRANSPORT_LABEL[this.cfg.mailTransport]} (${reason}). Kiểm tra cấu hình email.`,
            availableAt: new Date(Date.now() + Math.min(300000, 10000 * 2 ** row.attempts)),
          },
        });
      }
    }
  }
}

const TRANSPORT_LABEL = {
  local: 'hộp thư thử nghiệm',
  smtp: 'SMTP',
  resend: 'Resend',
  gmail_api: 'Gmail API',
} as const;

/** Tiêu đề có ký tự ngoài ASCII (tiếng Việt) mã hóa theo RFC 2047. */
function encodeHeader(value: string) {
  return /^[ -~]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** From cho Gmail API: tên hiển thị từ MAIL_FROM ("Bot Arena <...>"), địa chỉ luôn là GMAIL_SENDER_EMAIL. */
export function gmailFrom(mailFrom: string, senderEmail: string) {
  const name = /^\s*"?([^"<]*?)"?\s*</.exec(mailFrom)?.[1]?.trim();
  return `${name || 'Bot Arena'} <${senderEmail}>`;
}

/** "Tên <a@b>": chỉ mã hóa phần tên, giữ nguyên địa chỉ. */
function encodeAddress(value: string) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  return m && m[1] ? `${encodeHeader(m[1])} <${m[2]}>` : value.trim();
}

/** Thư RFC 5322 dạng text/plain UTF-8, nội dung base64, trả về base64url cho trường `raw` của Gmail API. */
export function buildMime(mail: { from: string; to: string; subject: string; text: string; id: string }) {
  if (/[\r\n]/.test(mail.to + mail.from + mail.subject)) throw new Error('GMAIL_INVALID');
  const body = Buffer.from(mail.text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const lines = [
    `From: ${encodeAddress(mail.from)}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Message-ID: <${mail.id}@bot-arena>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}
