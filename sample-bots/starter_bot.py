"""Bot mẫu khởi đầu - BOT ARENA.

Máy chủ gọi make_move(state) mỗi lượt. state gồm:
  turn            lượt hiện tại, bắt đầu từ 0
  total_turns     tổng số lượt của trận (có thể tăng khi đấu phụ)
  moves           các lựa chọn hợp lệ, ví dụ ["ROCK", "PAPER", "SCISSORS"]
  beats           bảng thắng, ví dụ {"ROCK": ["SCISSORS"], ...}
  my_moves        các lựa chọn bạn đã ra
  opponent_moves  lựa chọn của đối thủ, hoặc None nếu giai đoạn này giấu dữ liệu
  results         "W"/"L"/"D" theo từng lượt, hoặc None nếu bị giấu

Trả về một chuỗi trong state["moves"]. Sai lựa chọn, lỗi, quá 100 ms CPU = thua lượt đó.
Quá 1 giây không trả lời: bot bị dừng và thua các lượt còn lại.
Không dùng mạng, tiến trình con hay đọc tệp ngoài thư mục bot.
Dùng module random bình thường: máy chủ đặt seed để trận chạy lại cho cùng kết quả.
"""
import random


def counter_of(move, beats):
    """Trả về một lựa chọn thắng được `move` theo bảng luật (dùng được cả khi luật đổi)."""
    winners = [m for m, losers in beats.items() if move in losers]
    return random.choice(winners) if winners else None


def make_move(state):
    moves = state["moves"]
    opp = state["opponent_moves"]

    # Giai đoạn giấu dữ liệu: không biết đối thủ, chơi ngẫu nhiên là khó bị khai thác nhất.
    if not opp:
        return random.choice(moves)

    # Có dữ liệu: đoán đối thủ lặp lại lựa chọn hay gặp nhất trong 20 lượt gần đây.
    recent = opp[-20:]
    guess = max(set(recent), key=recent.count)
    return counter_of(guess, state["beats"]) or random.choice(moves)
