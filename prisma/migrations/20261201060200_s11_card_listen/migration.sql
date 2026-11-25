-- Listen to your flashcards (s11-17): the languages a deck's fronts and backs are written in. Nullable, additive:
-- null means "the site's language", which is what every existing deck keeps.
ALTER TABLE "flashcard_deck" ADD COLUMN "frontLang" VARCHAR(16);
ALTER TABLE "flashcard_deck" ADD COLUMN "backLang" VARCHAR(16);
