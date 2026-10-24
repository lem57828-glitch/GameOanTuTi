# TV3 — Điều hành thi đấu: sơ loại, cây 32 → 4, khiếu nại

Phần này nối tiếp [cấu hình giải](TV3_CONFIGURATION.md). Giải phải được công bố trước khi điều hành thi đấu.

## Luồng điều hành

1. **Lập kế hoạch các mức** (BTC). Chọn **số mức** (1–8), rồi mỗi mức một dòng: tên, **số đội giữ lại** và **số vòng Swiss** riêng. Số đội giảm dần; mức cuối cố định 32. Ô báo lỗi ngay khi nhập; mức giữ lại không ít hơn số đội đang có được cảnh báo là sẽ bị bỏ qua khi khóa. Ví dụ 1000 → 500 → 200 → 100 → 32; với 180 đội gợi ý 100 → 32. Nhập thêm số vòng Swiss mỗi mức (đề xuất 3–5) và phạm vi tránh tái đấu (trong một mức hoặc toàn bộ sơ loại).
2. **Khóa bot và mở mức.** Mức 1 nhận mọi đội đã duyệt; các mức sau nhận các đội đi tiếp của mức trước. Mức không phải mức cuối mà số đội đã ≤ chỉ tiêu thì tự bỏ qua. Nếu đặt mốc khóa bot cho mức, máy chủ tự khóa khi tới giờ (kiểm tra mỗi 30 giây theo giờ máy chủ). Khóa mức cũng chốt **bot của từng đội cho cả mức**: đội trưởng chọn trước ở tab "Trận của đội"; đội chưa chọn dùng bot của mức trước, không có thì bot hợp lệ mới nhất. Các trận Swiss/tranh suất trong mức không có bước chọn bot, chạy ngay khi mở phòng.
3. **Ghép vòng.**
   - Vòng 1 bốc thăm theo seed của mức; các vòng sau ghép đội gần điểm và tránh tái đấu.
   - Số đội lẻ: một đội nhận bye, ưu tiên đội chưa nghỉ rồi đến đội ít điểm. Bye được tính như thắng.
   - Nếu buộc phải tái đấu, số cặp tái đấu được ghi vào nhật ký.
4. **Kết quả cặp đấu.** Có ba nguồn, đi chung một đường tính:
   - Từ phòng đấu (TV4, khi đã nối).
   - Trọng tài/BTC nhập tay từng ván.
   - Mô phỏng demo (chỉ khi `DEMO_MODE`).
5. **Xác nhận vòng** (BTC hoặc trọng tài): cần đủ kết quả và không còn khiếu nại mở. Chỉ vòng đã xác nhận mới tính vào bảng điểm chính thức. Có thể cho thi lại vòng gần nhất nếu chưa xác nhận.
6. **Chốt mức.** Cần đủ số vòng, mọi vòng đã xác nhận và không còn khiếu nại.
   - Xếp hạng theo: điểm → điểm trung bình đối thủ → hiệu số ván.
   - Nhóm bằng hoàn toàn vắt qua vạch cắt phải **tranh suất**, không loại theo mã đội:
     - Nhóm ≤ 10 đội đấu loại trực tiếp rút gọn.
     - Nhóm > 10 đội đấu thêm một vòng trong nhóm trước.
   - Trận tranh suất luôn phân thắng thua: 2 ván, rồi 2 ván phụ, rồi bốc thăm.
7. **Cây 32.** Khi chốt mức cuối, hạt giống lấy theo thứ hạng của mức đó; điểm các mức trước không được cộng dồn. Đội bằng hoàn toàn được xếp theo bốc thăm có seed. Cây xếp theo thứ tự chuẩn: hạt giống 1 gặp 32, hạt giống 1 và 2 ở hai nửa nhánh. Thiếu đội thì đội còn lại đi tiếp do vắng đối thủ.
8. **Vòng 32 → vòng 16 → tứ kết.** Mỗi vòng có bốn bước: Bắt đầu → kết quả → **Chốt vòng** (BTC/trọng tài, không còn khiếu nại mở) → tạo cặp vòng sau theo nhánh cố định. Chốt tứ kết thì có **Top 4** và giai đoạn này dừng.

Trang **Khu vực BTC → Điều hành thi đấu** chỉ hiện đúng một nút chính cho bước kế tiếp; máy chủ tự kiểm tra lại trạng thái. Hai người bấm cùng lúc không tạo vòng trùng vì mỗi thao tác khóa hàng Tournament trong transaction.

## Tính kết quả một cặp

| Loại cặp        | Cấu trúc                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Swiss (sơ loại) | Đúng 2 ván đổi màu; so số ván thắng → thắng/hòa/thua trận. Điểm trận: 3/1/0, bye 3.                 |
| Tranh suất      | 2 ván; bằng thì đúng 2 ván phụ; vẫn bằng thì bốc thăm theo seed của cặp.                            |
| Loại trực tiếp  | Đủ 5 hiệp, mỗi hiệp 3/1/0; bằng điểm thì đúng 2 hiệp phụ; vẫn bằng thì bốc thăm (thể lệ 2.0 mục 6). |

- Máy chủ kiểm tra số ván/hiệp: nhập thiếu, thừa, hoặc thêm hiệp phụ khi không bằng điểm đều bị từ chối (400).
- Bốc thăm tính từ seed lưu trong cặp, nên ai thao tác cũng ra cùng kết quả và kiểm tra lại được.
- Kết quả chưa chốt có thể ghi lại; mỗi lần ghi tăng `resultVersion`. Kết quả đã chốt bị từ chối (409).

## Khiếu nại

- Chỉ đội trưởng của một trong hai đội được gửi, khi cặp đã có kết quả và chưa chốt. Mỗi đội chỉ có một khiếu nại mở cho mỗi cặp. Cặp tranh suất áp dụng kết quả ngay nên không nhận khiếu nại.
- Khiếu nại đang mở chặn xác nhận vòng, chốt mức và chốt vòng loại trực tiếp.
- Trọng tài/BTC chọn một trong ba quyết định, luôn kèm lý do và ghi nhật ký:
  - **Bác.**
  - **Chấp nhận, giữ kết quả.**
  - **Chấp nhận và thi lại**: kết quả tạm bị xóa và cặp chờ kết quả mới; đội và seed giữ nguyên.

## API (`/api/v1`)

| Method / đường dẫn                                          | Quyền         | Nội dung                                            |
| ----------------------------------------------------------- | ------------- | --------------------------------------------------- |
| GET tournaments/:id/competition                             | Công khai     | Tổng quan: mức, bước kế tiếp, cặp chờ, nhánh, Top 4 |
| GET tournaments/:id/standings?level=                        | Công khai     | Bảng xếp hạng một mức, kèm nhãn trạng thái          |
| GET tournaments/:id/bracket                                 | Công khai     | Nhánh 32 → 4                                        |
| GET tournaments/:id/my-pairings                             | Đăng nhập     | Cặp của đội mình + quyền khiếu nại                  |
| GET/POST tournaments/:id/qualifier/my-bot                   | Đội trưởng chọn | Bot của đội cho mức sắp tới (một bot cho mọi trận Swiss của mức); khóa mức thì chốt |
| POST appeals · GET appeals/mine                             | Đăng nhập     | Gửi/xem khiếu nại của đội                           |
| GET admin/appeals · POST admin/appeals/:id/decision         | BTC/trọng tài | Danh sách và quyết định                             |
| POST admin/pairings/:id/result                              | BTC/trọng tài | Nhập kết quả `{games: ['a'\|'b'\|null], reason}`    |
| POST admin/tournaments/:id/qualifier/rounds/:r/confirm      | BTC/trọng tài | Xác nhận vòng                                       |
| POST admin/tournaments/:id/knockout/:phase/confirm          | BTC/trọng tài | Chốt vòng r32/r16/qf                                |
| POST admin/tournaments/:id/qualifier/plan                   | BTC           | `{targets, rounds[], names[], avoidRematch, reason}` |
| PATCH admin/tournaments/:id/qualifier/levels/:ord           | BTC           | Tên, số vòng, mốc khóa bot, mốc công bố             |
| POST admin/tournaments/:id/qualifier/lock · rounds · finish | BTC           | Khóa mức · ghép vòng · chốt mức                     |
| POST admin/tournaments/:id/qualifier/rounds/:r/rerun        | BTC           | Thi lại vòng gần nhất chưa xác nhận                 |
| POST admin/tournaments/:id/knockout/:phase/start            | BTC           | Bắt đầu vòng loại trực tiếp                         |
| POST admin/tournaments/:id/competition/reset                | BTC           | Đặt lại phần thi đấu (giữ đội, bot, kế hoạch)       |
| POST admin/tournaments/:id/demo/teams · demo/simulate       | BTC, chỉ demo | Thêm đội mẫu có bot mô phỏng · mô phỏng cặp chờ     |

Mọi thao tác điều hành cần `reason` ít nhất 3 ký tự và được ghi vào AuditLog cùng requestId. Lỗi trạng thái trả 409, dữ liệu sai trả 400, chưa đăng nhập 401, sai quyền 403.

## Dữ liệu

Migration `tournament_competition` thêm các bảng: `QualifierLevel` (mức), `Pairing` (cặp đấu, hợp đồng PairAssignment cho TV4), `BracketRound` (trạng thái vòng r32/r16/qf), `Appeal`. Tournament có thêm `avoidRematch` và `top4`. Bảng xếp hạng không lưu bản sao mà tính lại từ Pairing đã có kết quả, nên không thể lệch. Mã ở `apps/api/src/modules/tournaments`:

- `swiss.ts`, `scoring.ts`: hàm thuần, có test.
- `competition.service.ts`: điều phối.
- `competition.controller.ts`: HTTP.

## Nối với các module khác

- **TV1:** đọc đội của giải qua `AccountsTeamsService.tournamentTeams`. Đội `approved`/`locked` được vào mức 1; đội `withdrawn` giữ điểm đã đấu nhưng không được ghép vòng mới và không giành suất.
- **TV2:** đội mẫu dùng bot mô phỏng (`BotsRunnerService.demoPolicies`). Khi TV2 có nộp bot thật, thêm điều kiện "có bot hợp lệ" khi khóa mức.
- **TV4:** lấy cặp chờ thi qua `CompetitionService.pairAssignments(tournamentId)`, và gửi kết quả bằng `recordResult(pairingId, games, 'match', …)` sau khi trận kết thúc (MatchCompleted). Việc chọn bot/quân kín, tung xu từng hiệp và phòng đấu thuộc TV4.

## Giá trị đề xuất còn chờ BTC chốt

Các giá trị dưới đây đang dùng để chạy được, nhưng chưa phải luật chính thức (xem [DECISIONS.md](DECISIONS.md)):

- **Q02:** trận sơ loại 2 ván đổi màu.
- **Q03:** bye tính 3 điểm; tránh tái đấu mặc định trong từng mức.
- **Q04:** tiêu chí phụ điểm → ĐTB đối thủ → hiệu số; cách tranh suất ranh giới.
- **Q05:** dưới 32 đội thì cho đi tiếp do vắng đối thủ.
- **Q12:** quyền khiếu nại (chỉ đội trưởng, trước khi chốt).

Đổi các giá trị này: sửa `swiss.ts`/`scoring.ts`, test đơn vị và tài liệu trong cùng PR.

## Thử nhanh trên giao diện

1. Đăng nhập **BTC Demo**, vào **Khu vực BTC → Điều hành thi đấu**. Chọn "Giải mẫu Bot Arena", thêm khoảng 38 đội mẫu ở **Công cụ thử nghiệm**, rồi lưu kế hoạch (mặc định 32, 3 vòng).
2. Lặp lại: bấm nút chính (Khóa bot → Ghép vòng) → **Mô phỏng kết quả** → **Xác nhận vòng**. Sau đó **Chốt mức**, rồi mô phỏng tranh suất nếu có.
3. Bắt đầu Vòng 32 → mô phỏng → Chốt; làm tiếp với vòng 16 và tứ kết. Trang **Giải đấu** sẽ hiện bảng xếp hạng, nhánh đấu và Top 4.
4. Thử khiếu nại: sau khi ghép vòng và mô phỏng, đăng nhập **Nguyễn An** (đội trưởng Alpha), vào **Giải đấu → Trận của đội tôi → Gửi khiếu nại**. Sau đó đăng nhập trọng tài để xử lý ở tab **Khiếu nại**.
5. Muốn làm lại: **Bắt đầu lại phần thi đấu**. Thao tác này giữ đội và kế hoạch.

## Chưa làm

- Trận thật qua phòng đấu: TV4 chưa nối `recordResult`, nên hiện chỉ có nhập tay và mô phỏng.
- Thông báo đối thủ/lịch cho đội (TV1).
- Rút đội bằng giao diện (đội `withdrawn` vẫn được xử lý đúng nếu TV1 đặt trạng thái).
- Sửa lịch hoặc nhánh sau khi đã chốt.
- Chứng nhận/giải thưởng.
- Bán kết và chung kết: ngoài phạm vi 32 → 4.
