import type { MyPairingView, StandingRowView, TeamView } from '@arena/contracts';

/** Không suy diễn bị loại từ một trận thua Swiss; kết quả chốt vòng mới quyết định đi tiếp. */
export function teamNextStep(team: TeamView | null, pairings: MyPairingView[], standing?: StandingRowView) {
  if (!team)
    return {
      title: 'Tạo đội hoặc tham gia đội',
      detail: 'Lập đội mới hoặc dùng mã do đội trưởng chia sẻ.',
      href: '/team',
      label: 'Tạo đội / Tham gia đội',
    };
  if (team.status === 'withdrawn')
    return {
      title: 'Đội đã rút khỏi giải',
      detail: 'Liên hệ BTC nếu cần hỗ trợ.',
      href: '/team',
      label: 'Xem đội',
    };
  if (!team.tournamentId)
    return {
      title: 'Đội chưa đăng ký giải',
      detail: 'Bạn có thể quản lý đội, chuẩn bị bot và đăng ký khi giải mở.',
      href: '/team',
      label: 'Quản lý đội / Đăng ký giải',
    };
  if (team.status === 'draft')
    return {
      title: 'Chờ BTC duyệt đội',
      detail: 'Kiểm tra thành viên và hồ sơ trong thời gian chờ duyệt.',
      href: '/team',
      label: 'Xem đội',
    };
  const pending = pairings.filter((p) => p.status === 'scheduled');
  const next = pending.find((p) => p.roomId) ?? pending[0];
  if (next)
    return next.roomId
      ? {
          title: 'Phòng thi đấu đã mở',
          detail:
            'Vào phòng để xem trạng thái trận. Swiss dùng bot đã chốt cho cả mức; loại trực tiếp chọn kín từng hiệp.',
          href: `/rooms/${next.roomId}`,
          label: 'Vào phòng',
        }
      : {
          title: 'Đã có đối thủ · Chờ BTC mở phòng',
          detail: 'Cặp đấu đã được công bố. Nút vào phòng sẽ xuất hiện khi BTC mở trận.',
          href: '/tournament',
          label: 'Xem giải đấu',
        };
  const provisional = pairings.find((p) => p.status === 'done' && !p.confirmed);
  if (provisional)
    return {
      title: 'Chờ BTC xác nhận kết quả',
      detail: 'Kết quả đang tạm tính. Đội có thể xem lại trận và gửi khiếu nại theo quy định.',
      href: provisional.roomId ? `/rooms/${provisional.roomId}` : '/tournament',
      label: provisional.roomId ? 'Xem lại trận' : 'Xem kết quả',
    };
  const knockout = pairings.find(
    (p) =>
      p.kind === 'knockout' &&
      p.status === 'done' &&
      p.confirmed &&
      p.winnerTeamId &&
      p.winnerTeamId !== team.id,
  );
  if (knockout)
    return {
      title: 'Đội dừng ở vòng loại trực tiếp',
      detail: 'Kết quả đã được BTC xác nhận. Bạn vẫn có thể xem lại các trận của đội.',
      href: '/tournament',
      label: 'Xem nhánh đấu',
    };
  if (standing?.state === 'eliminated' || standing?.state === 'advanced')
    return {
      title: standing.state === 'eliminated' ? 'Đội dừng ở vòng sơ loại' : 'Đội đã giành quyền đi tiếp',
      detail: 'Trạng thái theo bảng xếp hạng được công bố. Theo dõi lịch và thông báo từ BTC.',
      href: '/tournament',
      label: 'Xem bảng xếp hạng',
    };
  return {
    title: pairings.some((p) => p.confirmed) ? 'Chờ công bố vòng tiếp theo' : 'Chuẩn bị bot dự thi',
    detail: 'Nộp bot GitHub hợp lệ, chọn bộ bot theo giai đoạn và theo dõi thông báo từ BTC.',
    href: pairings.some((p) => p.confirmed) ? '/tournament' : '/bots',
    label: pairings.some((p) => p.confirmed) ? 'Xem bảng xếp hạng' : 'Nộp / Kiểm thử bot',
  };
}
