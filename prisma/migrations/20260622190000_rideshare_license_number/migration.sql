-- Rideshare: replace driver-licence image storage with a self-reported licence
-- number. We no longer collect or retain licence images.
ALTER TABLE "rideshare_driver" DROP COLUMN IF EXISTS "licenseImageKey";
ALTER TABLE "rideshare_driver" DROP COLUMN IF EXISTS "licenseDeletedAt";
ALTER TABLE "rideshare_driver" ADD COLUMN "licenseNumber" VARCHAR(40);
