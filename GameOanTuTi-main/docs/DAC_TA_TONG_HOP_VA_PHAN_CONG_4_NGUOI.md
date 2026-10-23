# ĐẶC TẢ TỔNG HỢP VÀ PHÂN CÔNG XÂY DỰNG LẠI BOT ARENA

**Phiên bản:** 1.0 — Dự thảo ngày 19/10/2026  
**Phạm vi:** Đăng ký → sơ loại → chọn 32 đội → loại trực tiếp → chọn 4 đội  
**Định hướng:** Xây lại hệ thống từ đầu; mã cũ chỉ dùng tham khảo.

## 1. Căn cứ và nguyên tắc tổng hợp

Tài liệu này tổng hợp ba nguồn:

1. [Đặc tả sơ loại của đồng đội](https://docs.google.com/document/d/1l8pLCWdKvBot9idfHwyjNzvEGvKQnt7YkC-fJV5vOW8/edit): các mức chọn đội, lịch đăng ký, thời gian khóa và cách tính điểm.
2. [Đặc tả chức năng hệ thống của đồng đội](https://docs.google.com/document/d/1jZrHQOS0nrkqo7pHbpJw46BJL-86XZ95O8TPEIoXIn0/edit): tài khoản, đội, GitHub, giải đấu, sandbox, phòng đấu, xem giải và hỗ trợ.
3. [Thể lệ 32→4 phiên bản 2.0](THE_LE_VONG_LOAI_32_DEN_4.md): cây nhị phân, trận 5 hiệp, bộ 3 bot, chọn quân thứ 10, tung đồng xu, phòng công khai và thời gian giữa hiệp.

Khi có khác biệt, quy định 32→4 mới nhất được ưu tiên trong giai đoạn loại trực tiếp. Các mục có nhãn **Đề xuất** là phương án để nhóm chốt; không phải yêu cầu đã thống nhất trong cả ba nguồn. Các câu hỏi chưa có câu trả lời được gom ở mục 10, không tự biến thành luật chính thức.

**Chưa thiết kế bán kết/chung kết:** sau khi chọn đủ 4 đội, hệ thống lưu kết quả và dừng ở trạng thái chờ giai đoạn tiếp theo. Bán kết, chung kết sẽ đổi luật và thi offline; không áp dụng mặc định quy trình online của vòng 32→4 cho các vòng này.

## 2. Vai trò và tài khoản

| Vai trò | Quyền chính |
|---|---|
| Khách, không đăng nhập | Xem thông tin công khai, nhánh, bảng xếp hạng, phòng trực tiếp và replay được công khai. |
| Thí sinh | Quản lý hồ sơ, tham gia một đội trong cùng giải, nộp/xem bot của đội, đấu thử và xem phòng. |
| Đội trưởng | Quản lý đội/mời thành viên, xác nhận bộ bot, chọn bot và quân thứ 10, sẵn sàng và gửi khiếu nại chính thức. |
| Admin/BTC/Trọng tài | Cấu hình giải, duyệt đội, điều hành, xử lý khiếu nại/sự cố, chốt kết quả; hành động phải được ghi nhật ký. |

Yêu cầu tài khoản:

- Tên đăng nhập và email không trùng; kiểm tra phía máy chủ và ràng buộc trong database, không chỉ kiểm tra trên giao diện.
- Theo nguồn 2, email sinh viên có phần trước `@` bắt đầu bằng `26` và miền `vnu.edu`. **Phải xác nhận lại miền chính xác trước triển khai**; không tự thay thành một miền khác.
- Có xác minh email, mật khẩu được băm, khôi phục mật khẩu và giới hạn thử đăng nhập. Cơ chế có cần xác minh lại mỗi lần đăng nhập phải được nhóm chốt.
- Hồ sơ gồm avatar, tên, email, ID, mã sinh viên, lớp/khoa; phải hoàn tất các trường bắt buộc trước khi lập đội hoặc được duyệt thi đấu.
- Xem lịch sử thi đấu, thống kê thắng/hòa/thua và thành tích đã đạt. Huy hiệu có thể thể hiện các mốc sơ loại/Top 32/Top 4; chưa xác định vô địch khi phạm vi chỉ đến 4 đội.

## 3. Đội và thời gian đăng ký

- Công bố đợt thi trước hạn đăng ký **2 tuần**, có thông báo trên website/fanpage.
- Đội dự thi có **2–4 thành viên**, gồm đội trưởng. Có thể tạo đội nháp một người, nhưng chỉ duyệt hợp lệ khi đủ 2–4 người trước hạn.
- Một thí sinh chỉ tham gia một đội trong cùng giải. Có tạo đội, mời/tham gia qua email hoặc ID, mã/link mời, rời đội và chuyển đội trưởng trước khi khóa đội hình.
- Tên đội phải được kiểm tra trùng khi nhập và khi lưu. **Đề xuất:** chuẩn hóa khoảng trắng, Unicode và chữ hoa/thường; tên duy nhất trong cùng giải, ID đội là định danh ổn định.
- Đội có link GitHub, danh sách bot/phiên bản đã nhận và chat nội bộ. Mã mời không được làm lộ mã nguồn hoặc thông tin riêng của đội.
- Hết hạn đăng ký thì khóa thay đổi thành viên và bộ bot cho mức sơ loại sắp thi. Việc khóa này không cấm cập nhật bot mãi mãi: mở lại thời gian nộp bot trước mức/vòng tiếp theo theo lịch.
- Theo nguồn 1, luật chi tiết được cung cấp trên web khi đội đã được thành lập. BTC cần bảo đảm mọi đội đủ điều kiện đều có quyền truy cập luật và mốc chuẩn bị rõ ràng.

## 4. Bot, GitHub và thực thi

### 4.1. Nộp và quản lý phiên bản

- Thống nhất bot dùng **Python**, giao diện `make_move(state)`; phát hành bot mẫu và mô tả dữ liệu bàn cờ/nước đi.
- Nhận bot từ GitHub, ghi rõ repository và commit SHA. Chỉ chấm bản mã đã tải và kiểm thử thành công; commit mới trên GitHub không tự thay bản đã khóa.
- Lưu nội dung mã nguồn, mã phiên bản, SHA-256, commit nguồn nếu có, người nộp, thời gian nhận và kết quả kiểm thử. Database phải đủ để phục hồi mã bot, không chỉ lưu link GitHub hoặc đường dẫn file.
- Đội xem được phiên bản và lịch sử các commit mà hệ thống thực sự đã nhận. Không thể hiện một commit chưa tải về như đã sẵn sàng thi.
- **Đề xuất:** nhận tệp Python trực tiếp làm kênh dự phòng; nếu nhóm chỉ chọn GitHub thì phải nêu rõ trong hướng dẫn. Kho riêng tư cần cơ chế cấp quyền an toàn, không gửi token xuống trình duyệt.
- Sơ loại sử dụng một bot chính thức cho mỗi đội trong mỗi mức. Vòng 32→4 khóa bộ từ 1 đến tối đa 3 bot cho mỗi đội trong mỗi vòng.

### 4.2. Kiểm thử và sandbox

- Web không trực tiếp thực thi mã thí sinh. Worker chuyên chạy bot trong môi trường cách ly, giới hạn CPU, RAM, thời gian và tiến trình; chặn mạng và truy cập dữ liệu đội khác.
- Đóng gói cả web bằng Docker không thay thế sandbox riêng cho mã bot. Phải kiểm chứng cách ly thực tế trước khi nhận mã công khai.
- Worker có hàng đợi, heartbeat, trạng thái lỗi, chống xử lý trùng và phục hồi sau khi chết giữa trận.
- Ghi lỗi riêng cho đội sở hữu bot. Phân biệt lỗi bot với lỗi hạ tầng; xử lý bot sai/treo theo luật đã công bố.
- Có báo cáo trùng mã/độ tương đồng để BTC xem xét; không tự xử loại chỉ vì giống bot mẫu. **Đề xuất:** kiểm tra trùng chính xác trong bản đầu, đánh giá tương đồng nâng cao sau.

### 4.3. Đấu thử

Cho đội đấu với bot mẫu hoặc cho hai phiên bản bot của chính đội thi đấu. Lưu log và replay; không tính điểm giải. Có giới hạn số lượt và ưu tiên tài nguyên cho trận chính thức.

## 5. Sơ loại theo các mức chọn đội

### 5.1. Các mức và lịch thi

- Mục tiêu thiết kế: khoảng **1.000 đội → 500 → 200 → 100 → 32**. Tất cả con số là số **đội**, không phải số thành viên.
- Nếu số đội ban đầu ít hơn, bỏ các mức không cần thiết; BTC công bố danh sách mức trước khi thi. Ví dụ đề xuất: 180 đội thì chọn 100 rồi 32. Cách xử lý khi có dưới 32 đội phải được chốt riêng.
- Sau hạn đăng ký, ngày tiếp theo công bố mức đầu tiên theo lịch nguồn 1. Giữa các mức có **1 ngày chuẩn bị**; các đội còn suất có thể cập nhật bot.
- Mốc dự kiến mỗi ngày thi: **18:00 khóa bot, 20:00 công bố kết quả**, theo giờ Việt Nam. Công bố rõ ngày thi; không chỉ hiển thị giờ thiếu ngày.
- Khoảng 18:00–20:00 không thay mã hoặc bản thi của mức đang chạy. Nếu trận/sự cố chưa xử lý xong lúc 20:00, thông báo chậm kết quả; không chọn đội từ bảng điểm chưa đủ trận.

### 5.2. Ghép cặp và tính điểm

- Mỗi mức dự kiến mỗi đội chơi **3–5 trận**; phải chọn một số vòng cụ thể trước mức và áp dụng đồng đều, không tự cho đội này 3 trận, đội khác 5 trận.
- Nguồn 1 đề xuất vòng đầu ngẫu nhiên, sau đó ghép đội gần điểm nhau. Đây là **sơ loại chia mức có ghép Swiss trong từng mức**, không phải một bảng Swiss liên tục giữ điểm từ 1.000 đến 32 đội.
- Không bố trí tái đấu ngoài chính sách BTC đã công bố. Cần chốt phạm vi tránh tái đấu là trong một mức hay toàn bộ sơ loại; nếu không thể ghép, phải báo BTC thay vì âm thầm tạo cặp lặp.
- Điểm **trận sơ loại**: thắng 3, hòa 1, thua 0. Kết thúc mức, chọn đủ số đội có thứ hạng cao nhất; sang mức mới đặt điểm về **0**. Không đặt lại điểm sau từng vòng nhỏ trong cùng mức.
- Đặt lại điểm chỉ tạo bảng điểm của mức mới, không xóa kết quả hoặc lịch sử mức trước. Hạt giống Top 32 lấy từ kết quả mức cuối đã chốt theo tiêu chí được công bố, không tự cộng điểm các mức trước.
- Cấu trúc một trận sơ loại chưa được hai nguồn chốt. **Đề xuất:** giữ 2 ván đổi màu, so điểm ván để xác định thắng/hòa/thua trận; không tự dùng trận 5 hiệp của vòng 32→4 cho sơ loại.
- Số đội lẻ, cách tính bye, tiêu chí phụ và tranh suất ở ranh giới phải được chốt trước khi triển khai kết quả chính thức.
- **Đề xuất tiêu chí:** điểm → ĐTB đối thủ → hiệu số ván; nhóm bằng hoàn toàn vắt qua vị trí cắt phải xử lý tranh suất theo luật công bố, không tự loại bằng ID đội.

### 5.3. Bảng xếp hạng

Hiển thị mức, vòng, số trận đã chơi, điểm, tiêu chí phụ, thắng/hòa/thua và trạng thái tạm/đã chốt. Đội đi tiếp tô xanh, bị loại tô đỏ, đồng thời có nhãn chữ để không phụ thuộc màu. Dùng cùng cách gọi và định dạng trong các vòng; không dùng điểm Swiss thay cho điểm hiệp loại trực tiếp.

BTC chốt kết quả và xử lý các suất hòa trước khi tạo danh sách 32 đội cùng hạt giống.

## 6. Loại trực tiếp 32→4 — quy tắc đã thống nhất

### 6.1. Nhánh, lịch và phòng

- Dùng cây nhị phân, 32 đội ở các lá theo hạt giống; đội thắng đi lên nhánh, không ghép lại sau mỗi vòng.
- Vòng 32: 16 trận; vòng 16: 8 trận; tứ kết: 4 trận. Tổng cộng **28 trận**, chọn 4 đội; giữa hai vòng có **2 ngày** để sửa và đăng ký bộ bot mới.
- Mỗi cặp có phòng riêng, dùng chung cho các hiệp và lần chạy lại. Sang vòng mới tạo phòng mới.
- BTC thông báo đối thủ, link phòng, lịch và hạn đăng ký bot sau khi vòng trước được chốt, trước hạn khóa bot của vòng mới.
- Thí sinh khác và khách không đăng nhập được xem bàn cờ trực tiếp, kết quả và replay. Mã nguồn, lựa chọn đang giữ kín và log riêng không công khai.

### 6.2. Bộ bot và lựa chọn mỗi hiệp

- Mỗi đội đăng ký **1–3 bot hợp lệ**, khóa mã nguồn cho cả vòng. Được dùng lại một bot ở nhiều hiệp; không sửa mã hoặc thêm bot giữa hiệp.
- Đội trưởng chọn **một bot và loại quân thứ 10** trước mỗi hiệp. Lựa chọn kín; chỉ công bố đồng thời khi hai đội sẵn sàng hoặc hết hạn chọn.
- Giữa hai hiệp có **tối đa 10 phút** để chọn bot, chọn quân và gửi khiếu nại/ý kiến. Cả hai sẵn sàng thì được bắt đầu sớm.
- Sau khóa lựa chọn, tung đồng xu độc lập mỗi hiệp. Đội thắng cầm Xanh và đi trước, đội còn lại cầm Hồng; lưu và công khai kết quả tung xu. Không bắt buộc luân phiên đi trước.
- Mỗi hiệp là một ván cờ mới, khởi động lại bot và bộ đếm lỗi. Đội trưởng vào phòng để lựa chọn; không yêu cầu tất cả thành viên cùng online.

### 6.3. Bàn cờ

- Bàn 9×9. Mỗi bên có 3 Búa, 3 Bao, 3 Kéo cố định và một quân tùy chọn Búa/Bao/Kéo, tổng cộng 10 quân. Quân tùy chọn không đổi loại trong hiệp.
- Đi một quân một ô theo 8 hướng. Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Chỉ vào ô trống hoặc ăn quân bị khắc; quân cùng đội, cùng loại hoặc mạnh hơn chặn đường.
- Thắng hiệp khi tới đích (Xanh: I9; Hồng: A1), ăn hết một loại quân đối phương, hoặc đối phương hết nước hợp lệ.
- Lặp thế cờ cùng bên đến lượt lần thứ ba hoặc đạt 200 nước tổng hai bên: bên nhiều quân hơn thắng, bằng nhau hòa.
- Ô xuất phát cụ thể của quân thứ 10 chưa chốt; không tự cho phép đội tùy ý đổi vị trí.

### 6.4. Hiệp và điểm

- Chơi **đủ 5 hiệp chính**, không dừng sớm. Mỗi hiệp thắng **3**, hòa **1**, thua **0** điểm.
- Hòa tổng điểm sau 5 hiệp thì chơi **đúng 2 hiệp phụ** theo cùng quy trình chọn bot/quân, tung xu và nghỉ tối đa 10 phút.
- So điểm cả 7 hiệp; vẫn hòa thì bốc thăm công khai, có ghi nhận. Không ưu tiên hạt giống hoặc điểm Swiss.
- Đội có điểm cao hơn thắng trận và đi tiếp. Điểm không chuyển sang trận/vòng mới.

### 6.5. Lỗi, khiếu nại và chạy lại

- Thông số cơ sở từ thể lệ 2.0: 200 ms CPU/nước, 1 giây chờ phản hồi, 3 giây khởi động. Hai lỗi nước đi đầu được đi thay; lỗi thứ ba trong hiệp thua hiệp. Crash/không khởi động/quá hạn chờ thua hiệp ngay. Cần chốt RAM và đo giới hạn trên môi trường thi.
- Khiếu nại chính thức do đội trưởng gửi kèm hiệp, nước và bằng chứng trong khoảng giữa hiệp. Khán giả có thể gửi ý kiến nhưng không tự dừng/sửa trận.
- BTC có thể tạm hoãn hiệp kế tiếp để xác minh. Sau hiệp cuối, giải quyết các khiếu nại còn tồn trước khi chốt trận và chuyển vòng.
- Phân biệt lỗi hạ tầng với lỗi bot. Chạy lại giữ bot, loại quân thứ 10, màu/đội đi trước và kết quả tung xu đã khóa; lưu các lần chạy và không cộng điểm trùng.
- Giữ nguyên phòng khi chạy lại, phân biệt lần chạy cũ/mới. Nếu thay đổi đội đi tiếp, phải điều chỉnh nhánh/phòng/thông báo trước khi vòng sau bắt đầu.

## 7. Các chức năng dùng chung

| Nhóm chức năng | Yêu cầu tổng hợp và cách đưa vào kế hoạch |
|---|---|
| Quản trị giải | Tên, logo/banner, mô tả, luật, lịch, số đội, mức sơ loại, giới hạn và tài liệu đính kèm; duyệt hồ sơ, khóa đội/bot, theo dõi hàng đợi. |
| Điều hành và trọng tài | Xem bằng chứng/log, xử lý bot độc hại, tạm hoãn, quyết định chạy lại/xử lý đội rút; ghi người thực hiện, lý do và thời gian. Sửa lịch/nhánh không được âm thầm ghi đè kết quả đã chốt. |
| Phòng và spectator | Thông tin hai đội, luật, đồng hồ máy chủ, bàn cờ trực tiếp, điểm, kết quả, replay; không trộn sự kiện giữa các hiệp/lần chạy. Có lọc live/sắp tới/đã xong, tìm đội và mở phòng từ cây. |
| Chat và ý kiến | Chat nội bộ đội; hội thoại hai đội/BTC và mục ý kiến trong phòng. Phân biệt chat, ý kiến khán giả và khiếu nại chính thức; chống spam, kiểm tra quyền đọc. |
| Thông báo | Trung tâm chuông, chưa đọc/đã đọc; lịch, đối thủ, khóa bot, hiệp, kết quả, điều chỉnh, phản hồi trọng tài. Email xác minh bắt buộc; email nhắc lịch/Web Push là phần bổ sung theo nguồn 2. |
| Replay và dữ liệu | Play/pause/từng nước/tua nhanh; lưu bàn đầu, loại quân thứ 10, bot/phiên bản, màu, tung xu, nước, log riêng và kết quả. Tải lại trang phải khôi phục đúng tiến độ. |
| Truyền thông | Fanpage là kênh công bố; website lưu thông báo chính thức và tài liệu. Livestream nhúng, bài highlight và dự đoán khán giả là chức năng mở rộng. |
| Thành tích/thưởng | Lưu mốc đã đạt và thông tin giải thưởng. Chưa xác định danh hiệu vô địch khi chỉ triển khai đến Top 4. |
| Check-in | Nguồn 2 ghi tùy chọn. Nếu áp dụng, cần chính sách riêng; không tự xử thua chỉ vì khách/thành viên không mở phòng. |
| Thanh toán/ví/ngân hàng | Nguồn 2 có đề cập. **Đề xuất để giai đoạn sau**: chưa tích hợp thu phí, ví hay tự chuyển thưởng trong bản xây lại đến Top 4; phải được nhóm xác nhận phạm vi này. |

**Đề xuất phạm vi bản đầu:** làm đủ luồng từ đăng ký đến Top 4, GitHub/version, chạy an toàn, phòng trực tiếp/replay, thông báo và khiếu nại. Livestream, dự đoán, QR mời, tương đồng nâng cao, Web Push và tài chính triển khai sau khi luồng chính ổn định. Không xóa các yêu cầu này khỏi backlog.

## 8. Dữ liệu, an toàn và điều kiện vận hành

- Lưu tài khoản/hồ sơ/xác minh; đội/thành viên/mời; giải/mức/vòng/nhánh; mã nguồn/commit/phiên bản; bộ bot đã khóa; phòng/trận/hiệp/lựa chọn; tung xu; lần chạy/sự kiện; bảng điểm; thông báo/chat/khiếu nại/quyết định/audit.
- Một trận tách khỏi hiệp và lần chạy. Một hiệp chỉ có một kết quả có hiệu lực; lần chạy lại thay hiệu lực, không cộng thêm điểm.
- Mọi khóa thời gian, chốt lựa chọn kín, sẵn sàng, tung xu và ghi kết quả phải xử lý ở máy chủ, có chống yêu cầu trùng/đồng thời. Trước công bố đồng thời, API và sự kiện không được lộ lựa chọn đối thủ.
- ID, trạng thái và quyền phải kiểm tra ở máy chủ. Public replay không chứa source code, token GitHub/Turso hay log riêng. Mật khẩu không lưu dạng đọc được.
- Có backup database và diễn tập phục hồi, quản lý secret ngoài Git, log theo trận/hiệp/lần chạy, healthcheck và cảnh báo worker mất heartbeat.
- Ước lượng tải không chỉ dựa trên 28 trận loại trực tiếp. Nếu đủ 1.000 đội và mỗi mức 3–5 vòng, tổng sơ loại có thể khoảng **2.700–4.500 trận** khi các mức có số đội chẵn và đủ trận. Phải benchmark worker trước khi cam kết xử lý trong cửa sổ 18:00–20:00.
- Python là ngôn ngữ bot đã thống nhất; frontend/backend/database phải chốt một bộ công nghệ chung ở mốc đầu. Railway/Turso đã được chuẩn bị trong repo cũ nhưng chưa kiểm chứng vận hành thật, không coi đó là kết quả nghiệm thu cho hệ thống xây lại.

## 9. Phân công 4 người — cân bằng theo độ khó và đầu ra

Giả định 4 thành viên có thời gian tham gia và năng lực tương đương, dùng tên TV1–TV4 để nhóm điền tên thật. Điểm dưới đây là **ước lượng tương đối**, không phải số ngày hoặc số dòng code. Mỗi người nhận 30 điểm, có cả kiểm thử và tích hợp; không giao riêng một người làm toàn bộ kiểm thử/tài liệu.

### 9.1. TV1 — Tài khoản, đội và giao tiếp

| Gói việc | Điểm | Đầu ra phải bàn giao |
|---|---:|---|
| Đăng ký/đăng nhập, xác minh email, hồ sơ, phân quyền | 8 | API, màn hình, kiểm tra domain/username/email, hồ sơ bắt buộc, khôi phục mật khẩu. |
| Đội 2–4 người, mời/rời/chuyển chủ, kiểm tra tên, khóa đội hình | 6 | Luồng đội đầy đủ, không vượt giới hạn hoặc tham gia trùng giải. |
| Trung tâm thông báo và adapter email | 4 | Gửi/lưu trạng thái đọc; nhận sự kiện lịch, hiệp và kết quả từ TV3/TV4. |
| Chat dùng chung và chat riêng đội | 4 | Lưu hội thoại, quyền đọc, chống spam; TV4 dùng lại cho phòng. |
| Trang chủ, hướng dẫn, tài liệu/thông báo của BTC | 4 | Phần giới thiệu giải, hồ sơ và nội dung quản trị; không bao gồm điều hành trận của TV3/TV4. |
| Kiểm thử, tích hợp và tài liệu module | 4 | Test quyền, hết hạn, khóa thành viên, email/mời trùng; bộ dữ liệu mẫu. |
| **Tổng** | **30** | |

### 9.2. TV2 — Bot, luật cờ và worker cách ly

| Gói việc | Điểm | Đầu ra phải bàn giao |
|---|---:|---|
| GitHub, nhận mã, phiên bản/commit và kiểm thử hợp lệ | 6 | API/màn hình bot, snapshot mã bất biến, khóa phiên bản, báo cáo trùng chính xác. |
| Engine bàn cờ và giao diện bot Python | 5 | Luật cờ, 9 quân cố định + quân tùy chọn, trạng thái/nước hợp lệ và kiểm tra thắng/hòa. |
| Sandbox, hàng đợi thực thi, tài nguyên và phục hồi worker | 8 | Chạy độc lập web, heartbeat, giới hạn thực tế, phân biệt lỗi bot/hạ tầng. |
| Đấu thử, kết quả/sự kiện một hiệp cho module phòng | 4 | Test bot mẫu/nội bộ, hợp đồng đầu vào/đầu ra và stream sự kiện; không tự điều phối cả trận 5 hiệp. |
| Test bot lỗi/độc hại, benchmark và cấu hình chạy worker | 7 | Bộ test luật, timeout/crash, cách ly; báo cáo tải và script vận hành worker. |
| **Tổng** | **30** | |

### 9.3. TV3 — Giải đấu, sơ loại và kết quả chính thức

| Gói việc | Điểm | Đầu ra phải bàn giao |
|---|---:|---|
| Cấu hình giải, lịch đăng ký/mức/vòng và các mốc khóa | 4 | API và màn hình điều hành, không phụ thuộc đồng hồ trình duyệt. |
| Sơ loại chia mức, ghép Swiss, điểm/tiêu chí phụ và cắt suất | 10 | 3–5 vòng/mức, reset điểm đúng mức, xử lý lẻ/tái đấu/hòa theo chính sách đã chốt. |
| Hạt giống, cây 32→4, mở/chốt/chuyển vòng | 3 | Sinh cặp và đường đi cố định; cung cấp dữ liệu nhánh cho TV4; dừng ở Top 4. |
| Kết quả, khiếu nại/trọng tài và audit quyết định | 6 | Bảng xếp hạng, hồ sơ khiếu nại, duyệt quyết định và chặn chuyển vòng sai trạng thái. |
| Kiểm thử giải, công bằng lịch và tích hợp kết quả | 7 | Mô phỏng nhiều quy mô đội, lỗi/rút/chạy lại; đối soát điểm và kịch bản chốt vòng. |
| **Tổng** | **30** | |

### 9.4. TV4 — Phòng đấu, điều phối hiệp và trải nghiệm khán giả

| Gói việc | Điểm | Đầu ra phải bàn giao |
|---|---:|---|
| Trạng thái trận/hiệp, bộ 3 bot, chọn kín, sẵn sàng, 10 phút, tung xu và điểm 5+2 hiệp | 10 | Backend điều phối, khóa nguyên tử, gọi worker TV2 từng hiệp; tổng điểm trận và kết quả tạm. |
| Phòng trực tiếp, cập nhật tiến độ, xem lại và kết nối lại | 8 | Bàn cờ, đồng hồ, kết quả/log theo quyền; dùng sự kiện và engine từ TV2. |
| Cây nhị phân phía giao diện, spectator, tìm kiếm/lọc | 4 | Khách vào xem không đăng nhập; mở đúng phòng từ nhánh do TV3 cung cấp. |
| Chat phòng, ý kiến và gửi khiếu nại | 2 | Dùng nền chat TV1; chuyển khiếu nại chính thức sang module TV3, không tự phán quyết. |
| Test đồng thời, reconnect, quyền xem và tích hợp toàn trận | 6 | Không lộ lựa chọn, không double-start/double-score, chuyển hiệp/chạy lại đúng. |
| **Tổng** | **30** | |

Phân chia này cân bằng bằng cách giao TV2 phần rủi ro sandbox/luật, TV3 phần thuật toán giải và rà soát, TV4 phần trạng thái trực tiếp/đồng thời; TV1 ít thuật toán hơn nhưng có nhiều luồng tài khoản, đội và tích hợp email/chat. Sau mốc tích hợp đầu tiên, cập nhật điểm dựa trên việc còn lại và chuyển bớt đầu việc độc lập nếu có người lệch tải; không đổi người sở hữu module giữa chừng chỉ để cân số ticket.

### 9.5. Ranh giới và hợp đồng bàn giao

| Bên bàn giao → bên dùng | Hợp đồng chung cần chốt |
|---|---|
| TV1 → các module | Account/Team/Role, quyền, trạng thái hồ sơ và đội hình; Notification và Chat API dùng chung. |
| TV2 → TV3/TV4 | BotVersion bất biến; yêu cầu chạy một hiệp gồm bot A/B, luật, bố trí quân, màu, seed và giới hạn; sự kiện nước đi và kết quả chuẩn. |
| TV3 → TV4 | Stage/Pair/Room assignment, hai đội, hạt giống, lịch, trạng thái được phép thi và tham chiếu bộ bot. |
| TV4 → TV2 | GameRequested cho đúng hiệp đã khóa; không gọi lại do người xem reconnect; giữ nguyên lựa chọn khi retry. |
| TV4 → TV3 | MatchCompleted gồm kết quả 5 hoặc 7 hiệp, điểm, cách phân thắng và phiên bản kết quả; TV3 chốt chính thức và chuyển nhánh. |
| TV3 → TV4/TV1 | Quyết định tạm hoãn/chạy lại/chốt, lịch và đối thủ mới; TV4 thi hành trạng thái, TV1 thông báo. |

Đề xuất tổ chức module riêng `accounts-teams`, `bots-runner`, `tournaments`, `rooms-matches`; mỗi người làm API, màn hình và migration của module mình. Không cùng sửa một file API khổng lồ. ID, schema chung, mã lỗi, kiểu sự kiện và phân quyền phải được duyệt chung trước khi viết tách nhánh.

### 9.6. Các mốc làm việc và tiêu chí bàn giao

| Mốc | Công việc song song | Điều kiện kết thúc |
|---|---|---|
| M0 — Chốt nền | Cả nhóm chốt mục 10, schema, API/event, công nghệ, mock data và cách chạy dev. | Có hợp đồng module và bộ kịch bản chung; chưa cần đợi mọi màn hình xong. |
| M1 — Luồng tối thiểu | TV1 tài khoản/đội; TV2 bot + một hiệp; TV3 một mức sơ loại; TV4 phòng giả lập và chọn kín. | Tích hợp được đội thật → bot thật → hiệp thật → hiển thị kết quả. |
| M2 — Đủ phạm vi | Sơ loại nhiều mức → Top 32 → cây → trận 5+2 hiệp → Top 4; nối thông báo và khiếu nại. | Không cần sửa DB thủ công để chuyển vòng; khách xem được phòng. |
| M3 — Ổn định và diễn tập | Mỗi người test module mình và review module khác; thử lỗi/reconnect/tải, backup/restore, triển khai staging. | Qua checklist nghiệm thu, không lộ mã/token/lựa chọn kín; có báo cáo tải và hướng dẫn vận hành. |

Review chéo theo vòng TV1→TV2→TV3→TV4→TV1. Mỗi người chịu trách nhiệm test phần mình; cả nhóm cùng chạy kịch bản toàn hệ thống. Luân phiên người tích hợp/release và ghi biên bản để phần việc chung không dồn vào một người. Chưa ấn định số ngày khi nhóm chưa cung cấp thời gian làm việc và năng lực thực tế.

## 10. Các quyết định cần chốt trước khi lập trình phần liên quan

| Mã | Nội dung chưa thống nhất | Ảnh hưởng / đề xuất |
|---|---|---|
| Q01 | Miền email `vnu.edu`, tiền tố `26` và cách xác minh khi đăng nhập | TV1 xác nhận đúng tài khoản sinh viên thực tế trước khi khóa validation. |
| Q02 | Cấu trúc trận sơ loại | Chốt số ván và hòa trận; đề xuất 2 ván đổi màu, tách khỏi luật 5 hiệp. |
| Q03 | Số vòng mỗi mức, bye, phạm vi tránh tái đấu | BTC cấu hình trước mỗi mức; cùng số vòng cho mọi đội, không lặng lẽ lặp cặp. |
| Q04 | Tiêu chí phụ và tranh suất tại mọi mốc, nhất là Top 32 | Chốt cách xử lý nhóm bằng hoàn toàn; không chọn ngẫu nhiên mà chưa công bố. |
| Q05 | Quy mô đội nhỏ hơn mốc/nhỏ hơn 32 và lịch theo ngày | Chốt cách bỏ mức, miễn đấu, lùi kết quả khi chưa đủ trận. |
| Q06 | Sơ loại có dùng quân thứ 10 tùy chọn hay giữ 3 Búa–4 Bao–3 Kéo | Thể lệ mới chỉ chốt cho 32→4; đề xuất sơ loại giữ luật chuẩn hiện hành đến khi có quyết định khác. |
| Q07 | Ô xuất phát quân thứ 10, thời gian chọn trước hiệp 1 | TV2/TV4 cần cấu hình chuẩn; không tự suy ra đội được đặt quân tùy ý. |
| Q08 | Hết 10 phút nhưng đội chưa chọn hợp lệ hoặc đội trưởng offline | Chốt fallback, dùng lựa chọn trước hay quyết định BTC; không tự tạo luật xử thua mới. |
| Q09 | GitHub riêng tư, quy cách tệp/nhiều tệp, nộp trực tiếp | Chốt cách cấp quyền và gói bot tối đa; danh sách 3 bot là 3 phiên bản mã đã nhận, không phải 3 link biến động. |
| Q10 | RAM/CPU/thời gian, cấu trúc sandbox và ngân sách máy chạy | Đo thật, không cam kết 1.000 đội/2 giờ khi chưa benchmark. |
| Q11 | Check-in, kênh nhắc bổ sung, livestream/dự đoán, QR và tài chính | Xác nhận đề xuất ưu tiên ở mục 7; giữ backlog nhưng chưa làm tất cả trước luồng chính. |
| Q12 | Phạm vi quyền khiếu nại, hạn sau hiệp cuối và quyền điều chỉnh nhánh | Chốt chính sách trước khi hoàn thiện admin/hold/rerun, tránh xung đột với vòng sau. |

## 11. Checklist nghiệm thu chung

1. Đăng ký đúng điều kiện; hồ sơ và đội 2–4 người hợp lệ; không trùng tên/email/thành viên; khóa đội hình đúng hạn.
2. Nhận đúng commit bot, lưu mã và kiểm thử; thay commit sau khóa không đổi bot thi; bot không đọc được secret hoặc file đội khác.
3. Sơ loại ghép đúng số vòng, không cộng trùng điểm, đặt lại điểm đúng mức; xử lý ranh giới trước khi chốt Top 32.
4. Cây 32 lá sinh 16+8+4 cặp; giữ nhánh cố định, kết thúc đúng 4 đội và không tự chạy bán kết/chung kết.
5. Trận chơi đủ 5 hiệp; hòa thì đủ 2 hiệp phụ rồi bốc thăm nếu cần; mỗi hiệp điểm 3/1/0 và tung xu độc lập.
6. Chỉ chọn trong bộ 1–3 bot đã khóa; chọn quân thứ 10 hợp lệ; không lộ lựa chọn trước công bố đồng thời; hai đội sẵn sàng bắt đầu sớm hoặc hết 10 phút theo chính sách.
7. Khách xem trực tiếp/replay nhưng không đọc source code/log riêng; reconnect không chạy lại hiệp hoặc cộng điểm lần nữa.
8. Khiếu nại/hold/rerun có người, lý do, bằng chứng và lịch sử; không chuyển vòng khi kết quả chưa chốt.
9. Worker chết, mạng gián đoạn, thao tác trùng và bot lỗi không làm hỏng nhánh/điểm; phục hồi được từ bản sao lưu.
10. Cả nhóm bàn giao code, test, mock/seed, tài liệu API và hướng dẫn chạy; kiểm tra lại phân bố công việc bằng việc thực tế, không chỉ tổng điểm ước lượng.

**Ghi chú:** Tài liệu này mô tả hệ thống sẽ xây lại. Không coi các chức năng ở đây là đã có trong repo hiện tại. Bốn thành viên cần duyệt mục 10 và phần ưu tiên trước khi bắt đầu sprint đầu.
