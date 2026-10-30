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

## Sửa code

Push lên `main` → Render tự build và deploy lại (`autoDeploy`). Dữ liệu ở Neon giữ nguyên.

## Dùng kèm Vercel?

Không cần: service Render đã phục vụ cả web. Nếu vẫn muốn web trên Vercel, Vercel phải chuyển `/api/*` và
`/socket.io/*` sang địa chỉ Render (rewrites trong `vercel.json`), trả `index.html` cho các trang con, và tên miền
Vercel phải có trong `WEB_ORIGIN`. Vercel không chuyển tiếp WebSocket nên xem trận trực tiếp sẽ dùng polling (chậm hơn).
