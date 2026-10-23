# rooms-matches (TV4)

Owner: TV4. Dữ liệu: Room, Match, MatchSelection, Game, GameChoice, GameResult, GameEvent.

- Phòng/snapshot/sự kiện trực tiếp: `rooms.service.ts`, `rooms.gateway.ts` (room.join/leave → room.snapshot/event), ván demo `POST /demo/games`.
- Trận nhiều hiệp theo cặp TV3: `matches.service.ts` (máy trạng thái chọn kín → khóa → tung xu → chạy → hiệp sau/kết thúc), `matches.controller.ts`, `matches.repository.ts`. Chi tiết: [docs/TV4_MATCHES.md](../../../../../docs/TV4_MATCHES.md).

Interface dùng của module khác:

- TV3: `CompetitionService.pairAssignments/assignment/attachMatch/format/gamesNeeded/recordResult`.
- TV2: `BotsRunnerService.botsForMatch/botLabels/createGameJob/kick`.
- TV1: `AccountsTeamsService.team/teamNames`.

Không import repository của module khác.

Chưa làm: thông báo cho đội, chat phòng, replay điều khiển, bỏ cuộc/offline. `POST /rooms` (phòng ngoài cặp đấu) vẫn trả 501.
