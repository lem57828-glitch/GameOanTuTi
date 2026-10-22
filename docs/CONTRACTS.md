# Hợp đồng M0

Nguồn chuẩn: `packages/contracts/src`. Schema Zod được dùng để kiểm tra dữ liệu lúc chạy; OpenAPI sinh tại `/api/v1/openapi.json`. Thay đổi hợp đồng phải cập nhật đồng thời producer, consumer, tài liệu và test.

## HTTP

Prefix `/api/v1`. Thành công `{ data, meta? }`; lỗi `{ error: { code, message, details?, requestId } }`, có header x-request-id. 400 validation, 401 chưa đăng nhập, 403 sai quyền/origin, 409 xung đột, 501 FEATURE_NOT_IMPLEMENTED (details có owner). Demo tắt trả 404 DEMO_DISABLED. Cookie arena_session, không dùng localStorage để lưu token.

| API                                 | Quyền / hành vi                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET health                          | Công khai; trạng thái chung, demoMode, workerAlive                                                 |
| GET admin/health                    | BTC/trọng tài; DB, Redis, heartbeat, queue, outbox; meta.recovery có kết quả quét job              |
| GET session / DELETE session        | Đọc hoặc xóa phiên                                                                                 |
| GET dev/accounts / POST dev/session | Chỉ development/test + DEMO_MODE; body accountId                                                   |
| GET teams/mine                      | Sinh viên xem đội của mình                                                                         |
| GET bots?teamId=                    | Sinh viên chỉ đội mình; BTC/trọng tài xem các đội; không có source                                 |
| GET tournaments/current             | Giải hiện tại và danh sách stage công khai                                                         |
| GET rooms / rooms/:id               | Danh sách phòng / RoomSnapshot công khai                                                           |
| GET games/:id/events?afterSeq=0     | Replay sự kiện bền vững, seq tăng dần                                                              |
| POST demo/games                     | Chỉ BTC/demo; body requestKey, roomId?; 201 mới / 200 đã có; data gồm created, roomId, gameId, job |
| GET jobs/:id                        | BTC/trọng tài xem tiến độ và lỗi nội bộ                                                            |

Các endpoint đội/bot/giải/phòng chưa làm có placeholder rõ trong controller và OpenAPI. Không dùng dữ liệu giả để báo thao tác chính thức thành công.

## DTO và queue

API cấu hình giải sau M0: xem [TV3_CONFIGURATION.md](TV3_CONFIGURATION.md). TournamentView/StageView có thêm configStatus, các mốc UTC; TournamentView có revision, serverTime và registrationPhase do server xác định. Mutation admin phải kèm expectedRevision/reason; cấu hình và trạng thái thi đấu là hai vòng đời riêng.

- SessionUser: id, displayName, role, teamId (theo giải hiện tại).
- BotVersion: id, teamId, version, label, sourceHash, rulesetId, status, createdAt; không gửi source.
- PairAssignment: pairId, stageId, teamAId, teamBId, kind, lockAt; hợp đồng TV3 → TV4. Bảng `Pairing` của TV3 là nguồn cặp đấu; TV4 lấy cặp chờ thi qua `CompetitionService.pairAssignments` và trả kết quả bằng `recordResult` (danh sách ván/hiệp). Schemas thi đấu (PairingView, StandingsView, BracketView, CompetitionView, AppealView, các request) nằm trong `packages/contracts/src/tournaments.ts`; API ở [TV3_COMPETITION.md](TV3_COMPETITION.md).
- GameRequest v1: requestKey, gameId, choices.blue/pink (botVersionId, extraType), rulesetId, seed, limits. cpuMsPerMove/wallMsPerMove/startupMs tính bằng ms; maxPlies/maxErrorsPerGame là số lượng. Chỉ là hạn mức mô phỏng, chưa phải sandbox.
- BullMQ QueueJobData chỉ chứa jobId và requestKey; request đầy đủ đọc lại từ PostgreSQL. QueueAdapter che việc enqueue/state/requeue/counts; GameRunner che việc thực thi.
- GameResult: requestKey, gameId, attemptId, winner/null, reason, plies, piecesLeft, rulesetId, resultVersion, replayRef. Kết quả phòng công khai là projection ngắn hơn.

## Socket

Client gửi `room.join` / `room.leave` với `{roomId}`. Server gửi `room.snapshot`, `room.event`, `room.error`. Phòng công khai chỉ đọc, giới hạn số phòng/kết nối và tần suất gửi.

RoomSnapshot có roomId, streamId, seq, status, gameId, rulesetId, teams, coinResult, board, turn, history, result, job, serverTime, deadline. Deadline null ở M0. Coin chỉ do server quyết định và lưu một lần; client chỉ hoạt họa kết quả đã có.

RoomEvent có eventId, type, schemaVersion=1, aggregateId=roomId, streamId, seq, occurredAt, payload. Các loại: game.created/started/move/finished/failed. Stream là `game:<gameId>`. Seq cũ/trùng bỏ qua; nhảy seq/đổi stream tải snapshot. MatchCompleted đã có schema để TV4 bàn giao TV3 ở milestone sau; chưa phát khi demo kết thúc.
