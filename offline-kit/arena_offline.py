#!/usr/bin/env python3
"""Bộ kiểm thử offline Bot Arena — bán kết / chung kết.

Chạy hoàn toàn không cần Internet, chỉ dùng thư viện chuẩn Python 3.8+.
Luật cờ trong file này khớp với engine của hệ thống thi đấu (packages/game-engine):
cùng thế cờ, cùng thứ tự nước hợp lệ, cùng điều kiện kết thúc.

Ví dụ:
    python arena_offline.py --ruleset semifinal --blue bot.py --pink greedy
    python arena_offline.py --ruleset final --blue bot.py --pink bot_mau.py --games 7 --show
    python arena_offline.py --rules final          # in luật và vị trí vật cản

Bot là file .py có hàm make_move(state) trả về {"from": "B2", "to": "C3"}.
Đối thủ dựng sẵn: random, greedy (ưu tiên ăn quân), rusher (lao về đích).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import random
import sys
import time

COLS = "ABCDEFGHI"
SIZE = 9
MAX_PLIES = 200
WALL_MS = 1000  # thời gian tối đa mỗi nước (giây thực)
CPU_MS = 200  # ngân sách CPU mỗi nước
MAX_ERRORS = 3  # nước sai tối đa mỗi ván
BEATS = {"ROCK": ["SCISSORS"], "PAPER": ["ROCK"], "SCISSORS": ["PAPER"]}
TYPES = ["ROCK", "PAPER", "SCISSORS"]
SWAP_NEXT = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
GOALS = {"blue": "I9", "pink": "A1"}
NAME = {"ROCK": "Búa", "PAPER": "Bao", "SCISSORS": "Kéo"}

RING = ["D4", "E4", "F4", "F5", "F6", "E6", "D6", "D5"]
RULESETS = {
    "standard": {"id": "standard-32-4", "fixed": [], "moving": [], "special": []},
    "semifinal": {
        "id": "semifinal-obstacles-1",
        "fixed": ["C5", "D6", "E5", "F4", "G5"],
        "moving": [],
        "special": [],
    },
    "final": {
        "id": "final-dynamic-1",
        "fixed": ["C5", "G5"],
        "moving": [{"path": RING, "every": 6}, {"path": RING[4:] + RING[:4], "every": 6}],
        "special": [
            {"square": "E3", "kind": "shield"},
            {"square": "E7", "kind": "shield"},
            {"square": "B5", "kind": "swap"},
            {"square": "H5", "kind": "swap"},
        ],
    },
}
DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def square(c: int, r: int) -> str:
    return f"{COLS[c]}{r + 1}"


def parse_square(s: str):
    if not isinstance(s, str) or len(s) != 2 or s[0] not in COLS or not s[1].isdigit() or s[1] == "0":
        return None
    return COLS.index(s[0]), int(s[1]) - 1


# ------------------------------------------------------------------ bàn cờ, luật


def standard_board(blue_extra="PAPER", pink_extra="PAPER"):
    """Bố trí 10 quân chuẩn; 4 ô trung tâm nhận loại quân thứ 10 đội chọn."""
    board = {}

    def assign(side, extra, center, row_edge, col_edge):
        for sq in center:
            board[sq] = {"side": side, "type": extra}
        if extra == "PAPER":
            row, col = "SCISSORS", "ROCK"
        elif extra == "SCISSORS":
            row, col = "PAPER", "ROCK"
        else:
            row, col = "SCISSORS", "PAPER"
        for sq in row_edge:
            board[sq] = {"side": side, "type": row}
        for sq in col_edge:
            board[sq] = {"side": side, "type": col}

    assign("blue", blue_extra, ["B2", "C2", "B3", "C3"], ["B1", "C1", "D1"], ["A2", "A3", "A4"])
    assign("pink", pink_extra, ["G7", "H7", "G8", "H8"], ["F9", "G9", "H9"], ["I6", "I7", "I8"])
    return board


def moving_at(rules, ply):
    return [o["path"][(ply // o["every"]) % len(o["path"])] for o in rules["moving"]]


def obstacles_at(rules, ply):
    """Ô vật cản trước nước thứ ply+1 (cố định + động)."""
    return sorted(set(rules["fixed"]) | set(moving_at(rules, ply)))


def special_at(rules, sq):
    for x in rules["special"]:
        if x["square"] == sq:
            return x["kind"]
    return None


def signature(board, to_move, moving):
    pieces = ";".join(f"{sq}:{p['side'][0]}:{p['type'][0]}" for sq, p in sorted(board.items()))
    base = f"{to_move[0]}|{pieces}"
    return f"{base}|{','.join(moving)}" if moving else base


def other(side):
    return "pink" if side == "blue" else "blue"


def new_game(rules, blue_extra="PAPER", pink_extra="PAPER", max_plies=MAX_PLIES):
    board = standard_board(blue_extra, pink_extra)
    return {
        "board": board,
        "to_move": "blue",
        "ply": 0,
        "max_plies": max_plies,
        "history": [],
        "reps": [signature(board, "blue", moving_at(rules, 0))],
    }


def legal_moves(rules, state, side=None):
    """Đi 1 ô theo 8 hướng; không vào ô vật cản; không ăn quân đứng trên ô khiên."""
    side = side or state["to_move"]
    blocked = set(obstacles_at(rules, state["ply"]))
    board = state["board"]
    out = []
    for frm, p in list(board.items()):
        if p["side"] != side:
            continue
        c, r = parse_square(frm)
        for dc, dr in DIRS:
            nc, nr = c + dc, r + dr
            if nc < 0 or nr < 0 or nc >= SIZE or nr >= SIZE:
                continue
            to = square(nc, nr)
            if to in blocked:
                continue
            target = board.get(to)
            if target is None:
                out.append({"from": frm, "to": to, "capture": None})
            elif (
                target["side"] != side
                and target["type"] in BEATS[p["type"]]
                and special_at(rules, to) != "shield"
            ):
                out.append({"from": frm, "to": to, "capture": target["type"]})
    return out


def count_pieces(board):
    n = {"blue": 0, "pink": 0}
    for p in board.values():
        n[p["side"]] += 1
    return n


def judge_by_pieces(board):
    n = count_pieces(board)
    return "blue" if n["blue"] > n["pink"] else "pink" if n["pink"] > n["blue"] else None


def check_end(rules, state, mover):
    board = state["board"]
    opp = other(mover)
    at_goal = board.get(GOALS[mover])
    if at_goal and at_goal["side"] == mover:
        return {"winner": mover, "reason": "goal"}
    for t in TYPES:
        if not any(p["side"] == opp and p["type"] == t for p in board.values()):
            return {"winner": mover, "reason": "eliminate"}
    # Ô đổi loại có thể làm chính bên vừa đi mất hẳn một loại quân → bên đó thua.
    if rules["fixed"] or rules["moving"] or rules["special"]:
        for t in TYPES:
            if not any(p["side"] == mover and p["type"] == t for p in board.values()):
                return {"winner": opp, "reason": "eliminate"}
    if not legal_moves(rules, state, opp):
        return {"winner": mover, "reason": "no_moves"}
    latest = state["reps"][-1]
    if state["reps"].count(latest) >= 3:
        return {"winner": judge_by_pieces(board), "reason": "repetition"}
    if state["ply"] >= state["max_plies"]:
        return {"winner": judge_by_pieces(board), "reason": "max_plies"}
    return None


def apply_move(rules, state, move):
    legal = next(
        (m for m in legal_moves(rules, state) if m["from"] == move.get("from") and m["to"] == move.get("to")),
        None,
    )
    if legal is None:
        raise ValueError(f"Nước không hợp lệ: {move}")
    side = state["to_move"]
    board = {sq: dict(p) for sq, p in state["board"].items()}
    piece = board.pop(legal["from"])
    promoted = SWAP_NEXT[piece["type"]] if special_at(rules, legal["to"]) == "swap" else None
    board[legal["to"]] = {**piece, "type": promoted} if promoted else piece
    record = {
        "ply": state["ply"] + 1,
        "side": side,
        "from": legal["from"],
        "to": legal["to"],
        "type": piece["type"],
        "capture": legal["capture"],
    }
    if promoted:
        record["promoted"] = promoted
    nxt = other(side)
    new_state = {
        **state,
        "board": board,
        "to_move": nxt,
        "ply": state["ply"] + 1,
        "history": state["history"] + [record],
        "reps": state["reps"] + [signature(board, nxt, moving_at(rules, state["ply"] + 1))],
    }
    return new_state, check_end(rules, new_state, side), record


def python_state(rules, state, side, seed):
    """Đúng định dạng state hệ thống gửi cho make_move(state)."""
    out = {
        "protocol_version": 1,
        "ruleset_id": rules["id"],
        "board_size": SIZE,
        "goals": dict(GOALS),
        "max_plies": state["max_plies"],
        "my_side": side,
        "turn": state["ply"] // 2 + 1,
        "ply": state["ply"],
        "board": {sq: dict(p) for sq, p in state["board"].items()},
        "pieces_left": count_pieces(state["board"]),
        "legal_moves": legal_moves(rules, state, side),
        "last_move": dict(state["history"][-1]) if state["history"] else None,
        "seed": seed,
    }
    if rules["fixed"] or rules["moving"] or rules["special"]:
        out["obstacles"] = obstacles_at(rules, state["ply"])
        out["fixed_obstacles"] = list(rules["fixed"])
        out["moving_obstacles"] = [{"path": list(o["path"]), "every": o["every"]} for o in rules["moving"]]
        out["special_cells"] = [dict(x) for x in rules["special"]]
    return out


# ------------------------------------------------------------------ đối thủ dựng sẵn (giống bot mô phỏng của hệ thống)


def rng(seed):
    """mulberry32 — cùng seed cho cùng chuỗi số với engine của hệ thống."""
    s = seed & 0xFFFFFFFF

    def imul(a, b):
        return (a * b) & 0xFFFFFFFF

    def nxt():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = s
        t = imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def _pick(arr, rand):
    return arr[int(rand() * len(arr))]


def _dist(a, b):
    (ac, ar), (bc, br) = parse_square(a), parse_square(b)
    return max(abs(ac - bc), abs(ar - br))


def policy_random(rules, state, rand):
    return _pick(legal_moves(rules, state), rand)


def policy_greedy(rules, state, rand):
    moves = legal_moves(rules, state)
    caps = [m for m in moves if m["capture"]]
    return _pick(caps or moves, rand)


def policy_rusher(rules, state, rand):
    moves = legal_moves(rules, state)
    goal = GOALS[state["to_move"]]
    best = min(_dist(m["to"], goal) for m in moves)
    return _pick([m for m in moves if _dist(m["to"], goal) == best], rand)


POLICIES = {"random": policy_random, "greedy": policy_greedy, "rusher": policy_rusher}


def simulate(rules, blue, pink, seed, blue_extra="PAPER", pink_extra="PAPER"):
    """Ván giữa hai đối thủ dựng sẵn — xác định theo seed (dùng để đối chiếu với engine hệ thống)."""
    rand = rng(seed)
    state = new_game(rules, blue_extra, pink_extra)
    while True:
        pol = POLICIES[blue if state["to_move"] == "blue" else pink]
        state, end, _ = apply_move(rules, state, pol(rules, state, rand))
        if end:
            return state["history"], end


# ------------------------------------------------------------------ chạy bot như trọng tài


class Player:
    def __init__(self, spec: str, seed: int):
        self.spec = spec
        self.seed = seed
        self.module = None
        self.rand = rng(seed)
        if spec not in POLICIES:
            loader = importlib.util.spec_from_file_location(f"bot_{abs(hash((spec, seed)))}", spec)
            if loader is None or loader.loader is None:
                raise SystemExit(f"Không mở được file bot: {spec}")
            self.module = importlib.util.module_from_spec(loader)
            random.seed(seed)
            loader.loader.exec_module(self.module)
            if not callable(getattr(self.module, "make_move", None)):
                raise SystemExit(f"{spec}: thiếu hàm make_move(state)")

    @property
    def name(self):
        return self.spec

    def move(self, rules, state, side):
        if self.module is None:
            return POLICIES[self.spec](rules, state, self.rand), None
        payload = json.loads(json.dumps(python_state(rules, state, side, self.seed)))
        wall, cpu = time.perf_counter(), time.process_time()
        try:
            mv = self.module.make_move(payload)
        except Exception as e:  # noqa: BLE001 — bot lỗi thì xử thua như hệ thống
            return None, f"crash: {type(e).__name__}: {e}"
        if (time.perf_counter() - wall) * 1000 > WALL_MS:
            return None, f"timeout: quá {WALL_MS}ms"
        if (time.process_time() - cpu) * 1000 > CPU_MS:
            return None, f"timeout: vượt ngân sách CPU {CPU_MS}ms"
        if not isinstance(mv, dict) or not isinstance(mv.get("from"), str) or not isinstance(mv.get("to"), str):
            return {"invalid": True, "raw": mv}, None
        return mv, None


def draw_board(rules, state):
    blocked = set(obstacles_at(rules, state["ply"]))
    lines = []
    for r in range(SIZE - 1, -1, -1):
        row = []
        for c in range(SIZE):
            sq = square(c, r)
            p = state["board"].get(sq)
            if p:
                ch = p["type"][0]
                row.append(ch if p["side"] == "blue" else ch.lower())
            elif sq in blocked:
                row.append("#")
            elif special_at(rules, sq) == "shield":
                row.append("+")
            elif special_at(rules, sq) == "swap":
                row.append("~")
            else:
                row.append(".")
        lines.append(f"{r + 1} " + " ".join(row))
    lines.append("  " + " ".join(COLS))
    return "\n".join(lines)


def play_game(rules, blue: Player, pink: Player, blue_extra, pink_extra, show=False):
    """Một ván theo đúng cách trọng tài hệ thống xử lý: nước sai đi thay nước hợp lệ đầu tiên, sai 3 lần thua;
    bot lỗi / quá giờ thua ngay."""
    state = new_game(rules, blue_extra, pink_extra)
    errors = {"blue": 0, "pink": 0}
    notes = []
    while state["ply"] < state["max_plies"]:
        side = state["to_move"]
        valid = legal_moves(rules, state, side)
        if not valid:
            return {"winner": other(side), "reason": "no_moves"}, state, notes
        mv, err = (blue if side == "blue" else pink).move(rules, state, side)
        if err:
            notes.append(f"{side}: {err}")
            return {"winner": other(side), "reason": err.split(":")[0]}, state, notes
        if mv.get("invalid") or not any(m["from"] == mv["from"] and m["to"] == mv["to"] for m in valid):
            errors[side] += 1
            notes.append(f"{side}: nước không hợp lệ {mv.get('raw', mv)} (lỗi {errors[side]}/{MAX_ERRORS})")
            if errors[side] >= MAX_ERRORS:
                return {"winner": other(side), "reason": "errors"}, state, notes
            mv = valid[0]
        state, end, rec = apply_move(rules, state, mv)
        if show:
            extra = f" → {NAME[rec['promoted']]}" if rec.get("promoted") else ""
            cap = f" ăn {NAME[rec['capture']]}" if rec["capture"] else ""
            print(f"\n#{rec['ply']} {side}: {rec['from']}-{rec['to']} ({NAME[rec['type']]}{cap}{extra})")
            print(draw_board(rules, state))
        if end:
            return end, state, notes
    return {"winner": judge_by_pieces(state["board"]), "reason": "max_plies"}, state, notes


def print_rules(name):
    r = RULESETS[name]
    print(f"Luật {name} ({r['id']})")
    print("  Bàn 9x9, 10 quân mỗi bên, đi 1 ô theo 8 hướng; Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.")
    print("  Thắng: tới ô đích (Xanh → I9, Hồng → A1), ăn hết một loại quân đối phương, đối phương hết nước;")
    print("  lặp thế cờ 3 lần hoặc hết 200 nước: bên nhiều quân hơn thắng, bằng thì hòa.")
    if r["fixed"]:
        print(f"  Vật cản cố định: {', '.join(r['fixed'])} — không quân nào được đi vào.")
    for i, o in enumerate(r["moving"], 1):
        print(f"  Vật cản động {i}: đi vòng {' → '.join(o['path'])}, tiến 1 ô sau mỗi {o['every']} nước.")
        print("    Không đi vào ô vật cản đang đứng; quân đã đứng sẵn ở ô đó vẫn đi ra được.")
    for x in r["special"]:
        desc = "khiên: quân đứng trên không bị ăn" if x["kind"] == "shield" else "đổi loại: Búa→Bao→Kéo→Búa"
        print(f"  Ô {x['square']} — {desc}.")
    if r["special"]:
        print("  Đổi loại làm chính bên mình mất hẳn một loại quân thì bên đó thua.")
    print("\nTrạng thái ban đầu (# vật cản, + ô khiên, ~ ô đổi loại; chữ hoa = Xanh, thường = Hồng):")
    print(draw_board(r, new_game(r)))


def main(argv=None):
    # Console Windows mặc định không phải UTF-8: in tiếng Việt không lỗi mà không cần đặt PYTHONIOENCODING.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Bộ kiểm thử offline Bot Arena (bán kết / chung kết)")
    ap.add_argument("--ruleset", choices=list(RULESETS), default="semifinal")
    ap.add_argument("--blue", default="bot.py", help="file bot hoặc random/greedy/rusher")
    ap.add_argument("--pink", default="greedy", help="file bot hoặc random/greedy/rusher")
    ap.add_argument("--extra-blue", choices=TYPES, default="PAPER", help="quân thứ 10 của Xanh")
    ap.add_argument("--extra-pink", choices=TYPES, default="PAPER", help="quân thứ 10 của Hồng")
    ap.add_argument("--games", type=int, default=1, help="số ván (đổi màu luân phiên)")
    ap.add_argument("--seed", type=int, default=317)
    ap.add_argument("--show", action="store_true", help="in bàn cờ sau mỗi nước")
    ap.add_argument("--rules", choices=list(RULESETS), help="chỉ in luật của vòng rồi thoát")
    ap.add_argument("--simulate-json", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.rules:
        print_rules(a.rules)
        return 0
    rules = RULESETS[a.ruleset]
    if a.simulate_json:  # dùng cho kiểm thử đối chiếu với engine hệ thống
        moves, end = simulate(rules, a.blue, a.pink, a.seed, a.extra_blue, a.extra_pink)
        print(json.dumps({"moves": moves, "end": end}))
        return 0
    wins = {a.blue: 0, a.pink: 0}
    for g in range(a.games):
        seed = a.seed + g
        first, second = (a.blue, a.pink) if g % 2 == 0 else (a.pink, a.blue)
        ex1, ex2 = (a.extra_blue, a.extra_pink) if g % 2 == 0 else (a.extra_pink, a.extra_blue)
        end, state, notes = play_game(
            rules, Player(first, seed), Player(second, seed + 1), ex1, ex2, show=a.show
        )
        winner = {"blue": first, "pink": second}.get(end["winner"]) if end["winner"] else None
        if winner:
            wins[winner] += 1
        print(
            f"Ván {g + 1}: Xanh={first} vs Hồng={second} → "
            f"{'hòa' if not winner else winner + ' thắng'} ({end['reason']}, {state['ply']} nước)"
        )
        for n in notes:
            print(f"   {n}")
    if a.games > 1:
        print(f"Tổng: {a.blue} {wins[a.blue]} – {wins[a.pink]} {a.pink}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
