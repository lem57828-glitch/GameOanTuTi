# accounts-teams (TV1)

Các trang: đăng nhập/đăng ký; hồ sơ và đổi mật khẩu; xác minh email/quên và đặt lại mật khẩu; hộp thư local; đội và tham gia bằng mã; thông báo; nội dung công khai; quản trị TV1. Dùng TanStack Query, HTTP qua src/lib/api.ts, component chung từ @arena/ui, contracts từ @arena/contracts.

Quyền trên server là nguồn quyết định. Mỗi đội tối đa 4 người gồm đội trưởng; khi chốt cần 2–4 người. Chat không nằm trong phạm vi.

Đội mới được lập độc lập với giải (`tournamentId: null`), vẫn có thể tham gia bằng mã, chuyển đội trưởng, nộp bot và đấu thử. `TeamRegistrationCard` cho đội trưởng đăng ký giải qua `POST /teams/mine/tournaments/:tournamentId`; sau đó lịch khóa của giải áp dụng cho đội. Các đội đã đăng ký trước đây giữ nguyên dữ liệu.

Chỉ còn hai role `student` (Thí sinh) và `admin` (BTC). BTC phụ trách cả phân xử kết quả, xác nhận vòng và xử lý khiếu nại; không còn lựa chọn role trọng tài riêng.

Xem docs/TV1_IMPLEMENTATION.md để thử từng luồng và cấu hình SMTP.

Đã bỏ lời mời tham gia qua email, tạo mã mới và tự Chốt đội hình của đội trưởng. Các API tương ứng đã gỡ bỏ; dữ liệu lời mời cũ chỉ giữ làm lịch sử, lời mời đang chờ bị hủy.
