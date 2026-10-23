import type { ConfigurationActionRequest, RegistrationPhase } from '@arena/contracts';
import { conflict } from '../../core/errors.js';
import type { TournamentRow } from './tournaments.repository.js';

/** Duyệt cấu hình độc lập với trạng thái thi đấu; không chốt điểm/kết quả ở đây. */
export function nextConfigurationStatus(status: string, action: ConfigurationActionRequest['action']) {
  if (action === 'open' && status === 'draft') return 'open';
  if (action === 'lock' && status === 'open') return 'locked';
  if (action === 'confirm' && status === 'locked') return 'confirmed';
  if (action === 'reopen' && (status === 'locked' || status === 'confirmed')) return 'open';
  throw conflict('Thao tác không hợp lệ với trạng thái cấu hình hiện tại. Tải lại dữ liệu để kiểm tra.');
}

export function registrationPhase(
  row: Pick<TournamentRow, 'registrationOpensAt' | 'registrationClosesAt' | 'teamLockAt' | 'botLockAt'>,
  now: Date,
): RegistrationPhase {
  if (!row.registrationOpensAt || !row.registrationClosesAt || !row.teamLockAt || !row.botLockAt)
    return 'unconfigured';
  if (now >= row.botLockAt) return 'bots_locked';
  if (now >= row.teamLockAt) return 'teams_locked';
  if (now >= row.registrationClosesAt) return 'closed';
  return now >= row.registrationOpensAt ? 'open' : 'scheduled';
}

/** Cho lưu nháp chưa đủ mốc; từ chối mọi cặp thời gian đã nhập nhưng đảo thứ tự. */
export function validateTimeline(row: TournamentRow, complete = false): void {
  const milestones = [row.registrationOpensAt, row.registrationClosesAt, row.teamLockAt, row.botLockAt];
  if (complete && (!row.stages.length || milestones.some((d) => !d)))
    throw conflict('Cần đủ bốn mốc đăng ký/khóa và ít nhất một giai đoạn.');
  const present = milestones.filter((d): d is Date => d !== null);
  if (present.some((d, i) => i > 0 && d < present[i - 1]!))
    throw conflict('Thứ tự lịch phải là mở đăng ký → đóng đăng ký → khóa đội → khóa bot.');
  if (
    row.registrationOpensAt &&
    row.registrationClosesAt &&
    row.registrationOpensAt >= row.registrationClosesAt
  )
    throw conflict('Đóng đăng ký phải sau mở đăng ký.');
  let previousEnd = row.botLockAt;
  for (const stage of row.stages) {
    if (complete && (!stage.lockAt || !stage.startsAt || !stage.endsAt))
      throw conflict(`Giai đoạn ${stage.name} chưa có đủ mốc khóa/bắt đầu/kết thúc.`);
    if (stage.lockAt && stage.startsAt && stage.lockAt > stage.startsAt)
      throw conflict(`Hạn khóa của ${stage.name} phải trước hoặc bằng giờ bắt đầu.`);
    if (stage.startsAt && stage.endsAt && stage.startsAt >= stage.endsAt)
      throw conflict(`Kết thúc ${stage.name} phải sau giờ bắt đầu.`);
    const start = stage.lockAt ?? stage.startsAt ?? stage.endsAt;
    if (previousEnd && start && start < previousEnd)
      throw conflict(`Lịch ${stage.name} chồng mốc khóa bot hoặc giai đoạn trước.`);
    previousEnd = stage.endsAt ?? stage.startsAt ?? stage.lockAt ?? previousEnd;
  }
}
