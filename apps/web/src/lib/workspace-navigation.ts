export type WorkspaceGroup = 'account' | 'team' | 'competition' | 'rooms' | 'content' | 'admin';
export interface Destination {
  href: string;
  label: string;
  group: string;
  keywords: string;
}
export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
export function matchesSearch(text: string, query: string) {
  const value = normalizeSearch(text);
  return normalizeSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => value.includes(word));
}
export function destinations(role: 'student' | 'admin' | null, demo = false): Destination[] {
  const entries: Destination[] = [
    { href: '/', label: 'Trang chủ', group: 'Khám phá', keywords: 'home bat dau' },
    {
      href: '/tournament',
      label: 'Giải đấu',
      group: 'Khám phá',
      keywords: 'lich bang diem xep hang cay nhanh 32',
    },
    { href: '/rooms', label: 'Phòng đấu', group: 'Khám phá', keywords: 'truc tiep replay xem lai' },
    { href: '/guide', label: 'Hướng dẫn', group: 'Tài liệu', keywords: 'luat choi python' },
    { href: '/news', label: 'Thông báo BTC', group: 'Tài liệu', keywords: 'tin tai lieu the le' },
  ];
  if (!role)
    entries.push(
      { href: '/login', label: 'Đăng nhập', group: 'Tài khoản', keywords: 'tai khoan' },
      { href: '/register', label: 'Đăng ký tham gia', group: 'Tài khoản', keywords: 'tao tai khoan' },
    );
  if (role) {
    entries.push(
      { href: '/profile', label: 'Hồ sơ', group: 'Tài khoản', keywords: 'mat khau email xac minh' },
      { href: '/notifications', label: 'Thông báo của tôi', group: 'Tài khoản', keywords: 'lich ket qua' },
    );
  }
  if (role === 'student')
    entries.push(
      {
        href: '/competition',
        label: 'Thi đấu của đội',
        group: 'Đội của bạn',
        keywords: 'buoc tiep theo tran',
      },
      { href: '/team', label: 'Đội của tôi', group: 'Đội của bạn', keywords: 'thanh vien ma moi dang ky' },
      {
        href: '/bots',
        label: 'Bot của tôi',
        group: 'Đội của bạn',
        keywords: 'nop version phien ban github kiem thu dau thu',
      },
    );
  if (role === 'admin')
    entries.push(
      {
        href: '/admin',
        label: 'Điều hành giải',
        group: 'Ban tổ chức',
        keywords: 'btc worker cau hinh giai khieu nai',
      },
      {
        href: '/admin/accounts',
        label: 'Quản trị tài khoản và nội dung',
        group: 'Ban tổ chức',
        keywords: 'btc tai khoan email lich su audit doi',
      },
      { href: '/bots', label: 'Tất cả phiên bản bot', group: 'Ban tổ chức', keywords: 'kiem thu' },
    );
  if (demo && !role)
    entries.push({
      href: '/demo-login',
      label: 'Đăng nhập mẫu',
      group: 'Môi trường demo',
      keywords: 'thu nghiem',
    });
  if (demo && role)
    entries.push({
      href: '/mailbox',
      label: 'Hộp thư thử nghiệm',
      group: 'Môi trường demo',
      keywords: 'email xac minh',
    });
  return entries;
}
export function workspaceMeta(path: string): {
  group: WorkspaceGroup;
  label: string;
  section: string;
  hint: string;
  auth?: boolean;
} {
  if (path.startsWith('/admin/accounts'))
    return {
      group: 'admin',
      label: 'Quản trị tài khoản',
      section: 'Ban tổ chức',
      hint: 'Quản lý tài khoản, đội và nội dung từ cùng một nơi.',
    };
  if (path.startsWith('/admin'))
    return {
      group: 'admin',
      label: 'Điều hành giải',
      section: 'Ban tổ chức',
      hint: 'Cấu hình → mở giai đoạn → theo dõi phòng → xác nhận kết quả.',
    };
  if (path.startsWith('/rooms/'))
    return {
      group: 'rooms',
      label: 'Chi tiết phòng',
      section: 'Đấu trường',
      hint: 'Theo dõi trạng thái kết nối và dùng thanh replay để xem từng nước đi.',
    };
  if (path === '/rooms')
    return {
      group: 'rooms',
      label: 'Phòng đấu',
      section: 'Đấu trường',
      hint: 'Tìm phòng theo tên đội, trạng thái hoặc loại giải.',
    };
  if (path === '/tournament')
    return {
      group: 'competition',
      label: 'Giải đấu',
      section: 'Đấu trường',
      hint: 'Lịch thi, bảng điểm và hành trình Top 32 → Top 4.',
    };
  if (path === '/competition')
    return {
      group: 'team',
      label: 'Thi đấu của đội',
      section: 'Khu vực thí sinh',
      hint: 'Bước tiếp theo được xác định từ trạng thái thực tế của đội.',
    };
  if (path === '/team')
    return {
      group: 'team',
      label: 'Đội của tôi',
      section: 'Khu vực thí sinh',
      hint: 'Kết nối đồng đội. Hoàn thiện đội hình. Sẵn sàng nhập cuộc.',
    };
  if (path === '/bots')
    return {
      group: 'team',
      label: 'Bot và đấu thử',
      section: 'Chiến thuật',
      hint: 'Tập luyện với Python; cố định phiên bản GitHub khi thi chính thức.',
    };
  if (path === '/news' || path === '/guide')
    return {
      group: 'content',
      label: path === '/guide' ? 'Hướng dẫn' : 'Thông báo BTC',
      section: 'Tài liệu',
      hint: 'Theo dõi thông tin đã công bố từ ban tổ chức.',
    };
  const labels: Record<string, string> = {
    '/login': 'Đăng nhập',
    '/register': 'Tạo tài khoản',
    '/demo-login': 'Đăng nhập mẫu',
    '/forgot-password': 'Quên mật khẩu',
    '/reset-password': 'Đặt lại mật khẩu',
    '/verify-email': 'Xác minh email',
    '/profile': 'Hồ sơ',
    '/notifications': 'Thông báo của tôi',
    '/mailbox': 'Hộp thư thử nghiệm',
  };
  return {
    group: 'account',
    label: labels[path] ?? 'Trang hiện tại',
    section: 'Tài khoản',
    hint: 'Một tài khoản. Một đội. Cả hành trình chiến thuật.',
    auth: [
      '/login',
      '/register',
      '/demo-login',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
    ].includes(path),
  };
}
