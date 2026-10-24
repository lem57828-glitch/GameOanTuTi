# Bot "Săn một loại quân": thắng bằng luật "ăn hết một loại quân của đối phương".
#
# Mỗi lượt chọn "con mồi" = loại quân đối phương còn ít nhất (hòa thì chọn loại mình có nhiều quân khắc nhất).
# Quân khắc con mồi đi săn; quân khác thì đứng yên tránh rủi ro hoặc che chắn.
# Thứ tự ưu tiên:
#   1. Có nước thắng ngay thì đi luôn.
#   2. Bỏ các nước khiến đối phương thắng ngay ở lượt sau.
#   3. Ăn con mồi nếu được; không thì đưa thợ săn lại gần con mồi gần nhất, tránh ô bị khắc.
# Chỉ dùng thư viện chuẩn.

COLS = "ABCDEFGHI"
SIZE = 9
BEATS = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}
HUNTER = {v: k for k, v in BEATS.items()}  # loại -> loại khắc nó
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


def count(board, side, kind):
    return sum(1 for p in board.values() if p["side"] == side and p["type"] == kind)


def wins_now(board, side, goals, move):
    frm, to, cap = move
    if to == goals[side]:
        return True
    return cap is not None and count(board, other(side), cap) == 1


def lets_opponent_win(board_after, me, goals):
    opp = other(me)
    return any(wins_now(board_after, opp, goals, m) for m in legal(board_after, opp))


def danger(board, square, me):
    piece = board[square]
    return any(
        (t := board.get(n)) and t["side"] != me and BEATS[t["type"]] == piece["type"] for n in around(square)
    )


def pick_prey(board, me):
    opp = other(me)
    options = []
    for kind in BEATS:
        left = count(board, opp, kind)
        hunters = count(board, me, HUNTER[kind])
        if left and hunters:
            options.append((left, -hunters, kind))
    return min(options)[2] if options else None


def make_move(state):
    me = state["my_side"]
    opp = other(me)
    goals = state["goals"]
    board = state["board"]
    moves = [(m["from"], m["to"], m["capture"]) for m in state["legal_moves"]]

    for m in moves:
        if wins_now(board, me, goals, m):
            return {"from": m[0], "to": m[1]}

    safe = [m for m in moves if not lets_opponent_win(play(board, m[0], m[1]), me, goals)] or moves
    prey = pick_prey(board, me)
    targets = [s for s, p in board.items() if p["side"] == opp and p["type"] == prey]

    def score(m):
        frm, to, cap = m
        piece = board[frm]
        after = play(board, frm, to)
        s = 0.0
        if cap == prey:
            s += 20
        elif cap:
            s += 5
        if piece["type"] == HUNTER.get(prey) and targets:
            s += 2.0 * (min(dist(frm, t) for t in targets) - min(dist(to, t) for t in targets))
        if danger(after, to, me):
            s -= 8 if count(after, me, piece["type"]) > 1 else 40
        return (s, frm, to)

    best = max(safe, key=score)
    return {"from": best[0], "to": best[1]}
