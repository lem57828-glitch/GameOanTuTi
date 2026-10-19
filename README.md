# BOT ARENA — khung xây lại (init)

Bộ khung để 4 thành viên xây lại hệ thống thi bot cờ búa/kéo/bao theo
`docs/DAC_TA_TONG_HOP_VA_PHAN_CONG_4_NGUOI` (phạm vi: đăng ký → sơ loại → Top 32 → loại trực tiếp → Top 4).

Khung chỉ dựng **phần nền dùng chung (mốc M0)** và **chỗ trống cho từng người**. Nghiệp vụ của mỗi module vẫn là việc của người phụ trách:
mọi API chưa làm trả `501 Chưa làm (TVx)`, mọi trang giao diện là trang giữ chỗ ghi việc cần làm.

| Module | Người | Thư mục | Phạm vi |
|---|---|---|---|
| `accounts-teams` | TV1 | `server/modules/accounts-teams/` | Tài khoản, hồ sơ, đội 2–4 người, thông báo, chat, trang chủ/hướng dẫn |
| `bots-runner` | TV2 | `server/modules/bots-runner/` | GitHub/phiên bản bot, engine luật cờ, sandbox + worker, đấu thử |
| `tournaments` | TV3 | `server/modules/tournaments/` | Cấu hình giải, sơ loại chia mức + Swiss, Top 32, cây 32→4, kết quả, khiếu nại |
| `rooms-matches` | TV4 | `server/modules/rooms-matches/` | Phòng đấu, trận 5+2 hiệp, chọn kín, tung xu, phòng trực tiếp, replay, khán giả |

Mỗi module có `README.md` riêng: việc cần làm (theo điểm phân công), hợp đồng cung cấp/sử dụng, quyết định cần chốt.

## Chạy
Cần Node.js ≥ 22.13 (Python 3.11 cần khi TV2 làm worker).
```bash
npm install
npm run seed        # tạo dữ liệu mẫu (thêm --reset để tạo lại)
npm start           # http://localhost:3000
npm test            # kiểm thử lõi + danh sách todo của từng module
npm run worker      # worker chạy bot (TV2 hiện thực)
```
Trang chủ hiện **bảng tiến độ**: tự đọc bảng API của 4 module, cho biết API nào đã làm.

**Đăng nhập giả lập** (`#/dev`, chỉ khi phát triển, tự tắt khi `NODE_ENV=production`): chọn một tài khoản mẫu để làm việc khi chức năng đăng nhập của TV1 chưa xong. Tài khoản mẫu: `btc` (admin), `trongtai` (referee), `sv1a`…`sv4b` (4 đội, đội trưởng là `svNa`), `svle` (chưa có đội).

## Tài liệu
- `docs/ARCHITECTURE.md` — cấu trúc thư mục, quy ước, cách thêm API/migration/sự kiện/trang, quy trình git.
- `docs/CONTRACTS.md` — hợp đồng giữa các module (mục 9.5 đặc tả): dữ liệu, hàm, sự kiện.
- `docs/DECISIONS.md` — các quyết định Q01–Q12 cần chốt ở M0.

## Bản cũ
Hệ thống trước khi xây lại được gắn tag `legacy-v1` (gồm cả cấu hình Railway/Turso). Chỉ dùng để tham khảo, ví dụ
`git show legacy-v1:src/game/board.js`; đặc tả yêu cầu xây lại, không chép nguyên.
