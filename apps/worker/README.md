# Bot worker (TV2)

Worker nhận từng ván qua BullMQ, đọc snapshot mã/choices từ PostgreSQL, chạy engine chuẩn,
lưu stream/kết quả và phát tín hiệu Redis. Chạy bot mô phỏng và bot Python qua Docker/Podman.

`pnpm dev:worker`; `pnpm --filter @arena/worker benchmark`.
Hướng dẫn cấu hình, API, giới hạn, kiểm thử và checklist: [TV2_ACCEPTANCE](../../docs/TV2_ACCEPTANCE.md).

Bot mới có trạng thái pending cho tới khi worker kiểm thử hai màu thành công.
Trận chính thức có priority 1, validation 5, đấu thử 10; job đang chạy không bị ngắt để nhường chỗ.
Chạy nhiều worker bằng WORKER_ID riêng, cùng DB/Redis/QUEUE_PREFIX; admin health có danh sách heartbeat.
