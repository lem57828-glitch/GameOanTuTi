"""Bot mẫu cho bán kết / chung kết — điểm khởi đầu để đội sửa theo luật mới.

Hệ thống gọi make_move(state) mỗi lượt và chờ {"from": ..., "to": ...} trong tối đa 1 giây (CPU 200ms).
state["legal_moves"] đã loại các ô vật cản và quân đứng trên ô khiên, nên chọn trong danh sách này thì
không bao giờ phạm luật. Các trường thêm ở bán kết/chung kết:
    obstacles          ô vật cản ở lượt này
    fixed_obstacles    vật cản cố định
    moving_obstacles   [{path, every}]: vật cản động ở path[(ply // every) % len(path)] trước nước ply+1
    special_cells      [{square, kind}]: kind = "shield" (không bị ăn) hoặc "swap" (đổi loại khi dừng ở đó)
"""

COLS = "ABCDEFGHI"
BEATS = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}
SWAP_NEXT = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}


def _xy(sq):
    return COLS.index(sq[0]), int(sq[1]) - 1


def _dist(a, b):
    (ac, ar), (bc, br) = _xy(a), _xy(b)
    return max(abs(ac - bc), abs(ar - br))


def _neighbors(sq):
    c, r = _xy(sq)
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            if (dc or dr) and 0 <= c + dc < 9 and 0 <= r + dr < 9:
                yield f"{COLS[c + dc]}{r + dr + 1}"


def make_move(state):
    me = state["my_side"]
    goal = state["goals"][me]
    board = state["board"]
    shields = {x["square"] for x in state.get("special_cells", []) if x["kind"] == "shield"}
    swaps = {x["square"] for x in state.get("special_cells", []) if x["kind"] == "swap"}
    my_types = [p["type"] for p in board.values() if p["side"] == me]

    def score(m):
        piece = board[m["from"]]
        kind = SWAP_NEXT[piece["type"]] if m["to"] in swaps else piece["type"]
        s = 0.0
        if m["to"] == goal:
            return 1e9
        if m["capture"]:
            s += 50
        # Đổi loại làm mất hẳn một loại quân của mình là thua ngay.
        if m["to"] in swaps and my_types.count(piece["type"]) == 1:
            return -1e9
        # Ô có quân đối phương đứng cạnh ăn được mình (trừ khi đứng trên ô khiên) là nguy hiểm.
        if m["to"] not in shields:
            for n in _neighbors(m["to"]):
                q = board.get(n)
                if q and q["side"] != me and BEATS[q["type"]] == kind:
                    s -= 30
                    break
        s -= 2 * _dist(m["to"], goal)
        return s

    return max(state["legal_moves"], key=score)
