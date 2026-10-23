# Bàn giao TV2 — Bot Arena

Nhánh local: `bot-engine-sandbox`. Phạm vi là backend/API/worker, engine và giao thức bot.
UI bàn cờ, nút replay, chọn kín và điều phối trận nhiều hiệp thuộc TV4. Không thay thiết kế UI trong đợt này.

## 1. Tiêu chí từng gói

| Gói | Đầu ra để nghiệm thu |
| --- | --- |
| Nhận mã/GitHub/phiên bản | Nộp Python trực tiếp hoặc một file từ GitHub theo SHA 40 ký tự; lưu mã, SHA-256, repo/commit/path, người nộp, log. Đánh số phiên bản trong transaction có khóa theo đội. AST kiểm tra cú pháp, worker kiểm thử thực thi hai màu rồi mới đánh dấu `valid`. |
| Engine/Python | Một engine chuẩn cho ván mới, 20 vị trí đúng sơ đồ, 9 tổ hợp quân thêm, di chuyển/ăn/chặn, đích, hết một loại quân, hết nước, lặp ba lần, giới hạn 200 nước. `make_move(state)` và bot mẫu được công bố. |
| Sandbox/queue/phục hồi | Docker hoặc Podman, chặn mạng, filesystem chỉ đọc, RAM/CPU/PID/output/wall time; watchdog host dọn container nếu worker chết. Outbox, ưu tiên trận chính thức, heartbeat từng worker, lease/fencing, retry cùng dữ liệu và kết quả hiệu lực duy nhất. |
| Đấu thử/hợp đồng TV4 | Bot mẫu hoặc phiên bản cùng đội; giới hạn tần suất; chọn màu/quân thêm độc lập qua API. Lưu seed, luật, bàn đầu, giới hạn, nước có loại quân/capture và kết quả. Source/log riêng có kiểm tra quyền. Không cộng điểm giải. |
| Test/benchmark/vận hành | Unit/engine, test GitHub, test DB/Redis riêng, test container thật, luồng browser thật; benchmark có báo cáo máy/runtime/workload/concurrency và giới hạn đo. |

Phiên bản mã đã nhận không đổi khi repository thay đổi. Trạng thái kiểm thử có thể chuyển `pending → valid/invalid`.
Kiểm thử thành công không đảm bảo bot sẽ đúng trên mọi trạng thái; trận thật vẫn có trọng tài kiểm nước đi.

## 2. Bố trí và luật chuẩn

`rulesetId=standard-32-4`, bàn 9×9; cột A–I, hàng 1–9.

| Nhóm | Xanh | Hồng |
| --- | --- | --- |
| Búa, khi quân thêm là Bao | A2, A3, A4 | I6, I7, I8 |
| Bao, khi quân thêm là Bao | B2, C2, B3, C3 | G7, H7, G8, H8 |
| Kéo, khi quân thêm là Bao | B1, C1, D1 | F9, G9, H9 |
| Đích phải tới | I9 | A1 |

A1/I9 ban đầu trống. Loại quân thêm chiếm cụm 2×2, hai rìa mang hai loại còn lại, mỗi loại 3 quân.
Hai đội chọn độc lập. Thắng tung xu được gán Xanh và đi trước; engine nhận màu đã khóa, không tự tung lại xu.
Ván cũ `demo-ottv2-0` vẫn đọc bằng luật cũ để bảo toàn replay. Mọi ván mới/phòng chờ dùng chuẩn.

Mỗi nước đi 1 ô theo 8 hướng. Không đi vào quân mình, cùng loại hoặc loại khắc chế mình.
Búa ăn Kéo; Kéo ăn Bao; Bao ăn Búa. Thắng ngay khi tới đích, ăn hết một loại quân đối phương hoặc đối phương hết nước hợp lệ.
Lặp thế cờ cùng lượt đi lần thứ ba hoặc đủ 200 nước tổng: nhiều quân hơn thắng, bằng nhau hòa.
Sau khi ván kết thúc không được áp thêm nước.

Hai nước sai hợp lệ về cấu trúc được trọng tài thay bằng nước đầu tiên; nước sai thứ ba thua.
Crash/không nạp được bot/quá hạn bot thua; lỗi runtime container/DB/Redis là lỗi hạ tầng, không tự cộng thắng cho đối thủ.

## 3. Giao thức Python

Một file UTF-8, tối đa 500.000 ký tự và tối đa 500 KB khi lấy từ GitHub; thư viện chuẩn Python.
Image có thể do BTC chuẩn bị nếu cần thư viện khác. Không tự cài dependency do thí sinh chỉ định.
Hàm đồng bộ `def make_move(state)` nhận đúng một tham số, không dùng decorator.

Payload có `protocol_version`, `ruleset_id`, `board_size`, `goals`, `max_plies`, `my_side`, `turn`, `ply`,
`board`, `pieces_left`, `legal_moves`, `last_move`, `seed`. Bàn là ánh xạ ô → `{side,type}`;
loại quân là `ROCK/PAPER/SCISSORS`; màu `blue/pink`; ô trống không có trong ánh xạ.
Trả `{ "from": "A2", "to": "B2" }`; có thể trả trực tiếp một phần tử `legal_moves`.
Không in debug ra stdout; stderr được đọc có giới hạn. Dùng `seed/ply` khi cần ngẫu nhiên xác định.

Bot mẫu: `apps/worker/examples/greedy.py`, `random_bot.py`.

## 4. API nghiệm thu

Prefix `/api/v1`; đăng nhập và quyền thực hiện ở server. Source và log không đưa ra kênh khán giả.

| API | Hành vi |
| --- | --- |
| `POST /bots` | Nộp `{teamId,label,sourceCode}` hoặc `{teamId,label,githubRepo,commitSha,sourcePath?}`; không gửi cả hai nguồn. |
| `GET /bots`, `GET /bots/:id/source` | Danh sách của đội và mã/log/nguồn GitHub riêng; chờ status `valid` trước khi đấu thử. |
| `POST /bots/:id/test-runs` | `{botVersionId,opponentType:"demo"|"bot",opponentTarget,mySide?,extraType?,opponentExtraType?}`. Bot đối thủ phải thuộc đội mình hoặc là policy mẫu. |
| `GET /test-runs/:id`, `GET /bots/:id/test-runs` | Kết quả/log theo quyền; endpoint chi tiết có đủ metadata replay. |
| `POST /stages/:id/bot-selection` | Đội trưởng chọn `{teamId,botVersionIds}`; sơ loại 1, knockout 1–3 bot hợp lệ. |
| `POST /stages/:id/bot-selection/lock` | BTC/trọng tài chốt sớm; sau chốt/hạn khóa không thay được bộ bot. |
| `GET /stages/:id/bot-selection/:teamId` | Đọc bộ bot của đội mình hoặc staff. Nộp bản mới không thay bộ đã khóa. |
| `GET /admin/bots/duplicates` | Báo cáo trùng chính xác cho BTC; không tự loại đội. |
| `GET /games/:id/bot-diagnostics` | Log riêng trận chính thức, chỉ trả log bên sở hữu hoặc staff. |

TV4 gọi `createGameJob` với `stageId` cho ván chính thức, màu/đội và bot đã khóa.
Service kiểm bot có thuộc bộ khóa trước khi tạo job. Không gọi worker trực tiếp từ trình duyệt.
`GameRequest` chạy một ván, không tự chấm cả trận 5+2 hiệp. Retry giữ nguyên choices/seed/ruleset/limits.
Khán giả dùng snapshot + stream `game.move`; snapshot có `initialBoard`, `maxPlies`, `rulesetId`.

## 5. Cấu hình chạy

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm dev
# Terminal khác
pnpm dev:worker
```

Máy nghiệm thu đã cấu hình `.env` dùng Podman và image `docker.io/library/python:3.12` sẵn có.
Máy khác: đặt `BOT_SANDBOX_MODE=docker`; `BOT_CONTAINER_CMD=docker` hoặc đường dẫn Podman;
`BOT_SANDBOX_IMAGE` là image đã tải, nên pin digest khi phát hành. Không tự fallback về local.
`BOT_SANDBOX_MODE=trusted-local` chỉ là demo mã tin cậy, không đáp ứng cách ly. Production từ chối chế độ này.
Worker kiểm runtime/image ngay lúc khởi động. `PYTHON_CMD` cấu hình Python cho AST/API và local nếu cần.

Container: không mạng, root filesystem chỉ đọc, mount riêng thư mục bot chỉ đọc, user 65534,
không capabilities, no-new-privileges, 128 MiB RAM/swap, 32 PID, 16 MiB tmpfs, tổng output ≤1 MiB.
Quota CPU theo ngân sách 200 ms/1 giây; wrapper cũng đo CPU của tiến trình Python mỗi nước.
Bot nạp module tối đa 3 giây sau khi Python sẵn sàng; runtime container có cửa sổ khởi tạo riêng 15 giây.
Nước đi tối đa 1 giây wall. Watchdog host giới hạn cả vòng đời và dọn container độc lập với worker.

GitHub public không cần token. Repo riêng: `GITHUB_BOT_TOKEN` chỉ nằm trên server;
`GITHUB_BOT_PRIVATE_REPOS={"team_alpha":["owner/repo"]}` giới hạn repository được cấp quyền theo đội.
Không đưa token vào URL, source, browser hay log. Chỉ một file `.py`, không tải symlink/thư mục/submodule.

## 6. Lệnh và checklist nghiệm thu

Chạy cả bộ nghiệm thu backend TV2 bằng **`pnpm tv2:acceptance`**.
Lệnh này bật test container thật, chạy build/typecheck/unit/integration và ghi kết quả vào `TV2_TEST_RESULTS.json`.
Các dịch vụ DB/Redis và container runtime trong `.env` phải sẵn sàng.

- `pnpm build`, `pnpm typecheck`, `pnpm test`.
- `pnpm test:integration`: tạo schema PostgreSQL riêng, seed riêng, queue prefix riêng và dọn schema đó khi xong.
- `ARENA_TEST_CONTAINER=1` rồi `pnpm --filter @arena/worker test:container`: kiểm cách ly thực tế; PowerShell đặt `$env:ARENA_TEST_CONTAINER='1'`.
- Web/API/worker đang chạy: `pnpm exec playwright test --config tests/live/playwright.config.ts`.
- `pnpm --filter @arena/worker benchmark`; `BENCHMARK_SAMPLES` và `BENCHMARK_OUTPUT` chọn lượng mẫu/đầu ra.

1. Nộp bot mẫu greedy → pending → valid; bot sai cú pháp hoặc sai nước → invalid, không được đấu thử.
2. Nộp đồng thời hai bản: số version khác nhau; source/hash/commit của bản cũ giữ nguyên.
3. Đấu với policy mẫu và bản khác cùng đội; hai màu chọn quân thêm khác nhau; replay dựng đúng bàn đầu/cuối.
4. Tài khoản đội khác không xem source/kết quả riêng hoặc dùng bot đối thủ làm bot đấu thử.
5. Chọn bot theo stage, BTC chốt hoặc qua hạn khóa: thay bộ bị từ chối; nộp bản mới không làm đổi bộ khóa.
6. Mất Redis/API restart/worker chết giữa ván: outbox/lease phục hồi, seed/xu giữ nguyên, chỉ một kết quả hiệu lực.
7. Bot thử mạng/file/RAM bị chặn; bot crash/timeout có lý do; lỗi container được phân biệt với lỗi bot.
8. Đọc báo cáo `TV2_BENCHMARK_2026_10_23.json`: máy, runtime, workload và concurrency đều ghi rõ.

Benchmark hiện là runner-only, 4 mẫu mỗi concurrency, tối đa 200 nước/ván, không đo mạng/DB/queue.
Không nhân tuyến tính để cam kết cụm 4 laptop hay 1.000 đội trong 2 giờ. Nhóm nghiệm thu tải lớn theo workload giải thực tế.

## 7. Bằng chứng kiểm chứng đợt bàn giao

- `pnpm tv2:acceptance`: bốn bước đều exit code 0; 84 test unit/engine/container và 12 test tích hợp qua.
- Test browser thật: bot mới v7 qua pending → valid trong Podman, đấu thử hoàn tất 198 nước, `eliminate`.
- Client GitHub thực tế tải được snapshot public `python/cpython`, commit
  `b1e32ff4f33d93d2b876ff83da3b578e7829c8d4`, file `Lib/this.py` (1.003 byte); không thực thi mã này.
- Các kiểm thử URL/commit/path/mã trả về của GitHub dùng fixture; kho riêng cần token của kho được BTC cấp để nghiệm thu quyền thực tế.
- Cấu hình và kỳ hạn bộ bot được lưu bền vững; gia hạn lịch giai đoạn không tự mở bộ đã hết hạn khóa.
- Ván mới dùng bố trí chuẩn; lịch sử cũ giữ ruleset gốc, không sửa nước/kết quả đã lưu.
