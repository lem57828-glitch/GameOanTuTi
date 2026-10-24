# Bot Python mẫu

Năm bot với lối chơi khác nhau, để nộp thử và đấu thử trên web. Mỗi file là một bot độc lập: chỉ dùng thư viện chuẩn, có hàm `make_move(state)` trả `{"from": ô, "to": ô}`. Mọi bot đều đi nước thắng ngay nếu có, và không đi nước để đối phương thắng ngay ở lượt sau.

| File | Lối chơi |
| --- | --- |
| `tien_cong.py` | Dồn quân về ô đích nhanh nhất, quân đi đầu được ưu tiên, tránh ô bị khắc. |
| `phong_thu.py` | Giữ góc nhà (ô đích của đối phương), chỉ ăn quân khi an toàn, chờ hết 200 nước để thắng nhờ hơn quân. |
| `san_loai.py` | Chọn loại quân đối phương còn ít nhất rồi săn tới khi hết loại đó (thắng bằng luật ăn hết một loại). |
| `tinh_truoc.py` | Minimax cắt tỉa alpha-beta, đào sâu dần. Tự dừng ở 0,09 giây CPU mỗi nước, dưới ngân sách 0,2 giây của sandbox. |
| `ngau_nhien_an_toan.py` | Mốc so sánh: đi ngẫu nhiên nhưng né nước nguy hiểm. |

Đấu thử vòng tròn trên máy (126 ván, mỗi cặp đổi màu và đổi quân thứ 10), kèm 2 bot mẫu trong `apps/api/prisma/sample-bots`:

| Bot | Thắng | Hòa | Thua | CPU tối đa/nước |
| --- | --- | --- | --- | --- |
| tinh_truoc | 33 | 0 | 3 | 94 ms |
| san_loai | 30 | 2 | 4 | 16 ms |
| phong_thu | 14 | 12 | 10 | 16 ms |
| than_trong (mẫu) | 14 | 8 | 14 | 16 ms |
| tien_cong | 10 | 0 | 26 | 16 ms |
| ngau_nhien_an_toan | 7 | 4 | 25 | 47 ms |
| tham_an (mẫu) | 4 | 2 | 30 | 16 ms |

Nộp lên web: **Bot của tôi → Nộp phiên bản mới**, dán mã hoặc chọn file. Bot nộp trực tiếp dùng để đấu thử. Thi chính thức cần nộp từ GitHub theo commit (xem `docs/BOT_SUBMISSION_HYBRID.md`).
