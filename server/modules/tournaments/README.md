# Module `tournaments` — TV3

**Phạm vi:** cấu hình giải và lịch, sơ loại chia mức (≈1000→500→200→100→32) với ghép Swiss trong từng mức, hạt giống và cây 32→4, kết quả chính thức, khiếu nại và quyết định trọng tài (đặc tả mục 5, 6.1, 6.5, 9.3).

## Tệp của module
| Tệp | Nội dung |
|---|---|
| `index.js` | Bảng API. |
| `service.js` | Phần 1: `currentTournament()`, `getPair(pairId)` (bản tối thiểu). Phần 2: nghiệp vụ của bạn; khung nhận `match.completed` từ TV4. |
| `migrations/001_draft.sql` | `tournaments`, `stages`, `stage_entries`, `pairs`, `appeals` (đề xuất). |
| `web/modules/tournaments.js`, `test/modules/tournaments.test.js` | Giao diện và kiểm thử của module. |

## Việc cần làm (30 điểm, mục 9.3)
- [ ] (4) Cấu hình giải, lịch đăng ký/mức/vòng, các mốc khóa — không phụ thuộc đồng hồ trình duyệt.
- [ ] (10) Sơ loại chia mức, ghép Swiss, điểm/tiêu chí phụ, cắt suất; 3–5 vòng/mức đồng đều; reset điểm đúng mức; lẻ/tái đấu/hòa.
- [ ] (3) Hạt giống, cây 32→4, mở/chốt/chuyển vòng; dừng ở Top 4.
- [ ] (6) Kết quả, khiếu nại/trọng tài, audit quyết định; chặn chuyển vòng sai trạng thái.
- [ ] (7) Kiểm thử nhiều quy mô đội, lỗi/rút/chạy lại; đối soát điểm, kịch bản chốt vòng.

## Hợp đồng
- Cung cấp: `PairAssignment` qua `getPair()` và sự kiện `pair.assigned`; `stage.opened`; `decision.made`.
- Nhận: `MatchCompleted` từ TV4 (sự kiện `match.completed`) — chỉ nhận kết quả mới hơn theo `resultVersion`, không cộng trùng.
- Dùng TV1: `teamOf`, `getTeam`, `notify`.

## Quyết định cần chốt
Q02 (cấu trúc trận sơ loại), Q03 (số vòng/bye/tái đấu), Q04 (tiêu chí phụ, tranh suất), Q05 (ít đội, lịch theo ngày), Q12 (quyền khiếu nại, điều chỉnh nhánh).

Tham khảo bản cũ: `git show legacy-v1:src/services/swiss.js` (Swiss một bảng liên tục — khác mô hình chia mức của đặc tả mới).
