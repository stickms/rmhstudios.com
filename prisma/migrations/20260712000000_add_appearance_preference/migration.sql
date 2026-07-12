-- Per-user appearance preferences (theme + accent), synced across devices
CREATE TABLE "appearance_preference" (
    "userId" TEXT NOT NULL,
    "style" TEXT,
    "accent" TEXT,

    CONSTRAINT "appearance_preference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "appearance_preference" ADD CONSTRAINT "appearance_preference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
