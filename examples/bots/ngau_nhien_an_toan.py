# Bot "Ngẫu nhiên an toàn": mốc so sánh. Đi ngẫu nhiên, nhưng không bỏ qua nước thắng ngay,
# không đi nước để đối phương thắng ngay, và tránh đứng cạnh quân địch khắc mình khi còn lựa chọn khác.
# Hệ thống đặt sẵn seed cho `random` mỗi ván, nên cùng ván chạy lại cho cùng kết quả.
import random

COLS = "ABCDEFGHI"
SIZE = 9
BEATS = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}
DIRS = [(dc, dr) for dc in (-1, 0, 1) for dr in (-1, 0, 1) if dc or dr]


def xy(square):
    return COLS.index(square[0]), int(square[1:]) - 1


def name(c, r):
    return f"{COLS[c]}{r + 1}"


def around(square):
    c, r = xy(square)
    for dc, dr in DIRS:
        nc, nr = c + dc, r + dr
        if 0 <= nc < SIZE and 0 <= nr < SIZE:
            yield name(nc, nr)


def other(side):
    return "pink" if side == "blue" else "blue"


def legal(board, side):
    out = []
    for frm, p in board.items():
        if p["side"] != side:
            continue
        for to in around(frm):
            t = board.get(to)
            if t is None:
                out.append((frm, to, None))
            elif t["side"] != side and BEATS[p["type"]] == t["type"]:
                out.append((frm, to, t["type"]))
    return out


def play(board, frm, to):
    b = dict(board)
    b[to] = b.pop(frm)
    return b


def wins_now(board, side, goals, move):
    frm, to, cap = move
    if to == goals[side]:
        return True
    left = sum(1 for p in board.values() if p["side"] == other(side) and p["type"] == cap)
    return cap is not None and left == 1


def make_move(state):
    me = state["my_side"]
    goals = state["goals"]
    board = state["board"]
    moves = [(m["from"], m["to"], m["capture"]) for m in state["legal_moves"]]

    for m in moves:
        if wins_now(board, me, goals, m):
            return {"from": m[0], "to": m[1]}

    def safe(m):
        after = play(board, m[0], m[1])
        return not any(wins_now(after, other(me), goals, o) for o in legal(after, other(me)))

    def exposed(m):
        after = play(board, m[0], m[1])
        piece = after[m[1]]
        return any(
            (t := after.get(n)) and t["side"] != me and BEATS[t["type"]] == piece["type"] for n in around(m[1])
        )

    pool = [m for m in moves if safe(m)] or moves
    calm = [m for m in pool if not exposed(m)] or pool
    m = random.choice(calm)
    return {"from": m[0], "to": m[1]}
