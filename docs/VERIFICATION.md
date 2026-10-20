# Kiểm chứng nền M0

Ngày kiểm tra: 20/10/2026. Nhánh: `foundation/fresh-start`. Môi trường Windows, Node 24.20.0, pnpm 9.15.4; PostgreSQL 16.6 và Redis 7.4.2 chạy qua Compose. Không reset database hoặc xóa dữ liệu cũ.

## Đã chạy

| Lệnh / nhóm kiểm tra           | Kết quả                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| pnpm install --frozen-lockfile | Qua; dùng đúng lockfile                                              |
| pnpm db:generate               | Qua                                                                  |
| pnpm db:migrate                | Qua; không còn migration chờ                                         |
| pnpm db:seed, chạy hai lần     | Qua; upsert ID cố định, không nhân đôi seed hoặc đè ván mới          |
| pnpm check                     | Qua: format, lint, build, typecheck, 21 unit tests                   |
| pnpm test:integration          | Qua: 6 kiểm thử với PostgreSQL/Redis thật                            |
| pnpm test:e2e                  | 2 Playwright tests qua trên Chromium; mobile 390px và desktop 1440px |

Unit tests gồm 7 contracts, 7 engine, 2 client sequence/snapshot, 2 API session/config, 3 worker deterministic/policy/config.

Integration kiểm tra: guard 401/403, cookie HttpOnly, Origin khác bị chặn, validation 400/requestId, placeholder 501; hai POST trùng đồng thời chỉ một game/job/outbox; đọc snapshot không enqueue/tung lại xu; replay nước đã commit khi retry; lease chặn bản giao trùng trong cùng worker; một kết quả và seq liên tục; socket join/rejoin cùng snapshot; API restart phát lại outbox; kill tiến trình worker giữa ván rồi BullMQ phục hồi, attempt cũ superseded và attempt mới succeeded. Proxy Redis riêng của test kiểm tra mất kết nối rồi tự nối lại mà không dừng Redis của máy.

E2E kiểm tra các trang công khai không tràn ngang; sinh viên bị chặn trang/API BTC; BTC tạo ván qua BullMQ và worker thật; khán giả không cần phiên vẫn xem bàn cờ/kết quả; reload/offline/online giữ game, coin, board, seq. Đã xem ảnh trang chủ desktop và phòng mobile. Ảnh và trace nằm trong test-results/playwright-report (gitignore).

## Giới hạn

- CI workflow đã được thêm, chưa chạy trên GitHub trong phiên làm việc này.
- Chưa kiểm thử Safari/Firefox, tải lớn, nhiều API, backup/restore hoặc deploy production.
- Chưa có bot Python thật, sandbox, đăng nhập thật, Swiss, cây đấu chính thức hoặc deadline/lựa chọn kín. Placeholder 501 được giữ; các phần này không được tính là đã hoàn thành.
- Build còn cảnh báo bundle web lớn hơn 500 kB; cần chia tải trang/thư viện trước khi tối ưu production.
- Khi chủ động ngắt mạng trong E2E, Vite có thể ghi ws proxy ECONNABORTED; client vẫn kết nối lại và đồng bộ thành công.
- E2E để lại ván mô phỏng trong phòng demo để xem lại; integration chỉ dọn fixture riêng. Dữ liệu SQLite cũ không tự nhập vào PostgreSQL mới.

M0 đủ để nhóm tiếp tục phát triển từng module từ luồng demo; kết quả này không xác nhận hệ thống đủ điều kiện tổ chức giải thật.
