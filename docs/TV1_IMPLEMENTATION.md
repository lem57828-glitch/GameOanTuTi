# TV1 — Tài khoản, đội và giao tiếp (không gồm chat)

Cập nhật ngày 23/10/2026. Yêu cầu hiện tại: email đúng miền `@vnu.edu.vn`, đội tối đa **4 người gồm đội trưởng**. Đội cần **2–4 người khi chốt/duyệt**; một người được phép lập đội trước để tuyển thành viên. Chat được loại khỏi phạm vi theo yêu cầu người dùng.

## Kiểm tra nhanh trên máy

1. Mở <http://localhost:5173/register>, điền họ tên, email trường `mssv@vnu.edu.vn`, lớp, khoa và mật khẩu từ 8 đến 128 ký tự. MSSV được lấy tự động từ phần trước @.
2. Bấm **Gửi mã xác minh**, nhập mã 6 chữ số nhận qua email rồi bấm **Đăng ký**. Mã có hạn 120 giây, bộ đếm vẫn tiếp tục khi tải lại trang. Hết giờ bấm **Gửi lại mã**; mã trước mất hiệu lực. Chỉ khi mã đúng mới tạo Account, và tài khoản được đánh dấu đã xác minh ngay. Nhập sai tối đa 5 lần mỗi mã. Tài khoản cũ chưa xác minh vẫn có thể dùng liên kết xác minh trong Hồ sơ.
3. Trong **Đội của tôi**, tạo đội hoặc nhập mã 10 ký tự để tham gia. Mã giữ nguyên trong suốt thời gian của đội. Đội trưởng có thể loại thành viên và chuyển quyền cho thành viên bất kỳ trong đội. Chỉ tham gia bằng mã; không có lời mời qua email, tạo mã mới hay Chốt đội hình dành cho đội trưởng.
4. Thành viên có thể rời đội trước hạn khóa. Đội trưởng phải chuyển quyền nếu còn thành viên khác; nếu là người cuối, rời đội sẽ chuyển đội sang trạng thái đã rút, giữ dữ liệu lịch sử.
5. Giới hạn tối đa 4 người gồm đội trưởng; BTC duyệt đội cần 2–4 thành viên hợp lệ. Quy định khóa đội của BTC, lịch và trạng thái giải vẫn được kiểm tra bằng thời gian server. Không còn thao tác tự chốt đội hình của thí sinh.
6. **Hồ sơ** cho phép sửa tên đăng nhập, họ tên, MSSV, lớp, khoa; username/MSSV phải duy nhất. MSSV không đổi sau khi đội hình đã khóa. Đổi mật khẩu cần mật khẩu hiện tại và đăng xuất tất cả phiên cũ.
7. **Quên mật khẩu** trên trang đăng nhập gửi liên kết 30 phút. Lấy liên kết từ hộp thư thử nghiệm của tài khoản khi chạy local; khi chưa đăng nhập có thể đăng nhập lại bằng mật khẩu cũ để xem hộp thư thử nghiệm. Với SMTP, liên kết đến hộp thư trường. Đặt lại thành công sẽ thu hồi mọi phiên cũ. Liên kết xác minh có hạn 24 giờ; các token chỉ dùng một lần, DB xác thực lưu hash token.
8. **Thông báo** hiển thị trạng thái mới/đã đọc và đánh dấu đọc tất cả. Thông báo được lưu theo người nhận và phân trang; tài khoản khác không đọc/đổi trạng thái được.
9. Để thử chức năng BTC trên máy, vào <http://localhost:5173/demo-login> → **BTC Demo** → **Quản trị TV1**. Có các mục Tài khoản, Đội, Nội dung BTC, Gửi thông báo, Email và Lịch sử. BTC có thể cấp vai trò/khóa tài khoản, duyệt/khóa/mở đội trước hạn, soạn nội dung nháp, công bố, sửa hoặc xóa. Không tự đổi quyền/khóa chính mình; bảo vệ quản trị viên thật cuối cùng. Tài khoản bị khóa/đổi quyền bị thu hồi phiên.
10. Nội dung đã công bố hiển thị tại **Thông báo BTC**; loại hướng dẫn cũng xuất hiện tại **Hướng dẫn**. Tài liệu hỗ trợ nội dung và đường dẫn HTTP/HTTPS. Bản nháp chỉ BTC xem được. Nội dung được hiển thị dưới dạng văn bản an toàn, không thực thi HTML.

## Email

Chế độ thử nghiệm `MAIL_TRANSPORT=local`: email chỉ được lưu trong DB và xem tại `/mailbox` bởi chính tài khoản nhận, không gửi ra ngoài. Endpoint bị đóng khi dùng SMTP hoặc production. Trang quản trị chỉ hiển thị trạng thái gửi, không đưa token/email body cho người quản trị.

Để gửi thật, cấu hình trong `.env` rồi khởi động lại API:

```dotenv
EMAIL_ALLOWED_DOMAINS=vnu.edu.vn
MAIL_TRANSPORT=smtp
MAIL_FROM=Bot Arena <btc.arena.ai@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=btc.arena.ai@gmail.com
SMTP_PASSWORD=mat-khau-ung-dung
WEB_ORIGIN=https://dia-chi-web-thuc-te
```

Cổng 465 thường dùng `SMTP_SECURE=true`. Kết nối không implicit TLS vẫn bắt buộc STARTTLS. Gmail SMTP đã được kiểm tra xác thực thành công với tài khoản btc.arena.ai@gmail.com. Mật khẩu ứng dụng chỉ nằm trong .env; không đưa vào tài liệu/log. Việc giao tới hộp thư trường còn phụ thuộc hệ thống email người nhận. Xem [hướng dẫn Google](https://support.google.com/mail/answer/7104828). Production từ chối chạy với mail local; không bật DEMO_MODE ở production. Không ghi thông tin SMTP thật vào git.

Mã đăng ký được gửi đồng bộ qua SMTP để chỉ bắt đầu đếm khi máy chủ SMTP đã nhận email; không xếp hàng thử lại mã đã hết hạn. Mã xác thực được lưu dưới dạng HMAC gắn với email/nonce, mã đã dùng và mã hết hạn không được chấp nhận. Các email thông báo/khôi phục khác vẫn dùng hàng đợi.

Hàng đợi email được lưu trong `EmailMessage`, thử lại tối đa 5 lần với thời gian chờ tăng dần; BTC có thể xếp hàng lại email lỗi. Khi tiến trình dừng giữa lúc gửi, email có thể được giao lại (SMTP không bảo đảm exactly-once). Notification có khóa chống trùng theo người nhận/sự kiện và không tạo email. Các email thông báo hoạt động cũ còn chờ hoặc lỗi đã bị hủy. Trước khi chuyển hệ thống local sang gửi SMTP thật, cần xem các email đang chờ trong trang quản trị để tránh gửi nhầm dữ liệu thử nghiệm.

## Tích hợp TV3/TV4

`NotificationsService.deliver(tx, accountIds, sourceKey, title, body, href)` là service công khai để ghi thông báo cùng transaction nguồn; `sourceKey` phải ổn định khi phát lại. `NotificationsService.team(...)` gửi cho thành viên của một đội. Thông báo hoạt động chỉ được lưu trong Notification và hiển thị trong hệ thống; không gửi email. Chỉ email xác minh tài khoản và email khôi phục mật khẩu được giữ lại.

Bộ đồng bộ chạy mỗi 5 giây, có cursor trong DB và khóa chống trùng:

- Audit thay đổi lịch/cấu hình giải và giai đoạn từ module TV3.
- Nhắc các mốc đóng đăng ký, khóa đội và bắt đầu giai đoạn trong 24 giờ tới.
- Hiệp mới từ `Game` và kết quả hiệp từ `GameResult` của module TV4/worker. Thông báo kết quả hiệp không được coi là quyết định chốt kết quả chính thức.
- Lập/tham gia đội bằng mã, chuyển đội trưởng, rời/loại thành viên, thay đổi trạng thái đội do BTC và nội dung BTC công bố.

`POST /api/v1/admin/notification-events` (chỉ admin) nhận `{ sourceKey, accountIds, kind: 'schedule'|'round'|'result', title, body, href }` cho thông báo bổ sung từ BTC/tích hợp. Đây là adapter cho sự kiện chưa tồn tại trong TV3/TV4; TV1 không tự xây Swiss hoặc điều hành trận.

## API và dữ liệu

- `auth/options`, `auth/registration-code`, `auth/register`, `auth/login`, `auth/forgot-password`, `auth/reset-password`, `auth/verify-email`, `auth/resend-verification`, `session`.
- `profile` GET/PATCH và `profile/password` POST.
- `teams`, `teams/join`, `teams/mine`, `teams/mine/captain`, `teams/mine/members/:accountId`.
- `notifications`, `notifications/read-all`, `notifications/:id/read`, `dev/mailbox` (local).
- `publications` công khai và `admin/publications` cho BTC.
- `admin/accounts`, `admin/teams`, `admin/mail-status`, `admin/tv1/audit`, `admin/notification-events`.

Tài liệu OpenAPI: <http://localhost:3100/api/v1/openapi.json>. Schema request dùng chung từ `packages/contracts/src/accounts.ts`. Migration mới thêm thông tin xác minh/phiên, token một lần, lời mời, thông báo, email, nội dung và cursor. Không sửa migration cũ, không reset database.

## Kiểm thử

```powershell
corepack pnpm --filter @arena/api test
corepack pnpm --filter @arena/api exec dotenv -e ../../.env -- vitest run test/integration/team-membership.test.ts test/integration/tv1.test.ts test/integration/registration-code.test.ts
corepack pnpm --filter @arena/api typecheck
corepack pnpm --filter @arena/web build
node --env-file=.env tests/tv1-browser.cjs
```

Browser test cần web dev tại cổng 5173, DB/Redis đang chạy và Chrome có sẵn (hoặc đặt PLAYWRIGHT_CHANNEL). Script tự tạo schema PostgreSQL riêng, áp migration, khởi động API test tại 3315 với mail local và chuyển API request của trình duyệt sang server test. Không gửi email thật, không xóa dữ liệu người dùng. Schema test được dọn trong finally; ảnh kiểm tra ở `test-results/registration/`. Kiểm tra mã sai, hết 120 giây, gửi lại, mã dùng một lần, bộ đếm qua tải lại trang, hồ sơ đã xác minh, MSSV tự động, đăng nhập, tham gia bằng mã, rời/chuyển trưởng/loại thành viên và khôi phục mật khẩu. Integration tests bao gồm số lần thử, gửi email thất bại và hai yêu cầu đăng ký đồng thời.

Luồng mới: `POST /auth/registration-code {email}` trả `{expiresAt,serverTime}`; không bao giờ trả mã qua API. `POST /auth/register {fullName,email,className,faculty,password,verificationCode}` chỉ tạo tài khoản khi đúng mã. Mã 6 chữ số gồm cả số 0 đầu. Không gửi MSSV hoặc role từ trình duyệt.

Chat không có endpoint, giao diện hoặc bảng mới trong đợt này. Những tính năng bot, engine thi thật, thuật toán giải và phòng đấu chính thức vẫn thuộc TV2–TV4.

Trang chủ chỉ hiển thị Đăng ký tham gia cho khách chưa đăng nhập; ẩn trong lúc kiểm tra phiên để tránh nháy nút khi người dùng đã đăng nhập.
