-- Expand step: one Listing for the player marketplaces. The cosmetics market
-- ("market_listing"), the trading-card market ("card_listing") and creator
-- storefront products ("storefront_product", with "storefront_purchase") become
-- rows of "listing" told apart by "kind" (COSMETIC | CARD | PRODUCT), and
-- product purchases become "listing_purchase". Every copied row keeps its id
-- (cuids, unique across the three tables), so the ledger rows that name a
-- listing or product by id ("coin_transaction"."entityId") and a filled buy
-- order's "filledListingId" still point at the same thing.
--
-- Additive only: the old tables stay, and are dropped by the contract release.
--
-- Why triggers, not only a copy. A listing is money in escrow: an item or a
-- card that sells exactly once. During the blue/green swap (and for the whole
-- of a rollback) the previous release keeps listing, buying and cancelling on
-- the old tables while this one does the same on "listing". A one-shot copy
-- would leave each release blind to the other's writes: a listing bought on the
-- old release would still be ACTIVE here and sell a second time (a second buyer
-- debited, the escrowed inventory row re-parented away from the first buyer),
-- and a card listed on the old release after the copy (its card already taken
-- out of the seller's stack) would be invisible here and lost at the contract.
-- So until the contract, each old table and "listing" mirror every insert,
-- update and delete into each other, in the same transaction as the write:
--
--   * a claim on either side (UPDATE ... WHERE status = 'ACTIVE') also writes
--     the other side's row, under that row's lock, so a racing claim on the
--     other release either waits and then finds the row SOLD (count 0, refused)
--     or deadlocks and is rolled back by Postgres. Either way no listing sells
--     twice and no coins move without the claim;
--   * the mirror INSERT targets the primary key only (ON CONFLICT ("id")). A
--     second live listing for the same inventory row, or a second purchase of
--     the same product by the same buyer, made concurrently on the other
--     release, violates the other table's unique index and aborts that whole
--     transaction (coins included): it fails closed;
--   * a mirrored write fires the other table's trigger one level deeper, which
--     returns at once (pg_trigger_depth() > 1), so nothing loops.
--
-- The contract release must, in one migration: re-run the four copy
-- statements below (each reuses the old id and ends in ON CONFLICT ("id") DO
-- NOTHING, so a re-run is a no-op while the triggers are in place), drop the
-- six triggers and their functions, then drop the old tables.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the indexes are on "listing" and "listing_purchase", created empty in this migration; the copy fills them afterwards inside the same transaction

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('COSMETIC', 'CARD', 'PRODUCT');

-- CreateTable
CREATE TABLE "listing" (
    "id" TEXT NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "sellerId" TEXT NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "inventoryId" TEXT,
    "itemId" VARCHAR(64),
    "gameId" VARCHAR(64),
    "cardIndex" SMALLINT,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(80),
    "description" VARCHAR(500),
    "deliverable" TEXT,
    "salesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id"),
    -- Each kind fills the columns its old table had as NOT NULL (the mirror
    -- into that table relies on it).
    CONSTRAINT "listing_kind_fields" CHECK (
        ("kind" <> 'COSMETIC' OR ("inventoryId" IS NOT NULL AND "itemId" IS NOT NULL))
        AND ("kind" <> 'CARD' OR ("gameId" IS NOT NULL AND "cardIndex" IS NOT NULL))
        AND ("kind" <> 'PRODUCT' OR "title" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "listing_purchase" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_inventoryId_key" ON "listing"("inventoryId");

-- CreateIndex
CREATE INDEX "listing_kind_status_itemId_priceCoins_idx" ON "listing"("kind", "status", "itemId", "priceCoins");

-- CreateIndex
CREATE INDEX "listing_kind_status_gameId_cardIndex_foil_priceCoins_idx" ON "listing"("kind", "status", "gameId", "cardIndex", "foil", "priceCoins");

-- CreateIndex
CREATE INDEX "listing_sellerId_kind_status_idx" ON "listing"("sellerId", "kind", "status");

-- CreateIndex
CREATE INDEX "listing_purchase_buyerId_idx" ON "listing_purchase"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_purchase_listingId_buyerId_key" ON "listing_purchase"("listingId", "buyerId");

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_purchase" ADD CONSTRAINT "listing_purchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_purchase" ADD CONSTRAINT "listing_purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Mirror functions (transitional; the contract release drops them) ───────

-- Old tables → "listing" / "listing_purchase".
CREATE FUNCTION "listing_mirror_from_market_listing"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "listing" WHERE "id" = OLD."id";
    RETURN NULL;
  END IF;
  INSERT INTO "listing" (
    "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
    "closedAt", "reviewedAt", "inventoryId", "itemId"
  ) VALUES (
    NEW."id", 'COSMETIC', NEW."sellerId", NEW."priceCoins", NEW."status", NEW."buyerId", NEW."createdAt", CURRENT_TIMESTAMP,
    NEW."closedAt", NEW."reviewedAt", NEW."inventoryId", NEW."itemId"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "sellerId" = EXCLUDED."sellerId", "priceCoins" = EXCLUDED."priceCoins", "status" = EXCLUDED."status",
    "buyerId" = EXCLUDED."buyerId", "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt",
    "closedAt" = EXCLUDED."closedAt", "reviewedAt" = EXCLUDED."reviewedAt",
    "inventoryId" = EXCLUDED."inventoryId", "itemId" = EXCLUDED."itemId";
  RETURN NULL;
END;
$$;

CREATE FUNCTION "listing_mirror_from_card_listing"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "listing" WHERE "id" = OLD."id";
    RETURN NULL;
  END IF;
  INSERT INTO "listing" (
    "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
    "closedAt", "gameId", "cardIndex", "foil"
  ) VALUES (
    NEW."id", 'CARD', NEW."sellerId", NEW."priceCoins", NEW."status", NEW."buyerId", NEW."createdAt", CURRENT_TIMESTAMP,
    NEW."closedAt", NEW."gameId", NEW."cardIndex", NEW."foil"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "sellerId" = EXCLUDED."sellerId", "priceCoins" = EXCLUDED."priceCoins", "status" = EXCLUDED."status",
    "buyerId" = EXCLUDED."buyerId", "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt",
    "closedAt" = EXCLUDED."closedAt", "gameId" = EXCLUDED."gameId", "cardIndex" = EXCLUDED."cardIndex",
    "foil" = EXCLUDED."foil";
  RETURN NULL;
END;
$$;

-- A product is on sale (ACTIVE) or taken down (CANCELED); "active" is that bit.
CREATE FUNCTION "listing_mirror_from_storefront_product"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "listing" WHERE "id" = OLD."id";
    RETURN NULL;
  END IF;
  INSERT INTO "listing" (
    "id", "kind", "sellerId", "priceCoins", "status", "createdAt", "updatedAt",
    "title", "description", "deliverable", "salesCount"
  ) VALUES (
    NEW."id", 'PRODUCT', NEW."creatorId", NEW."price",
    CASE WHEN NEW."active" THEN 'ACTIVE'::"ListingStatus" ELSE 'CANCELED'::"ListingStatus" END,
    NEW."createdAt", NEW."updatedAt", NEW."title", NEW."description", NEW."deliverable", NEW."salesCount"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "sellerId" = EXCLUDED."sellerId", "priceCoins" = EXCLUDED."priceCoins", "status" = EXCLUDED."status",
    "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt", "title" = EXCLUDED."title",
    "description" = EXCLUDED."description", "deliverable" = EXCLUDED."deliverable",
    "salesCount" = EXCLUDED."salesCount";
  RETURN NULL;
END;
$$;

CREATE FUNCTION "listing_mirror_from_storefront_purchase"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "listing_purchase" WHERE "id" = OLD."id";
    RETURN NULL;
  END IF;
  INSERT INTO "listing_purchase" ("id", "listingId", "buyerId", "pricePaid", "createdAt")
  VALUES (NEW."id", NEW."productId", NEW."buyerId", NEW."pricePaid", NEW."createdAt")
  ON CONFLICT ("id") DO NOTHING;
  RETURN NULL;
END;
$$;

-- "listing" / "listing_purchase" → the old tables, so the previous release
-- (during the swap, or after a rollback) sees what this one writes.
CREATE FUNCTION "listing_mirror_to_legacy"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."kind" = 'COSMETIC' THEN
      DELETE FROM "market_listing" WHERE "id" = OLD."id";
    ELSIF OLD."kind" = 'CARD' THEN
      DELETE FROM "card_listing" WHERE "id" = OLD."id";
    ELSE
      DELETE FROM "storefront_product" WHERE "id" = OLD."id";
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."kind" = 'COSMETIC' THEN
    INSERT INTO "market_listing" (
      "id", "sellerId", "inventoryId", "itemId", "priceCoins", "status", "buyerId", "createdAt",
      "closedAt", "reviewedAt"
    ) VALUES (
      NEW."id", NEW."sellerId", NEW."inventoryId", NEW."itemId", NEW."priceCoins", NEW."status", NEW."buyerId", NEW."createdAt",
      NEW."closedAt", NEW."reviewedAt"
    )
    ON CONFLICT ("id") DO UPDATE SET
      "sellerId" = EXCLUDED."sellerId", "inventoryId" = EXCLUDED."inventoryId", "itemId" = EXCLUDED."itemId",
      "priceCoins" = EXCLUDED."priceCoins", "status" = EXCLUDED."status", "buyerId" = EXCLUDED."buyerId",
      "createdAt" = EXCLUDED."createdAt", "closedAt" = EXCLUDED."closedAt", "reviewedAt" = EXCLUDED."reviewedAt";
  ELSIF NEW."kind" = 'CARD' THEN
    INSERT INTO "card_listing" (
      "id", "sellerId", "gameId", "cardIndex", "foil", "priceCoins", "status", "buyerId", "createdAt", "closedAt"
    ) VALUES (
      NEW."id", NEW."sellerId", NEW."gameId", NEW."cardIndex", NEW."foil", NEW."priceCoins", NEW."status", NEW."buyerId",
      NEW."createdAt", NEW."closedAt"
    )
    ON CONFLICT ("id") DO UPDATE SET
      "sellerId" = EXCLUDED."sellerId", "gameId" = EXCLUDED."gameId", "cardIndex" = EXCLUDED."cardIndex",
      "foil" = EXCLUDED."foil", "priceCoins" = EXCLUDED."priceCoins", "status" = EXCLUDED."status",
      "buyerId" = EXCLUDED."buyerId", "createdAt" = EXCLUDED."createdAt", "closedAt" = EXCLUDED."closedAt";
  ELSE
    INSERT INTO "storefront_product" (
      "id", "creatorId", "title", "description", "price", "deliverable", "active", "salesCount", "createdAt", "updatedAt"
    ) VALUES (
      NEW."id", NEW."sellerId", NEW."title", NEW."description", NEW."priceCoins", NEW."deliverable",
      NEW."status" = 'ACTIVE', NEW."salesCount", NEW."createdAt", NEW."updatedAt"
    )
    ON CONFLICT ("id") DO UPDATE SET
      "creatorId" = EXCLUDED."creatorId", "title" = EXCLUDED."title", "description" = EXCLUDED."description",
      "price" = EXCLUDED."price", "deliverable" = EXCLUDED."deliverable", "active" = EXCLUDED."active",
      "salesCount" = EXCLUDED."salesCount", "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt";
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "listing_purchase_mirror_to_legacy"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "storefront_purchase" WHERE "id" = OLD."id";
    RETURN NULL;
  END IF;
  INSERT INTO "storefront_purchase" ("id", "productId", "buyerId", "pricePaid", "createdAt")
  VALUES (NEW."id", NEW."listingId", NEW."buyerId", NEW."pricePaid", NEW."createdAt")
  ON CONFLICT ("id") DO NOTHING;
  RETURN NULL;
END;
$$;

-- ─── Hold the old tables still, attach their mirrors, then copy ─────────────
-- The lock (taken in the order the old release's storefront purchase writes
-- them: purchase, then product) makes the previous release's writes wait for
-- this migration to commit, so no row is written between the copy's snapshot
-- and the trigger that would have mirrored it. Reads carry on.
LOCK TABLE "storefront_purchase", "storefront_product", "market_listing", "card_listing" IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER "listing_mirror" AFTER INSERT OR UPDATE OR DELETE ON "market_listing"
FOR EACH ROW EXECUTE FUNCTION "listing_mirror_from_market_listing"();

CREATE TRIGGER "listing_mirror" AFTER INSERT OR UPDATE OR DELETE ON "card_listing"
FOR EACH ROW EXECUTE FUNCTION "listing_mirror_from_card_listing"();

CREATE TRIGGER "listing_mirror" AFTER INSERT OR UPDATE OR DELETE ON "storefront_product"
FOR EACH ROW EXECUTE FUNCTION "listing_mirror_from_storefront_product"();

CREATE TRIGGER "listing_mirror" AFTER INSERT OR DELETE ON "storefront_purchase"
FOR EACH ROW EXECUTE FUNCTION "listing_mirror_from_storefront_purchase"();

-- ─── Copy (idempotent; the contract re-runs it before dropping the old tables) ─
-- Status, buyer, closedAt and reviewedAt carry over as they are, so a SOLD or
-- CANCELED listing stays closed and a HELD one stays under review.

-- 1. Cosmetics market.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
  "closedAt", "reviewedAt", "inventoryId", "itemId"
)
SELECT
  m."id", 'COSMETIC', m."sellerId", m."priceCoins", m."status", m."buyerId", m."createdAt",
  COALESCE(m."closedAt", m."createdAt"), m."closedAt", m."reviewedAt", m."inventoryId", m."itemId"
FROM "market_listing" AS m
ON CONFLICT ("id") DO NOTHING;

-- 2. Trading-card market.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
  "closedAt", "gameId", "cardIndex", "foil"
)
SELECT
  c."id", 'CARD', c."sellerId", c."priceCoins", c."status", c."buyerId", c."createdAt",
  COALESCE(c."closedAt", c."createdAt"), c."closedAt", c."gameId", c."cardIndex", c."foil"
FROM "card_listing" AS c
ON CONFLICT ("id") DO NOTHING;

-- 3. Storefront products: price → priceCoins, creatorId → sellerId, active → status.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "createdAt", "updatedAt",
  "title", "description", "deliverable", "salesCount"
)
SELECT
  p."id", 'PRODUCT', p."creatorId", p."price",
  CASE WHEN p."active" THEN 'ACTIVE'::"ListingStatus" ELSE 'CANCELED'::"ListingStatus" END,
  p."createdAt", p."updatedAt", p."title", p."description", p."deliverable", p."salesCount"
FROM "storefront_product" AS p
ON CONFLICT ("id") DO NOTHING;

-- 4. Storefront purchases (after the products they point at).
INSERT INTO "listing_purchase" ("id", "listingId", "buyerId", "pricePaid", "createdAt")
SELECT s."id", s."productId", s."buyerId", s."pricePaid", s."createdAt"
FROM "storefront_purchase" AS s
ON CONFLICT ("id") DO NOTHING;

-- ─── The other direction, attached after the copy so it does not echo it ────
CREATE TRIGGER "listing_mirror" AFTER INSERT OR UPDATE OR DELETE ON "listing"
FOR EACH ROW EXECUTE FUNCTION "listing_mirror_to_legacy"();

CREATE TRIGGER "listing_mirror" AFTER INSERT OR DELETE ON "listing_purchase"
FOR EACH ROW EXECUTE FUNCTION "listing_purchase_mirror_to_legacy"();
