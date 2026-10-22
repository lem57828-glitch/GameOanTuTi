# tournaments (TV3) — giao diện

- `TournamentAdmin.tsx`: cấu hình, lịch, duyệt và công bố giải (tab **Cấu hình giải** trong Khu vực BTC).
- `CompetitionAdmin.tsx`:
  - Tab **Điều hành thi đấu** (nút chính theo bước kế tiếp do API tính, nhập kết quả, công cụ demo).
  - Tab **Khiếu nại** (`AppealsAdmin`).
- `competition-ui.tsx`: bảng xếp hạng, nhánh 32 → 4, dòng kết quả cặp. Trạng thái luôn có nhãn chữ, không chỉ màu; bảng và nhánh cuộn ngang trong vùng riêng.
- `MyPairings.tsx`: trận của đội tôi và form khiếu nại (chỉ đội trưởng).
- `TournamentPage.tsx`: lịch công khai, giai đoạn, bảng xếp hạng, nhánh đấu, trận của đội tôi.

Dữ liệu lấy qua TanStack Query và `src/lib/api.ts`. Quyền do API kiểm tra; ẩn nút chỉ để giao diện gọn. Xem [TV3_COMPETITION.md](../../../../../docs/TV3_COMPETITION.md).
