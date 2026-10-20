# Đặc tả luật và thể lệ vòng loại trực tiếp từ 32 xuống 4 đội

> **Bản đặc tả cũ để tham khảo.** Thể lệ đã thay đổi ngày 19/10/2026: trận 5 hiệp, tính điểm 3–1–0, tối đa 3 bot, chọn quân thứ 10, phòng công khai và tối đa 10 phút giữa các hiệp. Dùng [thể lệ rút gọn phiên bản 2.0](THE_LE_VONG_LOAI_32_DEN_4.md) làm căn cứ cho yêu cầu mới; các mục luật cũ dưới đây chưa được đồng bộ và không dùng để triển khai thay cho bản 2.0.

**Dự án:** BOT ARENA — Cuộc thi lập trình bot cờ Oẳn Tù Tì OTTv2  
**Phiên bản tài liệu:** 1.1 — Dự thảo cập nhật ngày 18/10/2026  
**Phạm vi:** Vòng 32 đội, vòng 16 đội và tứ kết  
**Mục đích:** Làm cơ sở thống nhất thể lệ và chỉnh sửa phần mềm.

Tài liệu lấy luật và các thông số mặc định của dự án hiện tại làm phương án cơ sở. Các yêu cầu dưới đây là đặc tả mục tiêu; không có nghĩa mọi quy trình đã được phần mềm tự động hóa. Mục 13 đối chiếu những phần đã có với những phần cần bổ sung. Ban tổ chức (BTC) cần thống nhất bản thể lệ chính thức trước khi áp dụng cho cuộc thi.

## 1. Mục tiêu và phạm vi

Giai đoạn này nhận danh sách 32 đội đã vượt qua sơ loại, tổ chức thi đấu loại trực tiếp và chọn đúng 4 đội vào bán kết.

| Vòng | Mã giai đoạn | Số đội đầu vào | Số cặp đấu | Số đội đi tiếp |
|---|---|---:|---:|---:|
| Vòng 32 | `r32` | 32 | 16 | 16 |
| Vòng 16 | `r16` | 16 | 8 | 8 |
| Tứ kết | `qf` | 8 | 4 | 4 |
| Tổng cộng | | | **28** | **4 đội vào bán kết** |

Không áp dụng vòng tròn hoặc cộng điểm tích lũy để cứu đội đã thua. Một đội thua cặp đấu sẽ dừng thi đấu ở giai đoạn đạt được.

Không đặc tả lại cách tổ chức Swiss, tranh suất Top 32, bán kết, chung kết hay giải thưởng. Luật thay đổi riêng cho chung kết không áp dụng trong ba vòng này.

## 2. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Đội | Nhóm thí sinh có mã đội và đội trưởng trên hệ thống. |
| Bot | Chương trình Python của đội, có hàm `make_move(state)`. |
| Phiên bản bot | Một bài nộp có mã định danh, mã nguồn, SHA-256 và trạng thái kiểm thử riêng. |
| Ván | Một lần chơi từ thế cờ ban đầu đến khi có kết quả thắng, thua hoặc hòa. |
| Trận | Gồm 2 ván chính đổi màu, có thể thêm 2 ván phụ nếu hòa. |
| Cặp đấu | Hai đội tranh một suất đi tiếp. Trong phạm vi này, mỗi cặp được quyết định bằng **1 trận**. |
| Phòng đấu | Không gian theo dõi riêng của một cặp đấu, có mã phòng và đường dẫn cố định, dùng chung cho các ván chính, ván phụ và lần chạy lại của cặp đó. |
| Seed trận | Giá trị khởi tạo ngẫu nhiên dùng cho việc chạy trận và bốc thăm khi cần. |
| Hạt giống | Vị trí 1–32 của đội trong danh sách đã chốt sau sơ loại; khác với seed trận. |
| Lần chạy | Một lần worker thực thi trận. Một trận có thể có nhiều lần chạy nếu được BTC cho chạy lại. |

## 3. Điều kiện tham dự và đầu vào

Trước khi tạo nhánh vòng 32, hệ thống phải có:

1. Danh sách 32 đội chính thức, sau khi hoàn tất việc tranh suất ở ranh giới Top 32 nếu có.
2. Thứ tự hạt giống 1–32 đã chốt và không trùng đội.
3. Thông tin đội trưởng, thành viên và ít nhất một phiên bản bot hợp lệ cho mỗi đội tham dự.
4. Bộ luật áp dụng, cấu hình tài nguyên và lịch khóa bot từng vòng đã công bố.

Thứ tự hạt giống dựa trên thứ hạng sơ loại đã chốt: điểm Swiss → điểm trung bình đối thủ → hiệu số ván thắng trừ ván thua. Các đội đã chắc suất nhưng bằng hoàn toàn các tiêu chí được bốc thăm phân hạt giống có lưu seed và nhật ký. Không dùng thứ tự đăng ký hay mã đội làm tiêu chí phụ ngầm.

Danh sách đội và thành viên giữ nguyên trong giai đoạn loại trực tiếp, trừ quyết định ngoại lệ có ghi nhận của BTC. Việc thay thành viên không được làm thay đổi danh tính đội hoặc chuyển suất đi tiếp cho đội khác.

Trường hợp đầu vào ít hơn 32 đội phải được BTC công bố là nhánh thiếu đội; áp dụng mục 10. Không âm thầm thêm tài khoản mẫu vào giải chính thức để đủ 32 đội.

## 4. Cách xếp nhánh và chuyển vòng

### 4.1. Nguyên tắc

- Dùng nhánh loại trực tiếp cố định, bố trí hạt giống tiêu chuẩn cho 32 đội.
- Không bốc lại cặp và không xếp lại theo thứ hạng sau mỗi vòng.
- Đội thắng chiếm vị trí tiếp theo trên nhánh của mình.
- Điểm, ĐTB đối thủ và hiệu số Swiss chỉ phục vụ xếp hạt giống ban đầu; không dùng để quyết định đội thắng một cặp đấu loại trực tiếp.

### 4.2. Nhánh vòng 32

Các số trong cột hạt giống là vị trí sau sơ loại, không phải ID đội trong database.

| Cặp | Hai hạt giống | Cặp | Hai hạt giống |
|---|---|---|---|
| M01 | 1 – 32 | M09 | 2 – 31 |
| M02 | 16 – 17 | M10 | 15 – 18 |
| M03 | 8 – 25 | M11 | 7 – 26 |
| M04 | 9 – 24 | M12 | 10 – 23 |
| M05 | 4 – 29 | M13 | 3 – 30 |
| M06 | 13 – 20 | M14 | 14 – 19 |
| M07 | 5 – 28 | M15 | 6 – 27 |
| M08 | 12 – 21 | M16 | 11 – 22 |

### 4.3. Nhánh vòng 16 và tứ kết

Ký hiệu `W(Mxx)` là đội thắng cặp `Mxx`.

| Vòng 16 | Cặp đấu | Tứ kết | Cặp đấu |
|---|---|---|---|
| M17 | W(M01) – W(M02) | M25 | W(M17) – W(M18) |
| M18 | W(M03) – W(M04) | M26 | W(M19) – W(M20) |
| M19 | W(M05) – W(M06) | M27 | W(M21) – W(M22) |
| M20 | W(M07) – W(M08) | M28 | W(M23) – W(M24) |
| M21 | W(M09) – W(M10) | | |
| M22 | W(M11) – W(M12) | | |
| M23 | W(M13) – W(M14) | | |
| M24 | W(M15) – W(M16) | | |

Đầu ra cuối cùng là `W(M25)`, `W(M26)`, `W(M27)`, `W(M28)`. Đây là 4 đội vào bán kết; không tự xếp thứ hạng 1–4 trong giai đoạn này.

### 4.4. Công bố đối thủ trước mỗi vòng

1. Sau khi kết quả giai đoạn trước được BTC chốt, hệ thống xác định các cặp của vòng kế tiếp theo nhánh cố định. Với vòng 32, phải chốt danh sách và hạt giống sau sơ loại trước khi công bố.
2. Công bố nhánh và gửi thông báo trong ứng dụng tới toàn bộ thành viên của cả hai đội, bao gồm đội trưởng, **trước hạn khóa phiên bản bot** của vòng đó. Không chờ đến lúc trận bắt đầu mới thông báo đối thủ.
3. Thông báo phải có tên đối thủ, mã cặp, vòng đấu, link phòng, thời điểm công bố, hạn nộp/chọn bot, hạn khóa bot, lịch thi dự kiến và các thay đổi liên quan.
4. BTC công bố trước khoảng thời gian chuẩn bị. Các cặp trong cùng vòng được công bố theo cùng một mốc và có cùng khoảng thời gian chuẩn bị; hệ thống không được khóa vòng ngay sau thông báo nếu chưa đủ thời gian đã công bố.
5. Thí sinh được sửa và chọn bot trong thời gian chuẩn bị theo mục 7. Biết đối thủ không cấp quyền truy cập mã nguồn, bài nộp chưa công khai hoặc log riêng của đối thủ.
6. Thông báo vẫn được lưu khi người nhận offline. Không bắt buộc hai đội phải cùng online, đã đọc thông báo hoặc xác nhận sẵn sàng thì worker mới được thi đấu.
7. Nếu đối thủ hoặc lịch thi thay đổi do chạy lại/xử lý ngoại lệ trước khi khóa vòng, BTC phải thu hồi hiệu lực thông báo cũ, gửi thông báo điều chỉnh tới cả hai đội và công bố lại các mốc bị ảnh hưởng. Bảo đảm thời gian chuẩn bị theo chính sách đã công bố; không âm thầm đổi đối thủ sát giờ khóa.

Nhánh công khai cho phép dự đoán đối thủ tương lai, nhưng các nhãn `W(Mxx)` chỉ là vị trí chờ, chưa phải thông báo đối thủ chính thức. Email hoặc kênh nhắc bổ sung có thể triển khai sau; thông báo trong ứng dụng và lịch trên phòng là nguồn thông tin chính thức.

### 4.5. Phòng riêng cho từng cặp đấu

- Mỗi cặp có đúng một phòng được tạo khi công bố cặp đấu. Với đủ 32 đội, có 16 phòng vòng 32, 8 phòng vòng 16 và 4 phòng tứ kết, tổng cộng **28 phòng**.
- Phòng được liên kết từ nhánh đấu, thông báo và khu vực thi đấu của hai đội. Mỗi thành viên được xem các phòng của đội mình, không chỉ riêng đội trưởng.
- Cùng một phòng được dùng cho cả 2 ván chính, 2 ván phụ nếu có và các lần chạy lại. Không tạo phòng mới cho từng màu hoặc mỗi lần chạy.
- Đội đi tiếp sang vòng khác sẽ có phòng mới theo cặp mới. Phòng cũ vẫn tồn tại để xem lại và tra soát.
- Phòng hiển thị hai đội và hạt giống, lịch chuẩn bị/khóa/thi, trạng thái bot của từng đội theo quyền xem, bàn cờ, ván đang diễn ra, kết quả các ván, tổng điểm và đội đi tiếp.
- Các trạng thái phải thể hiện được: đang chuẩn bị, đã khóa/chờ chạy, đang thi đấu, chờ BTC xử lý sự cố, đã chạy xong/chờ chốt, đã chốt, hoặc miễn đấu/hủy theo quyết định BTC. Trạng thái phòng phải thống nhất với trạng thái trận và lần chạy hiện hành.
- Phòng là nơi theo dõi. Không dùng thao tác vào phòng, rời phòng, nút sẵn sàng hay việc một đội offline làm điều kiện quyết định thắng thua. Worker chạy trên máy chủ theo lệnh/lịch điều hành đã công bố; đóng trình duyệt không dừng trận.
- Phòng của cặp thiếu đối thủ hiển thị lý do miễn đấu và quyết định đi tiếp; không giả lập một ván cờ để có diễn biến.

Quyền xem của khán giả và phạm vi dữ liệu trong phòng tuân theo mục 11.2; có link phòng không đồng nghĩa được truy cập mọi dữ liệu.

## 5. Luật bàn cờ dùng trong cả ba vòng

### 5.1. Bàn cờ, quân và thế xuất phát

- Bàn cờ 9 × 9: cột A–I, hàng 1–9.
- Hai bên là Xanh và Hồng; Xanh đi trước.
- Mỗi bên có 10 quân: 3 Búa (`ROCK`), 4 Bao (`PAPER`), 3 Kéo (`SCISSORS`).
- Ô đích của Xanh là **I9**, ô đích của Hồng là **A1**.
- Mỗi ván bắt đầu lại từ thế cờ chuẩn, không tiếp tục thế cờ của ván trước.

| Loại quân | Vị trí Xanh ban đầu | Vị trí Hồng ban đầu |
|---|---|---|
| Búa | B4, C3, D2 | H6, G7, F8 |
| Bao | B5, C4, D3, E2 | H5, G6, F7, E8 |
| Kéo | C5, D4, E3 | G5, F6, E7 |

### 5.2. Di chuyển và ăn quân

Mỗi lượt di chuyển một quân sang một ô liền kề theo một trong 8 hướng, kể cả đường chéo. Không được ra ngoài bàn cờ hoặc nhảy qua ô.

Bảng khắc chế giữ nguyên trong cả ba vòng:

| Quân di chuyển | Ăn được |
|---|---|
| Búa | Kéo |
| Kéo | Bao |
| Bao | Búa |

Được đi vào ô trống hoặc ô có quân đối phương bị quân mình khắc chế. Quân cùng đội, quân đối phương cùng loại và quân đối phương mạnh hơn đều chặn đường; đi vào các ô đó là nước không hợp lệ. Khi ăn quân, quân bị ăn bị loại khỏi bàn và quân di chuyển chiếm ô đó.

### 5.3. Điều kiện kết thúc ván

Sau mỗi nước hợp lệ, kiểm tra theo thứ tự:

1. Đội vừa đi đưa quân vào ô đích của mình: thắng ván.
2. Đội vừa đi ăn hết **một trong ba loại quân** của đối phương: thắng ván; không cần ăn hết cả 10 quân.
3. Đối phương đến lượt nhưng không còn nước hợp lệ: đối phương thua ván.
4. Cùng một thế cờ xuất hiện lần thứ ba: phân định theo số quân còn lại.
5. Đạt giới hạn **200 nước của cả hai bên cộng lại**: phân định theo số quân còn lại.

Đối với điều kiện 4 và 5, bên còn nhiều quân hơn thắng; bằng số quân thì hòa. Thế cờ được coi là giống nhau khi vị trí, loại, màu của mọi quân và bên đến lượt đều giống nhau. Số lần lặp được tính lại từ đầu mỗi ván, bao gồm thế xuất phát.

Thua kỹ thuật do lỗi bot được xử lý theo mục 8, có thể kết thúc ván trước các điều kiện trên.

## 6. Cấu trúc trận và xác định đội đi tiếp

### 6.1. Hai ván chính đổi màu

| Ván | Đội A | Đội B |
|---|---|---|
| 1 | Xanh | Hồng |
| 2 | Hồng | Xanh |

Đội A/B được xác định theo vị trí trên nhánh và lưu trước khi chạy trận. Hai ván chính đều phải được chơi, kể cả khi một đội thắng ván 1. Mỗi ván khởi động lại tiến trình bot và bộ đếm lỗi.

Điểm ván: thắng 1; hòa 0,5; thua 0. Sau 2 ván, đội có tổng điểm ván cao hơn thắng trận và đi tiếp.

Ví dụ: thắng một ván và hòa một ván là thắng trận 1,5–0,5; mỗi bên thắng một ván hoặc cả hai ván hòa đều là hòa trận 1–1.

### 6.2. Phân thắng khi hòa

Nếu hòa sau hai ván chính:

1. Chơi thêm **đúng 2 ván phụ đổi màu**: ván 3 A cầm Xanh, ván 4 B cầm Xanh.
2. Giữ nguyên bộ luật, phiên bản bot và giới hạn tài nguyên của trận chính.
3. Tính lại tổng điểm của cả 4 ván. Đội có điểm cao hơn đi tiếp.
4. Nếu vẫn hòa, bốc thăm xác định đội đi tiếp bằng thuật toán dùng seed trận đã lưu. Ghi rõ kết quả được quyết định bằng bốc thăm.

Không dùng hạt giống, điểm Swiss, hiệu số hoặc thời gian suy nghĩ để ưu tiên một đội khi trận đã hòa. Không bốc lại seed vì kết quả không thuận lợi. BTC phải công bố cơ chế bốc thăm trước vòng 32; nếu muốn thay cơ chế này, phải sửa bản đặc tả và phần mềm trước khi thi.

Mỗi trận có 2 hoặc 4 ván. Với đủ 32 đội và không có chạy lại, tổng cộng 28 trận, từ **56 đến 112 ván**. Các cặp miễn đấu không phát sinh ván.

## 7. Nộp bot và khóa phiên bản

### 7.1. Yêu cầu bài nộp

- Nhận mã Python có hàm `make_move(state)`; dung lượng tối đa 1 MB (1.048.576 byte).
- Bot nhận trạng thái bàn cờ và danh sách nước hợp lệ; trả về một nước đi.
- Trạng thái bàn cờ là thông tin công khai trong ván; không có quân bị che.
- Một bài chỉ có trạng thái hợp lệ sau khi hoàn tất kiểm thử của worker. Bot đang chờ kiểm thử không được coi là đã hợp lệ.
- Kiểm thử hợp lệ kiểm tra giao tiếp và lỗi thực thi; không chứng nhận bot mạnh hoặc chắc chắn không lỗi ở mọi thế cờ.

### 7.2. Quy tắc khóa

Mỗi đội được khóa **một phiên bản cho từng vòng**: vòng 32, vòng 16 và tứ kết có ba lần khóa độc lập.

1. Trước hạn khóa, đội trưởng chọn bản thi trong các phiên bản hợp lệ của đội.
2. Khi khóa, hệ thống ghi mã phiên bản và SHA-256 cho vòng đó.
3. Mọi ván chính, ván phụ và lần chạy lại của vòng đều dùng đúng bản đã khóa.
4. Nộp hoặc chọn bản mới sau khi khóa không thay đổi bản đang thi trong vòng đó.
5. Đội đi tiếp được nâng cấp bot cho vòng kế tiếp nếu BTC đang mở nhận bài.
6. Không có bản hợp lệ mới thì giữ bản hợp lệ đang được chọn; nếu không còn bản được chọn hợp lệ, có thể dùng bản đã khóa hợp lệ gần nhất theo chính sách BTC đã công bố. Không tự chọn một bản đang lỗi hoặc đang chờ kiểm thử.

BTC công bố trước hạn nộp và hạn khóa của từng vòng, có tính đến thời gian chờ kiểm thử. Không mặc định có 24 giờ giữa hai vòng nếu BTC chưa công bố lịch đó.

Hạn khóa phải nằm sau mốc công bố đối thủ chính thức và đáp ứng khoảng chuẩn bị tại mục 4.4. Trong phòng, mỗi đội được xem mã phiên bản và trạng thái bản thi của chính mình; mã nguồn bot của đối thủ không được tiết lộ qua thông tin khóa.

Đội không có bất kỳ bản hợp lệ nào tại thời điểm chốt được xử lý là không đủ điều kiện thi theo mục 10; không để worker chạy một đường dẫn bot rỗng.

## 8. Giới hạn tài nguyên và lỗi bot

### 8.1. Thông số cơ sở

| Thông số | Giá trị |
|---|---|
| CPU cho một nước | Tối đa 200 ms |
| Thời gian chờ phản hồi một nước | Tối đa 1 giây |
| Khởi động bot mỗi ván | Tối đa 3 giây |
| Bộ nhớ mỗi bot | Mục tiêu giới hạn 256 MB |
| Số lỗi được tính trong một ván | Lỗi thứ 3 làm thua ván |
| Số nước mỗi ván | Tối đa 200, tổng cả hai bên |

Các giá trị trên là cấu hình cơ sở cần chốt trước cuộc thi. Nếu BTC đổi thông số, phải công bố trước và áp dụng thống nhất cho toàn bộ các đội trong cùng vòng. Không thay cấu hình giữa hai ván của một trận.

### 8.2. Lỗi tính vào bộ đếm

Nước không hợp lệ, exception trong `make_move`, hoặc vượt CPU nhưng vẫn phản hồi trước hạn chờ được tính là một lỗi.

- Ở lỗi thứ 1 và thứ 2: hệ thống chọn thay một nước hợp lệ theo bộ sinh ngẫu nhiên dùng seed, ghi rõ lỗi và nước đi thay.
- Ở lỗi thứ 3 trong cùng ván: đội đó thua ván.
- Bộ đếm lỗi đặt lại khi bắt đầu ván mới; không cộng dồn lỗi từ ván chính sang ván phụ.

### 8.3. Lỗi dừng bot

Không khởi động được, thiếu hàm `make_move`, tiến trình thoát/crash hoặc quá thời gian chờ khiến bot bị dừng được xử thua ván ngay. Ván tiếp theo vẫn được khởi động lại; thua một ván do lỗi không tự động làm thua cả trận.

Bot cố truy cập tài nguyên bị cấm có thể bị chặn và phát sinh lỗi thực thi. Nếu xác định có hành vi gian lận hoặc phá hoại, BTC xem xét xử lý kỷ luật riêng; không đồng nhất lỗi lập trình vô ý với vi phạm có chủ đích.

## 9. Quy trình điều hành một vòng

1. **Chuẩn bị:** xác nhận danh sách đội, cặp đấu, luật, lịch thi, thời hạn khiếu nại, thời gian chuẩn bị và cấu hình thực thi.
2. **Công bố và mở phòng:** tạo phòng riêng cho từng cặp, công bố nhánh và gửi thông báo đối thủ cho hai đội theo mục 4.4; bắt đầu thời gian chuẩn bị.
3. **Nhận/chọn bot:** thí sinh nộp, chờ kiểm thử; đội trưởng chọn bản thi trước hạn đã công bố.
4. **Khóa vòng:** sau khi đủ thời gian chuẩn bị, kiểm tra điều kiện từng đội, lưu bản bot của vòng và cập nhật trạng thái đã khóa trong phòng.
5. **Chạy trận:** worker thực thi các trận theo hàng đợi; phòng cập nhật diễn biến theo mục 11.3, không phụ thuộc trình duyệt của thí sinh đang mở hay đóng.
6. **Rà soát:** phòng hiển thị kết quả tạm; xử lý lỗi hệ thống, khiếu nại và quyết định chạy lại nếu có. Không công bố đối thủ chính thức của vòng sau khi kết quả còn cần sửa.
7. **Chốt vòng:** BTC xác nhận kết quả cuối cùng; hệ thống xác định đủ số đội đi tiếp, ghi trạng thái đã chốt trong phòng và khóa kết quả để chuyển vòng.
8. **Chuyển vòng:** dựng nhánh tiếp theo theo mục 4, tạo phòng và thông báo đối thủ vòng mới. Chu kỳ công bố → chuẩn bị → khóa bot phải được thực hiện lại cho vòng 16 và tứ kết.

Phải phân biệt **đã chạy xong** và **đã chốt để chuyển vòng**. Đối với vận hành mục tiêu, trạng thái chạy xong chưa cho phép tự vượt qua bước rà soát của BTC.

Lịch và thời hạn khiếu nại do BTC cấu hình/công bố trước vòng. Thời gian máy chủ là căn cứ cho các mốc khóa, nộp bài và tiếp nhận khiếu nại; giờ trên máy thí sinh chỉ có tính tham khảo.

## 10. Rút đội, miễn đấu và sự cố

### 10.1. Thiếu đối thủ hoặc đội rút

- Nhánh được công bố thiếu đội: đội ở cặp chỉ có một đối thủ hợp lệ được đi tiếp theo diện miễn đấu; không ghi thêm ván thắng giả.
- Đội rút hoặc bị loại do vi phạm trước khi chạy cặp: BTC xác nhận đối thủ được đi tiếp theo quyết định xử lý, có lý do và nhật ký riêng.
- Không tự đảo nhánh, thay đối thủ hoặc đưa đội đã thua trở lại.
- Cả hai đội cùng không đủ điều kiện, hoặc rút sau khi đã có kết quả: tạm dừng quyết định đi tiếp của cặp đó và để BTC xử lý bằng quyết định công bố rõ. Đây là ngoại lệ, không được giải quyết bằng cách tùy tiện chọn đội có ID nhỏ hơn.

### 10.2. Lỗi hệ thống

Mất kết nối database, worker chết, máy chủ quá tải hoặc sự cố môi trường phải được phân biệt với lỗi do chương trình bot. Không tự ghi một đội thua vì một lỗi hạ tầng chưa được xác định.

Trận có sự cố hạ tầng được giữ ở trạng thái cần xử lý. Khi chạy lại, giữ nguyên hai đội, phiên bản bot, luật và seed trận; tạo lần chạy mới, giữ lịch sử cũ. Điểm/kết quả chính thức chỉ lấy từ lần chạy được sử dụng, không cộng hai lần.

Nếu cả hai bot đều lỗi khởi động, cần xác minh nguyên nhân chung của môi trường trước khi phán quyết. Phần mềm không được mặc nhiên xử đội khởi động trước là đội thua nếu chưa xác định lỗi riêng của đội đó.

### 10.3. Chạy lại vòng hiện tại

BTC chỉ cho chạy lại để xử lý sự cố hoặc khiếu nại có căn cứ, không dùng chạy lại để tìm kết quả mong muốn.

- Không chạy lại khi còn trận trong vòng đang thực thi.
- Chỉ chạy lại vòng gần nhất; vòng kế tiếp chưa được khóa hoặc bắt đầu.
- Giữ cặp đấu, bản bot, bộ luật và seed; giữ kết quả các vòng trước.
- Xóa hiệu lực kết quả cũ của vòng đang chạy lại và dựng lại nhánh sau theo kết quả mới.
- Giữ lịch sử các lần chạy. Chứng nhận đã cấp dựa trên kết quả bị thay đổi phải thu hồi hoặc cập nhật.
- Giữ nguyên mã phòng của cặp đang chạy lại; đánh dấu lần chạy cũ đã bị thay thế, đưa lần chạy mới thành diễn biến hiện hành và thông báo cho cả hai đội. Người xem không được nhầm nước đi của hai lần chạy là cùng một ván.
- Nếu nhánh sau thay đổi, các phòng và thông báo đối thủ vòng sau chưa chốt phải được cập nhật có lịch sử, theo mục 4.4; không thay đổi nội dung phòng cũ mà không thông báo.
- Nếu đã bắt đầu vòng sau, cần quy trình hoàn nguyên riêng được BTC phê duyệt; không được dùng nút chạy lại thông thường để sửa vòng trước.

Seed hỗ trợ tái hiện ngẫu nhiên; không bảo đảm mọi bot tùy ý sẽ cho diễn biến giống hệt khi có hành vi phụ thuộc thời gian, tài nguyên hoặc yếu tố không xác định khác.

## 11. Thông tin hiển thị và quyền truy cập

### 11.1. Kết quả một cặp đấu

Tối thiểu hiển thị hai đội, hạt giống, vòng, trạng thái, kết quả từng ván, tổng điểm ván, đội đi tiếp và cách phân định: ván chính, ván phụ, bốc thăm, miễn đấu hoặc quyết định của BTC.

Nếu giao diện hiển thị số ván thắng thay vì điểm ván, nhãn phải nêu rõ để tránh nhầm. Không trình bày một trận hòa 2–2 điểm nhưng có đội đi tiếp bằng bốc thăm như một chiến thắng thông thường.

### 11.2. Quyền xem dữ liệu

- Công khai: nhánh đấu, trạng thái và kết quả theo chính sách đã công bố.
- Đội trong trận: được xem lại diễn biến theo quyền hệ thống; chỉ thấy log chi tiết của bot mình.
- Thành viên hai đội được truy cập cùng phòng và theo dõi bàn cờ trực tiếp. Đội trưởng có quyền chọn bot trước hạn khóa; các thành viên khác không được dùng phòng để vượt quyền này.
- Đội khác/người ngoài: chỉ xem diễn biến nếu BTC bật công khai cho giai đoạn.
- Mã nguồn bot là dữ liệu của đội, không tự công khai vì đội tham gia loại trực tiếp.
- Admin có quyền xem dữ liệu để điều hành và tra soát; mọi thao tác thay đổi quan trọng phải có nhật ký.
- BTC quyết định mở hay đóng quyền khán giả theo từng giai đoạn; nhánh, lịch và kết quả công khai không mặc nhiên mở mã nguồn hoặc log lỗi. Hệ thống phải kiểm tra quyền phía máy chủ đối với cả dữ liệu xem lại và luồng cập nhật trực tiếp.

### 11.3. Theo dõi trực tiếp và xem lại trong phòng

**Theo dõi trực tiếp là yêu cầu mục tiêu của phòng đấu.** Trong lúc worker thi đấu, phòng phải cập nhật số ván, màu, bên đến lượt, nước vừa đi, bàn cờ, số quân và kết quả khi ván kết thúc. Diễn biến được cập nhật khi máy chủ nhận nước đã kiểm tra hợp lệ, không chờ toàn bộ trận kết thúc mới xuất hiện. Lỗi bot và log chỉ hiển thị chi tiết theo quyền ở mục 11.2.

Khi người xem tải lại hoặc kết nối lại, hệ thống cung cấp trạng thái mới nhất và các sự kiện đã bỏ lỡ. Mỗi sự kiện phải gắn mã phòng, trận, lần chạy, ván và thứ tự nước để không hiển thị trùng hoặc trộn diễn biến. Mất kết nối của người xem không làm mất nước đi, dừng bot hay xử đội đó thua.

Sau trận, cùng phòng chuyển sang chế độ xem lại, cho phép chọn ván, xem từng nước và phân biệt các lần chạy. Phải đánh dấu kết quả tạm, kết quả đã chốt và lần chạy bị thay thế. BTC xử lý sự cố có thể tạm dừng công bố kết quả cuối cùng mà không xóa lịch sử đã có.

Việc phát lại dữ liệu sau khi trận kết thúc không được gắn nhãn là trực tiếp. Hiện runner lưu diễn biến để xem lại; cần bổ sung cơ chế truyền/cập nhật tiến độ từ worker để đáp ứng yêu cầu trực tiếp này. Phương án kỹ thuật sẽ được chọn khi triển khai; tài liệu thể lệ không bắt buộc dùng một giao thức cụ thể.

## 12. Dữ liệu lưu trữ và tiêu chí nghiệm thu

### 12.1. Dữ liệu bắt buộc

| Nội dung | Dữ liệu cần lưu |
|---|---|
| Đội và tài khoản | ID đội, thành viên, đội trưởng, trạng thái tham dự |
| Bản bot | ID bài, mã nguồn, phiên bản, SHA-256, người nộp, thời gian, kết quả kiểm thử |
| Khóa phiên bản | Vòng, đội, bản bot đã khóa, thời điểm khóa |
| Nhánh | Mã cặp, vị trí nhánh, hai đội, hạt giống, cặp kế tiếp, đội đi tiếp |
| Phòng đấu | Mã phòng cố định, cặp/vòng liên quan, hai đội, chính sách khán giả, trạng thái, lịch công bố/khóa/thi, trận và lần chạy hiện hành |
| Thông báo đối thủ | Vòng/cặp/phòng, người nhận, nội dung, thời gian công bố, lịch và hạn khóa, trạng thái đọc, lịch sử điều chỉnh hoặc thu hồi |
| Trận | Hai đội, hai bản bot, bộ luật, seed, kết quả và lý do phân định |
| Lần chạy | Số lần chạy, worker, thời gian bắt đầu/kết thúc, lỗi hạ tầng |
| Ván | Màu của mỗi đội, các nước đi, lỗi, nước đi thay, kết quả và nguyên nhân kết thúc |
| Tiến độ trực tiếp | Mã lần chạy/ván, thứ tự sự kiện/nước, thời gian máy chủ và dữ liệu cần để khôi phục trạng thái khi kết nối lại |
| Điều hành | Người thực hiện, thời điểm, hành động, lý do khi chạy lại/xử lý ngoại lệ |

Kết quả phải liên kết đến đúng bản bot đã khóa và lịch sử chạy. Có thể tạo lại file Python thực thi từ mã nguồn trong database; mất cache không làm mất bài nộp.

### 12.2. Tình huống nghiệm thu

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| AT01 | Đủ 32 đội hợp lệ | 16 cặp vòng 32, không trùng hoặc bỏ sót đội |
| AT02 | Kiểm tra hạt giống | Nhánh đúng M01–M16 và cố định qua các vòng |
| AT03 | Chạy hết ba vòng, không ngoại lệ | 28 cặp được quyết định, còn đúng 4 đội |
| AT04 | A thắng cả 2 ván chính | A đi tiếp; không chạy ván phụ |
| AT05 | A thắng 1 ván, hòa 1 ván | A đi tiếp với điểm 1,5–0,5 |
| AT06 | Hai ván chính hòa điểm | Chạy thêm đúng 2 ván đổi màu |
| AT07 | Vẫn hòa sau 4 ván | Một đội đi tiếp bằng bốc thăm; lưu seed và lý do |
| AT08 | Nộp/chọn bot mới sau khi khóa | Trận hiện tại vẫn dùng bản đã khóa |
| AT09 | Đội thắng vòng 32 chọn bản hợp lệ mới trước vòng 16 | Chỉ vòng 16 trở đi dùng bản mới sau khi khóa |
| AT10 | Bot trả nước sai 3 lần trong một ván | Hai lần đi thay; lần thứ 3 thua ván |
| AT11 | Bot bị treo quá thời gian chờ | Thua ván; ván sau khởi động lại |
| AT12 | Lặp thế cờ 3 lần hoặc đạt 200 nước | So số quân; bằng nhau là hòa ván |
| AT13 | Worker chết giữa trận | Không ghi thua bot vì lỗi hạ tầng; có thể phục hồi/chạy lại và không cộng kết quả trùng |
| AT14 | Chạy lại vòng gần nhất khi vòng sau chưa bắt đầu | Giữ vòng trước, lịch sử và bản bot; cập nhật lại nhánh sau |
| AT15 | Yêu cầu chạy lại vòng trước sau khi vòng sau đã bắt đầu | Từ chối thao tác thông thường |
| AT16 | Đội khác truy cập mã nguồn/log riêng | Không được phép |
| AT17 | Mất file Python cache nhưng mã trong DB còn nguyên | Tạo lại file, kiểm tra hash và tiếp tục thực thi |
| AT18 | Có đội rút hoặc không có bot hợp lệ | Xử lý theo quyết định BTC, không phát sinh lỗi đường dẫn hoặc tự đổi nhánh |
| AT19 | Vòng chạy xong nhưng chưa chốt | Chưa cho bắt đầu vòng kế tiếp theo quy trình mục tiêu |
| AT20 | Cả hai bot không khởi động được | Chuyển xác minh nguyên nhân, không tự ưu tiên đội theo thứ tự thực thi |
| AT21 | Công bố đủ nhánh từ 32 xuống 4 | Có 28 phòng riêng, mỗi cặp đúng một phòng; link đúng từ nhánh và thông báo |
| AT22 | Chuẩn bị vòng 32, vòng 16 hoặc tứ kết | Cả hai đội nhận thông báo đối thủ và link phòng trước hạn khóa; bảo đảm thời gian chuẩn bị đã công bố |
| AT23 | Thành viên hai đội vào cùng phòng | Xem đúng lịch, trạng thái và bàn cờ; không đọc được mã nguồn/log riêng của đối thủ |
| AT24 | Trận đang chạy, có nước hợp lệ mới | Phòng cập nhật diễn biến khi trận chưa kết thúc, không chỉ phát lại sau trận |
| AT25 | Người xem offline, tải lại hoặc kết nối lại | Worker vẫn chạy; khôi phục được trạng thái mới nhất, không trùng hoặc thiếu nước |
| AT26 | Chạy ván phụ hoặc chạy lại trận | Giữ phòng cũ, phân biệt rõ ván và lần chạy; không trộn nước hoặc điểm |
| AT27 | BTC chưa mở quyền khán giả | Người ngoài không truy cập được dữ liệu phòng bị hạn chế, kể cả qua API/luồng trực tiếp |
| AT28 | Kết quả vòng trước bị thay đổi trước khi khóa vòng sau | Cập nhật phòng/đối thủ, lưu lịch sử điều chỉnh, gửi thông báo mới và điều chỉnh hạn chuẩn bị theo chính sách |
| AT29 | Một đội không vào phòng hoặc chưa đọc thông báo | Không xử thua chỉ vì thiếu hiện diện; trận chạy theo lịch/lệnh điều hành |

## 13. Đối chiếu với phần mềm hiện tại

| Hạng mục | Hiện trạng / việc cần làm |
|---|---|
| Ba vòng `r32`, `r16`, `qf` | Đã có; cấu hình cơ sở mỗi cặp 1 trận. |
| Luật bàn cờ và hai ván đổi màu | Đã có trong engine và runner. |
| Hai ván phụ, sau đó bốc thăm theo seed | Đã có; giữ làm phương án cơ sở trong tài liệu này. |
| Xếp hạt giống và chuyển nhánh cố định | Đã có. |
| Mỗi cặp có phòng riêng | **Cần bổ sung.** Đã có trang xem trận; chưa có đầy đủ vòng đời phòng từ công bố đối thủ, chuẩn bị, khóa bot đến chốt kết quả cho cặp đấu. |
| Thông báo đối thủ trước hạn khóa từng vòng | **Cần bổ sung.** Cần thông báo trong ứng dụng cho cả hai đội, lịch chuẩn bị, trạng thái đọc và xử lý thông báo điều chỉnh. |
| Theo dõi trực tiếp và kết nối lại | **Cần bổ sung.** Có lưu nước đi để xem lại; cần truyền tiến độ khi trận đang chạy, đồng bộ theo lần chạy và kiểm tra quyền truy cập. |
| Lưu mã bot trong DB, khóa theo vòng | Đã có; cần kiểm tra rõ thông báo khi không còn bản hợp lệ để dùng. |
| Lưu lần chạy, nước đi, log và chạy lại vòng gần nhất | Đã có. |
| Rà soát và chốt riêng trước khi chuyển vòng | **Cần bổ sung nếu áp dụng đặc tả mục tiêu.** Hiện vòng loại trực tiếp tự đánh dấu hoàn tất và tạo nhánh sau khi các cặp kết thúc; chưa có bước xác nhận vòng độc lập như Swiss. |
| Chặn bắt đầu vòng sai thứ tự | Giao diện có điều kiện hiển thị; cần bảo đảm API kiểm tra đủ điều kiện vòng trước và trạng thái đã chốt. |
| Rút đội / xử thua vì không đủ điều kiện | **Cần hoàn thiện.** Có cờ rút đội và xử lý nhánh thiếu đối thủ, nhưng chưa đủ một quy trình tự động cho mọi tình huống rút đội trong loại trực tiếp. |
| Cả hai bot cùng không khởi động được | **Cần bổ sung xử lý riêng** theo mục 10.2; không coi thứ tự kiểm tra tiến trình là tiêu chí thắng thua. |
| Khiếu nại và thời hạn | Đã có chức năng gửi hỗ trợ; cần quy định hạn, trạng thái xử lý và quan hệ với bước chốt vòng. |
| Giới hạn bộ nhớ và cách ly bot | Có chế độ `process` và `docker`; mức thực thi phụ thuộc môi trường. Trước khi mở thi công khai phải xác minh cách ly và giới hạn tài nguyên thực tế, không coi chạy Python riêng là đã đáp ứng đầy đủ. |
| Nhật ký lý do quyết định của BTC | Đã có nhật ký thao tác; cần bổ sung trường/lưu lý do bắt buộc cho các quyết định ngoại lệ nếu áp dụng mục 10. |

## 14. Các nội dung BTC cần chốt trước khi phát hành thể lệ

1. Giữ phương án 2 ván chính + 2 ván phụ + bốc thăm, hay thay quy tắc phân thắng khi hòa.
2. Giá trị tài nguyên chính thức sau khi đo trên môi trường thi.
3. Mốc công bố đối thủ, lịch nộp/khóa/thi, thời gian chuẩn bị bằng nhau giữa các cặp và hạn khiếu nại.
4. Chính sách khán giả trong phòng, quyền xem trực tiếp/xem lại, log và thời điểm công khai kết quả.
5. Chính sách đội rút, không có bot hợp lệ, cả hai đội không đủ điều kiện và xử lý gian lận.
6. Có áp dụng bước chốt vòng riêng của mục 9 hay tiếp tục cơ chế hoàn tất tự động hiện tại; nếu chọn khác, phải sửa đồng bộ tài liệu và phần mềm.
7. Chính sách thông báo điều chỉnh đối thủ/lịch thi và thời gian chuẩn bị lại khi kết quả vòng trước bị thay đổi. Thông báo trong ứng dụng là bắt buộc; kênh nhắc bổ sung nếu có phải được công bố rõ.

## Tài liệu và mã nguồn tham chiếu nội bộ

- [Luật và mô tả dự án](../README.md)
- [Luật bàn cờ](../src/game/board.js)
- [Cấu hình thông số](../src/config.js)
- [Xếp hạt giống](../src/services/swiss.js)
- [Điều phối giải và khóa bot](../src/services/tournament.js)
- [Chạy ván, trận và xử lý hòa](../src/runner/match.js)
- [Quản lý bài nộp](../src/services/submissions.js)
