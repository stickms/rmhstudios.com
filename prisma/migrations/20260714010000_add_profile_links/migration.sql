-- Link-in-bio: an ordered list of { label, url } objects (max 5, enforced in
-- application code) stored as JSON on the user profile.
ALTER TABLE "user_profile" ADD COLUMN "links" JSONB;
