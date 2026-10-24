// TV1 — tài khoản, phiên, đội (đặc tả M0 mục 13–14).
import { z } from 'zod';
import { Id, Role } from './common.js';

/** Người dùng của phiên hiện tại. Không bao giờ chứa thông tin xác thực (mật khẩu, token). */
export const SessionUser = z.object({
  id: Id,
  displayName: z.string(),
  role: Role,
  /** Đội của người dùng, kể cả đội chưa đăng ký giải; null nếu chưa có đội. */
  teamId: Id.nullable(),
  /** Phiên tạo bằng đăng nhập mẫu (chỉ có ở development/test). */
  demo: z.boolean(),
  emailVerified: z.boolean().default(false),
  profileComplete: z.boolean().default(false),
});
// Keep older callers compatible; parsing still supplies the new flags with false defaults.
export type SessionUser = z.input<typeof SessionUser>;

/** POST /api/v1/dev/session — đăng nhập mẫu bằng một tài khoản seed. */
export const DevSessionRequest = z.object({ accountId: Id });
export type DevSessionRequest = z.infer<typeof DevSessionRequest>;

export const DemoAccount = z.object({
  id: Id,
  displayName: z.string(),
  role: Role,
  teamName: z.string().nullable(),
});
export type DemoAccount = z.infer<typeof DemoAccount>;

export const TeamStatus = z.enum(['draft', 'approved', 'locked', 'withdrawn']);
export const TeamMember = z.object({ id: Id, displayName: z.string(), isCaptain: z.boolean() });
export const TeamView = z.object({
  joinCode: z.string(),
  rosterLocked: z.boolean().default(false),
  id: Id,
  name: z.string(),
  status: TeamStatus,
  tournamentId: Id.nullable(),
  members: z.array(TeamMember),
});
export type TeamView = z.infer<typeof TeamView>;

const Email = z.string().trim().email('Email không hợp lệ.').max(254).toLowerCase();
export const RegisterRequest = z
  .object({
    fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên.').max(120),
    studentId: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập MSSV.')
      .max(50)
      .regex(/^[A-Za-z0-9_-]+$/, 'MSSV chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.')
      .transform((v) => v.toUpperCase()),
    className: z.string().trim().min(1, 'Vui lòng nhập lớp.').max(100),
    faculty: z.string().trim().min(1, 'Vui lòng nhập khoa.').max(150),
    email: Email,
    password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').max(128),
  })
  .strict();
export type RegisterRequest = z.infer<typeof RegisterRequest>;
export const REGISTRATION_CODE_TTL_SECONDS = 120;
export const RegistrationEmailRequest = z
  .object({
    email: Email.refine(
      (email) => /^[A-Za-z0-9_-]{1,50}$/.test(email.split('@')[0] ?? ''),
      'Email trường phải có MSSV hợp lệ trước dấu @.',
    ),
  })
  .strict();
export const CompleteRegistrationRequest = RegisterRequest.omit({ studentId: true })
  .extend({
    email: RegistrationEmailRequest.shape.email,
    verificationCode: z.string().regex(/^\d{6}$/, 'Vui lòng nhập mã xác minh gồm 6 chữ số.'),
  })
  .strict();
export type CompleteRegistrationRequest = z.infer<typeof CompleteRegistrationRequest>;
export const LoginRequest = z.object({ email: Email, password: z.string().min(1).max(128) }).strict();
export type LoginRequest = z.infer<typeof LoginRequest>;

export const TEAM_MEMBER_LIMIT = 4;
export const CreateTeamRequest = z
  .object({ name: z.string().trim().min(1, 'Vui lòng nhập tên đội.').max(100, 'Tên đội tối đa 100 ký tự.') })
  .strict();
export type CreateTeamRequest = z.infer<typeof CreateTeamRequest>;
export const JoinTeamRequest = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-F0-9]{10}$/, 'Mã đội gồm 10 ký tự chữ và số.'),
  })
  .strict();
export type JoinTeamRequest = z.infer<typeof JoinTeamRequest>;

export const ProfileUpdateRequest = RegisterRequest.omit({ email: true, password: true })
  .extend({
    username: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-zA-Z0-9_:-]+$/, 'Tên đăng nhập chỉ gồm chữ, số, gạch ngang, gạch dưới và dấu hai chấm.'),
  })
  .strict();
export const EmailRequest = z.object({ email: Email }).strict();
export const TokenRequest = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const ResetPasswordRequest = TokenRequest.extend({
  password: RegisterRequest.shape.password,
}).strict();
export const ChangePasswordRequest = z
  .object({ currentPassword: z.string().min(1).max(128), password: RegisterRequest.shape.password })
  .strict();
export const TransferCaptainRequest = z.object({ accountId: Id }).strict();
export const AdminAccountRequest = z
  .object({ role: Role, status: z.enum(['active', 'disabled']), reason: z.string().trim().min(5).max(500) })
  .strict();
export const AdminTeamRequest = z
  .object({ status: TeamStatus, reason: z.string().trim().min(5).max(500) })
  .strict();
export const PublicationRequest = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(8000),
    kind: z.enum(['announcement', 'guide', 'document']),
    linkUrl: z
      .union([
        z
          .string()
          .url()
          .max(2000)
          .refine((v) => /^https?:\/\//.test(v), 'Chỉ chấp nhận liên kết HTTP/HTTPS.'),
        z.literal(''),
      ])
      .default(''),
    published: z.boolean(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export interface ProfileView {
  id: string;
  fullName: string;
  username: string;
  email: string;
  studentId: string;
  className: string;
  faculty: string;
  emailVerified: boolean;
  role: z.infer<typeof Role>;
  isDemo: boolean;
}
export interface NotificationView {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface PublicationView {
  id: string;
  title: string;
  body: string;
  kind: string;
  linkUrl: string | null;
  published: boolean;
  revision: number;
  updatedAt: string;
}
export interface MailView {
  id: string;
  to: string;
  subject: string;
  text: string;
  status: string;
  createdAt: string;
}
export interface AdminAccountView extends ProfileView {
  status: string;
}
export interface AdminTeamView {
  id: string;
  name: string;
  status: z.infer<typeof TeamStatus>;
  captainId: string;
  tournamentId: string;
  members: { accountId: string; displayName: string }[];
}
