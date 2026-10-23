-- Keep authentication emails; never send queued activity notifications.
UPDATE "EmailMessage" SET status = 'cancelled' WHERE status IN ('pending', 'sending', 'failed') AND "dedupeKey" NOT LIKE 'auth:%' AND "dedupeKey" NOT LIKE 'registration:%';
