# Module `bots-runner` — TV2

**Phạm vi:** nhận bot từ GitHub (và tệp trực tiếp nếu nhóm chốt), phiên bản bất biến, engine luật cờ, sandbox và hàng đợi thực thi, đấu thử (đặc tả mục 4, 6.3, 9.2).

## Tệp của module
| Tệp | Nội dung |
|---|---|
| `index.js` | Bảng API (route chưa có `handler` trả 501). |
| `service.js` | Phần 1: `getBotVersion`, `validVersions`, `requestGame`, `gameStatus` (bản tối thiểu cho TV3/TV4). Phần 2: nghiệp vụ của bạn. |
| `engine.js` | Engine luật OTTv2 — khung hàm, chưa cài đặt. |
| `worker.js` | Worker chạy bot — khung, chưa cài đặt. Chạy bằng `npm run worker`. |
| `migrations/001_draft.sql` | `bot_versions`, `game_jobs` (đề xuất). |
| `web/modules/bots-runner.js`, `test/modules/bots-runner.test.js` | Giao diện và kiểm thử của module. |

## Việc cần làm (30 điểm, mục 9.2)
- [ ] (6) GitHub, nhận mã, phiên bản/commit, kiểm thử hợp lệ; snapshot mã bất biến; khóa phiên bản; báo cáo trùng chính xác.
- [ ] (5) Engine bàn cờ và giao diện bot Python `make_move(state)`; 9 quân cố định + quân tùy chọn; nước hợp lệ; thắng/hòa.
- [ ] (8) Sandbox, hàng đợi, giới hạn tài nguyên, heartbeat, phục hồi worker; phân biệt lỗi bot/hạ tầng.
- [ ] (4) Đấu thử; hợp đồng đầu vào/đầu ra một hiệp và luồng sự kiện cho phòng (không tự điều phối trận 5 hiệp).
- [ ] (7) Test bot lỗi/độc hại, benchmark, cấu hình chạy worker; báo cáo tải.

## Hợp đồng
- Nhận `GameRequest`, trả `GameResult` (xem `server/core/contracts.js`). Gọi lại cùng `requestKey` không tạo hiệp mới.
- Phát sự kiện `bot.version_ready`, `game.started`, `game.move`, `game.finished`, `game.failed`.
- Engine dùng chung cho TV4 (kiểm tra/vẽ nước): giữ chữ ký các hàm trong `engine.js`.

## Quyết định cần chốt
Q06 (sơ loại dùng quân thứ 10?), Q07 (ô xuất phát quân thứ 10), Q09 (GitHub riêng tư, nhiều tệp, nộp trực tiếp), Q10 (RAM/CPU, sandbox, ngân sách máy).

Tham khảo bản cũ (không chép nguyên, đặc tả yêu cầu xây lại): `git show legacy-v1:src/game/board.js`, `legacy-v1:src/runner/`.
