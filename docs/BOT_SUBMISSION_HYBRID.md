# Nộp bot tập luyện và thi chính thức

- Tập luyện: tải một file `.py`, dán code hoặc dùng bot đã nộp qua GitHub. Đấu thử với bot mẫu hoặc phiên bản hợp lệ của cùng đội (có thể dùng cùng phiên bản cho cả hai bên). Đối thủ mặc định quân thứ 10 là Bao.
- Thi chính thức: nộp URL repository GitHub, commit SHA đầy đủ 40 ký tự hex và đường dẫn một file Python (mặc định `bot.py`). Nộp đủ sớm để kiểm thử thực thi hoàn tất trước hạn chọn/khóa bộ bot. Nộp thành công không tự động đưa bot vào bộ thi.
- API tải code ở đúng commit, giải mã UTF-8, bỏ BOM và chuẩn hóa CRLF thành LF, tính SHA-256 rồi lưu snapshot. Worker chỉ chạy snapshot đã lưu; commit mới trên GitHub không thay đổi phiên bản cũ. Muốn đổi code phải nộp phiên bản mới.
- Backend từ chối bot nộp trực tiếp trong bộ thi và kiểm tra lại bộ đã khóa trước khi tạo job chính thức. Các bộ cũ chứa bot trực tiếp không được dùng tiếp cho trận mới; BTC cần xử lý theo lịch/điều lệ, không sửa source của phiên bản cũ.
- Riêng bot mô phỏng do BTC tạo vẫn được dùng khi `DEMO_MODE=true`; không được dùng trong production. Chế độ demo không cho phép bot người chơi tải trực tiếp trở thành bot thi chính thức.
- Repository riêng tư cần BTC cấp quyền theo đội qua `GITHUB_BOT_PRIVATE_REPOS` và token server. Không đưa token vào form hay mã bot.
- Đối soát: lưu ID phiên bản, repository, commit, đường dẫn, SHA-256 và thời gian nộp. So sánh với source ở commit sau cùng quy tắc chuẩn hóa; SHA-256 chỉ phát hiện nội dung trùng/đổi, không chứng minh quyền tác giả hoặc tự kết luận gian lận.

Không cần migration hoặc dependency mới cho luồng này. Không lấy lại code từ GitHub lúc chạy trận.
