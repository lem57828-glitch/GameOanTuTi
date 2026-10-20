// TV1 — tài khoản, phiên, đội (đặc tả M0 mục 13–14).
import { z } from 'zod';
import { Id, Role } from './common.js';

/** Người dùng của phiên hiện tại. Không bao giờ chứa thông tin xác thực (mật khẩu, token). */
export const SessionUser = z.object({
  id: Id,
  displayName: z.string(),
  role: Role,
  /** Đội của người dùng trong giải hiện tại; null nếu chưa có đội. */
  teamId: Id.nullable(),
  /** Phiên tạo bằng đăng nhập mẫu (chỉ có ở development/test). */
  demo: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUser>;

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
  id: Id,
  name: z.string(),
  status: TeamStatus,
  tournamentId: Id,
  members: z.array(TeamMember),
});
export type TeamView = z.infer<typeof TeamView>;
