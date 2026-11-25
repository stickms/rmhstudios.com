-- A private note on a saved home (s12 10). Nullable, additive: every existing saved listing keeps no note.
ALTER TABLE "home_favorite" ADD COLUMN "note" VARCHAR(1000);
