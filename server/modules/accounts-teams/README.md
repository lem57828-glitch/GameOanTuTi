# Module `accounts-teams` — TV1

**Phạm vi:** tài khoản, hồ sơ, đội 2–4 người, thông báo, chat; trang chủ/hướng dẫn/tài liệu BTC (đặc tả mục 2, 3, 7 và 9.1).

## Tệp của module
| Tệp | Nội dung |
|---|---|
| `index.js` | Bảng API. Route chưa có `handler` tự trả `501 Chưa làm (TV1)`. |
| `service.js` | Phần 1: hàm cho module khác dùng (đã có bản tối thiểu). Phần 2: nghiệp vụ của bạn (đang `todo()`). |
| `migrations/` | Lược đồ đề xuất `001_draft.sql`; thay đổi bằng tệp mới `002_…sql`. |
| `web/modules/accounts-teams.js` | Các trang giao diện của module (đang là trang giữ chỗ). |
| `test/modules/accounts-teams.test.js` | Kiểm thử của module (đang là danh sách `todo`). |

## Việc cần làm (30 điểm, mục 9.1)
- [ ] (8) Đăng ký/đăng nhập, xác minh email, hồ sơ, phân quyền; kiểm tra domain/username/email; khôi phục mật khẩu; giới hạn thử đăng nhập.
- [ ] (6) Đội 2–4 người: tạo, mời, tham gia, rời, chuyển đội trưởng, kiểm tra trùng tên, khóa đội hình theo hạn.
- [ ] (4) Trung tâm thông báo và adapter email.
- [ ] (4) Chat đội và nền chat dùng chung (TV4 dùng lại cho phòng).
- [ ] (4) Trang chủ, hướng dẫn, tài liệu/thông báo của BTC.
- [ ] (4) Kiểm thử quyền, hết hạn, khóa thành viên, email/mời trùng; dữ liệu mẫu.

## Giao diện cung cấp cho module khác (giữ nguyên chữ ký)
`teamOf(userId, tournamentId)`, `getTeam(teamId)`, `members(teamId)`, `isCaptain(userId, teamId)`, `isMember(userId, teamId)`, `notify({ userIds?, teamId?, kind, title, body?, link? })`; sự kiện `team.roster_locked`. Module khác cũng có thể phát `notification.requested` thay vì gọi `notify`.

## Phụ thuộc
- Core: `core/auth` (cookie phiên: gọi `setSession(res, userId)` khi đăng nhập thành công), `core/errors`, `core/audit`.
- TV3: id giải hiện tại và hạn đăng ký/khóa đội hình.

## Quyết định cần chốt trước khi viết phần liên quan
Q01 (miền email `vnu.edu`, tiền tố `26`, xác minh khi đăng nhập), Q11 (kênh nhắc bổ sung). Xem `docs/DECISIONS.md`.
