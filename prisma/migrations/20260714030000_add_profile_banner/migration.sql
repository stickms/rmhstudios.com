-- Profile banner/cover image (WebP object-storage URL) + size for quota.
ALTER TABLE "user_profile"
  ADD COLUMN "bannerUrl" VARCHAR(300),
  ADD COLUMN "bannerSizeBytes" INTEGER;
