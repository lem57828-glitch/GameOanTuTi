# Bộ kiểm thử offline — Bán kết & Chung kết Bot Arena

> Tài liệu dành cho thí sinh. **BTC chỉ phát bộ này qua USB ở bước 2 (công bố luật mới)**, không đăng lên mạng
> trước ngày thi.

Không cần Internet, chỉ cần Python 3.8 trở lên (không cài thêm thư viện).

| File               | Nội dung                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| `arena_offline.py` | Luật cờ của vòng (khớp với hệ thống thi đấu) + trọng tài chạy bot + đối thủ dựng sẵn |
| `bot_mau.py`       | Bot mẫu đã biết vật cản, ô khiên, ô đổi loại; dùng làm điểm khởi đầu                 |

## Lệnh thường dùng

```bash
python arena_offline.py --rules semifinal            # xem luật + bàn cờ bán kết
python arena_offline.py --rules final                # xem luật + bàn cờ chung kết
python arena_offline.py --ruleset semifinal --blue bot.py --pink greedy
python arena_offline.py --ruleset final --blue bot.py --pink bot_mau.py --games 7
python arena_offline.py --ruleset final --blue bot.py --pink rusher --show   # in bàn cờ từng nước
```

Đối thủ dựng sẵn: `random`, `greedy` (ưu tiên ăn quân), `rusher` (lao về đích). `--extra-blue` / `--extra-pink`
chọn quân thứ 10 (`ROCK`, `PAPER`, `SCISSORS`). Khi nộp bài qua USB, đội báo giám thị quân thứ 10 dùng cho cả vòng.

## Luật mới

Luật chuẩn giữ nguyên: bàn 9×9, 10 quân, đi 1 ô theo 8 hướng, Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Thắng khi tới ô
đích (Xanh → I9, Hồng → A1), ăn hết một loại quân đối phương, hoặc đối phương hết nước. Lặp thế cờ 3 lần hoặc hết 200
nước thì bên nhiều quân hơn thắng, bằng thì hòa.

**Bán kết** (`semifinal-obstacles-1`) thêm 5 **vật cản cố định** C5, D6, E5, F4, G5: không quân nào được đi vào.

**Chung kết** (`final-dynamic-1`):

- Vật cản cố định C5, G5.
- 2 **vật cản động** đi vòng quanh E5 (D4 → E4 → F4 → F5 → F6 → E6 → D6 → D5), luôn ở hai ô đối xứng nhau, tiến
  1 ô sau mỗi 6 nước. Không đi vào ô vật cản đang đứng; quân đã đứng sẵn ở ô đó vẫn đi ra được.
- **Ô khiên** E3, E7: quân đứng trên không bị ăn.
- **Ô đổi loại** B5, H5: quân dừng ở ô đổi sang loại kế tiếp (Búa → Bao → Kéo → Búa). Nếu việc đổi làm chính bên
  mình mất hẳn một loại quân thì bên đó thua.

Vị trí vật cản trước nước thứ `ply + 1` = `path[(ply // every) % len(path)]`.

## Bot nhận gì, trả gì

`make_move(state)` nhận cùng định dạng như vòng online, thêm các trường:

| Trường             | Ý nghĩa                                         |
| ------------------ | ----------------------------------------------- |
| `obstacles`        | ô vật cản ở lượt này                            |
| `fixed_obstacles`  | vật cản cố định                                 |
| `moving_obstacles` | `[{path, every}]` lịch vật cản động             |
| `special_cells`    | `[{square, kind}]`, kind = `shield` hoặc `swap` |

`state["legal_moves"]` đã loại ô vật cản và quân trên ô khiên. Trả về `{"from": "B2", "to": "C3"}` trong tối đa
1 giây (CPU 200 ms). Nước sai: hệ thống đi thay nước hợp lệ đầu tiên, sai 3 lần thua ván; bot lỗi hoặc quá giờ thua
ván ngay. Trọng tài trong `arena_offline.py` xử lý giống hệt.

## Thể thức

Bán kết **BO5** (thắng 3 ván trước), chung kết **BO7** (thắng 4 ván trước). Ván hòa không tính; mỗi ván tung xu chọn
màu. Hết số ván tối đa mà bằng số ván thắng thì đấu thêm tối đa 2 ván, vẫn bằng thì bốc thăm công khai.
