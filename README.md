# BOT ARENA — Cuộc thi Bot Oẳn Tù Tì

Nền tảng web cho cuộc thi lập trình bot cờ búa/kéo/bao (OTTv2) dành cho sinh viên năm nhất, xây theo
*Đề án cuộc thi Bot Oẳn Tù Tì — bản tổng hợp 13/10/2026*.
Hệ thống nhận bài, kiểm thử cách ly, chạy trận tự động, tổ chức sơ loại Swiss chọn 32 đội, quản lý
vòng chính và chung kết đổi luật, cấp chứng nhận có trang xác minh.

**Biến thể đã chốt:** bàn cờ OTTv2 9×9. Bot nhận thế cờ và danh sách nước hợp lệ, trả về một nước đi.

## Luật OTTv2

```
     A  B  C  D  E  F  G  H  I
 9   .  .  .  .  .  .  .  .  ★   ← đích của Xanh
 8   .  .  .  .  p  r  .  .  .
 7   .  .  .  .  s  p  r  .  .
 6   .  .  .  .  .  s  p  r  .
 5   .  P  S  .  .  .  s  p  .
 4   .  R  P  S  .  .  .  .  .
 3   .  .  R  P  S  .  .  .  .
 2   .  .  .  R  P  .  .  .  .
 1   ★  .  .  .  .  .  .  .  .   ← đích của Hồng
```
Chữ hoa: Xanh, chữ thường: Hồng. R = Búa, P = Bao, S = Kéo. Mỗi bên 3 Búa, 4 Bao, 3 Kéo.

- Xanh đi trước. Mỗi lượt đi **một quân, một ô** theo 8 hướng (như quân vua).
- Đi vào ô có quân đối phương mà quân mình khắc thì **ăn** quân đó: Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
  Quân mình, quân đối phương **cùng loại** và quân đối phương **mạnh hơn** đều chặn đường (không đi vào được).
- **Thắng:** đưa một quân vào ô đích (Xanh → I9, Hồng → A1) hoặc ăn hết **một loại** quân của đối phương.
- Tới lượt mà không còn nước hợp lệ: **thua**.
- Lặp cùng thế cờ 3 lần hoặc quá 200 nước (mỗi bên 100): bên còn **nhiều quân hơn** thắng, bằng nhau là hòa.
- **Một trận = 2 ván đổi màu** (mỗi bot cầm Xanh một ván). Thắng ván 1 điểm, hòa 0,5; nhiều điểm hơn thắng trận.

Engine luật: [src/game/board.js](src/game/board.js) (hàm thuần, có kiểm thử riêng).

## Chạy nhanh

Deploy Railway + Turso và chuyển dữ liệu local: xem [DEPLOY.md](DEPLOY.md).

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

Kiểm thử: `npm test` (50 ca: luật bàn cờ, ghép Swiss, tranh suất ranh giới, bot lỗi/treo/gian lận, chạy lại, khóa phiên bản, phân quyền, người chơi).

## Chức năng (đối chiếu mục 05 của đề án)

| Khu vực | Đã làm |
|---|---|
| Trang chủ & hướng dẫn | Nút Nộp bot / Chơi thử, quỹ thưởng, lịch giai đoạn, thông báo, thể lệ, giao diện bot, tải bot mẫu |
| Tài khoản & đội | Đăng ký, đăng nhập, lập đội 2-4 người, mã mời, chuyển đội trưởng, mời rời; khóa đổi thành viên khi Swiss khóa |
| Bot của tôi | Tải/kéo thả hoặc dán mã, kiểm thử cách ly, xem lỗi + log + mã, lưu phiên bản (SHA-256, người nộp, giờ máy chủ, môi trường), đội trưởng chọn bản thi |
| Chơi thử | Người đánh cờ với 4 bot mẫu, chọn màu, máy chủ kiểm tra mọi nước; không tính điểm |
| Chạy thử bot | Bot vs 4 bot mẫu, 1 trận đang chạy/đội, 20 trận/ngày, xem lại từng ván trên bàn cờ |
| Thách đấu | Đội mời bot đội khác đấu giao hữu, đội kia đồng ý mới chạy, không tính điểm |
| Đấu chính thức | Hàng đợi + worker chạy tự động; tắt trình duyệt không ảnh hưởng |
| Xếp hạng | Điểm Swiss, ĐTB đối thủ, hiệu số, ranh giới Top 32, trạng thái tạm/đã xác nhận, nhánh 32 → chung kết, bảng thưởng |
| Phòng chung kết | Soạn bảng khắc chế mới, chọn ngẫu nhiên một trận lịch sử (xem lại được), đếm giờ theo máy chủ, chỉ hai đội chung kết nhận luật, nộp bản riêng, khóa khi hết giờ |
| Thành tích | Vòng cao nhất, giải, chứng nhận điện tử có mã + trang xác minh in được |
| Hỗ trợ & quản trị | Khiếu nại, khóa vòng, ghép vòng, xác nhận vòng, chạy lại trận, rút đội, giải phụ, cấp chứng nhận, nhật ký |

### Reset giải để đấu lại

Admin có thể vào **Quản trị → Tài khoản mẫu** để tạo thí sinh giả mà không reset dữ liệu. Chọn chỉ tài khoản hoặc tài khoản kèm đội (2–4 thành viên/đội), tùy chọn nộp bot mẫu, đặt mật khẩu chung và tải danh sách đăng nhập CSV. Mỗi lần có mã đợt riêng để tránh trùng dữ liệu demo cũ. Đội chỉ được tạo trước khi khóa Swiss; bot được worker kiểm thử như bài nộp thường. Tính năng không tạo admin và không tự bắt đầu giải.

Để chỉ chạy lại vòng gần nhất, dùng **Quản trị → Điều hành → Chạy lại vòng hiện tại**. Hỗ trợ Swiss và vòng loại trực tiếp; giữ cặp đấu, bot đã khóa, seed và lịch sử chạy. Swiss cần xác nhận lại kết quả. Vòng loại trực tiếp dựng lại nhánh kế tiếp theo kết quả mới; chứng nhận cũ bị thu hồi và cần cấp lại. Chờ trận đang chạy hoàn tất; không chạy lại vòng trước khi vòng sau đã bắt đầu hoặc khi phiên chung kết đã phát luật cho hai đội bán kết thắng.

Trong **Quản trị → Điều hành → Reset giải đấu**, nhập `RESET` để xác nhận. Chờ mọi tác vụ đang chạy hoàn tất trước khi reset.

Thao tác xóa trận thi chính thức và lịch sử chạy, bảng điểm, nhánh đấu, phiên chung kết, giải thưởng và chứng nhận. Tài khoản, đội, bài nộp, trận chơi thử, thách đấu và nhật ký được giữ. Bản thi chung kết chuyển về bản thường hợp lệ mới nhất của đội (nếu có). Mở lại lập đội và nộp bài; giữ cấu hình số vòng Swiss. Sau đó khóa bản Swiss và bắt đầu vòng 1. Dữ liệu đã xóa không thể hoàn tác.

## Giao diện bot

```python
import random

def make_move(state):
    # me / opponent: "blue" | "pink"      my_goal / opponent_goal: "I9" | "A1"
    # beats: {"ROCK": ["SCISSORS"], ...}   board: {"B4": {"side": "blue", "type": "ROCK"}, ...}
    # my_pieces, opponent_pieces, history, ply, max_plies
    # legal_moves: [{"from": "B4", "to": "C5", "capture": None | "SCISSORS"}, ...]
    return random.choice(state["legal_moves"])   # hoặc ["B4", "C5"] hoặc "B4-C5"
```

- Nước sai, lỗi (exception) hoặc quá 200 ms CPU: hệ thống đi thay một nước hợp lệ ngẫu nhiên (theo seed) và ghi lỗi;
  lỗi lần thứ 3 trong ván thì **thua ván**.
- Quá 1 giây không trả lời, crash, thoát: bot bị dừng và **thua ván** đó (ván sau khởi động lại).
- Bàn cờ công khai nên bot luôn thấy toàn bộ thế cờ và các nước đã đi trong ván.
- `random` được đặt seed theo ván, nên chạy lại cho đúng diễn biến cũ (tra soát được).
- Bot mẫu trong [sample-bots/](sample-bots/): khởi đầu, ngẫu nhiên, tham ăn, lao về đích, nhìn trước một nước.

## Thể thức đã cài

- **Trận:** 2 ván đổi màu, nhiều ván thắng hơn thì thắng trận. Swiss: thắng 3, hòa 1, thua 0, bye 3 (không cộng hiệu số).
- **Ghép Swiss:** vòng 1 bốc thăm theo seed (lưu vào nhật ký); các vòng sau ghép trong nhóm điểm, quay lui để tránh tái đấu.
  Số lẻ: bye cho đội chưa nghỉ, ít điểm nhất; nếu chọn đó buộc phải tái đấu thì thử ứng viên kế tiếp.
  Tái đấu không thể tránh thì vẫn ghép và báo số lần trong nhật ký.
- **Xếp hạng:** điểm → điểm TB cuối sơ loại của đối thủ thực sự đã gặp (bye không tính) → hiệu số ván thắng-thua.
- **Ranh giới Top 32:** chỉ nhóm bằng hoàn toàn vắt qua vị trí 32 phải tranh suất. Nhóm ≤ 10: loại trực tiếp rút gọn
  (K−S trận, miễn đấu theo bốc thăm). Nhóm > 10: thêm đúng một vòng trong nhóm rồi loại rút gọn phần còn lại
  (50 đội/32 suất = 25 + 18 = 43 trận như ví dụ đề án). Đội bằng điểm nhưng chắc suất: bốc thăm phân hạt giống.
- **Vòng chính:** hạt giống 2–42 kiểu chuẩn; vòng 32/16/tứ kết 1 trận; bán kết đủ 3 trận; chung kết thắng 2/3.
  Hòa: thêm 2 ván đổi màu, vẫn hòa thì bốc thăm theo seed trận. Dưới 32 đội: cặp thiếu đối thủ thì đội còn lại đi tiếp.
- **Phiên bản:** khóa theo giai đoạn (bảng `entries`). Đổi bản sau khi khóa chỉ áp dụng cho giai đoạn sau.
- **Chạy lại:** trận (`matches`) tách khỏi lần chạy (`runs`); điểm tính lại từ kết quả trận nên không cộng hai lần.
- **Thưởng:** tự tính và cộng dồn theo đội: Top 32 (200k), bán kết (1,5tr), nhì (3tr), nhất (5tr), 2 giải phụ (800k) do BTC trao. Tổng 19.000.000đ.

## Kiến trúc

Database lưu tài khoản (`users`), nhóm/đội (`teams`), phiên bản và mã nguồn bot (`submissions.source_code`), kết quả trận (`matches`), lịch sử các lần chạy, nước đi và log (`runs`). Mật khẩu được băm scrypt. Bot mới được lưu trực tiếp vào database; worker tạo file Python trong `data/bots/` khi cần chạy và kiểm tra SHA-256. File bị mất có thể tạo lại từ database. Khi nâng cấp, hệ thống nạp mã bot cũ từ file vào database; các bài thiếu file được báo trong log và cần khôi phục riêng.

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
| `MAX_PLIES`, `CPU_MS_PER_MOVE`, `SWISS_ROUNDS`, `PRACTICE_PER_DAY` | 200, 200, 10, 20 | Thông số thể thức |

## An toàn khi chạy mã thí sinh — đọc trước khi mở thi

- Chế độ `process` (mặc định) chặn ở mức Python bằng audit hook: import socket/subprocess/ctypes, `os.system`,
  đọc tệp ngoài thư mục bot, ghi tệp ngoài thư mục bot; trên Linux thêm giới hạn RAM 256 MB. Không truyền biến
  môi trường bí mật cho bot. **Đây không phải sandbox đủ an toàn cho mã công khai**; chỉ dùng khi phát triển.
- Chế độ `docker`: mỗi bot chạy trong container `--network none`, `--memory 256m`, `--cpus 1`, `--pids-limit`,
  hệ thống tệp chỉ đọc. Cần Docker trên máy worker và image `python:3.11-slim`.
- Theo đề án: nếu bộ chạy chưa an toàn thì chỉ mở thông tin/đăng ký (Quản trị → Cài đặt → khóa nhận bài).
- Web không tự bảo đảm việc không dùng AI ở chung kết: cần phòng thi, máy cấu hình sẵn và giám sát.

## Hiệu năng đo được (máy dev Windows, `process`, 4 trận đồng thời)

Một trận 2 ván với bot mẫu khoảng 0,2–0,6 giây. Demo 40 đội: 10 vòng Swiss (190 trận) + vòng chính + chung kết xong trong ≈ 46 giây.
Ước lượng 500 đội × 10 vòng ≈ 2.500 trận ≈ 5–10 phút chạy thuần với bot nhẹ; bot tìm kiếm sâu (dùng gần hết 200 ms/nước)
có thể lâu hơn nhiều. Cần benchmark lại với bot thật và chế độ `docker` trước khi công bố năng lực (đề án mục 09).

## Những điểm đề án để mở, đã chốt cùng người dùng hoặc tự chốt (có thể đổi)

- Đi vào quân đối phương mạnh hơn: **cấm** (chặn đường như quân cùng loại).
- Hết nước đi: thua. Lặp 3 lần hoặc quá 200 nước: so số quân, bằng nhau là hòa.
- Một trận Swiss: 2 ván đổi màu. Hiệu số dùng để xếp hạng là ván thắng trừ ván thua.
- Nước sai/lỗi: hệ thống đi thay, lỗi thứ 3 thì thua ván. Quá 1 giây: bot bị dừng, thua ván.
- Kiểm thử hợp lệ: mỗi màu một ván 40 nước với bot ngẫu nhiên, không có nước lỗi nào thì hợp lệ.
- Chung kết đổi luật: đổi **bảng khắc chế** giữa ba loại quân (thế cờ, ô đích, giới hạn nước giữ nguyên).
  Dữ liệu phát cho hai đội: kết quả và toàn bộ nước đi của các ván trong một trận Swiss chọn ngẫu nhiên (ẩn tên đội).
- Xem trận: đội trong trận xem lại toàn bộ ván nhưng chỉ thấy lỗi/log của bot mình; người ngoài chỉ thấy kết quả từng ván,
  trừ giai đoạn bật công khai (mặc định chung kết); quản trị thấy hết.
- Bản hợp lệ đầu tiên tự thành bản thi; trong phiên chung kết, bản chung kết hợp lệ đầu tiên tự thay thế.
- Thách đấu: đội A mời bot đội B đấu giao hữu 2 ván, chỉ chạy khi đội B đồng ý và chọn phiên bản bot; không tính điểm, chỉ hai đội xem được;
  mỗi đội 10 lời mời/ngày, hết hạn sau 24 giờ, quản trị có nút khóa.
- Chưa làm: người vs người (hai người tự đánh cờ); xuất PDF chứng nhận (dùng In → Lưu PDF trên trang xác minh); gửi email.

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
public/                         index.html, app.css, app.js, admin.js, board.js (vẽ bàn cờ, xem lại ván)
sample-bots/                    bot mẫu cho thí sinh và cho chạy thử
scripts/demo.js, create-admin.js
test/                           node:test
```
