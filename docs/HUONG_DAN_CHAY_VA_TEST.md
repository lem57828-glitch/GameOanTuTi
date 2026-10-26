# Hướng dẫn chạy và kiểm thử (cho thành viên nhóm)

Làm theo thứ tự: **cài đặt lần đầu → bật hệ thống → kiểm thử tự động → thử tay các luồng**. Mọi lệnh chạy ở thư mục
gốc `GameOanTuTi` trong PowerShell.

## 1. Cài đặt lần đầu

Cần: Node.js 24, pnpm 9 (`corepack enable`), Docker Desktop, Python 3.8+ (lệnh `python` chạy được).

```powershell
pnpm install --frozen-lockfile
pnpm env:init                       # tạo .env.demo và .env.official (không commit hai file này)
docker compose --env-file .env -f infra/compose.yaml up -d   # PostgreSQL + Redis của dự án
pnpm db:generate
pnpm build
pnpm db:migrate:demo
pnpm db:seed:demo
pnpm db:migrate:official
```

> PowerShell báo `pnpm is not recognized`: chạy `$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"` (hoặc mở
> terminal mới sau `corepack enable`).

## 2. Mỗi lần pull code mới

**Dừng `dev:demo` / `dev:official` trước** (Windows khóa file Prisma khi server đang chạy), rồi:

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
pnpm db:migrate:demo
pnpm db:migrate:official
```

## 3. Bật hệ thống

Bật Docker Desktop, kiểm tra container: `docker compose --env-file .env -f infra/compose.yaml up -d`.

```powershell
pnpm dev:demo        # terminal 1 — web + API + worker bản demo
pnpm dev:official    # terminal 2 — bản chính thức (nếu cần)
```

| Bản        | Web                   | Kiểm tra API                        |
| ---------- | --------------------- | ----------------------------------- |
| Demo       | http://localhost:5173 | http://localhost:3100/api/v1/health |
| Chính thức | http://localhost:5174 | http://localhost:3101/api/v1/health |

`health` phải trả `"status":"ok"` và `"workerAlive":true`.

## 4. Kiểm thử tự động — một lệnh

```powershell
pnpm test:features             # đủ bộ, ~8 phút: unit + integration các luồng chính (cần Docker đang chạy)
pnpm test:features -- --quick  # ~2 phút: bỏ integration (không cần database)
pnpm test:features -- --live   # thêm: kiểm tra hai server đang chạy (bật bước 3 trước)
```

Cuối lệnh có bảng **ĐẠT / LỖI** cho từng bước. Các bước:

| Bước                      | Kiểm tra gì                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Engine                    | Luật chuẩn, vật cản cố định/động, ô khiên, ô đổi loại; bộ kiểm thử offline khớp engine từng nước |
| Bộ kiểm thử offline       | Script Python phát cho thí sinh chạy được                                                        |
| Unit API / web / worker   | Chấm điểm Swiss, loại trực tiếp, BO5/BO7; phòng đấu, replay; chạy bot                            |
| Integration `competition` | Sơ loại → cây 32 → Top 4 → bán kết được mở                                                       |
| Integration `matches`     | Phòng đấu, chọn kín, bot của mức, chặn xóa bot đang được chọn                                    |
| Integration `autopilot`   | Demo một thí sinh bấm "Tiếp theo" tới vô địch (bot chạy thật qua worker)                         |
| Integration `finals`      | Bán kết/chung kết offline: nhận bài USB, khóa, sandbox kiểm tra, BO5/BO7, vô địch                |

Integration tạo schema PostgreSQL riêng rồi xóa, **không đụng dữ liệu demo/chính thức**. Chạy riêng một luồng:
`pnpm test:integration -- finals`.

## 5. Thử tay các luồng (bản demo)

Dùng hai trình duyệt khác nhau (hoặc một cửa sổ ẩn danh) nếu cần đăng nhập BTC và thí sinh cùng lúc.

### 5.1 Một thí sinh, BTC tự động (nhanh nhất, đi trọn giải)

```powershell
pnpm demo:experience -- --solo --id tour_thu_<ten_ban>
```

1. http://localhost:5173/demo-login → chọn **Thí sinh demo (BTC tự động) · tour*thu*<ten_ban>**.
2. **Thi đấu của đội** → bấm **Tiếp theo** liên tục: sơ loại → 32 → 16 → tứ kết → **bán kết BO5 → chung kết BO7**
   → vô địch.
3. Tứ kết: vào phòng chọn kín bot + quân thứ 10, hoặc bấm **Dùng lựa chọn mặc định**.
4. Khung **Bán kết · Chung kết (offline)** → **Xem trực tiếp**: bàn cờ có vật cản (ô gạch chéo), ô khiên (viền xanh),
   ô đổi loại (viền vàng) và chú thích.
5. Giải đã chơi hết: chạy lại lệnh với `--id` khác để có giải mới.

Báo "Đang chờ worker kiểm thử bot": đợi vài giây rồi bấm lại.

### 5.2 Góc nhìn BTC — bán kết/chung kết nhận bài USB

1. Chơi giải ở 5.1 tới Top 4 (dừng bấm khi thấy "Bán kết: nhận bài USB").
2. Trình duyệt khác: `/demo-login` → **BTC Demo** → **Điều hành thi đấu** → chọn giải đó.
3. Khung **Bán kết**: mỗi đội chọn file `.py` (ví dụ `offline-kit/bot_mau.py`, `examples/bots/*.py`), quân thứ 10 →
   **Nhận bài** → bảng hiện SHA-256 và trạng thái kiểm tra.
4. **Khóa bài** → chờ cột Kiểm tra "Hợp lệ" → **Bắt đầu thi đấu** → **Mở phòng thi đấu** (thẻ bước chính ở trên).
5. Đấu xong → **Chốt bán kết → tạo chung kết** → lặp lại cho chung kết → **Chốt chung kết, công bố vô địch**.

Thử thêm: nộp file lỗi cú pháp (đội đó bị xử thua), nộp sau khi khóa (bị từ chối), nộp lại trước khi khóa (thay bài).
Chi tiết: [BAN_KET_CHUNG_KET.md](BAN_KET_CHUNG_KET.md).

### 5.3 Hai góc nhìn BTC + sinh viên (luồng đầy đủ)

`pnpm demo:experience` rồi làm theo [DEMO_HAI_GOC_NHIN.md](DEMO_HAI_GOC_NHIN.md).

### 5.4 Nộp bot qua GitHub

**Bot của tôi → Nộp phiên bản mới → Thi chính thức — nộp qua GitHub**:

- Repository: `https://github.com/lem57828-glitch/GameOanTuTi`
- Commit SHA: lấy bằng `git rev-parse origin/try-main` (commit phải đã push lên GitHub)
- Đường dẫn: `examples/bots/san_loai.py`, `examples/bots/phong_thu.py`, `examples/bots/tien_cong.py`,
  `examples/bots/tinh_truoc.py`, `examples/bots/ngau_nhien_an_toan.py`

Một đội không nộp trùng một file hai lần (cảnh báo trùng mã).

### 5.5 Bộ kiểm thử offline (thí sinh bán kết/chung kết)

```powershell
cd offline-kit
python arena_offline.py --rules semifinal
python arena_offline.py --ruleset final --blue bot_mau.py --pink greedy --games 7 --show
```

Xem [offline-kit/README.md](../offline-kit/README.md).

## 6. Lỗi thường gặp

| Hiện tượng                                 | Cách xử lý                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API`      | Mở Docker Desktop, đợi chạy xong rồi `docker compose ... up -d`                                                |
| Cổng 5173/3100 đang bị dùng                | Tắt bản chạy cũ (đóng terminal hoặc `taskkill` tiến trình node của dự án)                                      |
| `EPERM ... query_engine` khi `db:generate` | Dừng `dev:demo`/`dev:official` rồi chạy lại                                                                    |
| Nộp GitHub báo **403**                     | Hết lượt GitHub API (60 lần/giờ mỗi IP, mỗi bot dùng 2 lượt). Đợi tới giờ reset hoặc nộp kiểu tập luyện (file) |
| Không thấy nút **Tiếp theo**               | Đang đăng nhập tài khoản của giải khác — đăng xuất, chọn đúng tài khoản `· <mã giải>`                          |
| `pnpm is not recognized`                   | Xem ghi chú ở mục 1                                                                                            |

Không commit `.env`, `.env.demo`, `.env.official`, mật khẩu hoặc dữ liệu sinh viên.
