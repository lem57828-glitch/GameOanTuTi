# Bot "Tính trước": tìm kiếm minimax (negamax + cắt tỉa alpha-beta), đào sâu dần trong giới hạn thời gian.
#
# - Tự mô phỏng luật: đi 1 ô theo 8 hướng, Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
# - Thắng: vào ô đích, ăn hết một loại quân của đối phương, hoặc đối phương hết nước đi.
# - Đánh giá thế cờ: số quân, loại quân sắp bị ăn hết (của mình/đối phương), khoảng cách tới đích.
# - Hệ thống chỉ cho khoảng 0,2 giây CPU mỗi nước, nên bot dừng tìm ở 0,09 giây và dùng kết quả
#   của độ sâu đã tính xong gần nhất.
# Chỉ dùng thư viện chuẩn.
import time

COLS = "ABCDEFGHI"
SIZE = 9
BEATS = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}
KINDS = tuple(BEATS)
DIRS = [(dc, dr) for dc in (-1, 0, 1) for dr in (-1, 0, 1) if dc or dr]
TIME_BUDGET = 0.09
WIN = 100000

# Ô kề sẵn cho từng ô để tiết kiệm thời gian.
SQUARES = [f"{COLS[c]}{r + 1}" for c in range(SIZE) for r in range(SIZE)]
XY = {s: (COLS.index(s[0]), int(s[1:]) - 1) for s in SQUARES}
NEIGHBORS = {
    s: [
        f"{COLS[c + dc]}{r + dr + 1}"
        for dc, dr in DIRS
        if 0 <= c + dc < SIZE and 0 <= r + dr < SIZE
    ]
    for s, (c, r) in XY.items()
}


class OutOfTime(Exception):
    pass


def dist(a, b):
    (ac, ar), (bc, br) = XY[a], XY[b]
    return max(abs(ac - bc), abs(ar - br))


def other(side):
    return "pink" if side == "blue" else "blue"


def legal(board, side):
    out = []
    for frm, (s, kind) in board.items():
        if s != side:
            continue
        for to in NEIGHBORS[frm]:
            t = board.get(to)
            if t is None:
                out.append((frm, to, None))
            elif t[0] != side and BEATS[kind] == t[1]:
                out.append((frm, to, t[1]))
    return out


def counts(board):
    c = {("blue", k): 0 for k in KINDS}
    c.update({("pink", k): 0 for k in KINDS})
    for s, kind in board.values():
        c[(s, kind)] += 1
    return c


class Search:
    def __init__(self, goals, deadline, plies_left):
        self.goals = goals
        self.deadline = deadline
        self.plies_left = plies_left
        self.nodes = 0

    def evaluate(self, board, side):
        opp = other(side)
        c = counts(board)
        mine = sum(c[(side, k)] for k in KINDS)
        theirs = sum(c[(opp, k)] for k in KINDS)
        score = 10.0 * (mine - theirs)
        for k in KINDS:
            if c[(opp, k)] == 1:
                score += 6
            if c[(side, k)] == 1:
                score -= 6
        my_lead = min((dist(s, self.goals[side]) for s, p in board.items() if p[0] == side), default=9)
        op_lead = min((dist(s, self.goals[opp]) for s, p in board.items() if p[0] == opp), default=9)
        score += 2.0 * (op_lead - my_lead)
        return score

    def ordered(self, board, side, moves):
        goal = self.goals[side]
        return sorted(moves, key=lambda m: (m[1] != goal, m[2] is None, dist(m[1], goal)))

    def negamax(self, board, side, depth, alpha, beta, ply):
        self.nodes += 1
        if (self.nodes & 63) == 0 and time.process_time() > self.deadline:
            raise OutOfTime
        moves = legal(board, side)
        if not moves:
            return -WIN + ply  # hết nước đi là thua
        if depth == 0 or ply >= self.plies_left:
            if ply >= self.plies_left:  # hết 200 nước: so số quân
                c = counts(board)
                diff = sum(c[(side, k)] for k in KINDS) - sum(c[(other(side), k)] for k in KINDS)
                return 1000 * diff
            return self.evaluate(board, side)
        c = counts(board)
        opp = other(side)
        best = -WIN * 2
        for frm, to, cap in self.ordered(board, side, moves):
            if to == self.goals[side] or (cap and c[(opp, cap)] == 1):
                return WIN - ply
            child = dict(board)
            child[to] = child.pop(frm)
            val = -self.negamax(child, opp, depth - 1, -beta, -alpha, ply + 1)
            if val > best:
                best = val
            if best > alpha:
                alpha = best
            if alpha >= beta:
                break
        return best

    def root(self, board, side, depth, moves):
        best_val, best_move = -WIN * 2, moves[0]
        alpha = -WIN * 2
        c = counts(board)
        opp = other(side)
        for m in moves:
            frm, to, cap = m
            if to == self.goals[side] or (cap and c[(opp, cap)] == 1):
                return WIN, m
            child = dict(board)
            child[to] = child.pop(frm)
            val = -self.negamax(child, opp, depth - 1, -WIN * 2, -alpha, 1)
            if val > best_val:
                best_val, best_move = val, m
                alpha = max(alpha, val)
        return best_val, best_move


def make_move(state):
    started = time.process_time()
    side = state["my_side"]
    board = {s: (p["side"], p["type"]) for s, p in state["board"].items()}
    moves = [(m["from"], m["to"], m["capture"]) for m in state["legal_moves"]]
    if len(moves) == 1:
        return {"from": moves[0][0], "to": moves[0][1]}
    search = Search(state["goals"], started + TIME_BUDGET, state["max_plies"] - state["ply"])
    moves = search.ordered(board, side, moves)
    best = moves[0]
    depth = 1
    while True:
        try:
            val, move = search.root(board, side, depth, moves)
        except OutOfTime:
            break
        best = move
        # Xét nước tốt nhất trước ở độ sâu kế tiếp (cắt tỉa hiệu quả hơn).
        moves = [move] + [m for m in moves if m != move]
        if abs(val) >= WIN - 50 or depth >= 6:
            break
        depth += 1
    return {"from": best[0], "to": best[1]}
