# Bot "Tiến công": dồn quân về ô đích của mình càng nhanh càng tốt, nhưng không đi vào ô bị khắc.
#
# Thứ tự ưu tiên mỗi lượt:
#   1. Có nước thắng ngay (vào đích, hoặc ăn quân cuối cùng của một loại) thì đi luôn.
#   2. Bỏ các nước khiến đối phương thắng ngay ở lượt sau.
#   3. Chấm điểm phần còn lại: tiến gần đích (quân đi đầu được thưởng thêm), ăn quân,
#      tránh đứng cạnh quân địch khắc mình.
# Chỉ dùng thư viện chuẩn; mỗi nước chỉ tính vài trăm phép, rất nhanh.

COLS = "ABCDEFGHI"
SIZE = 9
BEATS = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}  # quân -> loại nó ăn được
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


def dist(a, b):
    (ac, ar), (bc, br) = xy(a), xy(b)
    return max(abs(ac - bc), abs(ar - br))


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


def count_type(board, side, kind):
    return sum(1 for p in board.values() if p["side"] == side and p["type"] == kind)


def wins_now(board, side, goals, move):
    frm, to, cap = move
    if to == goals[side]:
        return True
    return cap is not None and count_type(board, other(side), cap) == 1


def lets_opponent_win(board_after, me, goals):
    opp = other(me)
    return any(wins_now(board_after, opp, goals, m) for m in legal(board_after, opp))


def danger(board, square, piece, me):
    """Có quân địch đứng cạnh ô này và khắc quân `piece` không."""
    return any(
        (t := board.get(n)) and t["side"] != me and BEATS[t["type"]] == piece["type"] for n in around(square)
    )


def make_move(state):
    me = state["my_side"]
    goals = state["goals"]
    board = state["board"]
    goal = goals[me]
    moves = [(m["from"], m["to"], m["capture"]) for m in state["legal_moves"]]

    for m in moves:
        if wins_now(board, me, goals, m):
            return {"from": m[0], "to": m[1]}

    safe = [m for m in moves if not lets_opponent_win(play(board, m[0], m[1]), me, goals)] or moves

    lead = min(dist(s, goal) for s, p in board.items() if p["side"] == me)

    def score(m):
        frm, to, cap = m
        piece = board[frm]
        after = play(board, frm, to)
        gain = dist(frm, goal) - dist(to, goal)
        s = 3.0 * gain
        if dist(frm, goal) == lead:
            s += 2.0 * gain  # đẩy quân đi đầu
        if cap:
            s += 4.0
        if danger(after, to, piece, me):
            s -= 6.0
        return (s, -dist(to, goal), frm, to)

    best = max(safe, key=score)
    return {"from": best[0], "to": best[1]}
