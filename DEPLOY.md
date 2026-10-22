# Railway + Turso, chuyển dữ liệu hiện tại

Web và worker Python chạy cùng một service Railway, một replica. Turso lưu CSDL libSQL gồm tài khoản, đội, mã nguồn bot, kết quả và lịch sử trận. File Python trong `/data/bots` là cache thực thi, có thể tạo lại từ `submissions.source_code`. Volume `/data` giữ cache và log qua các lần deploy. Bản local mặc định vẫn dùng SQLite; cấu hình cloud không thay đổi database local.

## Email xác minh đăng ký

Hệ thống gửi mã 6 chữ số từ `btc.arena.ai@gmail.com` qua Gmail SMTP (TLS, cổng 465). Chỉ chấp nhận email `@vnu.edu.vn` hoặc tên miền con như `@uet.vnu.edu.vn`. Tài khoản chỉ được tạo sau khi nhập đúng mã trong 120 giây; mã dùng một lần, tối đa 5 lần nhập sai, gửi lại sau 60 giây. Gửi lại sẽ vô hiệu mã trước đó.

1. Đăng nhập tài khoản Gmail hệ thống, bật xác minh 2 bước và [tạo mật khẩu ứng dụng](https://support.google.com/accounts/answer/185833).
2. Thêm biến bí mật `SMTP_APP_PASSWORD` trên Railway bằng mật khẩu ứng dụng, rồi redeploy. Không dùng mật khẩu đăng nhập Gmail, không đưa mật khẩu vào Git hoặc chat.
3. Đăng ký thử bằng email VNU thực để kiểm tra thư đến và xác minh trong 2 phút. Máy chủ cần kết nối ra `smtp.gmail.com:465`.

Local: điền `SMTP_APP_PASSWORD` trong file `.env` (được Git bỏ qua) rồi chạy `node --env-file=.env src/server.js`. `npm start` hiện không tự đọc file `.env`. Nếu chưa có cấu hình hoặc gửi thư thất bại, hệ thống báo lỗi và không tạo tài khoản. Tài khoản đã có vẫn đăng nhập bình thường.

## 1. Tạo dịch vụ

- Đăng ký [Turso](https://app.turso.tech/), tạo database **libSQL-compatible** trống. Lấy URL `libsql://...` và token có quyền ghi; lưu riêng, không đưa token vào Git hoặc chat. Driver này dành cho libSQL, không phải API của Turso Database engine mới.
- Đăng ký [Railway](https://railway.com/), tạo project và service trống trước. Kết nối repository sau khi cấu hình các biến bên dưới để lần chạy đầu không khởi tạo CSDL trước khi import.
- Tạo volume gắn với service, mount tại `/data`. Đặt một replica, không bật chế độ tự ngủ khi worker cần chạy. Cần chọn gói có đủ RAM cho Node và hai bot Python mỗi trận; kiểm tra chi phí trong dashboard trước khi bật.

Tài liệu: [Dockerfile Railway](https://docs.railway.com/builds/dockerfiles), [volume](https://docs.railway.com/volumes), [Turso URL](https://docs.turso.tech/cli/db/show), [token](https://docs.turso.tech/cli/db/tokens/create).

## 2. Variables trên Railway

```dotenv
NODE_ENV=production
DB_DRIVER=turso
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-write-token
DATA_DIR=/data
PYTHON_BIN=python3
APP_SECRET=replace-with-a-random-secret-at-least-32-characters
EMBEDDED_WORKER=true
MATCH_CONCURRENCY=1
BOT_SANDBOX=process
TRUST_PROXY=1
DEPLOY_IMPORT_MODE=true
MIGRATION_TOKEN=replace-with-a-different-random-secret-at-least-32-characters
```

Tạo hai chuỗi ngẫu nhiên riêng biệt bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Railway cấp biến `PORT`, không cần cố định cổng 3000. `TRUST_PROXY=1` dành cho đường truy cập đi qua một reverse proxy tin cậy; kiểm tra topology nếu thêm CDN/proxy.

Kết nối repo có `Dockerfile` ở thư mục gốc. Giữ lệnh chạy mặc định `node scripts/start.js`. Trong Settings cấu hình healthcheck `/healthz`. Tạo domain HTTPS cho service. Lần deploy đầu chỉ chạy màn chờ nhập dữ liệu, không chạy worker và không seed database. `GET /healthz` trả `mode: import`.

## 3. Chốt bản chuyển dữ liệu

Chờ các tác vụ local đang chạy hoàn tất, dừng server local và tránh tiếp tục sửa dữ liệu cho đến khi chuyển xong. Không copy riêng `arena.db` khi đang có WAL. Export dùng transaction đọc nhất quán, gồm tất cả bảng và mã bot đã đối chiếu SHA-256:

```powershell
node scripts/export-data.js
```

Lệnh in đường dẫn `deploy-snapshot/arena-....json` và checksum. Snapshot chứa tài khoản/hash mật khẩu, email, bot, lịch sử và kết quả; chỉ giữ riêng, không commit. Export lấy mã bot từ database; với dữ liệu cũ chưa nâng cấp sẽ đọc file bot. Nếu thiếu mã nguồn ở cả database lẫn file hoặc có tác vụ đang chạy, export từ chối. Có thể tạo snapshot mới bằng tên mới; không ghi đè snapshot cũ.

## 4. Nhập lên cloud

Tạo file `.env.deploy` ở máy local (đã bị Git và Docker bỏ qua):

```dotenv
RAILWAY_IMPORT_URL=https://your-service.up.railway.app
MIGRATION_TOKEN=same-token-as-railway
```

Chạy với tên snapshot thực tế:

```powershell
node --env-file=.env.deploy scripts/upload-snapshot.js deploy-snapshot/arena-....json
```

Snapshot được gửi trực tiếp qua HTTPS có Bearer token, không đi qua Git. Import kiểm tra hash bot, khóa ngoại và số bản ghi; chèn CSDL trong một transaction. Chỉ chấp nhận **database trống**, không xóa hoặc ghi đè dữ liệu có sẵn. Không khởi động web/worker trong lúc import. File bot được đặt vào volume trước khi commit CSDL. Snapshot tối đa 100 MB với endpoint này; dữ liệu lớn hơn cần phương án nhập ngoại tuyến.

Nếu lỗi, xem log Railway. Nếu import lỗi và rollback, có thể gửi lại vào cùng database trống; các file bot trùng hash được tái sử dụng. Nếu yêu cầu upload mất kết nối sau khi commit, kiểm tra database trước khi thử lại; database đã có dữ liệu sẽ bị từ chối để tránh nhập trùng. Không reset database đích để thử lại khi chưa xác minh dữ liệu.

## 5. Chạy ứng dụng

Sau khi import thành công, đặt `DEPLOY_IMPORT_MODE=false`, xóa `MIGRATION_TOKEN` trên Railway và redeploy. Web khởi động từ dữ liệu đã nhập; `/healthz` trả `{ "ok": true }`. Giữ volume `/data` khi redeploy. Đăng nhập, kiểm tra số đội/bot, mở mã bot cũ và xem lại trận. Chạy một trận thử trước khi tiếp tục giải. Bản ghi giữ nguyên ID và hash mật khẩu; người dùng đăng nhập lại vì APP_SECRET mới.

**Chạy thử có kiểm soát:** `BOT_SANDBOX=process` chỉ chặn ở mức Python và không phải sandbox đủ an toàn cho mã công khai. Đóng nhận bài hoặc giới hạn người tham gia tin cậy. Dockerfile của web không đồng nghĩa đã cách ly từng bot; `BOT_SANDBOX=docker` cần Docker daemon/worker được cấu hình riêng. Không mặc định Railway service có Docker daemon. Trước khi mở cuộc thi công khai cần thiết kế worker cách ly và đo tải. Với driver đồng bộ, độ trễ Turso có thể chặn event loop; ban đầu đặt concurrency 1 và kiểm tra CPU timeout/heartbeat thực tế theo region.

Database chuyển lên giữ cả mật khẩu demo hiện tại. Đổi mật khẩu quản trị và xử lý các tài khoản dùng mật khẩu demo trước khi cho truy cập rộng. Snapshot, token và dữ liệu cá nhân không được đưa vào repository public. Bật backup Turso. Sau nâng cấp, cần xác nhận mọi bài nộp đã có `source_code`; khi đó backup CSDL có đủ mã bot và không cần cache Python để phục hồi. Bot cũ thiếu file không thể tự phục hồi nội dung trước khi migrate.

## Kiểm tra local

```powershell
npm test
$env:DB_DRIVER='libsql'
npm test
Remove-Item Env:DB_DRIVER
```

Driver `libsql` trong lệnh trên dùng file tạm local để kiểm tra tương thích SQL. Kiểm thử này không chứng minh latency, giới hạn transaction hay kết nối tới Turso thật. Chưa thể xác minh môi trường thật nếu chưa tạo Railway/Turso và cấu hình quyền truy cập.
