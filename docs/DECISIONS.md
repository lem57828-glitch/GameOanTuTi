# Quyết định và câu hỏi mở

## Đã chọn cho M0

Nest modular monolith, PostgreSQL/Prisma, Redis/BullMQ, React/Vite, Socket.IO, pnpm workspace; tách worker. Khởi tạo mới theo đặc tả M0, giữ tài liệu và dữ liệu cũ. Seed idempotent, reset riêng có xác nhận. Chỉ demo development/test; không khởi động production với demo. Không chuyển DB SQLite/Turso cũ tự động.

Luật demo có rulesetId riêng, chỉ kiểm tra engine/queue/replay. Không coi bố trí 10 quân cố định và cách thắng demo là luật chính thức. Trang giải và schema Tournament/Stage, hợp đồng PairAssignment/MatchCompleted được giữ để TV3 phát triển tiếp.

## Luật 32 → 4 đã thống nhất, chưa triển khai ở M0

Cây nhị phân 32 đội, ba lượt 32 → 16 → 8 → 4, cặp đấu có phòng cho khán giả. Mỗi trận 5 hiệp; tung xu từng hiệp để chọn đội đi trước. Tối đa 3 bot/đội; mỗi hiệp có 3 Búa, 3 Bao, 3 Kéo, chọn loại quân thứ 10. Lựa chọn bot/quân giữ kín rồi công bố đồng thời. Chuẩn bị tối đa 10 phút; hai đội sẵn sàng bắt đầu sớm, cũng tiếp nhận ý kiến/khiếu nại trong thời gian này. Điểm hiệp thắng/hòa/thua = 3/1/0. Bằng điểm sau 5 hiệp: 2 hiệp phụ, vẫn bằng thì bốc thăm. Bán kết/chung kết đổi luật và thi offline, ngoài phạm vi này.

## Chờ nhóm chốt trước milestone chính thức

| Vấn đề                                                                                             | Phụ trách phối hợp |
| -------------------------------------------------------------------------------------------------- | ------------------ |
| Email trường, xác minh, đăng nhập/session thật, quy trình duyệt đội 2–4 người                      | TV1                |
| Giao thức bot, private GitHub/upload, version/hash, hạn mức CPU/RAM/thời gian/network và sandbox   | TV2                |
| Sơ loại: số hiệp/trận, số vòng Swiss, điểm/bye, tránh tái đấu, thứ tự tie-break, tranh suất Top 32 | TV3                |
| Cách xếp hạt giống/cây 32 đội, thời điểm khóa/công bố đối thủ, chốt kết quả, khiếu nại             | TV3 + TV4          |
| Khi hết giờ chưa chọn bot/quân, mất kết nối, bỏ cuộc, thời gian hiệp đầu/hiệp phụ                  | TV4 + TV3          |
| Luật cờ chính thức: bố trí quân, di chuyển/ăn, đích, hòa, giới hạn nước và lỗi bot                 | TV2 + cả nhóm      |
| Quyền trọng tài/BTC khi pause/rerun, audit/revision kết quả, xử lý khiếu nại đang mở               | TV3 + TV4          |
| Production HTTPS, secret/session, lưu source/replay, backup, nhiều API/worker, quan sát vận hành   | Cả nhóm            |

**Cập nhật 22/10/2026 (TV3):** để luồng thi đấu chạy được, phần sơ loại/cây đấu đang dùng **giá trị đề xuất**, chưa phải luật chốt:

- **Q02:** trận sơ loại 2 ván đổi màu.
- **Q03:** bye = 3 điểm; tránh tái đấu trong từng mức (BTC đổi được sang toàn sơ loại); số vòng do BTC nhập cho từng mức.
- **Q04:** tie-break điểm → ĐTB đối thủ → hiệu số ván; bằng hoàn toàn ở vạch cắt thì tranh suất (≤ 10 đội loại trực tiếp, > 10 đội thêm một vòng), trận tranh suất 2 ván + 2 ván phụ + bốc thăm.
- **Q05:** dưới 32 đội thì đi tiếp do vắng đối thủ.
- **Q12:** khiếu nại chỉ do đội trưởng gửi, trước khi chốt.

Chi tiết và chỗ sửa: [TV3_COMPETITION.md](TV3_COMPETITION.md).

Không tự chọn mặc định cho các câu hỏi khác để biến demo thành giải thật. Thay đổi ruleset/hợp đồng phải có test và đồng thuận của module liên quan.
