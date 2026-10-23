# Bot mẫu Bot Arena (OTTv2) — "Tham ăn": vào đích nếu được, ưu tiên ăn quân, còn lại tiến gần đích.
#
# Mỗi lượt hệ thống gọi make_move(state) và nhận lại {"from": ô, "to": ô}. Các trường chính của state:
#   my_side       "blue" hoặc "pink" (Xanh đi về I9, Hồng đi về A1)
#   goals         {"blue": "I9", "pink": "A1"}
#   board         {"E5": {"side": "blue", "type": "ROCK"}, ...}   (type: ROCK = Búa, PAPER = Bao, SCISSORS = Kéo)
#   legal_moves   [{"from": "B2", "to": "C3", "capture": None hoặc loại quân bị ăn}, ...]
#   ply, max_plies, pieces_left, last_move
# Trả nước không có trong legal_moves bị tính lỗi (lỗi thứ 3 trong hiệp thì thua hiệp).

COLS = "ABCDEFGHI"


def pos(square):
    return COLS.index(square[0]), int(square[1:]) - 1


def dist(a, b):
    (ac, ar), (bc, br) = pos(a), pos(b)
    return max(abs(ac - bc), abs(ar - br))


def make_move(state):
    moves = state["legal_moves"]
    goal = state["goals"][state["my_side"]]

    # 1) Đi thẳng vào ô đích nếu có thể (thắng ngay).
    for m in moves:
        if m["to"] == goal:
            return {"from": m["from"], "to": m["to"]}

    # 2) Ưu tiên ăn quân; nếu nhiều lựa chọn thì chọn nước gần đích nhất.
    captures = [m for m in moves if m.get("capture")]
    if captures:
        best = min(captures, key=lambda m: (dist(m["to"], goal), m["from"], m["to"]))
        return {"from": best["from"], "to": best["to"]}

    # 3) Không có gì để ăn: tiến quân về gần đích nhất.
    best = min(moves, key=lambda m: (dist(m["to"], goal), m["from"], m["to"]))
    return {"from": best["from"], "to": best["to"]}
