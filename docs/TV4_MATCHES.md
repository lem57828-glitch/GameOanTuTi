# TV4 — Phòng đấu và trận nhiều hiệp

Nối cặp đấu của TV3 với worker chạy bot của TV2. Mỗi cặp có **một phòng riêng**, dùng xuyên suốt các hiệp chính, hiệp phụ và các lần chạy lại (thể lệ 32 → 4 bản 2.0, mục 2–4).

## Luồng một trận

1. **Mở phòng** (BTC): Khu vực BTC → Điều hành thi đấu → **"Mở phòng thi đấu cho N cặp"**. Mỗi cặp đang chờ thi được tạo phòng `room_p_<pairingId>` và một trận. Mở lại không tạo trận trùng.
2. **Chọn kín** (đội trưởng, trong phòng):
   - Chọn một bot trong bộ bot của đội cho giai đoạn. Ở loại trực tiếp chọn thêm **quân thứ 10** (Búa/Bao/Kéo). Sơ loại và tranh suất dùng bố trí chuẩn 3 Búa – 4 Bao – 3 Kéo (Q06).
   - Bấm **"Xác nhận và sẵn sàng"**. Đổi được cho tới khi khóa.
   - Đối thủ và khán giả chỉ thấy "Chưa chọn / Đã chọn / Sẵn sàng", không thấy bot hay quân.
3. **Khóa:**
   - Khóa khi cả hai đội sẵn sàng, hoặc khi hết giờ (`MATCH_SELECT_SECONDS`, mặc định 600 giây). Đồng hồ theo giờ máy chủ.
   - Đội chưa chọn khi hết giờ dùng **lựa chọn hiệp trước**; chưa có hiệp trước thì dùng bot đầu tiên trong bộ, quân thứ 10 là Bao. Đây là đề xuất cho Q08, chờ BTC chốt. Lựa chọn này được đánh dấu `auto`.
   - BTC/trọng tài có thể **"Khóa lựa chọn ngay"** cho một phòng hoặc cho cả giải.
4. **Tung xu và chạy:**
   - Loại trực tiếp tung xu độc lập mỗi hiệp; đội thắng xu cầm Xanh, đi trước.
   - Swiss/tranh suất tung xu ở ván 1, các ván sau đổi màu luân phiên.
   - Kết quả tung xu, lựa chọn đã khóa và seed được lưu **trước** khi chạy, rồi tạo `GameJob` cho worker (TV2).
5. **Hết hiệp:** cộng điểm hiệp, hỏi TV3 còn cần bao nhiêu hiệp (`gamesNeeded`):

   - Swiss: đúng 2 ván.
   - Loại trực tiếp: 5 hiệp, bằng điểm thì đúng 2 hiệp phụ.
   - Tranh suất: 2 ván + tối đa 2 ván phụ.

   Còn hiệp thì quay lại bước chọn kín (lại 10 phút); đủ thì trận **kết thúc**.

6. **Bàn giao cho TV3:** danh sách ván/hiệp được gửi qua `CompetitionService.recordResult(pairingId, games, 'match')`. TV3 tính kết quả (kể cả bốc thăm khi vẫn bằng), hiển thị nhãn nguồn "match", và chờ BTC/trọng tài xác nhận/chốt vòng như mọi kết quả khác.

## Sự cố

- **Ván lỗi** (worker đã thử lại mà vẫn lỗi): trận chuyển **Tạm dừng** kèm lý do. BTC/trọng tài bấm **"Chạy lại hiệp lỗi"** trong phòng. Hiệp chạy lại giữ nguyên bot, quân thứ 10, màu, kết quả tung xu và seed. Ván lỗi vẫn được lưu để truy vết.
- **Đội không có bot hợp lệ** khi khóa: trận tạm dừng, BTC xử lý theo quy định ("Đội không có bot hợp lệ phải được BTC xử lý trước khi bắt đầu trận").
- **Khiếu nại được chấp nhận và cho thi lại** (TV3): TV3 gỡ trận cũ khỏi cặp. BTC bấm mở phòng lại, và trận mới được tạo **trong cùng phòng**; lịch sử trận cũ vẫn giữ.
- Xem phòng, tải lại hay mất kết nối **không** tạo ván, không tung lại xu.

## Độ bền

- **Gửi bù kết quả:** trận xong được ghi `completedAt`; khi TV3 nhận kết quả thì ghi `reportedAt`. Nếu tiến trình dừng giữa hai bước này, bộ hẹn giờ (2 giây) tìm trận `completed` mà `reportedAt` còn trống và gửi lại.
  - Chỉ gửi khi cặp vẫn chờ kết quả và vẫn gắn với chính trận đó.
  - TV3 từ chối (ví dụ cặp đã có kết quả nhập tay) thì ghi lý do vào `pauseReason`, không gửi lặp.
- **Trận mồ côi:** "Bắt đầu lại phần thi đấu", thi lại vòng, hay khiếu nại cho thi lại đều làm cặp không còn gắn với trận cũ. Trước mỗi bước xử lý, trận kiểm tra lại cặp; không còn hiệu lực thì tự **hủy** (`cancelled`), không chạy ván vô ích.
- **Gộp xử lý:** worker báo tín hiệu ở mỗi nước. Trận chỉ được xử lý khi ván mới nhất đã xong hoặc lỗi; mỗi trận tại một thời điểm chỉ có một lần xử lý, yêu cầu đến sau được gộp lại. Nhờ vậy không cạn kết nối database khi nhiều phòng thi cùng lúc.
- **Bảng điều hành:** `GET admin/tournaments/:id/matches/summary` trả số phòng chưa mở / đang chọn / đang thi / tạm dừng / đã xong. Nút "Khóa lựa chọn ngay" chỉ đếm phòng đang chọn.

## Bộ bot dùng trong trận

Lấy qua `BotsRunnerService.botsForMatch(teamId, stageId)` (TV2):

- Đội đã **khóa bộ bot** cho giai đoạn (`BotStageSelection`): chỉ được chọn trong bộ đó. Ván được gửi kèm `stageId` để TV2 kiểm tra lại.
- Chưa khóa: chỉ ở **chế độ demo** mới cho dùng mọi bot hợp lệ của đội. Giải thật thì đội phải khóa bộ bot trước, nếu không trận sẽ tạm dừng chờ BTC.

## API (`/api/v1`)

| Method / đường dẫn                            | Quyền         | Nội dung                                                      |
| --------------------------------------------- | ------------- | ------------------------------------------------------------- |
| GET rooms/:id                                 | Công khai     | Snapshot phòng, có thêm `match` (điểm, hiệp, trạng thái chọn) |
| GET rooms/:id/my-selection                    | Đăng nhập     | Bot được phép + lựa chọn của chính đội mình                   |
| POST rooms/:id/choices                        | Đội trưởng    | `{botVersionId, extraType, ready}` cho hiệp đang chọn         |
| POST admin/tournaments/:id/matches/open       | BTC           | Mở phòng/trận cho các cặp đang chờ                            |
| POST admin/tournaments/:id/matches/force-lock | BTC/trọng tài | Khóa ngay mọi phòng đang chọn của giải                        |
| POST admin/matches/:id/force-lock             | BTC/trọng tài | Khóa ngay một phòng                                           |
| POST admin/matches/:id/rerun-game             | BTC/trọng tài | Chạy lại hiệp lỗi                                             |

Socket không đổi: `room.join` → `room.snapshot` / `room.event`. Khi trạng thái trận đổi (đã chọn, sẵn sàng, sang hiệp mới), máy chủ đẩy lại snapshot đầy đủ.

## Dữ liệu

Migration `20261024090000_match_orchestration` và `20261024150000_match_reported_at` (cột `Match.reportedAt`):

- `Match` thêm `kind`, `stageId`, `teamAId/BId`, `scoreA/B`, `outcomes`, `currentNo`, `deadlineAt`, `pauseReason`, `completedAt`.
- Bảng mới `MatchSelection` (khóa: trận, hiệp, đội).
- `Room.pairingId` (duy nhất).

Mỗi lần chuyển trạng thái chạy trong transaction khóa hàng `Match`, nên hai tiến trình không thể cùng mở hiệp mới cho một trận. Bộ hẹn giờ chạy 2 giây một lần; tín hiệu "ván xong" từ worker cũng kích hoạt chuyển hiệp ngay.

Mã: `apps/api/src/modules/rooms-matches/`:

- `matches.service.ts`: máy trạng thái trận.
- `matches.controller.ts`: HTTP.
- `matches.repository.ts`: truy cập dữ liệu.

Giao diện: `apps/web/src/features/rooms-matches/MatchPanel.tsx`.

Worker (TV2) không còn tự đặt `Match` thành "finished" sau mỗi ván; trạng thái trận do TV4 quyết định.

## Kiểm thử

`apps/api/test/integration/matches.test.ts` chạy với PostgreSQL, Redis và worker thật:

- **Sơ loại 17 đội, 8 phòng Swiss:**
  - Đội trưởng chọn kín; khán giả không thấy bot đã chọn.
  - Sinh viên/trọng tài không chọn thay được; bot của đội khác bị từ chối.
  - Hết giờ thì dùng lựa chọn dự phòng.
  - Mỗi trận đúng 2 ván, ván 2 đổi màu; kết quả về TV3 với nguồn "match".
- **Loại trực tiếp:**
  - Trận 5 (hoặc 7) hiệp có quân thứ 10.
  - Người thắng trận khớp với kết quả TV3.
  - Khiếu nại "chấp nhận + thi lại" thì mở trận mới trong cùng phòng.

## Còn chờ chốt / chưa làm

- **Q08** (hết giờ chưa chọn), **Q07** (ô xuất phát quân thứ 10, đang theo engine chuẩn của TV2), thời gian chọn trước hiệp 1: đang dùng giá trị đề xuất.
- Chưa có: thông báo cho đội khi phòng mở/sắp hết giờ (nối `NotificationsService` của TV1), chat phòng, replay điều khiển từng nước, bỏ cuộc/đội trưởng offline theo quyết định BTC.
