# Demo và chính thức dùng chung code

Hai môi trường dùng cùng chức năng nộp bot, đấu thử, replay, giải đấu và engine. Không copy module hoặc fork luật. Demo thêm tài khoản mẫu, dữ liệu seed và mô phỏng; chính thức dùng tài khoản thật, bot GitHub và phòng đấu thật. Tách môi trường không đồng nghĩa các phần việc còn thiếu (trọng tài xử lý sự cố, bán kết/chung kết...) đã được hoàn thành.

## Cấu hình riêng

| Thành phần                             | Demo                    | Chính thức               |
| -------------------------------------- | ----------------------- | ------------------------ |
| File local (gitignored)                | `.env.demo`             | `.env.official`          |
| PostgreSQL schema                      | `arena_demo`            | `arena_official`         |
| Redis database                         | `/0`                    | `/1`                     |
| Queue prefix                           | `arena-demo`            | `arena-official`         |
| Cookie                                 | `arena_demo_session`    | `arena_official_session` |
| Web development                        | `http://localhost:5173` | `http://localhost:5174`  |
| API development                        | 3100                    | 3101                     |
| Đăng nhập mẫu / tạo đội mẫu / mô phỏng | Có                      | API từ chối              |
| Đấu thử và replay                      | Có                      | Có                       |

Các cổng có thể đổi nhưng không được trùng giữa hai profile. Redis có thể là cùng một instance; database số và namespace hàng đợi phải khác nhau. PostgreSQL có thể là cùng một instance/database; schema khác nhau nên dữ liệu không tự chia sẻ. Đây là tách dữ liệu ứng dụng, không phải tách quyền quản trị: production nên dùng credentials, PostgreSQL/Redis riêng và backup phù hợp. Không dùng Redis Cluster với cách phân chia database số này.

Các lệnh profile không sử dụng `.env` cũ làm cấu hình dự phòng. `env:init` chỉ đọc kết nối PostgreSQL/Redis, runtime container và SMTP hiện có để tạo file mới, đổi schema/Redis database và tạo hai session secret riêng; không ghi đè file profile đã có. Không tự nhập dữ liệu từ schema `public`.

## Chuẩn bị lần đầu

```powershell
pnpm install --frozen-lockfile
pnpm env:init
```

Kiểm tra hai file mới; bật PostgreSQL, Redis và Docker/Podman. Ở `.env.official`, điền SMTP thật và địa chỉ gửi phù hợp. Demo mặc định dùng hộp thư local. Không commit file cấu hình thật hoặc mật khẩu.

Dừng API/worker cũ trước khi generate/build để tránh DLL Prisma bị khóa trên Windows:

```powershell
pnpm db:generate
pnpm build
pnpm db:migrate:demo
pnpm db:seed:demo
pnpm db:migrate:official
```

Hai lệnh migrate chỉ cập nhật schema của profile tương ứng. Seed/reset mẫu bị chặn ở official, kể cả khi `NODE_ENV=development`. Không reset hoặc truncate database dùng chung để chuyển môi trường.

## Tạo BTC thật

Điền `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` (ít nhất 12 ký tự) trong `.env.official`, rồi:

```powershell
pnpm admin:create:official
```

Đây là lệnh vận hành, không có endpoint công khai để cấp quyền BTC. Nó tạo tài khoản admin có mật khẩu, đánh dấu email đã được xác minh bởi người vận hành, ghi audit và từ chối ghi đè khi đã có BTC thật. Xóa mật khẩu bootstrap khỏi file sau khi thành công. Đăng nhập BTC → Cấu hình giải để tạo/công bố giải mới; không cần seed giải mẫu.

## Chạy development

```powershell
pnpm dev:demo
```

Hoặc ở terminal khác:

```powershell
pnpm dev:official
```

Mỗi lệnh tự chạy **web + API + worker**. Không cần mở thêm `dev:worker`. Có thể chạy đồng thời hai profile vì cổng, cookie và dữ liệu tách nhau. Ctrl+C sẽ dừng các tiến trình con của đúng lệnh đó. Worker official yêu cầu container, không được tự fallback sang Python local.

`NODE_ENV=development` không có nghĩa bật demo: `dev:official` vẫn tắt toàn bộ công cụ mẫu, chỉ bật cơ chế watch khi phát triển. Các lệnh `pnpm dev`/`dev:worker` cũ vẫn hỗ trợ `.env` cũ để tương thích, nhưng không nên dùng lẫn với lệnh profile do có thể trùng cổng.

## Chạy bản build chính thức

```powershell
pnpm build
pnpm start:official
```

Lệnh này đặt `NODE_ENV=production`, chạy API và worker từ `dist`, và phục vụ web đã build từ API tại `WEB_PORT` (mặc định 5174); không chạy Vite dev server. API và Socket.IO cùng origin với web. Cấu hình `WEB_ORIGIN` là địa chỉ web thật khi triển khai. Production dùng cookie Secure, cần HTTPS/reverse proxy cho địa chỉ ngoài localhost; mở WebSocket qua proxy. Không tự áp dụng migration hoặc seed trong lệnh start. Sửa code không tự cập nhật tiến trình production: build và khởi động lại có kiểm soát.

## Nghiệm thu

- Demo: có banner, đăng nhập mẫu, seed và mô phỏng.
- Official: không có banner/nút mẫu; gọi trực tiếp endpoint demo cũng bị từ chối. Cookie demo không đăng nhập được official.
- Tạo account/bot/phòng trong một profile không xuất hiện ở profile kia.
- Profile bị cấu hình chung schema, sai Redis database, queue, cookie, trùng cổng hoặc secret phải từ chối trước khi khởi động.
- Đấu thử, chọn quân thứ 10 và replay vẫn có ở cả hai; không đổi Swiss/tranh suất vì tách môi trường.
- Kiểm tra SMTP thật riêng; OTP test local không chứng minh thư đã đến hộp thư thật.

Đổi môi trường không xóa dữ liệu cũ. Nếu cần chuyển tài khoản/giải đã có từ `public` sang official phải lập bước nhập dữ liệu riêng; không copy seed hoặc tự nâng quyền tài khoản mẫu.
