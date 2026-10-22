# tournaments (TV3)

Owner: TV3. Dữ liệu: Tournament, Stage, QualifierLevel, Pairing, BracketRound, Appeal.

- Cấu hình và công bố giải: [TV3_CONFIGURATION.md](../../../../../docs/TV3_CONFIGURATION.md) (`tournaments.service.ts`, `configuration.ts`).
- Điều hành thi đấu — sơ loại chia mức + Swiss, tranh suất, cây 32 → 4, khiếu nại: [TV3_COMPETITION.md](../../../../../docs/TV3_COMPETITION.md).
  - `swiss.ts`, `scoring.ts`: hàm thuần, có test đơn vị.
  - `competition.service.ts`: điều phối, có transaction và audit.
  - `competition.controller.ts`: HTTP.
  - `competition.module.ts`: module riêng để dùng service công khai của TV1/TV2 mà không tạo vòng phụ thuộc.

Interface cho module khác:

- `TournamentsService.current/currentId`.
- `CompetitionService.pairAssignments`: TV4 lấy cặp chờ thi.
- `CompetitionService.recordResult`: TV4 trả kết quả trận.

Module khác không ghi trực tiếp các bảng trên.

Chưa làm:

- Nối kết quả trận thật từ TV4.
- Thông báo cho đội.
- Giao diện rút đội.
- Bán kết/chung kết.

Các tham số Q02–Q05, Q12 đang dùng giá trị đề xuất, xem docs/DECISIONS.md.
