import { conflict, forbidden, notFound } from '../../core/errors.js';
import type { Tx } from '../../core/prisma.service.js';

export async function assertTeamWindow(tx: Tx, tournamentId: string | null, joining = false) {
  if (!tournamentId) return;
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR SHARE`;
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound('giải đấu');
  const now = new Date();
  if (tournament.status !== 'registration' || (tournament.teamLockAt && now >= tournament.teamLockAt))
    throw conflict('Đội hình đã khóa theo lịch hoặc trạng thái giải đấu.');
  if (
    joining &&
    ((tournament.registrationOpensAt && now < tournament.registrationOpensAt) ||
      (tournament.registrationClosesAt && now >= tournament.registrationClosesAt))
  )
    throw conflict('Không trong thời gian đăng ký đội.');
}

/** Giữ truy cập đội cũ; đội mới vẫn tồn tại khi chưa có giải hiện tại. */
export async function findTeamMembership(tx: Tx, accountId: string, tournamentId: string | null = null) {
  if (tournamentId) {
    const current = await tx.membership.findUnique({
      where: { accountId_tournamentId: { accountId, tournamentId } },
    });
    if (current) return current;
  }
  return tx.membership.findFirst({
    where: { accountId, team: { status: { not: 'withdrawn' } } },
    orderBy: { joinedAt: 'desc' },
  });
}
export async function assertContestant(tx: Tx, id: string) {
  const account = await tx.account.findUnique({ where: { id } });
  if (!account || account.status !== 'active' || account.role !== 'student')
    throw forbidden('Chỉ thí sinh đang hoạt động được quản lý đội.');
  if (
    !account.isDemo &&
    (!account.emailVerifiedAt ||
      !account.displayName ||
      !account.studentId ||
      !account.className ||
      !account.faculty)
  )
    throw forbidden('Cần xác minh email và hoàn tất hồ sơ trước khi quản lý đội.');
  return account;
}
export const normalizeTeamName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
