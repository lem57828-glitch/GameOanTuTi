# Game engine chuẩn

Logic thuần: không DB, mạng, queue hoặc UI. `STANDARD_RULESET_ID=standard-32-4` dùng cho mọi ván mới.
`demo-ottv2-0` chỉ giữ để đọc lịch sử cũ; không tạo ván mới theo bố trí cũ.

- `createStandardBoard(blueExtra,pinkExtra)`: 20 quân theo sơ đồ đã chốt, hai màu chọn loại thêm độc lập.
- `newGame`, `legalMoves`, `applyMove`, `checkEnd`: nước 8 hướng, khắc chế, đích, loại quân, hết nước, lặp ba lần/200 nước.
- `replay`: dựng lại từ cùng ruleset/choices và moves; từ chối nước sai hoặc nước sau kết thúc.
- `toPythonState`: payload có metadata luật, bàn, lượt, đích và legal_moves; tách đối tượng để không sửa ngược engine.
- `simulate`, `rng`: bot mô phỏng tin cậy có seed xác định.

Kiểm thử: `pnpm --filter @arena/game-engine test`.
Chi tiết vị trí, giao thức và tiêu chí nghiệm thu: [TV2_ACCEPTANCE](../../docs/TV2_ACCEPTANCE.md).
