# accounts-teams (TV1)

Đội được lập độc lập với giải; `Team.tournamentId` và `Membership.tournamentId` có thể null. Đội trưởng chủ động đăng ký qua `POST /teams/mine/tournaments/:tournamentId`; kiểm tra lịch, quyền và thành viên trong transaction. Đội đã đăng ký giữ các hạn khóa của giải.

Role chỉ còn `student` và `admin`; migration chuyển tài khoản `referee` cũ thành admin và tăng sessionVersion. BTC kiêm phân xử, xử lý khiếu nại và xác nhận vòng.

Sở hữu Account, Team, Membership, AuthToken, RegistrationCode, TeamInvitation, Notification, EmailMessage và Publication. Đã triển khai đăng ký email @vnu.edu.vn bằng mã 6 chữ số có hạn 120 giây (chỉ tạo tài khoản sau khi mã hợp lệ), khôi phục/đổi mật khẩu, hồ sơ, phân quyền, đội 2–4 người khi chốt, tham gia bằng mã, rời/chuyển đội trưởng/loại thành viên, thông báo/email và nội dung BTC. Chat được loại khỏi phạm vi theo yêu cầu người dùng.

HTTP controller kiểm tra schema/quyền. SessionUser được dựng lại từ DB, đối chiếu sessionVersion để thu hồi phiên. Thay đổi thành viên dùng transaction và row lock; khóa ngoại membership theo tài khoản/giải ngăn tham gia trùng. Deadline sử dụng thời gian server.

Module khác sử dụng AccountsTeamsService (sessionUser, team, teamNames) hoặc NotificationsService (deliver, team), không truy cập repository trực tiếp. Request contracts ở packages/contracts/src/accounts.ts.

Hướng dẫn chạy thử, cấu hình SMTP, API, phạm vi và kiểm thử: [TV1_IMPLEMENTATION](../../../../../docs/TV1_IMPLEMENTATION.md).

Đã bỏ lời mời tham gia qua email, tạo mã mới và tự Chốt đội hình của đội trưởng. Các API tương ứng đã gỡ bỏ; dữ liệu lời mời cũ chỉ giữ làm lịch sử, lời mời đang chờ bị hủy.
