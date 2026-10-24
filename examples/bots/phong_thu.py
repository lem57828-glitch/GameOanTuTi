# Bot "Phòng thủ": giữ chặt góc nhà (chính là ô đích của đối phương), chỉ ăn quân khi an toàn,
# và chờ hết 200 nước để thắng nhờ còn nhiều quân hơn.
#
# Thứ tự ưu tiên mỗi lượt:
#   1. Có nước thắng ngay thì đi luôn.
#   2. Bỏ các nước khiến đối phương thắng ngay ở lượt sau.
#   3. Chấm điểm: chênh lệch số quân sau lượt trả đòn của đối phương (nhìn trước 1 lượt),
#      giữ quân quanh góc nhà, đón đánh quân địch đang tiến vào, không để quân cuối của một loại bị đe dọa.
# Chỉ dùng thư viện chuẩn.

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


def count(board, side, kind=None):
    return sum(1 for p in board.values() if p["side"] == side and (kind is None or p["type"] == kind))


def wins_now(board, side, goals, move):
    frm, to, cap = move
    if to == goals[side]:
        return True
    return cap is not None and count(board, other(side), cap) == 1


def lets_opponent_win(board_after, me, goals):
    opp = other(me)
    return any(wins_now(board_after, opp, goals, m) for m in legal(board_after, opp))


def threatened(board, me):
    """Các quân của mình đang bị một quân địch đứng cạnh khắc."""
    out = []
    for s, p in board.items():
        if p["side"] != me:
            continue
        for n in around(s):
            t = board.get(n)
            if t and t["side"] != me and BEATS[t["type"]] == p["type"]:
                out.append(s)
                break
    return out


def make_move(state):
    me = state["my_side"]
    opp = other(me)
    goals = state["goals"]
    board = state["board"]
    home = goals[opp]  # góc nhà của mình = ô đích của đối phương
    moves = [(m["from"], m["to"], m["capture"]) for m in state["legal_moves"]]

    for m in moves:
        if wins_now(board, me, goals, m):
            return {"from": m[0], "to": m[1]}

    safe = [m for m in moves if not lets_opponent_win(play(board, m[0], m[1]), me, goals)] or moves

    def score(m):
        frm, to, cap = m
        after = play(board, frm, to)
        # Đối phương trả đòn tốt nhất (ăn được quân nào thì coi như mất quân đó).
        worst_loss = 0
        for of, ot, oc in legal(after, opp):
            if oc:
                loss = 3
                if count(after, me, oc) == 1:
                    loss = 50  # mất quân cuối của một loại là thua
                worst_loss = max(worst_loss, loss)
        s = (3 if cap else 0) - worst_loss
        s -= 0.5 * len(threatened(after, me))
        # Giữ đội hình gần nhà, quân chặn đường đối phương được ưu tiên.
        s -= 0.15 * dist(to, home)
        enemy_near = [x for x, p in after.items() if p["side"] == opp and dist(x, home) <= 3]
        for x in enemy_near:
            if BEATS[after[to]["type"]] == after[x]["type"]:
                s += 0.6 * (4 - dist(to, x))  # áp sát quân địch mình khắc được
        return (s, frm, to)

    best = max(safe, key=score)
    return {"from": best[0], "to": best[1]}
