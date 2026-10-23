# Bot Arena

## Demo và chính thức

Dùng chung code, tách dữ liệu và cấu hình. Chạy `pnpm env:init` để tạo `.env.demo` và `.env.official` riêng, sau đó làm theo [hướng dẫn thiết lập và tạo BTC thật](docs/DEMO_VA_CHINH_THUC.md).

- `pnpm dev:demo`: web + API + worker demo.
- `pnpm dev:official`: web + API + worker với tài khoản/thể thức thật, không bật công cụ demo.
- `pnpm start:official`: bản build production, phục vụ web và API cùng cổng, kèm worker.
- `pnpm db:migrate:demo` / `pnpm db:migrate:official`: migration riêng từng schema.

Các lệnh và `.env` trong phần dưới là cách chạy cũ, giữ để tương thích. Không chạy đồng thời cách cũ và profile nếu trùng cổng. Không cần mở thêm worker khi dùng `dev:demo` hoặc `dev:official`.

Website thi bot cờ Búa – Bao – Kéo: frontend React, API NestJS, PostgreSQL, Redis/BullMQ và worker chạy bot Python riêng. Bàn cờ 9×9, mỗi bên 10 quân; mọi ván mới dùng engine chuẩn.

## Chạy hằng ngày

Mở terminal tại thư mục gốc `GameOanTuTi`. Bật PostgreSQL, Redis và Docker/Podman theo cấu hình `.env` trước.

**Terminal 1 — web và API:**

```powershell
pnpm dev
```

**Terminal 2 — worker chạy bot:**

```powershell
pnpm dev:worker
```

Giữ cả hai terminal chạy trong lúc sử dụng. Worker xử lý cả bot mẫu và bot Python mới nộp.

- Web: [http://localhost:5173](http://localhost:5173)
- Trạng thái API/worker: [http://localhost:3100/api/v1/health](http://localhost:3100/api/v1/health)
- Tài liệu API: [http://localhost:3100/api/v1/openapi.json](http://localhost:3100/api/v1/openapi.json)

Nếu cổng báo đang được sử dụng, dừng bản chạy cũ trước khi mở thêm. Cổng thực tế đọc từ `WEB_PORT` và `API_PORT` trong `.env`.

## Cập nhật sau khi pull hoặc merge

Dừng API/worker cũ, bật database và Redis, rồi chạy ở thư mục gốc:

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm --filter @arena/game-engine... build
```

Sau đó mở lại `pnpm dev` và `pnpm dev:worker`. Không cần reset database. Chỉ generate Prisma Client không tạo bảng/cột trong database; thiếu migration có thể khiến đăng ký/gửi mã xác minh hoặc nộp bot báo 500.

Mã đăng ký qua email thật cần `MAIL_TRANSPORT=smtp` và cấu hình SMTP hợp lệ. `MAIL_TRANSPORT=local` chỉ lưu thư để kiểm thử, không gửi ra hộp thư.

## Cài đặt lần đầu

Cần Node.js **24.x** (bản ghim trong `.nvmrc`), pnpm **9.15.4**, Python **>=3.10**, PostgreSQL và Redis. Để chạy bot trong môi trường cách ly, cần Docker hoặc Podman với Linux containers.

```powershell
corepack enable
corepack pnpm --version
pnpm install --frozen-lockfile
```

Tạo `.env` ở gốc repo nếu chưa có:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Kiểm tra `DATABASE_URL`, `REDIS_URL`, `WEB_ORIGIN` và cấu hình chạy bot trong `.env`. Giữ nguyên file đã cấu hình trên máy đang dùng.

Nếu chưa có PostgreSQL/Redis, khởi động bằng **một** trong hai cách sau. Nếu dịch vụ đã chạy theo địa chỉ trong `.env`, bỏ qua bước này.

```powershell
# Docker Compose
docker compose --env-file .env -f infra/compose.yaml up -d
```

```powershell
# Podman Compose, cần có Compose provider
podman compose --env-file .env -f infra/compose.yaml up -d
```

Sau khi database và Redis sẵn sàng:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
```

Sau đó chạy hai terminal như mục trên. Seed có thể chạy lại, không xóa dữ liệu hiện có. Khi chỉ cập nhật code, chạy migration mới nếu có; không cần reset database.

## Cấu hình chạy bot

API cần Python trên máy để kiểm tra cú pháp. Nếu lệnh `python` không trỏ đúng bản cài, đặt `PYTHON_CMD` trong `.env` thành đường dẫn Python.

### Chạy cách ly bằng Docker hoặc Podman

Ví dụ dùng Podman:

```dotenv
BOT_SANDBOX_MODE=docker
BOT_CONTAINER_CMD=podman
BOT_SANDBOX_IMAGE=docker.io/library/python:3.12
```

Tên chế độ `docker` dùng cho cả hai runtime. Bật Podman machine và tải image trước khi khởi động worker:

```powershell
podman machine start
podman pull docker.io/library/python:3.12
```

Nếu machine đã chạy thì chỉ cần tải image nếu chưa có. Với Docker, đặt `BOT_CONTAINER_CMD=docker`, bật Docker và tải cùng image bằng `docker pull docker.io/library/python:3.12`.

Worker kiểm runtime/image ngay lúc khởi động. Nếu gặp `spawn ... ENOENT`, kiểm tra runtime đã cài và có trên `PATH`; có thể đặt `BOT_CONTAINER_CMD` thành đường dẫn tuyệt đối đến executable. Sau khi sửa `.env`, dừng và chạy lại worker.

### Demo bot tin cậy trên máy cá nhân

File `.env.example` mặc định chọn:

```dotenv
BOT_SANDBOX_MODE=trusted-local
```

Chế độ này vẫn chạy được cả bot mẫu và bot nộp, dùng Python trực tiếp trên máy. Chỉ dùng với mã tin cậy của nhóm; khi nhận bot từ người ngoài, dùng chế độ container. Hệ thống không tự chuyển từ container sang local khi có lỗi.

## Thử nộp và chạy bot

1. Vào **Đăng nhập mẫu**, chọn sinh viên có đội, ví dụ **Nguyễn An**.
2. Mở **Bot của tôi**, tải file `.py` hoặc dán mã, nhập nhãn rồi bấm **Xác nhận nộp bot**.
3. Chờ trạng thái **Chờ kiểm thử → Hợp lệ**. Worker kiểm thử bot hai màu trước khi cho đấu thử.
4. Bấm **Đấu thử**, chọn bot mẫu rồi **Bắt đầu đấu ngay** để xem kết quả và nhật ký nước đi.

Bot phải có hàm đồng bộ `make_move(state)`. Có thể bắt đầu với [bot ưu tiên ăn quân](apps/worker/examples/greedy.py) hoặc [bot ngẫu nhiên có seed](apps/worker/examples/random_bot.py).

Đăng nhập **BTC Demo** để kiểm tra dịch vụ, cấu hình giải và tạo ván trong phòng demo. Khán giả có thể xem phòng không cần đăng nhập. Tải lại trang không tạo ván hoặc tung lại xu.

Nộp từ GitHub theo commit cố định, chọn hai phiên bản cùng đội để đấu thử và khóa bộ bot theo giai đoạn đã có API; xem [hợp đồng API](docs/CONTRACTS.md) và [checklist nghiệm thu](docs/TV2_ACCEPTANCE.md). Giao diện hiện tại mới hiển thị nhật ký đấu thử; bộ điều khiển replay bằng bàn cờ chưa có.

## Kiểm tra và benchmark

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
```

Kiểm thử tích hợp cần PostgreSQL/Redis và runtime container đã cấu hình; tự tạo schema và queue riêng, dọn dữ liệu thử khi kết thúc.

Kiểm tra cách ly container thật:

```powershell
$env:ARENA_TEST_CONTAINER='1'
pnpm --filter @arena/worker test:container
Remove-Item Env:ARENA_TEST_CONTAINER
```

Kiểm tra giao diện với web/API/worker đang chạy:

```powershell
pnpm exec playwright install chromium
pnpm exec playwright test --config tests/live/playwright.config.ts
```

Test này tạo thêm một phiên bản bot và lượt đấu thử trong database demo. Bộ E2E tự khởi động dịch vụ dùng `pnpm test:e2e`; cần dừng bản dev chiếm cổng 3100/5173 trước khi chạy.

Đo tốc độ runner:

```powershell
pnpm --filter @arena/worker benchmark
```

Báo cáo đo thật và giới hạn workload: [benchmark](docs/TV2_BENCHMARK_2026_10_23.json). Kết quả runner không bao gồm thời gian DB/queue/mạng.

## Tài liệu và phạm vi hiện tại

- [Kiến trúc và luồng dữ liệu](docs/ARCHITECTURE.md)
- [Hợp đồng API/socket/queue](docs/CONTRACTS.md)
- [Engine, giao thức Python, cấu hình worker và checklist nghiệm thu](docs/TV2_ACCEPTANCE.md)
- [Vận hành worker và nhiều máy](apps/worker/OPERATIONS.md)
- [Cấu hình và công bố lịch giải](docs/TV3_CONFIGURATION.md)
- [Các quyết định còn chờ chốt](docs/DECISIONS.md)

ghép giải chính thức, lựa chọn kín, giao diện replay và khiếu nại còn cần các module tương ứng. Bản demo không đồng nghĩa toàn bộ hệ thống đã sẵn sàng tổ chức giải chính thức.

TV1 đã có tài khoản, xác minh/khôi phục mật khẩu, hồ sơ, quản lý đội 2–4 người, thông báo/email và nội dung BTC; xem [hướng dẫn TV1](docs/TV1_IMPLEMENTATION.md).
