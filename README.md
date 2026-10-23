# Bot Arena — Foundation M0

Bộ khung mới trên nhánh `foundation/fresh-start`, theo [đặc tả M0](docs/Dac_ta_dung_nen_Bot_Arena_M0.docx). Giao diện tiếng Việt, API phân module, PostgreSQL, Redis/BullMQ và worker riêng. Luồng demo chạy thật qua hàng đợi; bot và luật dùng để mô phỏng, chưa dùng tổ chức thi chính thức.

## Chạy trên máy mới

Cần Node **24.20.0**, pnpm **9.15.4**, Docker Compose. Không ghi đè `.env` nếu đã có. PostgreSQL mặc định cổng 5432; đổi `POSTGRES_PORT` và cổng trong `DATABASE_URL` nếu máy đã dùng cổng này (máy hiện tại dùng 55433).

```sh
corepack enable
corepack pnpm --version
pnpm install --frozen-lockfile
# Chỉ khi chưa có .env: sao chép .env.example thành .env
docker compose -f infra/compose.yaml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Mở terminal thứ hai tại gốc repo:

```sh
pnpm dev:worker
```

Web: <http://localhost:5173>. API: <http://localhost:3100/api/v1/health>. OpenAPI JSON: <http://localhost:3100/api/v1/openapi.json>. Nếu chưa build thư viện dùng chung, chạy `pnpm build` trước khi chạy riêng worker. `pnpm dev` và `pnpm db:seed` tự build thư viện cần thiết.

Trong Đăng nhập mẫu, chọn **BTC Demo** → Khu vực BTC → Tạo ván mô phỏng → Vào phòng đấu. Sinh viên chỉ xem đội/bot của mình; trọng tài xem tình trạng dịch vụ/job; khán giả xem phòng không cần đăng nhập. Tải lại hay reconnect không tạo ván hoặc tung lại xu. Cùng `requestKey` trả lại cùng ván; mã mới tạo ván mới khi phòng rảnh.

Seed chạy lại an toàn, không xóa ván mới hay tạo tài khoản trùng. `pnpm db:reset -- --yes` xóa toàn bộ database được cấu hình; **không cần chạy để sử dụng hoặc cập nhật bộ khung**. Dữ liệu SQLite cũ trong `data/` và bản chụp `deploy-snapshot/` được giữ nguyên, không tự chuyển vào PostgreSQL.

## Kiểm tra

```sh
pnpm check
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Integration cần database đã migrate/seed và Redis. E2E tự mở API, worker, web; dừng bản dev đang chiếm 3100/5173 trước khi chạy. E2E tạo một ván demo để xem lại. CI thực hiện các bước tương tự với PostgreSQL/Redis riêng. Kết quả đã chạy và giới hạn: [VERIFICATION](docs/VERIFICATION.md).

## Bàn giao

TV3 đã có [quy trình cấu hình và công bố lịch giải](docs/TV3_CONFIGURATION.md) trong Khu vực BTC. Tạo giải nháp mới để thử; giải demo có sẵn đã công bố nên chỉ đọc cấu hình. Duyệt lịch không chốt kết quả thi đấu.

- [Kiến trúc và luồng dữ liệu](docs/ARCHITECTURE.md)
- [Hợp đồng API/socket/queue](docs/CONTRACTS.md)
- [Quyết định và vấn đề còn chờ chốt](docs/DECISIONS.md)
- [Phân công và cách làm việc nhóm](docs/TEAM.md)

TV1 đã có tài khoản, xác minh/khôi phục mật khẩu, hồ sơ, quản lý đội 2–4 người, thông báo/email và nội dung BTC; xem [hướng dẫn TV1](docs/TV1_IMPLEMENTATION.md). Chat được bỏ theo yêu cầu. Nộp bot/sandbox, Swiss, cây đấu chính thức, khiếu nại và lựa chọn kín còn là placeholder 501 có người phụ trách. Bán kết/chung kết offline nằm ngoài M0. Production từ chối bật demo; worker M0 chỉ chạy demo ở development/test. Chưa có cấu hình triển khai thi thật.
