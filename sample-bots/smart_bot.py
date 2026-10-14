"""Bot mẫu: nhìn trước một nước của đối thủ.

Ưu tiên: thắng ngay > chặn/ăn quân đe dọa ô nhà > ăn quân an toàn > tiến về đích mà không đứng vào ô bị ăn.
"""
import random

COLS = "ABCDEFGHI"
DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def xy(s):
    return COLS.index(s[0]), int(s[1:]) - 1


def name(x, y):
    return f"{COLS[x]}{y + 1}"


def dist(a, b):
    (ax, ay), (bx, by) = xy(a), xy(b)
    return max(abs(ax - bx), abs(ay - by))


def neighbors(s):
    x, y = xy(s)
    for dx, dy in DIRS:
        if 0 <= x + dx < 9 and 0 <= y + dy < 9:
            yield name(x + dx, y + dy)


def attacked(square, my_type, board, me, beats):
    """Quân `my_type` đứng ở `square` có bị một quân đối phương bên cạnh ăn được không."""
    for n in neighbors(square):
        p = board.get(n)
        if p and p["side"] != me and my_type in beats[p["type"]]:
            return True
    return False


def make_move(state):
    me, beats, board = state["me"], state["beats"], state["board"]
    goal, home = state["my_goal"], state["opponent_goal"]
    moves = state["legal_moves"]

    for m in moves:
        if m["to"] == goal:
            return m

    def score(m):
        my_type = board[m["from"]]["type"]
        after = dict(board)
        del after[m["from"]]
        after[m["to"]] = {"side": me, "type": my_type}
        s = 0
        if m["capture"]:
            s += 30
            # Ăn quân đang áp sát ô nhà được thưởng thêm.
            s += max(0, 4 - dist(m["to"], home)) * 10
        if attacked(m["to"], my_type, after, me, beats):
            s -= 25
        s += (dist(m["from"], goal) - dist(m["to"], goal)) * 5
        return s + random.random()

    return max(moves, key=score)
