# Kiến trúc và quy ước làm việc

## Cấu trúc
```
server/
  index.js            khởi động web
  app.js              ghép core + 4 module (không chứa nghiệp vụ)
  core/               NỀN DÙNG CHUNG — sửa qua review của cả nhóm
    config.js         cấu hình (đọc biến môi trường một chỗ)
    db.js             kết nối sqlite/libsql/turso, migration theo module, get/all/run/tx
    errors.js         mã lỗi chung, AppError, need(), todo()
    http.js           h() bọc handler, errorHandler, str()/int()
    auth.js           cookie phiên, loadUser, requireAuth, requireRole
    events.js         bus sự kiện + event_log (danh sách loại sự kiện là hợp đồng chung)
    audit.js          nhật ký hành động BTC/trọng tài
    contracts.js      hợp đồng dữ liệu giữa module + hàm kiểm tra
    module.js         defineModule(): bảng API → router, route chưa làm trả 501
    migrations/       bảng chung: users, audit_log, event_log, settings
  modules/<tên>/      MỖI NGƯỜI MỘT MODULE
    index.js          bảng API của module
    service.js        nghiệp vụ; phần đầu là hàm cho module khác dùng
    migrations/       lược đồ của module (NNN_ten.sql)
    README.md         việc cần làm, hợp đồng, quyết định liên quan
worker/index.js       khởi động worker chạy bot (TV2)
web/
  core.js             lõi giao diện: router, api(), menu theo vai trò, đăng nhập giả lập, bảng tiến độ
  modules/<tên>.js    trang của từng module
scripts/seed-mock.js  dữ liệu mẫu
test/                 helpers.js, core/ (kiểm thử lõi + hợp đồng), modules/ (mỗi module một tệp)
```
Công nghệ hiện tại: Node.js + Express, SQLite (`node:sqlite`) hoặc libSQL/Turso qua `DB_DRIVER`, giao diện HTML/JS thuần không cần build. Đây là đề xuất để chốt ở M0 (đặc tả mục 8); đổi thì đổi cả nhóm.

## Quy ước
1. **Chỉ sửa thư mục của module mình** (`server/modules/<tên>/`, `web/modules/<tên>.js`, `test/modules/<tên>.test.js`). Sửa `core/`, `docs/CONTRACTS.md` hay module khác thì mở PR và nhờ người liên quan duyệt.
2. **Không đọc/ghi thẳng bảng của module khác.** Dùng hàm ở phần 1 của `service.js` module đó hoặc sự kiện. Cần thêm hàm thì đề nghị chủ module.
3. **Lỗi:** luôn ném `AppError(code, message)` hoặc `need(...)` với mã trong `core/errors.js`. Không trả chuỗi lỗi tự chế.
4. **Thời gian:** mọi mốc khóa/đồng hồ dùng giờ máy chủ (ISO UTC trong CSDL, hiển thị giờ Việt Nam). Không tin đồng hồ trình duyệt.
5. **Quyền** kiểm tra ở máy chủ. Không gửi dữ liệu bí mật (mã nguồn, lựa chọn kín, token, log riêng) xuống trình duyệt rồi ẩn bằng giao diện.
6. **Thao tác của BTC/trọng tài** ghi `audit(actorId, action, { target, reason, data })`.

## Thêm một API
Trong `server/modules/<tên>/index.js`, gắn `handler` cho route có sẵn (hoặc thêm route mới):
```js
{ method: 'post', path: '/teams', auth: 'user', desc: 'Tạo đội', handler: (req) => s.createTeam(req.user, req.body) },
```
`auth`: `public` | `user` | `referee` (trọng tài hoặc admin) | `admin`. Handler trả về giá trị JSON (hoặc Promise). Bảng tiến độ tự cập nhật.

## Thêm migration
Tạo tệp mới `server/modules/<tên>/migrations/002_mo_ta.sql`. **Không sửa tệp đã chạy** (đã nằm trong bảng `_migrations` trên máy người khác). Cập nhật `scripts/seed-mock.js` nếu đổi bảng mà dữ liệu mẫu dùng.

## Thêm sự kiện
Thêm vào `TYPES` trong `server/core/events.js` + mô tả payload trong `docs/CONTRACTS.md` (qua review). Phát: `events.emit(type, payload, { actorId })`; nghe: `events.on(type, fn)` trong `init()` của module.

## Thêm trang
Trong `web/modules/<tên>.js`: `Arena.page({ path: '/doi', nav: 'Đội', roles: ['student'], title, owner, render(root, params, ctx) { ... } })`.
Gọi API bằng `Arena.api('/teams/mine')`; dọn interval khi rời trang bằng `ctx.cleanup(fn)`.

## Quy trình git đề xuất
- Nhánh chính `main` (sau khi nhóm duyệt khung này). Mỗi người làm trên nhánh `tv1/...`, `tv2/...`; mở PR, review chéo TV1→TV2→TV3→TV4→TV1 (mục 9.6).
- Mỗi PR chạy `npm test` sạch. Thay `test.todo` bằng test thật khi làm xong chức năng tương ứng.
- Không commit `data/`, `.env`, token.
