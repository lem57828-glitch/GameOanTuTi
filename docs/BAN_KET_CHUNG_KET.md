# Bán kết và chung kết offline — triển khai

Căn cứ: _Đặc tả tổ chức vòng bán kết và chung kết Bot Arena_. Tài liệu này mô tả phần hệ thống làm được, các giá
trị nhóm đã tự chọn khi đặc tả để ngỏ, và cách vận hành ngày thi.

## Hệ thống làm gì ở từng bước

| Bước đặc tả                   | Ngoài đời (BTC, giám thị)                      | Hệ thống                                                                                                |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Kiểm tra thiết bị (15')    | Giám thị kiểm tra laptop, ngắt mạng            | Chốt tứ kết → tạo bán kết, thông báo 4 đội lịch offline                                                 |
| 2. Công bố luật mới (15')     | BTC công bố luật, phát USB bộ kiểm thử offline | Bộ kiểm thử: `offline-kit/` (khớp engine từng nước, có test đối chiếu). Luật ẩn với thí sinh tới bước 6 |
| 3. Chỉnh sửa bot (90–120')    | Thí sinh sửa bot, chạy `arena_offline.py`      | —                                                                                                       |
| 4. Thu mã nguồn (10–15')      | Giám thị thu file `.py` bằng USB của BTC       | BTC nhập file trên máy nhận bài → phiên bản bot bất biến + SHA-256; **Khóa bài**                        |
| 5. Kiểm tra bot (20')         | —                                              | Worker kiểm tra cú pháp + chạy thử 2 màu trong sandbox **theo luật của vòng**; nhật ký cho BTC          |
| 6. Thi đấu trực tiếp (30–60') | Trình chiếu phòng đấu lên màn hình lớn         | **Bắt đầu thi** → **Mở phòng thi đấu** → worker chạy loạt BO; BTC **chốt vòng**                         |

Chốt bán kết tạo chung kết giữa hai đội thắng (cùng các bước 1–6). Chốt chung kết công bố vô địch và á quân (thông
báo cho hai đội). Giải vẫn là "giải hiện tại" để mọi người xem kết quả.

## Luật mới (engine `packages/game-engine`)

Mọi vị trí đối xứng tâm qua E5, không đè quân xuất phát hay ô đích, nên hai màu công bằng.

| Vòng      | Ruleset                 | Thêm vào luật chuẩn                                                                                                                                             |
| --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bán kết   | `semifinal-obstacles-1` | Vật cản cố định C5, D6, E5, F4, G5                                                                                                                              |
| Chung kết | `final-dynamic-1`       | Vật cản cố định C5, G5; 2 vật cản động chạy vòng quanh E5 (tiến 1 ô / 6 nước, luôn đối xứng); ô khiên E3, E7 (không bị ăn); ô đổi loại B5, H5 (Búa→Bao→Kéo→Búa) |

- Không đi vào ô vật cản (kể cả để ăn quân). Vật cản động tới ô đang có quân thì quân đó vẫn đi ra được, nhưng không
  ai đi vào được ô đó.
- Đổi loại làm chính bên vừa đi mất hẳn một loại quân thì bên đó thua (`eliminate`).
- Vị trí vật cản động là một phần của thế cờ khi xét lặp 3 lần.
- State gửi bot có thêm `obstacles`, `fixed_obstacles`, `moving_obstacles`, `special_cells`; `legal_moves` đã lọc.
  Nước đi qua ô đổi loại có thêm `promoted` (loại mới) để client vẽ lại đúng.

## Giá trị nhóm tự chọn (đặc tả để ngỏ)

| Điểm                      | Đặc tả                               | Đang dùng                                                                                                |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Thể thức bán kết          | "Mỗi cặp thi đấu"                    | **BO5** — thắng 3 ván trước                                                                              |
| Thể thức chung kết        | BO7                                  | BO7 — thắng 4 ván trước                                                                                  |
| Ván hòa                   | —                                    | Không tính; hết số ván tối đa mà bằng số ván thắng → thêm tối đa 2 ván → vẫn bằng thì bốc thăm theo seed |
| Màu mỗi ván               | —                                    | Tung xu độc lập mỗi ván (như loại trực tiếp)                                                             |
| Quân thứ 10               | —                                    | Đội đăng ký khi nộp bài USB, dùng cho cả vòng (không chọn kín trong phòng)                               |
| Đội không có bài hợp lệ   | "Quy định xử lý bot lỗi"             | Đội kia thắng (`walkover`); cả hai đội đều không có → cặp chờ BTC phân xử (nhập kết quả tay)             |
| Bố trí vật cản/ô đặc biệt | "Vật cản cố định / động, ô đặc biệt" | Như bảng luật trên                                                                                       |

Đổi các giá trị này: thể thức ở `apps/api/src/modules/tournaments/scoring.ts` (`SERIES`), bố trí ở
`packages/game-engine/src/index.ts` (`SEMIFINAL_VARIANT`, `FINAL_VARIANT`) **và** `offline-kit/arena_offline.py`
(test `offline-kit-parity` báo lỗi nếu hai bên lệch nhau).

## Ngày thi — thao tác BTC trên web

Điều hành thi đấu → khung **Bán kết** / **Chung kết**:

1. Mỗi đội: chọn file `.py` từ USB, chọn quân thứ 10, **Nhận bài**. Bảng hiện phiên bản, SHA-256, trạng thái kiểm tra.
   Nộp lại trước khi khóa thì thay bài (bản cũ vẫn lưu).
2. Hết giờ: **Khóa bài**. Sau đó không nhận/sửa bài nữa.
3. Chờ cột "Kiểm tra" hết "Đang kiểm tra" (mở để xem nhật ký) → **Bắt đầu thi đấu**.
4. Ở thẻ bước chính phía trên: **Mở phòng thi đấu** → mở link phòng trên máy chiếu (bàn cờ có vật cản, ô đặc biệt và
   chú thích).
5. Trận dừng vì lỗi: vào phòng **Chạy lại hiệp lỗi**, hoặc **Phân xử / Nhập kết quả** (nhập từng ván).
6. Xong vòng: **Chốt bán kết → tạo chung kết** / **Chốt chung kết, công bố vô địch**.

Mọi thao tác ghi AuditLog kèm lý do (`finals.submission`, `finals.lock`, `finals.start`, `finals.confirm`).

API (BTC): `GET /admin/tournaments/:id/finals`, `POST /admin/tournaments/:id/finals/:phase/submissions`,
`POST /admin/tournaments/:id/finals/:phase/{lock|start|confirm}` (`phase` = `sf` | `final`). Thí sinh/khán giả xem
qua `GET /tournaments/:id/competition` (trường `finals`, không có bài nộp; tên luật ẩn tới khi vòng bắt đầu thi).

## Demo

Giải trải nghiệm tự điều hành (`pnpm demo:experience -- --solo`): sau Top 4, nút **Tiếp theo** đi tiếp bán kết và
chung kết; bước thu bài USB được giả lập bằng bot hợp lệ mới nhất của mỗi đội (chỉ có ở chế độ này).

## Giới hạn

- Hệ thống không kiểm soát được laptop thí sinh (ngắt mạng, công cụ offline) — đúng như lưu ý của đặc tả; phần đó do
  giám thị.
- "Máy nhận bài cách ly" là máy BTC mở trang điều hành; hệ thống chỉ nhận nội dung file, không đọc USB trực tiếp.
- Bộ kiểm thử `offline-kit/` nằm trong mã nguồn; BTC tự chép ra USB, không phát công khai trước ngày thi.
