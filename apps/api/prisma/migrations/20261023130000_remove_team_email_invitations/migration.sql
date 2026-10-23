-- Retain historical records, but disable outstanding email invitations.
UPDATE "TeamInvitation" SET "status" = 'cancelled' WHERE "status" = 'pending';
UPDATE "EmailMessage" SET "status" = 'cancelled' WHERE "status" IN ('pending', 'sending') AND ("dedupeKey" LIKE 'invite-mail:%' OR "dedupeKey" LIKE 'invite:%');
