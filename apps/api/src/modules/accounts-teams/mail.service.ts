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
    if (!this.cfg.smtpHost || !this.cfg.smtpUser || !this.cfg.smtpPassword?.trim())
      throw new Error('SMTP_NOT_CONFIGURED');
    const transport = this.transport();
    try {
      const result = await transport.sendMail({
        from: this.cfg.mailFrom,
        to: email,
        subject,
        text,
        messageId: `<registration-${nonce}@bot-arena>`,
      });
      if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
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
    } finally {
      transport.close();
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
    const transport = this.cfg.mailTransport === 'smtp' ? this.transport() : null;
    for (const row of rows) {
      try {
        if (transport)
          await transport.sendMail({
            from: this.cfg.mailFrom,
            to: row.to,
            subject: row.subject,
            text: row.text,
            messageId: `<${row.id}@bot-arena>`,
          });
        await this.db.emailMessage.update({
          where: { id: row.id },
          data: { status: transport ? 'sent' : 'local', sentAt: new Date(), lastError: null },
        });
      } catch {
        this.log.warn(`Không gửi được email ${row.id}; sẽ thử lại theo lịch.`);
        await this.db.emailMessage.update({
          where: { id: row.id },
          data: {
            status: row.attempts >= 4 ? 'failed' : 'pending',
            lastError: 'Không kết nối hoặc gửi được qua SMTP. Kiểm tra cấu hình email.',
            availableAt: new Date(Date.now() + Math.min(300000, 10000 * 2 ** row.attempts)),
          },
        });
      }
    }
    transport?.close();
  }
}
