# rooms-matches (TV4) — giao diện

- `RoomPage.tsx` + `useRoomStream.ts`: bàn cờ trực tiếp, snapshot/reconnect, tung xu (`CoinToss`).
- `MatchPanel.tsx`: điểm trận, các hiệp kèm lựa chọn đã công bố, trạng thái chọn kín, đồng hồ theo giờ máy chủ, form chọn bot + quân thứ 10 cho đội trưởng (`/rooms/:id/my-selection`, `/rooms/:id/choices`), nút "Khóa lựa chọn ngay"/"Chạy lại hiệp lỗi" cho BTC/trọng tài.

Quyền do API kiểm tra; ẩn nút chỉ để giao diện gọn. Xem [docs/TV4_MATCHES.md](../../../../../docs/TV4_MATCHES.md).
