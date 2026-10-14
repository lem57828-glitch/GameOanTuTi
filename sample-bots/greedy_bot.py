"""Bot mẫu: ăn quân nếu được, không thì đi ngẫu nhiên."""
import random


def make_move(state):
    captures = [m for m in state["legal_moves"] if m["capture"]]
    return random.choice(captures or state["legal_moves"])
