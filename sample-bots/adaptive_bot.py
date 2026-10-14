"""Bot mẫu: khi được thấy lịch sử, đánh khắc lựa chọn đối thủ ra nhiều nhất; nếu bị giấu thì ngẫu nhiên."""
import random
from collections import Counter


def make_move(state):
    opp = state["opponent_moves"]
    if not opp:
        return random.choice(state["moves"])
    guess = Counter(opp).most_common(1)[0][0]
    winners = [m for m, losers in state["beats"].items() if guess in losers]
    return random.choice(winners or state["moves"])
