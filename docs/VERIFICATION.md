# Kiểm chứng nền M0

## Bổ sung TV3: lịch và duyệt cấu hình (20/10/2026)

Migration `20261020160000_tournament_configuration` đã áp dụng, giữ dữ liệu cũ. `pnpm check` qua với **24 unit tests**; `pnpm test:integration` qua **7 tests**; `pnpm test:e2e` qua **3 tests**. Test mới kiểm tra thứ tự lịch, biên giờ do server xác định, quy trình duyệt cấu hình, quyền BTC/trọng tài, revision khi ghi đồng thời, rollback/audit, công bố và đóng băng. E2E đi qua tạo nháp → nhập lịch → duyệt stage/giải → mở và hủy xác nhận công bố → reload xem audit, cùng kiểm tra không tràn ngang ở 390px. Integration kiểm tra công bố thật và dọn fixture riêng; E2E để lại giải nháp đã chốt để xem lại.

Hướng dẫn và giới hạn: [TV3_CONFIGURATION.md](TV3_CONFIGURATION.md). Chốt cấu hình chưa chốt kết quả hay chạy Swiss/cây đấu. Mốc khóa được trả theo giờ server; thao tác đội/nộp bot thật vẫn chờ TV1/TV2 nối kiểm tra.

## Kết quả nền M0 ban đầu

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

## Cập nhật 22/10/2026 — TV3 điều hành thi đấu (nhánh `feat/tournaments`)

| Lệnh / nhóm kiểm tra  | Kết quả                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| prisma migrate dev    | Qua; thêm migration `tournament_competition`, không sửa migration cũ                                                     |
| pnpm check            | Qua; API thêm 10 unit test (Swiss, bye, tránh tái đấu, cắt suất/tranh suất, hạt giống, tính điểm 5+2 hiệp và bốc thăm)   |
| pnpm test:integration | 10/10 qua; thêm `competition.test.ts`                                                                                    |
| pnpm test:e2e         | 4/4 qua (thêm kiểm tra trang Giải đấu và tab Điều hành/Khiếu nại; cập nhật hai test cũ theo các tab mới của Khu vực BTC) |

`competition.test.ts` kiểm tra:

- Phân quyền: khách xem, sinh viên/trọng tài không lập kế hoạch.
- Toàn luồng 38 đội: 3 vòng Swiss, mỗi vòng 19 cặp và 0 tái đấu. Thao tác trùng bị từ chối; xác nhận chỉ sau khi đủ kết quả.
- Chốt mức có tranh suất, ra đủ 32 suất. Hạt giống 1 gặp 32. Vòng 32/16/tứ kết, mỗi cặp 5 hoặc 7 hiệp. Có Top 4.
- Khiếu nại mở chặn xác nhận. Quyết định "chấp nhận + thi lại" đặt lại kết quả; nhập lại thì `resultVersion` tăng lên 2. Không sửa được kết quả đã chốt. Có audit.

Giới hạn: kết quả đến từ mô phỏng/nhập tay vì TV4 chưa nối phòng đấu. Chưa kiểm thử quy mô 1000 đội.

## Cập nhật 24/10/2026 — TV4 phòng đấu và trận nhiều hiệp (nhánh `feat/rooms-matches`)

Nền: `main` + nhánh sửa của TV2 `codex/fix-main-registration-database` (bổ sung migration và `scripts/test-integration.mjs`).

| Lệnh / nhóm kiểm tra   | Kết quả                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prisma migrate deploy  | Qua; thêm migration `20261024090000_match_orchestration`, không sửa migration cũ                                                                        |
| build, typecheck, test | Qua (contracts 7, engine 10, web 2, worker 14, API 26)                                                                                                  |
| pnpm test:integration  | 25/25 qua trong schema riêng; thêm `matches.test.ts` (2 kịch bản, worker thật)                                                                          |
| pnpm test:e2e          | 4/4 qua (sửa test TV3 dùng `/demo-login` sau khi TV1 đổi `/login` thành đăng nhập thật)                                                                 |
| Kiểm tra giao diện     | Chromium 1440/390 px: đội trưởng thấy form chọn bot + quân thứ 10, khán giả chỉ thấy cờ "đã chọn", sau 2 hiệp công bố lựa chọn và màu; không tràn ngang |

Lint toàn repo còn lỗi `any` trong test cũ của TV2 (`bot-submission.test.ts`, `test-run.test.ts`); các file TV3/TV4 không có lỗi lint.

M0 đủ để nhóm tiếp tục phát triển từng module từ luồng demo; kết quả này không xác nhận hệ thống đủ điều kiện tổ chức giải thật.
