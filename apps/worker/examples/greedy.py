def make_move(state):
    """Ưu tiên ăn quân; nếu không có thì chọn nước hợp lệ đầu tiên."""
    moves = state["legal_moves"]
    for move in moves:
        if move["capture"]:
            return {"from": move["from"], "to": move["to"]}
    return {"from": moves[0]["from"], "to": moves[0]["to"]}
