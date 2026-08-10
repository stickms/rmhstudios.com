-- AI-written descriptions for /pf2ecal sessions.
--
-- `blurbShort` is the line under the card in the agenda and `blurbLong` the
-- paragraph in the session sheet. Both are derived from what a person typed —
-- title, notes, location, when it runs, how many have replied — so `blurbKey`
-- is a hash of exactly those inputs: a mismatch is what asks for a rewrite, and
-- editing a session's notes is what causes the mismatch. Nothing has to
-- remember to invalidate anything.
--
-- All four are nullable and null for every existing row, on purpose. Nothing is
-- back-filled: generating on migrate would mean a model call per session inside
-- a deploy, and the page renders the notes someone typed whenever a description
-- is absent — which is also what it does with no DEEPSEEK_API_KEY set at all.

-- AlterTable
ALTER TABLE "pf2e_session" ADD COLUMN     "blurbAt" TIMESTAMP(3),
ADD COLUMN     "blurbKey" VARCHAR(64),
ADD COLUMN     "blurbLong" VARCHAR(2000),
ADD COLUMN     "blurbShort" VARCHAR(240);
