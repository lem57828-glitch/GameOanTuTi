# tournaments (TV3) — giao diện

- `TournamentAdmin.tsx`: cấu hình, lịch, duyệt và công bố giải (tab **Cấu hình giải** trong Khu vực BTC).
- `CompetitionAdmin.tsx`:
  - Tab **Điều hành thi đấu** (nút chính theo bước kế tiếp do API tính, nhập kết quả, công cụ demo).
  - Tab **Khiếu nại** (`AppealsAdmin`).
- `competition-ui.tsx`: bảng xếp hạng, nhánh 32 → 4, dòng kết quả cặp. Trạng thái luôn có nhãn chữ, không chỉ màu; bảng và nhánh cuộn ngang trong vùng riêng.
- `MyPairings.tsx`: trận của đội tôi và form khiếu nại (chỉ đội trưởng).
- `TournamentPage.tsx`: lịch công khai, giai đoạn, bảng xếp hạng, nhánh đấu, trận của đội tôi.
- `TeamCompetitionPage.tsx` (`/competition`): điểm vào sau đăng nhập sinh viên; tổng hợp đội, bước tiếp theo, bộ bot và trận/kết quả. Dùng lại component và giao diện hiện có.
- `StageBotCard.tsx`: đội trưởng lưu bộ bot theo giai đoạn qua API TV2; một bot sơ loại, tối đa ba bot loại trực tiếp. Chỉ bot GitHub hợp lệ được dùng thi chính thức; quyền và hạn khóa do API kiểm tra.
- `team-competition.ts`: xác định bước tiếp theo; không suy diễn bị loại từ một trận thua Swiss. Trạng thái sơ loại lấy từ bảng xếp hạng công bố.

Kiểm thử UI độc lập: `pnpm exec playwright test --config tests/e2e/team-competition.config.ts` (API fixture, không ghi database). Kiểm chứng bot thật: `pnpm --filter @arena/api test:github-match` (schema/queue riêng, sandbox container).

Dữ liệu lấy qua TanStack Query và `src/lib/api.ts`. Quyền do API kiểm tra; ẩn nút chỉ để giao diện gọn. Xem [TV3_COMPETITION.md](../../../../../docs/TV3_COMPETITION.md).
