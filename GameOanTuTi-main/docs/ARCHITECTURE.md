# Kiến trúc M0

## Cấu trúc

| Thành phần           | Trách nhiệm                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| apps/web             | React/TypeScript/Vite, TanStack Query, Router, Tailwind, Socket.IO client |
| apps/api             | NestJS modular monolith: Controller → Service → Repository                |
| apps/worker          | Node/TypeScript, consumer BullMQ, GameProcessor và GameRunner             |
| packages/contracts   | Zod schema dùng chung cho HTTP/socket/queue                               |
| packages/game-engine | Logic demo thuần: bàn cờ, nước đi, kết thúc, mô phỏng theo seed, replay   |
| packages/ui          | Token navy/cam/bạc, component Radix, trạng thái loading/empty/error       |
| infra                | PostgreSQL 16.6, Redis 7.4.2 trong Compose                                |

Bốn module ở cả API/web: accounts-teams, bots-runner, tournaments, rooms-matches. Module khác gọi service công khai, không import repository. Worker dùng Prisma trực tiếp trong tiến trình riêng; không khởi động Nest/API.

## Luồng mô phỏng

1. API đọc phiên từ cookie ký HMAC, lấy lại role/team từ DB, kiểm tra role BTC và demo mode.
2. POST demo/games kiểm tra requestKey. Một transaction ghi Match, Game, coin/seed, lựa chọn đã khóa, game.created, GameJob, OutboxEvent và audit.
3. Outbox dispatcher đưa job lên BullMQ với jobId bằng GameJob.id. Redis lỗi thì sự kiện vẫn pending và được phát lại với backoff.
4. Worker giữ lease DB, tạo RunAttempt, chạy bot mô phỏng theo seed/lựa chọn đã lưu. Mỗi nước và kết quả được commit trước khi publish tín hiệu Redis.
5. API nhận tín hiệu, đọc event bền vững và phát Socket.IO. Client lấy snapshot khi vào/reconnect, bỏ event cũ/trùng, resync khi thiếu seq/đổi stream. Poll snapshot 5 giây bù cả tín hiệu cuối bị mất.

PostgreSQL là nguồn dữ liệu chuẩn; Redis là hàng đợi và tín hiệu. Snapshot đọc bằng transaction RepeatableRead để bàn cờ, seq và kết quả cùng một thời điểm. Một ván có tối đa một GameResult. Lease được kiểm tra theo worker, attempt và hạn; cùng worker cũng không nhận đồng thời hai bản giao của một job. Retry phát lại cùng seed, đối chiếu nước đã lưu, không ghi trùng.

Outbox pending được phát lại khi API chạy; trang BTC có số pending/phát lại, hàng đợi và heartbeat worker. Bộ quét đưa lại job dispatched/running bị kẹt nếu lease hết và hàng đợi không còn giữ job hợp lệ. Không tự tạo seed hay reset khi khởi động.

## Biên bảo mật và phạm vi

Cookie HttpOnly/SameSite=Lax; production cần Secure/HTTPS. HTTP mutation kiểm tra Origin cấu hình; browser và API dùng chung origin qua Vite proxy khi dev. Runtime validation ở HTTP, socket nhận vào, queue và snapshot/event phía client. Public DTO không có source bot hoặc báo cáo riêng tư. Guard server quyết định quyền; ẩn nút chỉ giúp giao diện.

Chỉ có runner mô phỏng tin cậy. Chưa có cô lập CPU/RAM/network cho mã người dùng; không nhận/chạy bot thí sinh. Chưa hỗ trợ triển khai web production, session thật, mở rộng nhiều worker/API hoàn chỉnh hoặc vận hành giải thật. Những phần này cần milestone sau, không suy ra từ demo hoạt động.
