import random


def make_move(state):
    """Seed riêng từng lượt để retry tái hiện cùng quyết định."""
    chooser = random.Random(state.get("seed", 0) + state["ply"])
    move = chooser.choice(state["legal_moves"])
    return {"from": move["from"], "to": move["to"]}
