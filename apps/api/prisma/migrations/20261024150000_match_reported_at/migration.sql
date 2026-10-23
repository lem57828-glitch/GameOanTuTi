-- TV4: thời điểm đã bàn giao kết quả trận cho TV3. Trận completed mà reportedAt null được bộ hẹn giờ đối chiếu
-- và gửi bù (tiến trình có thể dừng giữa lúc hoàn tất trận và lúc gửi kết quả).
ALTER TABLE "Match" ADD COLUMN "reportedAt" TIMESTAMP(3);
