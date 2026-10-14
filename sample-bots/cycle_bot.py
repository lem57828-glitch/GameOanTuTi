"""Bot mẫu: xoay vòng các lựa chọn theo thứ tự."""


def make_move(state):
    return state["moves"][state["turn"] % len(state["moves"])]
