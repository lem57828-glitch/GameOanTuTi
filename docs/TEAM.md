# Bàn giao cho bốn thành viên

| Người | Module chính                       | Việc sau nền M0                                                                                                 |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TV1   | accounts-teams                     | Đăng nhập/xác minh thật, đội 2–4 người, captain/membership theo giải, profile/thông báo                         |
| TV2   | bots-runner + worker + game-engine | Nộp/version bot, kiểm thử, sandbox, tài nguyên/giao thức, engine luật chính thức                                |
| TV3   | tournaments                        | Sơ loại/Swiss, standings/tie-break, tranh suất Top 32, cây 32 → 4, khiếu nại/chốt kết quả; phối hợp CI/tài liệu |
| TV4   | rooms-matches                      | Phòng công khai, Match/Game, lựa chọn kín/ready/deadline, coin, trực tiếp/replay, bàn giao kết quả              |

M0 đã cung cấp skeleton chung và vertical slice demo cho cả nhóm; không có nghĩa toàn bộ phần việc từng người đã xong. Phần giải đấu hiện có được giữ nguyên, chỉ kết nối vào ứng dụng. TV3 bắt đầu tại `apps/api/src/modules/tournaments`, `apps/web/src/features/tournaments` và `packages/contracts/src/tournaments.ts`.

## Phối hợp

TV3 đã có:

- [Cấu hình và duyệt lịch giải](TV3_CONFIGURATION.md).
- [Điều hành thi đấu](TV3_COMPETITION.md): sơ loại chia mức + Swiss, tranh suất, cây 32 → 4, chốt vòng, khiếu nại.

Kết quả trận hiện đến từ nhập tay hoặc mô phỏng demo. TV4 nối phòng đấu vào `pairAssignments`/`recordResult`.

1. Cả nhóm chạy README và kiểm tra `pnpm check` trước khi tách nhánh.
2. Chốt contracts trước khi ghép module: TV1 cung cấp SessionUser/team; TV2 nhận GameRequest/trả GameResult; TV3 cung cấp PairAssignment; TV4 phát MatchCompleted.
3. Mỗi feature có cả API/web trong thư mục module. Gọi service công khai của module khác, không repository trực tiếp. Schema Prisma và contracts cần review người phụ trách module liên quan.
4. PR nhỏ có hành vi thay đổi, migration, test và cập nhật module README. Không sửa migration đã áp dụng; tạo migration mới. Không commit `.env`, DB/source bot cá nhân hoặc bản chụp dữ liệu.
5. Dùng bot/room demo để tích hợp sớm; tính năng chính thức chưa làm tiếp tục trả 501 thay vì giả lập thành công.

Nền M0 có thể merge khi cả nhóm kiểm tra luồng demo và các lệnh kiểm tra. Chưa cần chờ hoàn thiện Swiss hoặc sandbox để các thành viên làm song song.
