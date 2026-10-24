# Chạy thử giải trải nghiệm hai góc nhìn (BTC + sinh viên)

Hướng dẫn này giúp cả nhóm dựng lại buổi trình diễn: **một người làm BTC, một người làm sinh viên, cùng thao tác trên một giải**. Mọi trận đều do worker chạy bot Python thật; không có kết quả "bấm là ra".

Yêu cầu gốc: tài liệu bàn giao "Giải demo hai góc nhìn". Cách dựng môi trường demo/chính thức: [DEMO_VA_CHINH_THUC.md](DEMO_VA_CHINH_THUC.md).

---

## 1. Hai loại giải demo

|                | Giải trải nghiệm · Chạy bot thật   | Giải mô phỏng nhanh                   |
| -------------- | ---------------------------------- | ------------------------------------- |
| Dùng để        | Trình diễn hành trình sinh viên    | BTC thử ghép cặp, bảng điểm, cây giải |
| Kết quả đến từ | Phòng đấu, worker chạy bot         | Nút "Mô phỏng" (có nhãn "Mô phỏng")   |
| Nút mô phỏng   | **Bị chặn ở cả giao diện lẫn API** | Có                                    |
| Thêm đội mẫu   | Có (đội mẫu cũng đấu qua worker)   | Có                                    |

BTC chọn loại khi tạo giải (**Khu vực BTC → Cấu hình giải → Loại giải**; ô này chỉ hiện ở môi trường demo). Script ở bước 3 tạo sẵn một giải trải nghiệm.

---

## 2. Chuẩn bị (làm một lần)

Mở Docker Desktop, rồi ở thư mục dự án:

```powershell
pnpm install --frozen-lockfile
pnpm env:init            # tạo .env.demo và .env.official nếu chưa có
pnpm db:generate
pnpm build
pnpm db:migrate:demo
pnpm db:seed:demo        # tài khoản mẫu: BTC Demo, ...
```

Mỗi lần pull code mới có thư mục mới trong `apps/api/prisma/migrations/`, chạy lại `pnpm db:migrate:demo` (và `pnpm db:migrate:official` nếu dùng bản chính thức).

---

## 3. Tạo giải trải nghiệm

```powershell
pnpm demo:experience
```

Lệnh này tạo (chạy lại nhiều lần vẫn an toàn, không tạo trùng):

- **Giải trải nghiệm Bot Arena**: đã công bố, đang mở đăng ký. Đây là giải mới nhất nên trở thành "giải hiện tại".
- **3 đội đối thủ đã được duyệt**, mỗi đội có một bot nộp qua GitHub (repo của dự án, commit cố định). Bot ở trạng thái "chờ kiểm thử"; worker tự kiểm tra trong sandbox, khoảng nửa phút sau thành "Hợp lệ".
- **2 tài khoản sinh viên chưa có đội** để tự đi hành trình:
  - `tour_experience_sv1`: đội trưởng (lập đội, nộp bot, chọn bot).
  - `tour_experience_sv2`: thành viên (tham gia đội bằng mã).

Tùy chọn:

| Lệnh                                                               | Khi nào dùng                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `pnpm demo:experience -- --opponents 7`                            | Muốn tới **tứ kết có trận thật** (7 đối thủ + đội sinh viên = 8 đội). |
| `pnpm demo:experience -- --id tour_buoi2 --name "Buổi diễn tập 2"` | Tạo thêm một giải trải nghiệm mới, không đụng giải cũ.                |

Lệnh từ chối chạy ở môi trường chính thức. Nó không tạo mật khẩu, không sinh kết quả, không xóa dữ liệu.

Bật web + API + worker:

```powershell
pnpm dev:demo            # web http://localhost:5173
```

---

## 4. Kịch bản trình diễn

Dùng **hai trình duyệt riêng** (ví dụ Chrome cho BTC, Edge hoặc cửa sổ ẩn danh cho sinh viên). Không dùng hai tab cùng trình duyệt vì chung phiên đăng nhập.

Đăng nhập ở `http://localhost:5173/demo-login`:

- BTC: chọn **BTC Demo**.
- Sinh viên: chọn **Sinh viên trải nghiệm (đội trưởng)**.

| Bước                         | BTC làm                                                                                                                              | Sinh viên làm / thấy                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1. Lập đội                   | —                                                                                                                                    | **Đội của tôi** → tạo đội. Gửi mã đội cho thành viên (`tour_experience_sv2` tham gia bằng mã).                          |
| 2. Đăng ký giải              | —                                                                                                                                    | Thẻ **Đăng ký thi đấu giải** → đăng ký. Trang **Thi đấu của đội** báo "Chờ BTC duyệt đội".                              |
| 3. Duyệt đội                 | **Quản trị TV1 → Đội** → đổi trạng thái đội của sinh viên thành **Đã duyệt**.                                                        | Trạng thái đổi thành đã duyệt.                                                                                          |
| 4. Nộp bot                   | —                                                                                                                                    | **Bot của tôi → Nộp phiên bản mới → GitHub**, nhập thông tin ở mục 5. Chờ trạng thái **Hợp lệ** (bấm Đấu thử nếu muốn). |
| 5. Chọn bot                  | —                                                                                                                                    | **Thi đấu của đội**: chọn bộ bot sơ loại, rồi khung **Bot thi sơ loại** chọn bot cho mức.                               |
| 6. Lập kế hoạch + khóa mức   | **Điều hành thi đấu** → chọn số mức (giải 4 đội: 1 mức, giữ 32 đội, 3 vòng) → **Lưu kế hoạch** → nút chính **Khóa bot và mở Mức 1**. | Nhận thông báo "Mức 1 đã khóa"; bot của đội đã chốt cho cả mức.                                                         |
| 7. Ghép vòng + mở phòng      | Nút chính **Ghép vòng 1/3** → **Mở phòng thi đấu cho … cặp**.                                                                        | Thông báo "Đội bạn gặp …", rồi "Phòng đấu đã mở" → **Vào phòng**.                                                       |
| 8. Thi Swiss                 | Theo dõi tiến độ các phòng.                                                                                                          | Xem 2 ván đổi màu chạy trực tiếp; **Xem lại ván 1/2** để tua lại. Swiss **không có** bước chọn kín.                     |
| 9. Xác nhận vòng             | **Xác nhận vòng 1** khi đủ kết quả và không còn khiếu nại.                                                                           | Thông báo kết quả đã xác nhận; bảng xếp hạng cập nhật. Thua một cặp Swiss **không** có nghĩa bị loại.                   |
| 10. Lặp vòng 2, 3 → chốt mức | **Ghép vòng** → mở phòng → xác nhận, tới hết vòng; rồi **Chốt Mức 1 và cắt 32 suất**.                                                | Thông báo "Đội bạn vượt qua Mức 1" hoặc "dừng lại ở Mức 1".                                                             |
| 11. Loại trực tiếp           | **Bắt đầu Vòng 32** → mở phòng; tiếp theo Vòng 16, Tứ kết (xem ghi chú bên dưới).                                                    | Trong phòng: chọn kín bot **và quân thứ 10** cho từng hiệp, bấm sẵn sàng; 5 hiệp, hòa thì thêm 2 hiệp phụ.              |

### Về loại trực tiếp

Cây đấu luôn là 32 đội. Thiếu đội thì đội còn lại được **xử thắng do vắng đối thủ** (ghi rõ nhãn này, không phải trận worker đã chạy).

- **4 đội** (mặc định): mọi vòng loại trực tiếp đều là xử thắng vắng đối thủ, không có trận thật. Chỉ dùng để trình diễn Swiss.
- **8 đội** (`--opponents 7`): Vòng 32 và Vòng 16 là xử thắng; **tứ kết có 4 trận thật** với chọn kín và quân thứ 10.

Chọn trước buổi diễn và nói rõ với người xem.

---

## 5. Bot GitHub cho sinh viên

Bot nộp bằng file hoặc dán mã chỉ dùng **đấu thử**. Muốn dự thi, kể cả giải trải nghiệm, phải nộp qua GitHub theo commit. Có thể dùng bot mẫu trong repo dự án:

| Ô              | Giá trị                                          |
| -------------- | ------------------------------------------------ |
| Repo           | `https://github.com/lem57828-glitch/GameOanTuTi` |
| Commit         | `02d3c15ac4a4e80e3958098d4d3d7177f8b33b89`       |
| Đường dẫn file | `examples/bots/tinh_truoc.py`                    |

Đối thủ không dùng file `tinh_truoc.py` nên nộp file này không bị báo trùng mã. Các bot mẫu khác và lối chơi của chúng: [examples/bots/README.md](../examples/bots/README.md).

---

## 6. Khi gặp sự cố

| Hiện tượng                               | Cách xử lý                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot đứng ở "Chờ kiểm thử" lâu            | Worker chưa chạy hoặc Docker tắt. Kiểm tra `pnpm dev:demo` đang chạy và Docker Desktop đang bật.                                               |
| Sinh viên không thấy giải trải nghiệm    | Giải hiện tại là giải **mới nhất đang mở**. Nếu sau đó ai tạo giải khác, chạy lại `pnpm demo:experience -- --id <id mới>` để có giải mới nhất. |
| Chạy lại script báo "đã bắt đầu sơ loại" | Script không đổi đội/bot giữa chừng. Dùng **Bắt đầu lại phần thi đấu** (giữ đội, bot, kế hoạch), hoặc tạo giải mới bằng `--id`.                |
| Trận "Tạm dừng" trong phòng              | Hiệp lỗi khi chạy. BTC vào phòng bấm **Chạy lại hiệp lỗi**. Không có nút sinh tỷ số để vượt qua.                                               |
| Không xác nhận được vòng                 | Còn cặp chưa có kết quả hoặc còn khiếu nại mở (xử lý ở tab **Khiếu nại**).                                                                     |
| Thông báo không hiện                     | Thông báo gửi cho **thành viên của đội**. Đội tạo bằng nút "Thêm đội mẫu" không có tài khoản thành viên.                                       |

---

## 7. Chưa có trong phiên bản này

- BTC tự động (giai đoạn 2 trong tài liệu bàn giao).
- Nút cho BTC khóa bộ bot giai đoạn của từng đội. Hiện bộ bot khóa khi tới mốc khóa của giai đoạn (Cấu hình giải). Ở demo, bot cho mức sơ loại vẫn chốt khi BTC khóa mức.
- Bán kết, chung kết: hệ thống dừng ở Top 4.
- Mỗi sinh viên một giải riêng.
