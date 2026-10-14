"""Bot mẫu: luôn đưa quân tiến về ô đích nhanh nhất có thể."""
import random

COLS = "ABCDEFGHI"


def dist(a, b):
    return max(abs(COLS.index(a[0]) - COLS.index(b[0])), abs(int(a[1:]) - int(b[1:])))


def make_move(state):
    goal = state["my_goal"]
    moves = state["legal_moves"]
    best = min(dist(m["to"], goal) for m in moves)
    return random.choice([m for m in moves if dist(m["to"], goal) == best])
