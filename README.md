# BOT ARENA — Cuộc thi Bot Oẳn Tù Tì

Nền tảng web cho cuộc thi lập trình bot búa/kéo/bao dành cho sinh viên năm nhất, xây theo
*Đề án cuộc thi Bot Oẳn Tù Tì — bản tổng hợp 13/10/2026*.
Hệ thống nhận bài, kiểm thử cách ly, chạy trận tự động, tổ chức sơ loại Swiss chọn 32 đội, quản lý
vòng chính và chung kết đổi luật, cấp chứng nhận có trang xác minh.

**Biến thể đã chốt:** chọn búa/kéo/bao theo lượt (bot trả `ROCK` / `PAPER` / `SCISSORS`).
Bàn cờ 9×9 không nằm trong phạm vi mùa này.

## Chạy nhanh

Cần **Node.js ≥ 22.13** (dùng `node:sqlite` có sẵn, không cần cài CSDL) và **Python 3.11+**.

```bash
npm install
npm run demo -- --reset        # (tùy chọn) dựng một giải diễn tập đầy đủ 40 đội
npm start                      # http://localhost:3000
```

Tài khoản demo: quản trị `admin@arena.local` / `admin12345`; thí sinh `sv1_1@demo.local` / `matkhau123`.

Dừng demo ở một trạng thái để xem giao diện:
`npm run demo -- --reset --teams 60 --stop final-room` (`swiss` | `bracket` | `final-room` | `none`).

Hệ thống thật (không dùng demo): tạo quản trị viên rồi mở web.

```bash
npm run create-admin -- btc@truong.edu.vn "Ban tổ chức" matkhau-manh
npm start
```

Kiểm thử: `npm test` (37 ca: luật, ghép Swiss, tranh suất ranh giới, bot lỗi, chạy lại, khóa phiên bản, phân quyền).

## Chức năng (đối chiếu mục 05 của đề án)

| Khu vực | Đã làm |
|---|---|
| Trang chủ & hướng dẫn | Nút Nộp bot / Chơi thử, quỹ thưởng, lịch giai đoạn, thông báo, thể lệ, giao diện bot, tải bot mẫu |
| Tài khoản & đội | Đăng ký, đăng nhập, lập đội 1-3 người, mã mời, chuyển đội trưởng, mời rời; khóa đổi thành viên khi Swiss khóa |
| Bot của tôi | Tải/kéo thả hoặc dán mã, kiểm thử cách ly, xem lỗi + log + mã, lưu phiên bản (SHA-256, người nộp, giờ máy chủ, môi trường), đội trưởng chọn bản thi |
| Chơi thử | Người vs bot mẫu; máy chủ chốt nước bot trước rồi mới phân xử, không tính điểm |
| Chạy thử bot | Bot vs 4 bot mẫu, 1 trận đang chạy/đội, 20 trận/ngày, xem từng lượt và lỗi |
| Đấu chính thức | Hàng đợi + worker chạy tự động; tắt trình duyệt không ảnh hưởng |
| Xếp hạng | Điểm Swiss, ĐTB đối thủ, hiệu số, ranh giới Top 32, trạng thái tạm/đã xác nhận, nhánh 32 → chung kết, bảng thưởng |
| Phòng chung kết | Soạn luật mới, chọn ngẫu nhiên dữ liệu một trận lịch sử, đếm giờ theo máy chủ, chỉ hai đội chung kết nhận luật, nộp bản riêng, khóa khi hết giờ |
| Thành tích | Vòng cao nhất, giải, chứng nhận điện tử có mã + trang xác minh in được |
| Hỗ trợ & quản trị | Khiếu nại, khóa vòng, ghép vòng, xác nhận vòng, chạy lại trận, rút đội, giải phụ, cấp chứng nhận, nhật ký |

## Giao diện bot

```python
import random

def make_move(state):
    # turn, total_turns, moves, beats, my_moves, opponent_moves, results
    return random.choice(state["moves"])
```

- Trả về một chuỗi trong `state["moves"]`. Sai lựa chọn, lỗi hoặc quá 100 ms CPU: thua lượt đó.
- Quá 1 giây không trả lời: bot bị dừng, thua các lượt còn lại (tránh treo trận).
- **Quyền dữ liệu:** trước chung kết `opponent_moves` và `results` là `None` (đề án mục 04).
  Mỗi giai đoạn có cờ `reveal_opponent`; mặc định chỉ chung kết bật.
- `random` được đặt seed theo trận, nên chạy lại cho đúng kết quả cũ (tra soát được).
- Mẫu: [sample-bots/starter_bot.py](sample-bots/starter_bot.py).

## Thể thức đã cài

- **Trận:** 100 lượt, thắng nhiều lượt hơn thì thắng, bằng nhau hòa. Swiss: thắng 3, hòa 1, thua 0, bye 3 (không cộng hiệu số).
- **Ghép Swiss:** vòng 1 bốc thăm theo seed (lưu vào nhật ký); các vòng sau ghép trong nhóm điểm, quay lui để tránh tái đấu.
  Số lẻ: bye cho đội chưa nghỉ, ít điểm nhất; nếu chọn đó buộc phải tái đấu thì thử ứng viên kế tiếp.
  Tái đấu không thể tránh thì vẫn ghép và báo số lần trong nhật ký.
- **Xếp hạng:** điểm → điểm TB cuối sơ loại của đối thủ thực sự đã gặp (bye không tính) → hiệu số lượt.
- **Ranh giới Top 32:** chỉ nhóm bằng hoàn toàn vắt qua vị trí 32 phải tranh suất. Nhóm ≤ 10: loại trực tiếp rút gọn
  (K−S trận, miễn đấu theo bốc thăm). Nhóm > 10: thêm đúng một vòng trong nhóm rồi loại rút gọn phần còn lại
  (50 đội/32 suất = 25 + 18 = 43 trận như ví dụ đề án). Đội bằng điểm nhưng chắc suất: bốc thăm phân hạt giống.
- **Vòng chính:** hạt giống 1–32 kiểu chuẩn; vòng 32/16/tứ kết 1 trận; bán kết đủ 3 trận; chung kết thắng 2/3.
  Hòa: thêm 100 lượt, vẫn hòa thì bốc thăm theo seed trận. Dưới 32 đội: cặp thiếu đối thủ thì đội còn lại đi tiếp.
- **Phiên bản:** khóa theo giai đoạn (bảng `entries`). Đổi bản sau khi khóa chỉ áp dụng cho giai đoạn sau.
- **Chạy lại:** trận (`matches`) tách khỏi lần chạy (`runs`); điểm tính lại từ kết quả trận nên không cộng hai lần.
- **Thưởng:** tự tính và cộng dồn theo đội: Top 32 (200k), bán kết (1,5tr), nhì (3tr), nhất (5tr), 2 giải phụ (800k) do BTC trao. Tổng 19.000.000đ.

## Kiến trúc

```
Trình duyệt ── public/ (HTML/CSS/JS thuần, không cần build)
    │
Express API ── src/routes/api.js  (phân quyền phía máy chủ, cookie HMAC httpOnly)
    │
SQLite (WAL) ── src/db.js  ── data/arena.db, data/bots/
    │
Hàng đợi jobs (ưu tiên: thi chính thức → kiểm tra bài → chạy thử)
    │
Worker ── src/runner/  ── tiến trình Python bot_host.py (JSON từng dòng qua stdin/stdout)
```

Website không chạy mã thí sinh trực tiếp; worker có thể tách sang máy khác:
web `EMBEDDED_WORKER=false npm start`, máy chạy bot `npm run worker` (cùng `DATA_DIR`, ví dụ ổ chia sẻ).
Worker mất nhịp tim 60 giây thì tác vụ được đưa lại hàng đợi.

### Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng web |
| `APP_SECRET` | `dev-secret-change-me` | **Bắt buộc đổi** khi chạy thật (ký phiên đăng nhập) |
| `DATA_DIR` | `./data` | CSDL và bài nộp |
| `BOT_SANDBOX` | `process` | `docker` khi thi thật |
| `MATCH_CONCURRENCY` | 4 | Số trận đồng thời (đề án: thử nâng lên 8 sau benchmark) |
| `EMBEDDED_WORKER` | `true` | Chạy worker chung tiến trình web |
| `PYTHON_BIN` | `python` / `python3` | Trình thông dịch Python |
| `MATCH_TURNS`, `EXTRA_TURNS`, `SWISS_ROUNDS`, `PRACTICE_PER_DAY` | 100, 100, 10, 20 | Thông số thể thức |

## An toàn khi chạy mã thí sinh — đọc trước khi mở thi

- Chế độ `process` (mặc định) chặn ở mức Python bằng audit hook: import socket/subprocess/ctypes, `os.system`,
  đọc tệp ngoài thư mục bot, ghi tệp ngoài thư mục bot; trên Linux thêm giới hạn RAM 256 MB. Không truyền biến
  môi trường bí mật cho bot. **Đây không phải sandbox đủ an toàn cho mã công khai**; chỉ dùng khi phát triển.
- Chế độ `docker`: mỗi bot chạy trong container `--network none`, `--memory 256m`, `--cpus 1`, `--pids-limit`,
  hệ thống tệp chỉ đọc. Cần Docker trên máy worker và image `python:3.11-slim`.
- Theo đề án: nếu bộ chạy chưa an toàn thì chỉ mở thông tin/đăng ký (Quản trị → Cài đặt → khóa nhận bài).
- Web không tự bảo đảm việc không dùng AI ở chung kết: cần phòng thi, máy cấu hình sẵn và giám sát.

## Hiệu năng đo được (máy dev Windows, `process`, 4 trận đồng thời)

Một trận 100 lượt khoảng 0,15 giây. Demo 60 đội: 10 vòng Swiss (≈ 290 trận) + vòng chính + chung kết xong trong ≈ 25 giây.
Ước lượng 500 đội × 10 vòng ≈ 2.500 trận ≈ 2–4 phút chạy thuần. Chế độ `docker` chậm hơn đáng kể vì khởi động container,
cần benchmark lại trước khi công bố năng lực (đề án mục 09).

## Những điểm đề án để mở, đã tự chốt (có thể đổi)

- Bot hết 1 giây chờ bị dừng hẳn (thua các lượt còn lại) thay vì chỉ thua lượt đó, để tránh bot treo làm nghẽn worker.
- Kiểm thử hợp lệ: 20 lượt với bot ngẫu nhiên, không có lượt lỗi nào thì hợp lệ.
- Dữ liệu chung kết: chuỗi kết quả W/L/D từng lượt của một trận Swiss đã xác nhận chọn ngẫu nhiên (ẩn tên đội), tùy chọn kèm lựa chọn.
- Xem trận ở giai đoạn giấu dữ liệu: người ngoài chỉ thấy tỉ số; đội trong trận chỉ thấy lựa chọn và log của mình; quản trị thấy hết.
- Bản hợp lệ đầu tiên tự thành bản thi; trong phiên chung kết, bản chung kết hợp lệ đầu tiên tự thay thế.
- Chưa làm: người vs người, thách đấu bot đội khác (đề án ghi chưa ưu tiên); xuất PDF chứng nhận (dùng In → Lưu PDF trên trang xác minh); gửi email.

## Cấu trúc thư mục

```
src/
  server.js, worker.js, handlers.js, config.js, db.js, auth.js, rules.js
  routes/api.js                 API công khai, thí sinh, quản trị
  runner/bot_host.py, bot.js, match.js
  services/swiss.js             ghép cặp, xếp hạng, ranh giới, hạt giống (hàm thuần)
  services/tournament.js        khóa bản, vòng Swiss, tranh suất, nhánh, chạy trận
  services/submissions.js       nộp & kiểm thử bài
  services/results.js           thưởng, chứng nhận, phòng chung kết
  services/queue.js, play.js
public/                         index.html, app.css, app.js, admin.js
sample-bots/                    bot mẫu cho thí sinh và cho chạy thử
scripts/demo.js, create-admin.js
test/                           node:test
```
