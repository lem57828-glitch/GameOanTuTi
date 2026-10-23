# Kiểm chứng GitHub → trận thi chính thức

Ngày kiểm tra: 24/10/2026. Kết quả: **PASS**.

## Phạm vi đã chạy thật

- API NestJS, PostgreSQL và Redis thật. API `DEMO_MODE=false`; worker `NODE_ENV=production`, `DEMO_MODE=false`, sandbox Podman với image `docker.io/library/python:3.12`.
- Schema PostgreSQL riêng có tên ngẫu nhiên, áp dụng đủ 16 migration. Hàng đợi Redis và cổng API riêng. Không sửa giải, đội hoặc bot trong schema người dùng.
- Tài khoản/đội/giải được tạo làm fixture. Đăng nhập bằng email/mật khẩu thật qua API, không dùng endpoint đăng nhập mẫu. Phần đăng ký/email không thuộc kiểm thử này.
- GitHub API thật, không mock: repository `https://github.com/lem57828-glitch/GameOanTuTi`, commit `a8d405825d469c1271f2e022688d0bff2ad106bf`, hai file `apps/api/prisma/sample-bots/tham_an.py` và `apps/api/prisma/sample-bots/than_trong.py`.

## Kết quả

1. Bot nộp trực tiếp được xác thực để tập luyện nhưng bị từ chối khi chọn vào bộ thi chính thức.
2. Gửi tên nhánh `main` thay cho commit SHA bị từ chối.
3. Hai source từ GitHub được tải về, chuẩn hóa, hash và lưu snapshot đúng nội dung tại commit. Worker Python xác thực hợp lệ ở cả hai màu.
4. Đội trưởng chọn bộ bot; BTC khóa bộ. Thay bot sau khóa bị từ chối.
5. TV3 lập mức, khóa mức, tạo cặp Swiss; TV4 mở phòng cho cặp thật.
6. Mỗi đội chỉ được chọn bot trong bộ đã khóa. Lựa chọn chưa khóa không lộ cho khán giả. Hai bên sẵn sàng thì trận chạy, không chờ hết hạn.
7. Hai ván Swiss được Python bot chạy trong container, đổi màu giữa hai ván: ván 1 **24 nước, repetition**; ván 2 **30 nước, eliminate**. Không ván nào kết thúc do crash, timeout hoặc lỗi bot.
8. Job có `stageId` để kiểm tra bộ đã khóa. Kết quả và sự kiện replay được lưu. TV3 nhận kết quả với nguồn `match`; BTC xác nhận được vòng.
9. Bot GitHub đấu thử với cùng phiên bản của đội: **11 nước**; lựa chọn quân thứ 10 là Kéo được áp dụng, số sự kiện replay khớp số nước. Hash/commit của các snapshot thi chính thức giữ nguyên sau trận.
10. Đã dừng API/worker test, dọn hàng đợi riêng và xóa schema test.

## Chạy lại

Database, Redis và Podman/image phải sẵn sàng; cần truy cập GitHub công khai. Build source trước khi chạy:

```powershell
pnpm --filter @arena/api... build
pnpm --filter @arena/worker build
pnpm --filter @arena/api test:github-match
```

Script sẽ tạo và xóa schema test riêng, không chạy seed hoặc migration trên schema `public`. Báo cáo JSON được lưu tại `.tools/github-match-report.json`.

## Giới hạn

Đây là kiểm thử tích hợp qua HTTP/API và worker thật, chưa tự động bấm toàn bộ luồng trên trình duyệt. Đã kiểm tra repository công khai; chưa kiểm tra repository riêng tư, sự cố GitHub/rate limit, tải đông hoặc thao tác thay đổi repository từ bên ngoài.
