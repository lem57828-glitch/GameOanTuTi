"""Bot mẫu: chọn ngẫu nhiên đều."""
import random


def make_move(state):
    return random.choice(state["moves"])
