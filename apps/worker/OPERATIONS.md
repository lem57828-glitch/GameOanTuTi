# Vận hành worker TV2

Tài liệu nghiệm thu chuẩn: [TV2_ACCEPTANCE](../../docs/TV2_ACCEPTANCE.md).
Báo cáo đo thật: [TV2_BENCHMARK_2026_10_23.json](../../docs/TV2_BENCHMARK_2026_10_23.json).

## Một máy demo

1. Chuẩn bị PostgreSQL/Redis, Python >=3.10, Docker hoặc Podman Linux containers.
2. `BOT_SANDBOX_MODE=docker`, `BOT_CONTAINER_CMD` trỏ runtime, `BOT_SANDBOX_IMAGE` trỏ image đã tải.
3. `pnpm db:generate`, `pnpm db:migrate`, `pnpm build`.
4. `pnpm dev` và terminal khác `pnpm dev:worker`.
5. Kiểm tra `/api/v1/health`, staff xem `/api/v1/admin/health`.

Máy hiện tại đã kiểm chứng Podman với `docker.io/library/python:3.12`.
Không tự chuyển local khi runtime lỗi. `trusted-local` chỉ dùng mã do nhóm tin cậy và không đủ nghiệm thu cách ly.

## Nhiều worker

Mỗi laptop có container runtime/image cùng phiên bản. Kết nối DB/Redis trung tâm qua mạng riêng được cấp quyền.
Giữ cùng `QUEUE_PREFIX`, đặt `WORKER_ID` khác nhau, bắt đầu `WORKER_CONCURRENCY=2` rồi đo thực tế.
Không dùng chung ID giữa hai worker. Không cần chạy web/API trên từng máy.

Production: `NODE_ENV=production`, `DEMO_MODE=false`, `BOT_SANDBOX_MODE=docker`.
Địa chỉ DB/Redis và credential lấy từ môi trường được cấp, không đưa secret vào repository.
Đây là cấu hình worker; đăng nhập thật và điều phối giải do các module khác cung cấp.

## Phục hồi

- Outbox ghi cùng transaction với bot/trận thử/job, mất Redis không làm mất yêu cầu.
- GameJob lease và số attempt ngăn worker cũ ghi đè; retry giữ seed/choices và đối chiếu nước đã lưu.
- BotTestRun có lease/owner và seed/bàn đầu bền vững; bản giao lại đã hoàn tất không chạy thêm.
- Worker heartbeat hết hạn sau 10 giây; admin health giữ danh sách worker đang hoạt động.
- Container có watchdog host, mạng bị chặn và hạn tài nguyên. Lỗi hạ tầng không tự tính người chơi thua.
- Khi Docker/Podman/DB/Redis phục hồi, API quét bản ghi pending hoặc job mất khỏi Redis và đưa lại vào queue.

## Kiểm thử và tải

`pnpm test:integration` dùng schema riêng và queue riêng, có ca kill worker giữa ván, Redis mất kết nối,
API restart, outbox và một kết quả hiệu lực. `ARENA_TEST_CONTAINER=1` bật test chặn mạng/file và cgroup.

Benchmark runner đo 4 mẫu mỗi concurrency 1/2 với hai bot Python; không đo DB/queue hoặc cụm bốn máy.
Không dùng số ước lượng tuyến tính như cam kết công suất thực tế. Tăng `BENCHMARK_SAMPLES` để đo ổn định hơn
và dùng workload giải thật khi nghiệm thu khả năng phục vụ toàn trường.
