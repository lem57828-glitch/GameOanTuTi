"""Bot mẫu khởi đầu - BOT ARENA, luật OTTv2 (bàn cờ 9x9 búa/kéo/bao).

Máy chủ gọi make_move(state) mỗi khi tới lượt bạn. state gồm:
  me, opponent      màu của bạn / đối thủ: "blue" (Xanh, đi trước) hoặc "pink" (Hồng)
  my_goal           ô đích của bạn: Xanh "I9", Hồng "A1"
  opponent_goal     ô đích của đối thủ (góc nhà bạn - cần canh giữ)
  types, beats      loại quân và bảng thắng, ví dụ beats["ROCK"] == ["SCISSORS"]
  ply, max_plies    số nước đã đi trong ván và giới hạn nước
  board             {"B4": {"side": "blue", "type": "ROCK"}, ...} các ô có quân
  my_pieces         [{"square": "B4", "type": "ROCK"}, ...]
  opponent_pieces   như trên, của đối thủ
  legal_moves       [{"from": "B4", "to": "C5", "capture": None hoặc "SCISSORS"}, ...]
  history           các nước đã đi trong ván

Trả về một nước trong legal_moves: dict {"from": "B4", "to": "C5"}, list ["B4", "C5"] hoặc chuỗi "B4-C5".
Nước sai, lỗi, quá CPU: hệ thống đi thay một nước ngẫu nhiên và ghi lỗi; lỗi lần thứ 3 trong ván là thua.
Quá 1 giây không trả lời: bot bị dừng và thua ván. Không dùng mạng, tiến trình con hay đọc tệp ngoài thư mục bot.
"""
import random

COLS = "ABCDEFGHI"


def xy(square):
    """'C5' -> (2, 4): cột và hàng tính từ 0."""
    return COLS.index(square[0]), int(square[1:]) - 1


def distance(a, b):
    """Số nước tối thiểu để đi từ ô a tới ô b (đi 8 hướng như quân vua)."""
    (ax, ay), (bx, by) = xy(a), xy(b)
    return max(abs(ax - bx), abs(ay - by))


def make_move(state):
    moves = state["legal_moves"]
    goal = state["my_goal"]

    # 1. Có nước vào thẳng ô đích thì thắng ngay.
    for m in moves:
        if m["to"] == goal:
            return m

    # 2. Ưu tiên ăn quân.
    captures = [m for m in moves if m["capture"]]
    if captures:
        return random.choice(captures)

    # 3. Còn lại: tiến gần ô đích hơn, chọn ngẫu nhiên trong các nước tốt nhất.
    best = min(distance(m["to"], goal) - distance(m["from"], goal) for m in moves)
    return random.choice([m for m in moves if distance(m["to"], goal) - distance(m["from"], goal) == best])
