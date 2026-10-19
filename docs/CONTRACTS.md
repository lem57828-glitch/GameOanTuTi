# Hợp đồng giữa các module (đặc tả mục 9.5)

**Trạng thái: ĐỀ XUẤT ở M0** — cả nhóm duyệt rồi mới viết tách nhánh. Kiểu dữ liệu chi tiết nằm trong `server/core/contracts.js` (JSDoc + hàm kiểm tra), sự kiện nằm trong `server/core/events.js`. Đổi hợp đồng = sửa cả ba nơi (code, tài liệu này, `test/core/contracts.test.js`) và cả bên cung cấp lẫn bên dùng cùng duyệt.

## Bàn giao
| Bên bàn giao → bên dùng | Hàm / sự kiện | Trạng thái trong khung |
|---|---|---|
| TV1 → mọi module | `accounts-teams/service`: `teamOf(userId, tournamentId)`, `getTeam(teamId)`, `members(teamId)`, `isCaptain(userId, teamId)`, `isMember(userId, teamId)`, `notify({ userIds?, teamId?, kind, title, body?, link? })`; sự kiện `team.roster_locked`, `notification.requested` | Bản tối thiểu đã chạy (đọc bảng đề xuất) |
| Core → mọi module | `req.user = { id, username, email, display_name, role, status }`; vai trò `student`/`referee`/`admin`; `requireAuth`, `requireRole` | Đã có |
| TV2 → TV3/TV4 | `BotVersion` bất biến qua `getBotVersion(id)`, `validVersions(teamId)`; `requestGame(GameRequest)` → `{ jobId, created }` (cùng `requestKey` không tạo việc mới); `gameStatus(requestKey)`; sự kiện `bot.version_ready`, `game.started`, `game.move`, `game.finished { requestKey, result: GameResult }`, `game.failed` | `requestGame`/`gameStatus`/`getBotVersion` đã có; worker, engine chưa |
| TV3 → TV4 | `PairAssignment` qua `getPair(pairId)` và sự kiện `pair.assigned { pairId }`; `currentTournament()` | `getPair`/`currentTournament` đã có |
| TV4 → TV2 | `GameRequest` cho đúng hiệp đã khóa; không gọi lại khi người xem kết nối lại; retry giữ nguyên lựa chọn (cùng bot, quân thứ 10, màu, seed) | Chưa |
| TV4 → TV3 | Sự kiện `match.completed` với `MatchCompleted` (5 hoặc 7 hiệp, điểm, cách phân thắng, `resultVersion`) | TV3 đã có khung nghe + kiểm tra hợp đồng |
| TV3 → TV4/TV1 | Sự kiện `decision.made` (tạm hoãn/chạy lại/chốt), `stage.opened` | Chưa |
| TV4 → TV3 | Sự kiện `appeal.submitted` | Chưa |

## Kiểu dữ liệu chính (tóm tắt)
- **GameRequest:** `requestKey`, `blueBotVersionId`, `pinkBotVersionId`, `blueExtraType?`, `pinkExtraType?`, `rulesetId`, `seed`, `limits { cpuMsPerMove, wallMsPerMove, startupMs, maxPlies, maxErrors }`.
- **GameResult:** `requestKey`, `winner` (`blue`/`pink`/`null`), `reason` (`goal`, `eliminate`, `no_moves`, `repetition`, `max_plies`, `errors`, `crash`, `timeout`, `startup`), `plies`, `pieces { blue, pink }`, `moves[]`.
- **PairAssignment:** `pairId`, `stageId`, `kind` (`qualifier`/`knockout`), `teamA`, `teamB`, `seedA`, `seedB`, `lockAt`.
- **MatchCompleted:** `pairId`, `matchId`, `resultVersion`, `games[] { no, extra, winnerTeam, pointsA, pointsB }`, `pointsA`, `pointsB`, `winnerTeam`, `decidedBy` (`points`/`extra`/`lot`).

## Điểm cần chốt thêm ở M0
- Worker chạy tách tiến trình thì event bus trong bộ nhớ không tới được web. Đề xuất: worker ghi kết quả vào `game_jobs` + `event_log`, web đọc `event_log` theo mốc id (`events.since`) và phát lại cho module trong tiến trình web.
- Sơ loại (TV3) có dùng phòng/trận của TV4 hay TV3 tự gọi `requestGame` cho trận 2 ván (Q02)?
