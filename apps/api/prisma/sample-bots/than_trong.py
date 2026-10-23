# Bot mẫu Bot Arena (OTTv2) — "Thận trọng": tránh đứng cạnh quân đối phương khắc mình, ăn quân an toàn, tiến về đích.
#
# Mỗi lượt hệ thống gọi make_move(state) và nhận lại {"from": ô, "to": ô}. Các trường chính của state:
#   my_side       "blue" hoặc "pink" (Xanh đi về I9, Hồng đi về A1)
#   goals         {"blue": "I9", "pink": "A1"}
#   board         {"E5": {"side": "blue", "type": "ROCK"}, ...}   (type: ROCK = Búa, PAPER = Bao, SCISSORS = Kéo)
#   legal_moves   [{"from": "B2", "to": "C3", "capture": None hoặc loại quân bị ăn}, ...]
#   ply, max_plies, pieces_left, last_move

COLS = "ABCDEFGHI"
# Quân ở khóa ăn được quân ở giá trị: Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
BEATS = {"ROCK": "SCISSORS", "SCISSORS": "PAPER", "PAPER": "ROCK"}


def pos(square):
    return COLS.index(square[0]), int(square[1:]) - 1


def dist(a, b):
    (ac, ar), (bc, br) = pos(a), pos(b)
    return max(abs(ac - bc), abs(ar - br))


def neighbours(square):
    c, r = pos(square)
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            if (dc or dr) and 0 <= c + dc < 9 and 0 <= r + dr < 9:
                yield COLS[c + dc] + str(r + dr + 1)


def is_threatened(state, square, my_type):
    """Ô `square` có nằm cạnh quân đối phương ăn được quân loại `my_type` không."""
    for n in neighbours(square):
        piece = state["board"].get(n)
        if piece and piece["side"] != state["my_side"] and BEATS[piece["type"]] == my_type:
            return True
    return False


def make_move(state):
    moves = state["legal_moves"]
    goal = state["goals"][state["my_side"]]
    board = state["board"]

    for m in moves:
        if m["to"] == goal:
            return {"from": m["from"], "to": m["to"]}

    def safe(m):
        return not is_threatened(state, m["to"], board[m["from"]]["type"])

    def key(m):
        return (dist(m["to"], goal), m["from"], m["to"])

    safe_captures = [m for m in moves if m.get("capture") and safe(m)]
    if safe_captures:
        best = min(safe_captures, key=key)
        return {"from": best["from"], "to": best["to"]}

    safe_moves = [m for m in moves if safe(m)]
    best = min(safe_moves or moves, key=key)
    return {"from": best["from"], "to": best["to"]}
