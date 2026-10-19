# Quyết định cần chốt trước khi lập trình phần liên quan (đặc tả mục 10)

Điền cột **Quyết định** và **Ngày chốt** khi nhóm thống nhất; module liên quan cập nhật code theo. Chưa chốt thì không tự biến đề xuất thành luật chính thức.

| Mã | Nội dung | Module | Đề xuất trong đặc tả | Quyết định | Ngày chốt |
|---|---|---|---|---|---|
| Q01 | Miền email `vnu.edu`, tiền tố `26`, xác minh khi đăng nhập | TV1 | Xác nhận đúng tài khoản sinh viên thực tế trước khi khóa validation | | |
| Q02 | Cấu trúc trận sơ loại | TV3 (+TV2) | 2 ván đổi màu, tách khỏi luật 5 hiệp | | |
| Q03 | Số vòng mỗi mức, bye, phạm vi tránh tái đấu | TV3 | BTC cấu hình trước mỗi mức; cùng số vòng cho mọi đội | | |
| Q04 | Tiêu chí phụ và tranh suất, nhất là Top 32 | TV3 | Điểm → ĐTB đối thủ → hiệu số ván; tranh suất theo luật công bố | | |
| Q05 | Số đội nhỏ hơn mốc/nhỏ hơn 32, lịch theo ngày | TV3 | Bỏ mức không cần; xử lý miễn đấu; lùi kết quả khi chưa đủ trận | | |
| Q06 | Sơ loại dùng quân thứ 10 tùy chọn hay 3 Búa–4 Bao–3 Kéo | TV2, TV3 | Sơ loại giữ luật chuẩn đến khi có quyết định khác | | |
| Q07 | Ô xuất phát quân thứ 10, thời gian chọn trước hiệp 1 | TV2, TV4 | Cấu hình chuẩn; không cho đặt quân tùy ý | | |
| Q08 | Hết 10 phút mà chưa chọn hợp lệ / đội trưởng offline | TV4 | Fallback: dùng lựa chọn trước hoặc BTC quyết định | | |
| Q09 | GitHub riêng tư, nhiều tệp, nộp trực tiếp | TV2 | Bộ 3 bot là 3 phiên bản mã đã nhận, không phải 3 link | | |
| Q10 | RAM/CPU/thời gian, sandbox, ngân sách máy | TV2 | Đo thật, không cam kết 1.000 đội/2 giờ khi chưa benchmark | | |
| Q11 | Check-in, kênh nhắc, livestream/dự đoán, QR, tài chính | Cả nhóm | Giữ backlog, làm sau luồng chính | | |
| Q12 | Quyền khiếu nại, hạn sau hiệp cuối, điều chỉnh nhánh | TV3, TV4 | Chốt trước khi hoàn thiện hold/rerun | | |

Thêm từ khung init:
| Mã | Nội dung | Module | Đề xuất | Quyết định | Ngày chốt |
|---|---|---|---|---|---|
| K01 | Bộ công nghệ (Node/Express, SQLite/Turso, giao diện JS thuần) | Cả nhóm | Giữ như khung nếu không có lý do đổi | | |
| K02 | Worker tách tiến trình nhận/gửi sự kiện thế nào | TV2, TV4 | Qua `game_jobs` + `event_log` (xem CONTRACTS.md) | | |
