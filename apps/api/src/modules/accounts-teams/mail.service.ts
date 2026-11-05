import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
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

  /** Gửi một thư thật qua SMTP hoặc Resend. Ném lỗi có mã ổn định (SMTP_* / RESEND_*) để ghi log chẩn đoán. */
  private async deliver(mail: { to: string; subject: string; text: string; id: string }) {
    if (this.cfg.mailTransport === 'resend') return this.sendViaResend(mail);
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
          e instanceof Error && /^(SMTP|RESEND)_[A-Z_]+$/.test(e.message) ? e.message : 'SEND_FAILED';
        this.log.warn(`Không gửi được email ${row.id} (${reason}); sẽ thử lại theo lịch.`);
        await this.db.emailMessage.update({
          where: { id: row.id },
          data: {
            status: row.attempts >= 4 ? 'failed' : 'pending',
            lastError: `Không gửi được qua ${this.cfg.mailTransport === 'resend' ? 'Resend' : 'SMTP'} (${reason}). Kiểm tra cấu hình email.`,
            availableAt: new Date(Date.now() + Math.min(300000, 10000 * 2 ** row.attempts)),
          },
        });
      }
    }
  }
}
