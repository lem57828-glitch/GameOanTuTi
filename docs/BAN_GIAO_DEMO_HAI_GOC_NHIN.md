# Bàn giao: Giải demo hai góc nhìn và luồng chính thức

## 1. Mục tiêu và quyết định triển khai

Xây dựng một giải trải nghiệm để sinh viên đi từ chuẩn bị đội, nộp bot, thi Swiss đến vòng loại trực tiếp. BTC và sinh viên nhìn cùng một giải qua các màn hình theo vai trò; mọi thay đổi phải phản ánh trên cùng dữ liệu.

**Quyết định:** dùng chung code nghiệp vụ giải, trận, bot và engine; tách dữ liệu/cấu hình giữa môi trường demo và chính thức. Không xây hai hệ thống giải riêng cho BTC và sinh viên. Không tách nhánh Git theo vai trò hoặc chế độ chạy.

```text
Cùng một bộ code
├── Môi trường demo
│   └── Một giải trải nghiệm
│       ├── BTC: cấu hình và điều hành
│       └── Sinh viên: chuẩn bị và thi đấu
└── Môi trường chính thức
    └── Một giải chính thức
        ├── BTC: cấu hình và điều hành
        └── Sinh viên: chuẩn bị và thi đấu
```

Tài liệu này là yêu cầu bàn giao để phát triển tiếp. Những mục ghi “cần bổ sung” hoặc “giai đoạn 2” chưa được coi là tính năng đã có. Tài liệu không thay thế thể lệ thi đấu.

## 2. Phân biệt các chế độ

| Nội dung               | Giải trải nghiệm chạy bot thật                 | Mô phỏng nhanh của BTC            | Giải chính thức                                  |
| ---------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Môi trường             | Demo                                           | Demo                              | Official                                         |
| Mục đích               | Tập sử dụng và trình diễn hành trình sinh viên | Thử ghép cặp, bảng điểm, cây giải | Tổ chức thi                                      |
| Nguồn kết quả          | Worker chạy bot, lưu nước đi                   | Hệ thống sinh kết quả             | Worker chạy bot; nghiệp vụ trọng tài theo thể lệ |
| Xem bàn cờ/replay thật | Có, từ ván đã chạy                             | Không được giả là ván đã chạy     | Có                                               |
| Người làm các bước BTC | BTC thao tác; sau này có thể bật BTC tự động   | BTC                               | BTC/trọng tài có quyền                           |
| Quyền đi tiếp          | Theo kết quả và bước chốt vòng                 | Theo kết quả mô phỏng, có nhãn    | Theo thể lệ và kết quả đã xác nhận               |

Giải trải nghiệm và công cụ mô phỏng nhanh cùng tồn tại trong profile demo nhưng phải phân biệt ở cấp giải. Không dùng nút sinh kết quả cho giải đang được trình diễn là “chạy bot thật”.

**Cần bổ sung:** loại giải demo rõ ràng, ví dụ `experience` và `simulation`, thay vì chỉ suy ra từ `isDemo`. Tên field và migration do người triển khai đề xuất, thống nhất trong contracts trước khi code. Không dùng field này thay cho kiểm tra `DEMO_MODE`.

## 3. Phạm vi phiên bản đầu

### Bao gồm

- Một giải trải nghiệm dùng chung giữa BTC và các sinh viên tham gia.
- Góc nhìn BTC sử dụng trang điều hành hiện có.
- Góc nhìn sinh viên sử dụng màn hình **Thi đấu của đội** hiện có tại `/competition`.
- Nộp và kiểm thử bot, chọn bộ bot, thi Swiss, cập nhật kết quả/bảng điểm, mở vòng loại trực tiếp và xem lại từng ván.
- BTC thao tác điều hành qua web; không cần tự động hóa BTC trong phiên bản đầu.
- Dữ liệu đối thủ có thể được chuẩn bị trước, nhưng các ván được giới thiệu là thi thật phải chạy qua worker.

### Ngoài phạm vi phiên bản đầu

- Mỗi sinh viên có một bản sao giải riêng hoặc nhiều lượt trải nghiệm độc lập chạy đồng thời.
- Tự động bảo đảm sinh viên thắng hoặc được vào vòng trong.
- Thay luật, rút ngắn số hiệp hoặc tạo cây 4 đội mới chỉ phục vụ demo.
- Bán kết/chung kết offline: đã có (xem [BAN_KET_CHUNG_KET.md](BAN_KET_CHUNG_KET.md)); thể thức BO5 bán kết và bố trí vật cản là giá trị nhóm tự chọn, cần BTC xác nhận.
- Thêm hệ thống thách đấu riêng, thiết kế lại giao diện hoặc thay kiến trúc engine/worker.

Repo hiện có khái niệm giải hiện tại và đội trong giải hiện tại. Phiên bản đầu bám theo cơ chế này. Nếu cần giải riêng cho từng người, phải thiết kế lại việc chọn giải, phiên trải nghiệm và phạm vi đội; không chỉ thêm một `sessionId` ở frontend.

## 4. Quy tắc nghiệp vụ phải giữ

| Giai đoạn              | Hành vi cần giữ                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nộp bot                | File Python/dán code phục vụ tập luyện. Thi chính thức dùng bot GitHub theo commit SHA cố định, đã kiểm thử hợp lệ.                                    |
| Bộ bot giai đoạn       | Sơ loại chọn một bot; loại trực tiếp chọn từ một đến ba bot theo API hiện có. Đội trưởng lưu, BTC/lịch giải quyết định khóa.                           |
| Bot theo mức sơ loại   | Sau khi bộ bot giai đoạn đủ điều kiện, áp dụng lựa chọn bot cho cả mức qua nghiệp vụ `LevelBot` hiện có. Không bỏ qua bước này bằng cách sửa database. |
| Swiss                  | Mỗi cặp hai ván đổi màu, dùng bot đã chốt cho cả mức; mở phòng thì chạy, không chọn bot/quân và sẵn sàng từng hiệp.                                    |
| Loại trực tiếp         | Chọn kín bot và quân thứ 10 theo từng hiệp; khóa khi cả hai sẵn sàng hoặc hết hạn; tung xu và chạy worker.                                             |
| Số hiệp loại trực tiếp | Đủ năm hiệp, bằng điểm thì hai hiệp phụ và phân định tiếp theo thể lệ. Không tự đổi thành best-of-5.                                                   |
| Kết quả                | Kết quả phòng chuyển về giải với nguồn `match`. Kết quả tạm phải được xác nhận/chốt theo nghiệp vụ hiện có.                                            |
| Đi tiếp                | Thua một cặp Swiss không đồng nghĩa bị loại. Hiển thị theo bảng điểm và kết quả chốt mức/vòng.                                                         |
| Khiếu nại              | Khiếu nại mở chặn bước chốt tương ứng. Kịch bản trải nghiệm không được âm thầm bỏ qua.                                                                 |

Giải trải nghiệm chạy bot thật ưu tiên dùng cùng quy trình nộp bot GitHub như luồng chính thức. Nếu muốn nhận file Python trực tiếp để dự thi trải nghiệm, đó là thay đổi chính sách riêng cần được thống nhất; không tự nới `eligibleForCompetition` trong phần việc này.

## 5. Hành trình hai góc nhìn

| Bước              | BTC thực hiện                                          | Sinh viên thực hiện/nhìn thấy                                         | Điều kiện chuyển bước                               |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------- |
| 1. Mở giải        | Cấu hình, công bố lịch và mở đăng ký                   | Thấy giải trải nghiệm và hướng dẫn tham gia                           | Cấu hình hợp lệ, giải được công bố                  |
| 2. Chuẩn bị đội   | Duyệt đội                                              | Tạo/tham gia đội; thấy đang chờ duyệt hoặc đã duyệt                   | Đội/hồ sơ đạt điều kiện hiện có                     |
| 3. Chuẩn bị bot   | Theo dõi tình trạng bot và hạn khóa                    | Nộp bot, xem pending/valid/invalid, sửa và nộp phiên bản mới khi cần  | Bot hợp lệ và đúng nguồn được phép                  |
| 4. Chốt bot       | Khóa bộ bot/giai đoạn và mở mức theo thứ tự hiện có    | Chọn bộ bot; xem bot áp dụng cho mức sơ loại                          | Bộ bot đã khóa, bot cho mức được chốt               |
| 5. Ghép Swiss     | Ghép vòng và mở phòng                                  | Thấy vòng, đối thủ; chờ mở phòng hoặc bấm Vào phòng                   | Cặp hợp lệ có phòng và job                          |
| 6. Chạy Swiss     | Theo dõi lỗi/tiến độ                                   | Xem hai ván đổi màu và replay                                         | Worker hoàn thành, kết quả chuyển về giải           |
| 7. Chốt kết quả   | Xác nhận vòng; tiếp tục ghép/chốt mức khi đủ điều kiện | Thấy điểm tạm/đã xác nhận, chờ vòng tiếp theo hoặc trạng thái đi tiếp | Đủ kết quả, không còn khiếu nại chặn                |
| 8. Loại trực tiếp | Mở vòng và phòng                                       | Chọn kín bot/quân, sẵn sàng, xem các hiệp                             | Hai đội khóa lựa chọn hoặc áp dụng hạn chọn hiện có |
| 9. Tổng kết       | Chốt vòng                                              | Xem tỷ số, replay và trạng thái vòng sau/đã dừng/Top 4                | Kết quả được chốt đúng thể lệ                       |

BTC và sinh viên dùng hai phiên trình duyệt độc lập, ví dụ hai browser profile. Không dùng hai tab chung cookie rồi đổi role để giả lập hai người.

## 6. Yêu cầu giao diện

### Sinh viên

Giữ component, màu sắc, typography, bố cục và cơ chế query của repo. Mở rộng `/competition`, không tạo dashboard cạnh tranh với màn hình này.

- Nhãn rõ **Giải trải nghiệm · Chạy bot thật** kèm tên giải.
- Mỗi trạng thái có một hành động chính: tạo/tham gia đội, hoàn thiện hồ sơ, nộp bot, chọn bot, vào phòng hoặc xem lại.
- Hiển thị rõ khi đang chờ BTC: duyệt đội, khóa bot, mở phòng, xác nhận kết quả hoặc ghép vòng sau.
- Hiển thị lỗi kiểm thử bot và hướng dẫn tới trang bot; không coi trạng thái pending là đã sẵn sàng dự thi.
- Chỉ đội trưởng có thao tác chọn/lưu bot và sẵn sàng. Thành viên xem trạng thái, bàn cờ và replay.
- Hướng dẫn ngắn đúng giai đoạn: Swiss không có chọn kín từng hiệp; loại trực tiếp có bước này.
- Kết thúc trận hiển thị kết quả tạm/đã chốt, đường dẫn replay và trạng thái tiếp theo có căn cứ từ server.
- Giữ nút xem giải/bảng điểm/thông báo BTC, không bắt người dùng tự tìm bước tiếp theo qua nhiều trang.

### BTC

- Giữ trang điều hành hiện có; hiển thị loại giải demo đang điều hành.
- Với giải trải nghiệm chạy thật, ưu tiên mở phòng, theo dõi worker và xác nhận kết quả; chặn công cụ sinh kết quả cả UI lẫn API.
- Với giải mô phỏng nhanh, hiển thị nhãn mô phỏng trên kết quả và không trình bày là replay bot thật.
- Kết quả sinh viên thấy phải là kết quả BTC đang xử lý, không lấy từ bộ fixture frontend riêng.

## 7. Kịch bản dữ liệu và quy mô

### Kiểm chứng luồng Swiss với bốn đội

- Một giải demo chạy thật, bốn đội đủ điều kiện và bot Python đã chuẩn bị.
- Trình diễn một lượt nộp bot; các đối thủ có thể chuẩn bị phần nộp/kiểm thử trước.
- BTC ghép Swiss, mở phòng, worker chạy hai ván và BTC xác nhận vòng.
- Chứng minh được bước cập nhật điểm và ghép vòng tiếp theo.

**Giới hạn:** bốn đội không chứng minh đầy đủ việc sàng lọc Top 32. Không đổi chỉ tiêu cuối hoặc luật cây giải để làm cho kịch bản này trông như giải đủ 32 đội.

### Kiểm chứng tới vòng loại trực tiếp

Chọn một trong hai kịch bản và ghi rõ trước buổi trình diễn:

1. Chuẩn bị đủ đội cho cấu trúc hiện có, chạy các bước sơ loại cần thiết, chốt mức rồi mở vòng loại trực tiếp. Dùng cách này khi nghiệm thu việc chuyển giai đoạn xuyên suốt.
2. Chuẩn bị một giải demo thứ hai đã đi tới vòng trong bằng các bước hợp lệ và kết quả chạy thật được lưu trước. Công khai rằng phần chuẩn bị đã chạy trước; cách này chỉ nghiệm thu trải nghiệm vòng trong, không chứng minh toàn bộ quá trình chuyển từ Swiss ngay trong buổi đó.

Nếu hệ thống hiện có xử lý thiếu đội bằng walkover thì giữ đúng hành vi và nhãn đó; không giả các lượt walkover là trận worker đã chạy. Phiên bản đầu sử dụng từng giải làm giải hiện tại theo cơ chế hiện có, không tự giả định UI đã hỗ trợ chọn nhiều giải.

Một lần thi thử có thể kết thúc ở sơ loại. Nếu cần chế độ hướng dẫn bảo đảm người học thấy cả vòng trong, phải thiết kế riêng ở giai đoạn sau và công khai suất trải nghiệm; không sửa kết quả Swiss hoặc ghép vào bảng điểm thi thật.

## 8. Kiến trúc triển khai

### Thành phần hiện có cần tái sử dụng

| Phần                                        | Nguồn code                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dashboard sinh viên và trạng thái tiếp theo | `apps/web/src/features/tournaments/TeamCompetitionPage.tsx`, `team-competition.ts`            |
| Chọn bộ bot, bot theo mức, cặp đấu của đội  | `StageBotCard.tsx`, `LevelBotCard.tsx`, `MyPairings.tsx` trong feature tournaments            |
| BTC, bảng điểm và nhánh đấu                 | `CompetitionAdmin.tsx`, `TournamentAdmin.tsx`, `competition-ui.tsx` trong feature tournaments |
| Nộp bot và kiểm thử                         | `apps/web/src/features/bots-runner`, `apps/api/src/modules/bots-runner`                       |
| Swiss, chốt vòng/mức, cây giải              | `apps/api/src/modules/tournaments/competition.service.ts`                                     |
| Mở trận, lựa chọn kín, kết quả hiệp         | `apps/api/src/modules/rooms-matches/matches.service.ts`                                       |
| Live và replay                              | `apps/web/src/features/rooms-matches`, `apps/api/src/modules/rooms-matches`                   |
| Thực thi bot và luật                        | `apps/worker`, `packages/game-engine`                                                         |
| DTO và schema dùng chung                    | `packages/contracts/src/tournaments.ts`, `bots.ts`, `rooms.ts`                                |

Không import repository của module khác. Gọi service công khai theo quy ước repo. Không tạo runner, bộ tính điểm, bộ ghép Swiss hoặc pipeline kết quả thứ hai cho demo.

### Các API hiện có liên quan

Các đường dẫn bên dưới có tiền tố `/api/v1`. Quyền chi tiết xem controller và tài liệu module.

| Nhóm                     | API                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Đội/giải hiện tại        | `GET /teams/mine`, `GET /tournaments/current`                                                                                   |
| Nộp/kiểm thử bot         | `POST /bots`, `POST /bots/:id/test-runs`                                                                                        |
| Bộ bot                   | `GET /stages/:stageId/bot-selection/:teamId`, `POST /stages/:stageId/bot-selection`, `POST /stages/:stageId/bot-selection/lock` |
| Bot cho mức              | `GET/POST /tournaments/:id/qualifier/my-bot`                                                                                    |
| Dữ liệu giải             | `GET /tournaments/:id/competition`, `/standings`, `/bracket`, `/my-pairings`                                                    |
| Điều hành Swiss          | `POST /admin/tournaments/:id/qualifier/plan`, `/qualifier/lock`, `/qualifier/rounds`, `/qualifier/finish`                       |
| Xác nhận Swiss           | `POST /admin/tournaments/:id/qualifier/rounds/:round/confirm`                                                                   |
| Loại trực tiếp           | `POST /admin/tournaments/:id/knockout/:phase/start`, `/knockout/:phase/confirm`                                                 |
| Mở phòng                 | `POST /admin/tournaments/:id/matches/open`                                                                                      |
| Chọn kín                 | `GET /rooms/:id/my-selection`, `POST /rooms/:id/choices`                                                                        |
| Snapshot/replay          | `GET /rooms/:id`, `GET /rooms/:id/games/:gameId`, `GET /games/:id/events`                                                       |
| Mô phỏng nhanh, chỉ demo | `POST /admin/tournaments/:id/demo/teams`, `/demo/simulate`                                                                      |

Đây là danh sách điểm nối, không phải thứ tự gọi API cố định. Dùng trạng thái và bước kế tiếp do server trả; server kiểm tra lại điều kiện cho mọi thao tác.

### Cần bổ sung cho phiên bản đầu

1. Phân biệt giải trải nghiệm chạy thật và giải mô phỏng nhanh trong dữ liệu/contracts.
2. Bổ sung nhãn và hướng dẫn theo trạng thái cho hai góc nhìn.
3. Chặn sinh kết quả mô phỏng vào giải trải nghiệm chạy thật ở API, không chỉ ẩn nút.
4. Chuẩn bị dữ liệu đối thủ và hướng dẫn tái tạo kịch bản, không ghi mật khẩu hoặc bot cá nhân vào repo.
5. Thêm test cho phân loại giải, đồng bộ hai vai trò, phân quyền và chống thao tác sai chế độ.

Không coi banner hoặc cờ frontend là cơ chế bảo vệ nghiệp vụ.

## 9. Giai đoạn 2: BTC tự động

Chỉ triển khai sau khi phiên bản hai góc nhìn do người điều hành chạy thông suốt.

- Chỉ hoạt động khi profile demo bật, đúng loại giải trải nghiệm và được BTC bật cho giải đó.
- Orchestrator chạy phía server, gọi cùng service nghiệp vụ mà BTC dùng. Sinh viên không được cấp quyền admin và không gọi endpoint admin thay BTC.
- Có thể tự duyệt đội nếu đủ điều kiện, ghép vòng, mở phòng và chốt khi mọi điều kiện hợp lệ; không tự chốt bộ bot của người học trước khi họ hoàn tất bước chuẩn bị.
- Không tự thay bot, quân hoặc bấm sẵn sàng cho đội người học. Với đội đối thủ hệ thống, cần hành vi chọn/sẵn sàng xác định rõ và được ghi log.
- Khi thiếu bot, worker lỗi, trận tạm dừng hoặc có khiếu nại mở: dừng ở trạng thái chờ xử lý và giải thích cho người học; không sinh tỷ số để vượt qua.
- Mỗi bước có kiểm tra trạng thái, khóa đồng thời/idempotency phù hợp và audit nguồn tự động. Restart/retry không tạo thêm vòng, trận hoặc job trùng.
- Có bật/tắt, hiển thị tiến trình và bàn giao điều hành về BTC. Tắt tự động không hủy job/trận đã chạy.
- Mô hình actor hệ thống phải được thiết kế rõ; không nhúng cookie hoặc mật khẩu BTC vào orchestrator/frontend.
- Official từ chối mọi cấu hình và hành động dành riêng cho BTC tự động trải nghiệm.

## 10. Dữ liệu, môi trường và nhánh Git

- Tiếp tục tích hợp trên `try-main`; thay đổi đã kiểm chứng mới đưa về `main`. Không chuyển nhánh để bật/tắt demo.
- Dùng các profile `.env.demo` và `.env.official`, lệnh `dev:demo`/`dev:official` và cơ chế tách schema, Redis database, queue, cookie, cổng và secret hiện có.
- Không copy dữ liệu seed hoặc tài khoản mẫu sang official. Không chạy reset/truncate database dùng chung để bắt đầu lượt trải nghiệm mới.
- Không tự thay chính sách nộp bot, sandbox, deadline hoặc số hiệp khi đổi profile.
- Kịch bản tạo dữ liệu chỉ được chạy trong demo, có phạm vi sở hữu rõ và xử lý chạy lại an toàn. Không sửa database để vượt qua bước đang nghiệm thu.
- Nghiệm thu bot thật có thể chạy trên môi trường triển khai riêng với cấu hình official; “trình diễn cho thầy” không đồng nghĩa phải bật `DEMO_MODE`.

Chi tiết vận hành: [Demo và chính thức](DEMO_VA_CHINH_THUC.md).

## 11. Phân công đề xuất

| Người phụ trách                     | Trách nhiệm                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TV3/người đã làm mô phỏng BTC       | Chủ trì tính năng; phân loại giải, kịch bản trải nghiệm, ghép/chốt/chuyển vòng; orchestrator giai đoạn 2 |
| TV4/người làm phòng và UI sinh viên | Hướng dẫn trên dashboard, trạng thái chờ, vào phòng, chọn kín/sẵn sàng, live/replay                      |
| TV2                                 | Hợp đồng nộp/chọn bot, sandbox/worker, job và kết quả thật; phối hợp kiểm chứng bot đối thủ              |
| TV1                                 | Tài khoản/phiên, đội và duyệt đội, bảo đảm phân quyền và tách phiên hai vai trò                          |

TV3 giữ vai trò tích hợp nhưng thay đổi contracts/schema hoặc service của module khác cần thống nhất với người phụ trách module đó.

## 12. Thứ tự thực hiện và đầu ra bàn giao

1. Đọc các tài liệu tham chiếu; xác nhận quy mô kịch bản và những API đang dùng được.
2. Chốt contracts/phân loại giải và quy tắc chặn trộn kết quả trước khi làm UI.
3. Hoàn thiện giải demo hai vai trò với BTC thao tác thủ công, dùng dashboard/phòng hiện có.
4. Chạy trọn Swiss, xác nhận kết quả và kiểm chứng bước sang loại trực tiếp theo kịch bản công khai.
5. Sửa các điểm còn cần can thiệp ngoài web; bổ sung test và hướng dẫn tái tạo.
6. Bàn giao phiên bản đầu. Sau đó mới triển khai BTC tự động nếu được đưa vào phạm vi.

Đầu ra gồm code/contracts/migration nếu cần, test, script dữ liệu demo có guard, README chạy và kịch bản hai vai trò. Không đưa fixture kiểm thử vào UI sản phẩm hoặc trình bày fixture là trận bot thật.

## 13. Tiêu chí nghiệm thu

### Hai góc nhìn và chạy bot thật

- [ ] BTC và sinh viên đăng nhập ở hai phiên độc lập, cùng nhìn đúng một giải/đội/cặp đấu.
- [ ] BTC duyệt đội, mở phòng và chốt vòng; sinh viên thấy trạng thái tương ứng mà không phải đổi role hoặc sửa database.
- [ ] Sinh viên nộp bot; pending/invalid/valid hiển thị đúng; bot không hợp lệ không được dùng thi.
- [ ] Chọn bot, khóa bộ bot và bot theo mức đi qua nghiệp vụ hiện có; API chặn người không có quyền.
- [ ] Swiss chạy đúng hai ván đổi màu với bot Python thật, không yêu cầu sẵn sàng từng ván.
- [ ] Job dùng đúng phiên bản bot đã khóa; có nước đi, kết quả và replay lưu bền vững.
- [ ] Kết quả tự chuyển về giải với nguồn `match`; phân biệt tạm/đã chốt và áp dụng đúng bước xác nhận.
- [ ] Sinh viên thắng/thua/đi tiếp theo dữ liệu thật; không suy diễn bị loại từ một trận thua Swiss.
- [ ] Loại trực tiếp có chọn kín, sẵn sàng, deadline, đủ số hiệp; đối thủ không đọc được lựa chọn chưa công bố.
- [ ] Tải lại/reconnect không tạo trận, job hoặc tung xu mới; replay ván cũ không đổi trận hiện tại.
- [ ] Worker lỗi hoặc không đủ điều kiện có trạng thái chờ/lỗi rõ; không tự biến thành kết quả mô phỏng.
- [ ] Trên điện thoại và desktop, nút tiếp theo và trạng thái chờ đều đọc và thao tác được.

### Tách demo và official

- [ ] Giải chạy thật không nhận kết quả từ công cụ mô phỏng nhanh, kể cả gọi API trực tiếp.
- [ ] Giải mô phỏng có nhãn rõ, không có replay giả của ván chưa chạy.
- [ ] Official chặn endpoint/cấu hình demo; sinh viên không được nâng quyền để điều hành.
- [ ] Dữ liệu/cookie/job demo không xuất hiện hoặc được xử lý nhầm trong official.
- [ ] Test dùng schema/queue riêng; không xóa dữ liệu người dùng để nghiệm thu.

### Kiểm thử và minh chứng

Các lệnh hiện có để bắt đầu; test mới phải bổ sung vào phạm vi tương ứng:

```powershell
pnpm typecheck
pnpm build
pnpm test
pnpm test:integration
pnpm exec playwright test --config tests/e2e/team-competition.config.ts
pnpm --filter @arena/api test:github-match
```

Test UI với API fixture chứng minh hành vi giao diện; không thay thế kiểm chứng hai bot thật và các bước BTC/sinh viên trên cùng backend. Kịch bản GitHub thật cần PostgreSQL, Redis, container runtime và kết nối GitHub theo cấu hình repo.

Nhóm chạy diễn tập trên máy/mạng thuyết trình, ghi rõ dữ liệu chạy trước và replay dự phòng. Báo cáo bàn giao phải tách: đã chạy tự động, đã diễn tập thực tế và phần chưa kiểm chứng.

## 14. Tài liệu tham chiếu

- [Phân công và quy ước phối hợp](TEAM.md)
- [Demo và chính thức](DEMO_VA_CHINH_THUC.md)
- [Chính sách nộp bot](BOT_SUBMISSION_HYBRID.md)
- [Cấu hình giải](TV3_CONFIGURATION.md)
- [Swiss, cây giải, chốt kết quả và khiếu nại](TV3_COMPETITION.md)
- [Trận nhiều hiệp và phòng đấu](TV4_MATCHES.md)
- [Kiểm chứng bot GitHub thật](GITHUB_MATCH_VERIFICATION.md)
