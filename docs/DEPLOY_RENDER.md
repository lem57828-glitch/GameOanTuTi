# Deploy bản demo lên Render (miễn phí)

Một **Web Service chạy Docker** (dùng [Dockerfile](../Dockerfile)): Redis + API (phục vụ cả web) + worker trong cùng
container. Dữ liệu ở **Neon PostgreSQL** (miễn phí). Cấu hình sẵn trong [render.yaml](../render.yaml).

> Runtime **Node** của Render (Build/Start Command kiểu `pnpm build`, `pnpm start`) **không dùng được**: chỉ chạy API,
> không có Redis và worker chạy bot. Phải dùng runtime **Docker**.

## Giới hạn gói miễn phí

- **Ngủ sau 15 phút không có người truy cập**; lần mở kế tiếp mất khoảng 1 phút để thức dậy. Khi ngủ, worker cũng ngủ:
  ván đang chạy dừng lại và tự chạy tiếp khi service thức (trạng thái lưu ở PostgreSQL).
- 512 MB RAM, CPU yếu: cấu hình chạy **một ván mỗi lúc** (`WORKER_CONCURRENCY=1`). Đã thử: rảnh ~106 MB, đang chạy ván
  ~111 MB.
- Bot chạy ở chế độ `trusted-local` (chỉ demo): user riêng không quyền, không đọc được mật khẩu DB của API/worker, giới
  hạn RAM/tiến trình; bot vẫn gọi được mạng. Không dùng cấu hình này cho bản chính thức.

## Tạo service bằng tay (không dùng Blueprint)

New → **Web Service** → repo `GameOanTuTi`, nhánh `main` → **Language: Docker** (Root Directory để trống, Dockerfile
`./Dockerfile`) → Instance **Free** → Environment chỉ cần 3 biến: `DATABASE_URL`, `WEB_ORIGIN`, `SESSION_SECRET`
(chuỗi ngẫu nhiên ≥ 32 ký tự). Mọi cấu hình demo khác đã đặt sẵn trong Dockerfile; migration tự chạy khi khởi động.
Health Check Path: `/api/v1/health`. Mỗi lần khởi động, container tự nạp tài khoản mẫu (BTC Demo, Nguyễn An...; `SEED_DEMO=false` để tắt) và giải một thí sinh với tài khoản "Thí sinh demo (BTC tự động)" (`SEED_SOLO=false` để tắt). Cả hai chạy lại an toàn, không xóa hay tạo trùng dữ liệu; giải đã chơi dở thì được giữ nguyên.

## Các bước

1. **Neon** (neon.tech) → project mới, region **Singapore** → copy connection string, thêm `&schema=arena_demo`:
   `postgresql://USER:PASS@HOST/neondb?sslmode=require&schema=arena_demo`
2. **Render** → **New → Blueprint** → chọn repo `GameOanTuTi`, nhánh `main`. Render đọc `render.yaml` và tạo service
   `bot-arena-demo` (Docker, gói Free, Singapore).
   - Nếu đã tạo service runtime Node trước đó: xóa nó (Render không đổi runtime của service có sẵn sang Docker).
3. Render hỏi các biến `sync: false`:
   - `DATABASE_URL` = chuỗi Neon ở bước 1.
   - `WEB_ORIGIN` = địa chỉ service, ví dụ `https://bot-arena-demo.onrender.com` (xem ở trang service sau khi tạo; sai
     thì sửa ở **Environment** rồi deploy lại). Dùng thêm tên miền khác (Vercel...) thì nối bằng dấu phẩy.
   - `SESSION_SECRET` Render tự sinh.
4. Chờ build xong (lần đầu ~10 phút). Migration tự chạy khi container khởi động (`RUN_MIGRATIONS=true`).
5. Nạp dữ liệu mẫu — trang service → **Shell** (nếu gói miễn phí không có Shell: chạy lệnh tương tự trên máy với
   `DATABASE_URL` trỏ tới Neon):
   ```sh
   cd /app/apps/api && node_modules/.bin/tsx prisma/seed.ts
   cd /app/apps/api && node_modules/.bin/tsx prisma/demo-experience.ts --solo
   ```
6. Mở `https://<service>.onrender.com/demo-login`; kiểm tra `/api/v1/health` có `"workerAlive":true`.

Nạp dữ liệu mẫu từ máy (khi không có Shell), ở thư mục `apps/api`, PowerShell:

```powershell
$env:DATABASE_URL = "<chuỗi Neon>&schema=arena_demo"
pnpm exec tsx prisma/seed.ts
pnpm exec tsx prisma/demo-experience.ts --solo
Remove-Item Env:DATABASE_URL
```

## Gửi email thật (mã xác minh đăng ký)

Mặc định bản demo dùng hộp thư thử nghiệm (`MAIL_TRANSPORT=local`, xem mã ở `/mailbox`) — không gửi thư thật. Render gói
Free chặn cổng SMTP nên dùng **Resend** (gửi qua HTTPS):

1. resend.com → **Domains → Add domain** → thêm các bản ghi DNS Resend đưa ra vào nhà quản lý tên miền → chờ trạng thái
   **Verified**. Không có tên miền đã xác minh, Resend chỉ cho gửi từ `onboarding@resend.dev` **tới đúng email chủ tài
   khoản Resend** — sinh viên khác sẽ không nhận được.
2. Resend → **API Keys → Create API Key** (quyền Sending access).
3. Render → **Environment**:

| Biến                    | Giá trị                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `MAIL_TRANSPORT`        | `resend`                                                      |
| `RESEND_API_KEY`        | khóa ở bước 2 (`re_...`)                                      |
| `MAIL_FROM`             | `Bot Arena <no-reply@ten-mien-da-xac-minh>`                   |
| `EMAIL_ALLOWED_DOMAINS` | `vnu.edu.vn` (thêm `,gmail.com`... nếu cho đăng ký miền khác) |

Không cần các biến `SMTP_*` khi dùng Resend. Lỗi gửi ghi trong Logs dạng `Registration code failed (RESEND_FORBIDDEN)`:
`RESEND_FORBIDDEN` = khóa sai hoặc `MAIL_FROM` chưa thuộc tên miền đã xác minh; `RESEND_INVALID` = địa chỉ gửi/nhận
sai định dạng; `RESEND_RATE_LIMITED` = vượt hạn mức.

### Hoặc: Gmail API qua HTTPS (`MAIL_TRANSPORT=gmail_api`, không cần tên miền riêng)

Gửi từ chính một tài khoản Gmail (vd. `btc.arena.ai@gmail.com`) bằng Gmail API `users.messages.send` qua HTTPS (cổng
443), nên không bị Render chặn cổng SMTP. Áp dụng cho mã OTP đăng ký, thư xác minh email và đặt lại mật khẩu. Cơ chế
OTP (120 giây, dùng một lần), chống gửi trùng và giới hạn tần suất giữ nguyên. Server tự đổi refresh token lấy access
token (sống ~1 giờ) và làm mới khi hết hạn. Logs không bao giờ chứa mã OTP, client secret hay token. Giới hạn của Gmail
thường: khoảng 500 thư/ngày.

Google Cloud Console là nơi duy nhất cấp OAuth Client ID/Secret cho Gmail API, nên cần làm các bước sau **một lần**:

1. console.cloud.google.com → tạo project → **APIs & Services → Library** → bật **Gmail API**.
2. **OAuth consent screen** (Google Auth Platform): User type **External**; điền tên app, email hỗ trợ. Ở
   **Audience** bấm **Publish app** (chuyển sang _In production_). Nếu để _Testing_, refresh token **hết hạn sau 7
   ngày** và thư ngừng gửi. App chưa được Google xác minh vẫn dùng được cho tài khoản của mình (màn hình cấp quyền
   hiện cảnh báo, bấm _Advanced → Go to ... (unsafe)_).
3. **Credentials → Create credentials → OAuth client ID** → loại **Desktop app** → lưu Client ID và Client secret.
4. Trên máy có trình duyệt, ở thư mục repo:
   ```sh
   pnpm gmail:token -- <CLIENT_ID> <CLIENT_SECRET>
   ```
   Mở link hiện ra, đăng nhập **đúng tài khoản Gmail dùng để gửi**, cho phép quyền _Gửi email thay bạn_ (scope
   `gmail.send`: chỉ gửi, không đọc hộp thư). Terminal in ra `GMAIL_REFRESH_TOKEN`.
5. Render → **Environment**:

| Biến                    | Giá trị                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `MAIL_TRANSPORT`        | `gmail_api`                                                                   |
| `GMAIL_CLIENT_ID`       | Client ID ở bước 3                                                            |
| `GMAIL_CLIENT_SECRET`   | Client secret ở bước 3                                                        |
| `GMAIL_REFRESH_TOKEN`   | token ở bước 4                                                                |
| `GMAIL_SENDER_EMAIL`    | địa chỉ Gmail đã cấp quyền ở bước 4 (người gửi), vd. `btc.arena.ai@gmail.com` |
| `MAIL_FROM`             | (tùy chọn) chỉ dùng phần tên hiển thị, vd. `Bot Arena <...>`                  |
| `EMAIL_ALLOWED_DOMAINS` | `vnu.edu.vn`                                                                  |

Không cần `SMTP_*` hay `RESEND_API_KEY`. Thiếu một trong bốn biến `GMAIL_*` thì API từ chối khởi động và báo tên biến
thiếu. Lỗi gửi trong Logs: `GMAIL_TOKEN_REVOKED` = refresh token hết hạn/bị thu hồi (app còn ở _Testing_, đổi mật khẩu
Google, hoặc gỡ quyền) → chạy lại bước 4; `GMAIL_CLIENT_INVALID` = Client ID/secret sai; `GMAIL_FORBIDDEN` = chưa bật
Gmail API, thiếu quyền gửi hoặc `GMAIL_SENDER_EMAIL` không phải tài khoản đã cấp quyền; `GMAIL_RATE_LIMITED` = vượt hạn
mức ngày. Thư xác minh/đặt lại mật khẩu lỗi được tự thử lại tối đa 5 lần.

## Sửa code

Push lên `main` → Render tự build và deploy lại (`autoDeploy`). Dữ liệu ở Neon giữ nguyên.

## Web trên Vercel, backend trên Render

`vercel.json` (ở gốc repo và ở `apps/web` — Vercel đọc file ở Root Directory của project) chuyển `/api/*`,
`/socket.io/*` sang `https://bot-arena-demo.onrender.com` và trả `index.html` cho các trang con. Trình duyệt chỉ thấy
tên miền Vercel nên cookie đăng nhập hoạt động bình thường.

1. Địa chỉ Render khác `bot-arena-demo.onrender.com` → sửa `destination` trong cả hai `vercel.json`.
2. Trên Render, `WEB_ORIGIN` phải có **mọi** tên miền Vercel dùng để mở trang (API từ chối Origin lạ), cách nhau dấu
   phẩy, ví dụ `https://bot-arena-demo.onrender.com,https://game-oan-tu-ti.vercel.app`.
3. `TRUST_PROXY=2` (Vercel → proxy Render → API) để giới hạn đăng nhập tính đúng IP từng người.
4. Vercel không chuyển tiếp WebSocket: xem trận trực tiếp tự chuyển sang polling (chậm hơn một chút).
5. Mỗi lần deploy, Vercel tạo một link xem trước mới (có đoạn mã ngẫu nhiên). Link cố định là tên miền Production của
   project (Settings → Domains) — dùng link đó và đưa nó vào `WEB_ORIGIN`.
