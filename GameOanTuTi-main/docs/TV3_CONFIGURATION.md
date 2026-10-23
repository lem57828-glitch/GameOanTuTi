# TV3 — Cấu hình giải và lịch giai đoạn

Phần này triển khai sau nền M0: tạo giải nháp, lập lịch, duyệt cấu hình, công bố và audit. Chưa có ghép Swiss, tính điểm, cây đấu hoặc chốt kết quả chính thức.

## Thao tác trên giao diện

1. Đăng nhập BTC → Khu vực BTC → Cấu hình giải đấu → nhập tên và tạo giải nháp. Giải demo có sẵn đã công bố nên chỉ đọc; tạo giải mới để thử quy trình này.
2. Nhập lý do thao tác. Lưu tên/mô tả, giờ mở/đóng đăng ký, hạn khóa đội hình và hạn khóa nộp bot. Giờ nhập theo múi giờ thiết bị, lưu thành UTC trên máy chủ.
3. Thêm giai đoạn theo thứ tự thi đấu. Mỗi giai đoạn có tên, loại sơ loại/loại trực tiếp, hạn khóa, giờ bắt đầu và kết thúc. Có thể lưu nháp thiếu lịch rồi bổ sung sau.
4. Từng giai đoạn: **Mở cấu hình → Khóa cấu hình → Chốt cấu hình**. Trước khi khóa phải có đủ lịch của giải và các giai đoạn. Có thể mở lại cấu hình đã khóa/chốt khi giải chưa công bố; sau đó sửa và duyệt lại.
5. Khi tất cả giai đoạn đã chốt, thực hiện **Mở cấu hình → Khóa cấu hình → Chốt cấu hình** cho giải. Bấm **Công bố giải**, đọc xác nhận và công bố.
6. Xem lịch công khai tại trang Giải đấu. Lịch sử phía BTC lưu người thao tác, lý do, requestId và dữ liệu trước/sau; giao diện hiển thị tối đa 100 thao tác gần nhất.

Trọng tài được xem danh sách và lịch sử; chỉ BTC được sửa. Sau khi công bố, lịch/cấu hình đóng băng. Chưa có luồng sửa lịch giải đang thi đấu; cần thiết kế revision, thông báo và ảnh hưởng kết quả ở bước sau.

## Hai trạng thái riêng

- `configStatus`: draft → open → locked → confirmed, điều khiển việc duyệt lịch/cấu hình. Có reopen từ locked/confirmed trước công bố.
- `status`: trạng thái thi đấu sẵn có của Tournament/Stage. Duyệt cấu hình không chuyển Stage sang running/finished/confirmed và không xác nhận thắng/thua. Công bố chỉ chuyển Tournament từ draft sang registration.

Các mốc thời gian xác định `registrationPhase` trên máy chủ: unconfigured, scheduled, open, closed, teams_locked, bots_locked. Không phụ thuộc đồng hồ trình duyệt. Đây là dữ liệu để TV1/TV2 nối kiểm tra đăng ký, thành viên và nộp bot; các endpoint đó hiện vẫn 501, chưa có thao tác đội/bot thật để áp dụng khóa.

Giải nháp không trở thành giải hiện tại và không làm đổi teamId của phiên người dùng. Giải hiện tại là giải registration/running có thời điểm tạo mới nhất. Công bố một giải mới có thể đổi ngữ cảnh giải/đội hiện tại; cấu hình đã công bố được giữ để tra cứu.

## Điều kiện và tính nhất quán

- Mở đăng ký < đóng đăng ký ≤ khóa đội ≤ khóa bot ≤ hạn khóa giai đoạn đầu ≤ bắt đầu < kết thúc.
- Giai đoạn kế tiếp có hạn khóa/bắt đầu sau hoặc bằng kết thúc giai đoạn trước. Loại trực tiếp chưa tự sinh cặp hoặc chạy vòng.
- Khóa/chốt yêu cầu ít nhất một giai đoạn và lịch đầy đủ. Khóa/chốt giải yêu cầu từng giai đoạn đã chốt. Công bố yêu cầu cấu hình giải đã chốt và hạn đăng ký chưa qua.
- Mọi mutation của giải hiện có phải kèm `expectedRevision` và `reason` ít nhất 3 ký tự. Cả chỉnh stage và duyệt stage đều tăng revision chung của giải.
- Transaction khóa hàng Tournament, kiểm tra revision, cập nhật và ghi audit cùng nhau. Sai lịch, sai thứ tự duyệt, sai revision hoặc sửa giải đã công bố trả 409 và rollback. Sai dữ liệu trả 400, chưa đăng nhập 401, sai quyền 403.
- Khi nhận 409 do phiên khác sửa, bấm Tải lại dữ liệu rồi kiểm tra và nhập lại phần chỉnh sửa. Hệ thống không tự ghi đè thay đổi của người khác.

## API

Prefix `/api/v1`. Success giữ `{data}`, lỗi giữ envelope chung. POST trả 201; PATCH trả 200.

| Method / đường dẫn                                       | Quyền         | Nội dung                                                   |
| -------------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| GET admin/tournaments                                    | BTC/trọng tài | Danh sách gồm cả giải nháp                                 |
| POST admin/tournaments                                   | BTC           | name, description?, isDemo?; tạo nháp                      |
| PATCH admin/tournaments/:id                              | BTC           | Tên/mô tả, bốn mốc UTC/null, expectedRevision, reason      |
| POST admin/tournaments/:id/stages                        | BTC           | Tạo stage, ord tăng theo danh sách                         |
| PATCH admin/tournaments/:id/stages/:stageId              | BTC           | Sửa tên/loại/lịch stage thuộc đúng giải                    |
| POST admin/tournaments/:id/configuration                 | BTC           | action: open/lock/confirm/reopen, expectedRevision, reason |
| POST admin/tournaments/:id/stages/:stageId/configuration | BTC           | Duyệt cấu hình stage                                       |
| POST admin/tournaments/:id/publish                       | BTC           | expectedRevision, reason; đóng băng và công bố             |
| GET admin/tournaments/:id/audit                          | BTC/trọng tài | 100 thao tác gần nhất                                      |

Schemas nằm trong `packages/contracts/src/tournaments.ts`, OpenAPI tại `/api/v1/openapi.json`. Cột mới được thêm bằng migration `20261020160000_tournament_configuration`, không sửa migration cũ và không xóa dữ liệu.

Máy khác sau khi pull: dừng API/worker, chạy `pnpm db:generate`, `pnpm db:migrate`, `pnpm build`, rồi mở lại `pnpm dev` và `pnpm dev:worker`. Không cần reset hoặc seed lại.
