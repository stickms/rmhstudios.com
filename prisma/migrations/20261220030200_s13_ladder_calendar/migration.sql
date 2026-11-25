-- Sprint 13 / 09: "Show on my calendar" — opt-in for RMHLadder interviews, follow-ups and deadlines on /calendar and in the private feed.
ALTER TABLE "ladder_user_prefs" ADD COLUMN "calendarInFeed" BOOLEAN NOT NULL DEFAULT false;
