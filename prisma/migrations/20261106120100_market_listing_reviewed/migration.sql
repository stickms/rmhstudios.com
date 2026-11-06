-- An admin release of a HELD (anomalously priced) listing marks it reviewed so
-- the next buy is not frozen again at the same price.
ALTER TABLE "market_listing" ADD COLUMN "reviewedAt" TIMESTAMP(3);
