import { REGISTRATION_CODE_TTL_SECONDS } from '@arena/contracts';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProfileUpdateRequest, CompleteRegistrationRequest, z } from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { AppError, conflict, forbidden, notFound } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { MailService } from './mail.service.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class IdentityService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}
  assertDomain(email: string) {
    if (!this.cfg.emailDomains.includes(email.split('@')[1] ?? ''))
      throw new AppError(
        'VALIDATION_ERROR',
        `Chỉ chấp nhận email thuộc ${this.cfg.emailDomains.map((d) => '@' + d).join(', ')}.`,
      );
  }
  private registrationHash(email: string, nonce: string, code: string) {
    return createHmac('sha256', this.cfg.sessionSecret).update(`${email}:${nonce}:${code}`).digest('hex');
  }
  async requestRegistrationCode(email: string) {
    this.assertDomain(email);
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${email}, 23102026))`;
          if (await tx.account.findUnique({ where: { email } }))
            throw conflict('Email đã được đăng ký. Vui lòng đăng nhập.');
          const old = await tx.registrationCode.findUnique({ where: { email } });
          if (old && old.expiresAt > new Date() && !old.usedAt)
            throw new AppError(
              'RATE_LIMITED',
              'Mã hiện tại vẫn còn hiệu lực. Vui lòng chờ hết 120 giây trước khi gửi lại.',
              { expiresAt: old.expiresAt.toISOString(), serverTime: new Date().toISOString() },
            );
          let code = randomInt(0, 1000000).toString().padStart(6, '0');
          while (old && this.registrationHash(email, old.nonce, code) === old.codeHash)
            code = randomInt(0, 1000000).toString().padStart(6, '0');
          const nonce = randomBytes(16).toString('hex');
          await this.mail.sendRegistrationCode(tx, email, code, nonce);
          const now = new Date();
          const expiresAt = new Date(now.getTime() + REGISTRATION_CODE_TTL_SECONDS * 1000);
          await tx.registrationCode.upsert({
            where: { email },
            create: { email, nonce, codeHash: this.registrationHash(email, nonce, code), expiresAt },
            update: {
              nonce,
              codeHash: this.registrationHash(email, nonce, code),
              attempts: 0,
              usedAt: null,
              expiresAt,
              createdAt: now,
            },
          });
          return { expiresAt: expiresAt.toISOString(), serverTime: now.toISOString() };
        },
        { timeout: 25000, maxWait: 5000 },
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'INTERNAL_ERROR',
        'Không gửi được mã xác minh. Vui lòng thử lại sau hoặc liên hệ BTC.',
      );
    }
  }
  async register(input: CompleteRegistrationRequest) {
    this.assertDomain(input.email);
    const studentId = input.email.split('@')[0]!.toUpperCase();
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${input.email}, 23102026))`;
        const challenge = await tx.registrationCode.findUnique({ where: { email: input.email } });
        if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date())
          return { error: 'Mã xác minh không tồn tại hoặc đã hết hạn. Vui lòng gửi lại mã.' };
        if (challenge.attempts >= 5)
          return { error: 'Bạn đã nhập sai mã 5 lần. Vui lòng chờ hết thời gian để gửi lại mã.' };
        const expected = Buffer.from(challenge.codeHash, 'hex');
        const actual = Buffer.from(
          this.registrationHash(input.email, challenge.nonce, input.verificationCode),
          'hex',
        );
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          await tx.registrationCode.update({
            where: { email: input.email },
            data: { attempts: { increment: 1 } },
          });
          return { error: 'Mã xác minh không đúng. Vui lòng kiểm tra email.' };
        }
        const account = await tx.account.create({
          data: {
            username: `student:${studentId}`,
            displayName: input.fullName,
            studentId,
            className: input.className,
            faculty: input.faculty,
            email: input.email,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
        await tx.registrationCode.update({ where: { email: input.email }, data: { usedAt: new Date() } });
        await tx.auditLog.create({
          data: { actorId: account.id, action: 'account.register', target: account.id },
        });
        return { accountId: account.id };
      });
      if (result.error) throw new AppError('VALIDATION_ERROR', result.error);
      return result.accountId!;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict('Email hoặc MSSV đã được đăng ký.');
      throw error;
    }
  }
  private async issue(tx: Tx, accountId: string, email: string, kind: string) {
    await tx.authToken.updateMany({ where: { accountId, kind, usedAt: null }, data: { usedAt: new Date() } });
    const token = randomBytes(32).toString('hex');
    const record = await tx.authToken.create({
      data: {
        accountId,
        kind,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + (kind === 'verify' ? 86400000 : 1800000)),
      },
    });
    const url = `${this.cfg.webOrigins[0]}/${kind === 'verify' ? 'verify-email' : 'reset-password'}?token=${token}`;
    await this.mail.enqueue(
      tx,
      email,
      kind === 'verify' ? 'Xác minh email Bot Arena' : 'Khôi phục mật khẩu Bot Arena',
      `${kind === 'verify' ? 'Xác minh email của bạn (hạn 24 giờ)' : 'Đặt lại mật khẩu (hạn 30 phút)'}:\n${url}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
      `auth:${record.id}`,
    );
  }
  async request(email: string, kind: 'verify' | 'reset') {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE email = ${email} FOR UPDATE`;
      const account = await tx.account.findUnique({ where: { email } });
      if (
        !account ||
        account.isDemo ||
        account.status !== 'active' ||
        (kind === 'verify' && account.emailVerifiedAt)
      )
        return;
      const recent = await tx.authToken.findFirst({
        where: { accountId: account.id, kind, createdAt: { gt: new Date(Date.now() - 60000) } },
      });
      if (!recent) await this.issue(tx, account.id, email, kind);
    });
    return { message: 'Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi. Vui lòng kiểm tra hộp thư.' };
  }
  async redeem(token: string, kind: 'verify' | 'reset', password?: string) {
    const passwordHash = password ? await hashPassword(password) : undefined;
    await this.db.$transaction(async (tx) => {
      const tokenHash = digest(token);
      // Always lock account before token, matching token issuance and password changes.
      const candidate = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!candidate) throw new AppError('VALIDATION_ERROR', 'Liên kết không hợp lệ hoặc đã hết hạn.');
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${candidate.accountId} FOR UPDATE`;
      const record = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!record || record.kind !== kind || record.usedAt || record.expiresAt <= new Date())
        throw new AppError('VALIDATION_ERROR', 'Liên kết không hợp lệ hoặc đã hết hạn.');
      const account = await tx.account.findUnique({ where: { id: record.accountId } });
      if (!account || account.status !== 'active') throw forbidden();
      await tx.account.update({
        where: { id: record.accountId },
        data:
          kind === 'verify'
            ? { emailVerifiedAt: new Date() }
            : { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.authToken.updateMany({
        where: { accountId: record.accountId, kind, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { actorId: record.accountId, action: `account.${kind}`, target: record.accountId },
      });
    });
    return {
      message:
        kind === 'verify' ? 'Email đã được xác minh.' : 'Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.',
    };
  }
  async profile(id: string) {
    const account = await this.db.account.findUnique({ where: { id } });
    if (!account) throw notFound('tài khoản');
    return {
      id: account.id,
      username: account.username,
      email: account.email,
      fullName: account.displayName,
      studentId: account.studentId ?? '',
      className: account.className ?? '',
      faculty: account.faculty ?? '',
      emailVerified: !!account.emailVerifiedAt || account.isDemo,
      role: account.role,
      isDemo: account.isDemo,
    };
  }
  async updateProfile(id: string, input: z.infer<typeof ProfileUpdateRequest>) {
    try {
      await this.db.$transaction(async (tx) => {
        const account = await tx.account.findUniqueOrThrow({ where: { id } });
        if (account.isDemo) throw forbidden('Không sửa hồ sơ tài khoản mẫu.');
        if (account.studentId !== input.studentId) {
          const memberships = await tx.membership.findMany({
            where: { accountId: id },
            include: { team: { include: { tournament: true } } },
          });
          if (
            memberships.some(
              (m) =>
                m.team.status === 'locked' ||
                m.team.tournament.status === 'running' ||
                !!(m.team.tournament.teamLockAt && m.team.tournament.teamLockAt <= new Date()),
            )
          )
            throw conflict('Không đổi MSSV khi đội hình đã khóa.');
        }

        await tx.account.update({
          where: { id },
          data: {
            username: input.username,
            displayName: input.fullName,
            studentId: input.studentId,
            className: input.className,
            faculty: input.faculty,
          },
        });
        await tx.auditLog.create({ data: { actorId: id, action: 'account.profile.update', target: id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict('Tên đăng nhập hoặc MSSV đã được sử dụng.');
      throw error;
    }
    return this.profile(id);
  }
  async changePassword(id: string, currentPassword: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`;
      const account = await tx.account.findUniqueOrThrow({ where: { id } });
      if (
        account.isDemo ||
        !account.passwordHash ||
        !(await verifyPassword(currentPassword, account.passwordHash))
      )
        throw new AppError('VALIDATION_ERROR', 'Mật khẩu hiện tại không đúng.');
      await tx.account.update({ where: { id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.authToken.updateMany({
        where: { accountId: id, kind: 'reset', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({ data: { actorId: id, action: 'account.password.change', target: id } });
    });
    return { message: 'Đã đổi mật khẩu và đăng xuất các phiên. Vui lòng đăng nhập lại.' };
  }
  async version(id: string) {
    return (await this.db.account.findUniqueOrThrow({ where: { id }, select: { sessionVersion: true } }))
      .sessionVersion;
  }
}
