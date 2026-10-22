# Module `rooms-matches` — TV4

**Phạm vi:** phòng đấu cho mỗi cặp 32→4, trạng thái trận/hiệp, bộ 1–3 bot, chọn kín bot + quân thứ 10, sẵn sàng, 10 phút giữa hiệp, tung xu, điểm 5+2 hiệp, phòng trực tiếp, replay, cây phía giao diện, ý kiến khán giả và gửi khiếu nại (đặc tả mục 6, 7, 9.4).

## Tệp của module
| Tệp | Nội dung |
|---|---|
| `index.js` | Bảng API (khách không đăng nhập xem được phòng/replay). |
| `service.js` | Toàn bộ nghiệp vụ của bạn (đang `todo()`); khung nghe `pair.assigned`, `game.finished`. |
| `migrations/001_draft.sql` | `matches`, `match_bot_sets`, `match_games`, `game_runs` (đề xuất). |
| `web/modules/rooms-matches.js`, `test/modules/rooms-matches.test.js` | Giao diện và kiểm thử của module. |

## Việc cần làm (30 điểm, mục 9.4)
- [ ] (10) Trạng thái trận/hiệp, bộ 3 bot, chọn kín, sẵn sàng, 10 phút, tung xu, điểm 5+2 hiệp; khóa nguyên tử; gọi `requestGame` của TV2 từng hiệp.
- [ ] (8) Phòng trực tiếp, cập nhật tiến độ, xem lại, kết nối lại.
- [ ] (4) Cây nhị phân phía giao diện, spectator, tìm kiếm/lọc; mở đúng phòng từ nhánh TV3.
- [ ] (2) Ý kiến trong phòng (nền chat TV1), gửi khiếu nại sang TV3.
- [ ] (6) Test đồng thời, reconnect, quyền xem; không lộ lựa chọn, không double-start/double-score.

## Hợp đồng
- Nhận `PairAssignment` từ TV3 (`getPair`, sự kiện `pair.assigned`); gửi `MatchCompleted` (sự kiện `match.completed`).
- Gửi `GameRequest` cho TV2 qua `bots-runner/service.requestGame()` — mỗi lần chạy một `requestKey` duy nhất, retry giữ nguyên lựa chọn; nhận `game.move`, `game.finished`, `game.failed`.
- Dùng engine của TV2 để vẽ/kiểm tra nước; `isCaptain`, `notify`, chat của TV1.

## Quyết định cần chốt
Q07 (ô quân thứ 10, thời gian chọn trước hiệp 1), Q08 (hết 10 phút mà chưa chọn hợp lệ/đội trưởng offline), Q12 (khiếu nại sau hiệp cuối).

Tham khảo bản cũ: trình vẽ bàn cờ và xem lại ván `git show legacy-v1:public/board.js`.
