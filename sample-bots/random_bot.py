"""Bot mẫu: chọn ngẫu nhiên một nước hợp lệ."""
import random


def make_move(state):
    return random.choice(state["legal_moves"])
