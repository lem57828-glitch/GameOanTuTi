# tournaments (TV3)

TournamentAdmin tích hợp trong Khu vực BTC: tạo nháp, sửa lịch, duyệt từng stage và giải, xác nhận công bố, xem audit. Trọng tài chỉ đọc. TournamentPage hiển thị lịch công khai và registrationPhase do API tính. Xem [TV3_CONFIGURATION.md](../../../../../docs/TV3_CONFIGURATION.md).

Trang giao dien cua module tournaments; giu data-fetch trong TanStack Query va HTTP qua src/lib/api.ts. Component dung chung trong @arena/ui; contracts trong @arena/contracts.

API/module owner: TV3. Viec sau M0: Swiss, standings/tie-break, tranh suat Top 32, cay 32 -> 4, khieu nai/chot ket qua; Pairing/Standing/Appeal chua co schema. Khong tu thuc thi luat chinh thuc hoac coi viec an nut la kiem tra quyen. Backend guard la nguon quyet dinh.
