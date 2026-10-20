# LUẬT VÀ THỂ LỆ VÒNG LOẠI TRỰC TIẾP 32 → 4 ĐỘI

**BOT ARENA — Cờ Oẳn Tù Tì OTTv2**  
**Bản rút gọn 2.0 — Dự thảo cập nhật ngày 19/10/2026**

## 1. Nhánh đấu và các vòng thi

- Khi chốt đủ 32 đội, BTC công bố bảng đấu dạng **cây nhị phân**. Ban đầu 32 đội nằm ở các lá; mỗi nút đấu ghép hai đội từ hai nhánh con, đội thắng đi lên nút kế tiếp.
- Xếp vị trí các lá theo hạt giống sau sơ loại, giữ cố định nhánh đấu; không bốc lại cặp sau mỗi vòng.
- Vòng 32 có 16 trận, vòng 16 có 8 trận, tứ kết có 4 trận: tổng cộng **28 trận**, chọn 4 đội vào bán kết. Giai đoạn này dừng ở 4 đội, chưa xác định đội vô địch.
- Đội thắng đi tiếp, đội thua bị loại. Giữa hai vòng bố trí **2 ngày** để các đội chuẩn bị và sửa bot trước khi đăng ký bộ bot của vòng mới.

## 2. Thông báo đối thủ và phòng đấu công khai

- Mỗi cặp có **một phòng riêng**, dùng xuyên suốt các hiệp chính, hiệp phụ và lần chạy lại. Sang vòng mới, đội đi tiếp có phòng mới theo cặp mới.
- Sau khi chốt kết quả vòng trước, BTC thông báo đối thủ, link phòng, lịch thi và hạn đăng ký bộ bot trước vòng tiếp theo; bảo đảm thời gian chuẩn bị công bằng giữa các cặp.
- **Thí sinh khác và khách không đăng nhập được vào xem** bàn cờ trực tiếp, kết quả, lịch sử trận, nhánh đấu và bảng xếp hạng. Khán giả không được chọn bot, sửa quân hoặc điều khiển trận.
- Mã nguồn bot và log lỗi riêng không công khai. Trong thời gian chuẩn bị hiệp, lựa chọn bot và quân thứ 10 của đối thủ được giữ kín theo mục 4.
- Đội trưởng vào phòng để thực hiện lựa chọn và xác nhận sẵn sàng. Các thành viên còn lại không bắt buộc cùng online. Mất kết nối của người xem không làm dừng trận; nếu đội thi không chốt được lựa chọn, BTC xử lý theo quy định đã công bố.

## 3. Bộ bot của mỗi đội

- Trước mỗi vòng, mỗi đội đăng ký **từ 1 đến tối đa 3 bot** đã vượt qua kiểm thử hợp lệ; đội trưởng xác nhận danh sách trước hạn BTC công bố.
- Khi vòng bắt đầu, khóa mã nguồn và phiên bản của cả bộ bot. Giữa các hiệp chỉ được chọn một bot trong bộ đã đăng ký, không sửa mã hoặc thêm bot mới.
- Được chọn lại một bot ở nhiều hiệp, kể cả dùng cùng bot cho toàn bộ trận. Không bắt buộc luân phiên hoặc dùng hết 3 bot.
- Đội đi tiếp có thể cập nhật bộ bot trước vòng sau. Đội không có bot hợp lệ phải được BTC xử lý trước khi bắt đầu trận.

## 4. Cấu trúc trận và thời gian giữa các hiệp

- **Một trận gồm đủ 5 hiệp chính; mỗi hiệp là một ván cờ hoàn chỉnh.** Không dừng sớm dù một đội đã dẫn chắc điểm.
- Trước hiệp 1, hai đội chọn bot và loại quân thứ 10 trước giờ thi do BTC công bố.
- Giữa hai hiệp có **tối đa 10 phút** để chọn bot cho hiệp tiếp theo, chọn loại quân thứ 10 và gửi khiếu nại/ý kiến về hiệp vừa kết thúc.
- Mỗi đội giữ kín lựa chọn của mình. Khi cả hai đội xác nhận sẵn sàng, lựa chọn được khóa và công bố đồng thời; có thể bắt đầu sớm, không cần chờ đủ 10 phút.
- Hết 10 phút thì hết quyền thay đổi lựa chọn. Nếu cả hai đội đã có lựa chọn hợp lệ, hệ thống khóa và công bố đồng thời; trường hợp chưa có lựa chọn hợp lệ do BTC xử lý theo chính sách đã công bố trước giải.
- Sau khi khóa lựa chọn, **tung đồng xu độc lập trước mỗi hiệp** để quyết định đội đi trước. Hai đội có xác suất bằng nhau; kết quả được công khai và lưu lại. Một đội có thể đi trước ở nhiều hiệp liên tiếp, không mặc định luân phiên.
- Đội thắng tung đồng xu cầm Xanh và đi trước; đội còn lại cầm Hồng. Mỗi hiệp bắt đầu bằng bàn cờ mới, khởi động lại bot và đặt lại bộ đếm lỗi.
- Trình tự: **chọn kín bot và quân thứ 10 → khóa/công bố đồng thời → tung đồng xu → thi đấu → ghi điểm → thời gian chuẩn bị hiệp tiếp theo**.

## 5. Luật bàn cờ và quân thứ 10

- Bàn cờ 9 × 9. Mỗi đội có **9 quân cố định: 3 Búa, 3 Bao, 3 Kéo**, cộng **1 quân tùy chọn**, tổng cộng vẫn là 10 quân.
- Trước mỗi hiệp, đội chọn quân thứ 10 là **Búa, Bao hoặc Kéo**. Vì vậy đội có thể xuất phát với 4 Búa–3 Bao–3 Kéo, 3 Búa–4 Bao–3 Kéo, hoặc 3 Búa–3 Bao–4 Kéo.
- Hai đội chọn độc lập và được đổi loại quân thứ 10 giữa các hiệp. Quân này giữ nguyên loại trong suốt hiệp; chỉ được chọn loại, không tự đổi ô xuất phát. BTC phải công bố ô dành cho quân tùy chọn trước giải.
- Mỗi lượt đi một quân sang một ô liền kề theo 8 hướng. Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Chỉ đi vào ô trống hoặc ô có quân đối phương bị khắc chế; quân cùng đội, cùng loại hoặc mạnh hơn đều chặn đường.
- Thắng hiệp khi đưa một quân tới ô đích của mình — Xanh tới I9, Hồng tới A1 — hoặc ăn hết một loại quân đối phương. Đến lượt mà không có nước hợp lệ thì thua hiệp.
- Cùng thế cờ và bên đến lượt xuất hiện lần thứ ba, hoặc đạt 200 nước tổng hai bên: bên còn nhiều quân hơn thắng; bằng số quân thì hòa hiệp.

## 6. Tính điểm và xác định đội đi tiếp

- Mỗi hiệp: **thắng 3 điểm, hòa 1 điểm cho mỗi đội, thua 0 điểm**. Điểm đặt lại khi bắt đầu trận mới, không cộng điểm Swiss hoặc vòng trước.
- Sau đủ 5 hiệp chính, đội có tổng điểm cao hơn thắng trận và đi tiếp. Ví dụ: A thắng 2 hiệp, hòa 1, thua 2 thì hai đội cùng 7 điểm.
- Nếu bằng điểm, chơi thêm **đúng 2 hiệp phụ**. Hiệp phụ vẫn áp dụng chọn bot trong bộ đã khóa, chọn quân thứ 10, chọn kín/công bố đồng thời, tung đồng xu và tối đa 10 phút chuẩn bị giữa các hiệp.
- So tổng điểm của cả 7 hiệp. Nếu vẫn bằng điểm thì **bốc thăm quyết định đội đi tiếp**, công khai và lưu kết quả. Không dùng hạt giống hay điểm Swiss để ưu tiên.
- Đội thắng tứ kết giành suất bán kết; chưa xếp thứ hạng 1–4. Mỗi trận có 5 hoặc 7 hiệp, trừ trường hợp BTC xử lý miễn đấu/rút đội.

## 7. Khiếu nại, lỗi bot và sự cố

- Trong tối đa 10 phút giữa các hiệp, đội trưởng có thể gửi khiếu nại kèm hiệp, nước đi và bằng chứng liên quan. Thí sinh khác hoặc khán giả có thể gửi ý kiến, nhưng không có quyền tự dừng hoặc sửa trận.
- BTC tiếp nhận và quyết định xử lý. Khiếu nại không tự dừng đồng hồ hoặc thay kết quả; BTC có thể tạm hoãn hiệp tiếp theo nếu cần xác minh. Sau hiệp cuối, phải giải quyết khiếu nại còn tồn đọng trước khi chốt trận/chuyển vòng.
- Giới hạn cơ sở: 200 ms CPU mỗi nước, tối đa 1 giây chờ phản hồi và 3 giây khởi động bot.
- Nước sai, lỗi chương trình hoặc vượt CPU nhưng vẫn phản hồi trước hạn chờ: hai lỗi đầu được đi thay; lỗi thứ ba trong hiệp bị xử thua hiệp. Bot không khởi động được, thoát/crash hoặc quá thời gian chờ thì thua hiệp ngay.
- Lỗi máy chủ/môi trường thi do BTC xác minh, không tự quy thành lỗi bot. Chạy lại vì sự cố phải giữ đúng bot, loại quân thứ 10, màu/đội đi trước, luật và kết quả tung đồng xu của hiệp bị ảnh hưởng; lưu lịch sử và không cộng điểm hai lần.
- Đội rút, vi phạm, không có bot/lựa chọn hợp lệ hoặc cặp thiếu đối thủ do BTC quyết định xử lý. Không tự đổi nhánh hay đưa đội đã thua trở lại.

**Cần BTC chốt thêm:** ô xuất phát cụ thể của quân thứ 10; thời gian lựa chọn trước hiệp 1; và cách xử lý khi đội chưa có lựa chọn hợp lệ lúc hết giờ. Các nội dung này phải được công bố trước giải.

**Lưu ý:** Đây là bản thể lệ mới để triển khai. Chương trình hiện tại chưa được sửa để áp dụng trận 5 hiệp, bộ 3 bot, chọn quân thứ 10 và quy trình chọn giữa hiệp.
