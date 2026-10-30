# Deploy bản demo lên Fly.io

Bản demo (đăng nhập mẫu, nút "Tiếp theo", đội/bot mẫu) chạy trên **một máy Fly** + **PostgreSQL Neon (miễn phí)**.

```
Người dùng ──HTTPS──► Fly.io (bot-arena-demo.fly.dev)
                       └─ 1 máy: Redis (hàng đợi, trong máy) + API (phục vụ cả web) + worker chạy bot
                                  │
                                  └──► Neon PostgreSQL (dữ liệu: tài khoản, giải, bot, ván)
```

| File                                                            | Vai trò                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Dockerfile](../Dockerfile)                                     | Build cả monorepo, image chạy Node 24 + Python 3 + Redis                 |
| [fly.toml](../fly.toml)                                         | Cấu hình app, biến môi trường không bí mật, migration khi deploy         |
| [deploy/fly/start.mjs](../deploy/fly/start.mjs)                 | Chạy Redis → API + worker; một tiến trình chết thì Fly khởi động lại máy |
| [deploy/fly/sandbox-python.sh](../deploy/fly/sandbox-python.sh) | Chạy bot bằng user `bot` không quyền, giới hạn RAM/tiến trình            |

**Chi phí:** Fly tính tiền theo mức dùng (cần thẻ). Một máy `shared-cpu-1x` 1 GB chạy liên tục khoảng vài USD/tháng —
xem bảng giá Fly. Neon miễn phí (0,5 GB).

**Bảo mật bot:** máy Fly không có Docker nên bot chạy ở chế độ `trusted-local` (chỉ demo được phép), được rào thêm:
user riêng không đọc được biến môi trường của API/worker (mật khẩu DB), giới hạn 512 MB RAM, 64 tiến trình. Bot **vẫn
gọi được mạng ra ngoài**. Bản chính thức bắt buộc sandbox Docker — không deploy bản chính thức bằng cấu hình này.

## 1. Lần đầu

1. **Neon** (neon.tech) → tạo project, chọn region **Singapore** → copy connection string, thêm `schema=arena_demo`:
   `postgresql://USER:PASS@HOST/neondb?sslmode=require&schema=arena_demo`
2. **flyctl**: `iwr https://fly.io/install.ps1 -useb | iex` (PowerShell), mở terminal mới.
3. Đăng nhập (mở trình duyệt): `fly auth login`
4. Tạo app (tên phải chưa ai dùng; nếu đổi tên thì sửa `app` và `WEB_ORIGIN` trong `fly.toml`):
   ```powershell
   fly apps create bot-arena-demo
   ```
5. Đặt bí mật (không ghi vào file nào trong repo):
   ```powershell
   fly secrets set DATABASE_URL="postgresql://...&schema=arena_demo" SESSION_SECRET="<chuỗi ngẫu nhiên ≥ 32 ký tự>"
   ```
6. Deploy (Fly build image trên máy chủ của Fly, không cần Docker trên máy bạn; migration tự chạy):
   ```powershell
   fly deploy
   ```
7. Nạp dữ liệu mẫu (tài khoản mẫu, đội, bot) — một lần:
   ```powershell
   fly ssh console -C "sh -c 'cd /app/apps/api && node_modules/.bin/tsx prisma/seed.ts'"
   fly ssh console -C "sh -c 'cd /app/apps/api && node_modules/.bin/tsx prisma/demo-experience.ts --solo'"
   ```
8. Mở `https://bot-arena-demo.fly.dev/demo-login`. Kiểm tra `https://bot-arena-demo.fly.dev/api/v1/health` có
   `"workerAlive":true`.

## 2. Sửa code rồi cập nhật

Sửa code → commit/push như bình thường → ở thư mục gốc repo chạy `fly deploy`. Fly build bản mới, chạy migration, thay
máy cũ khi máy mới khỏe (health check `/api/v1/health`). Dữ liệu ở Neon giữ nguyên.

## 3. Vận hành

| Việc                           | Lệnh                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Xem log                        | `fly logs`                                                                                                              |
| Trạng thái máy                 | `fly status`                                                                                                            |
| Vào shell trong máy            | `fly ssh console`                                                                                                       |
| Khởi động lại                  | `fly apps restart bot-arena-demo`                                                                                       |
| Tạo giải một thí sinh mới      | `fly ssh console -C "sh -c 'cd /app/apps/api && node_modules/.bin/tsx prisma/demo-experience.ts --solo --id tour_moi'"` |
| Tạm dừng (không tính tiền máy) | `fly scale count 0` — bật lại: `fly scale count 1`                                                                      |

Máy chậm khi nhiều ván chạy cùng lúc: tăng RAM/CPU trong `[[vm]]` của `fly.toml` (tốn tiền hơn) hoặc giảm
`WORKER_CONCURRENCY`.

## 4. Thử image trên máy trước khi deploy (tùy chọn)

```powershell
docker build -t bot-arena-demo .
```

Đã thử: image build được; migration chạy; API + worker + Redis lên; `/demo-login` trả 200; bot Python đấu thử trọn ván
qua `sandbox-python.sh`; bot không đọc được biến môi trường của API/worker.
