-- CreateEnum
CREATE TYPE "CardTradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

-- CreateTable
CREATE TABLE "card_trade" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" "CardTradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_trade_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_trade_not_self" CHECK ("fromId" <> "toId")
);

-- CreateTable
CREATE TABLE "card_trade_item" (
    "tradeId" TEXT NOT NULL,
    "fromGives" BOOLEAN NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "cardIndex" SMALLINT NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "qty" SMALLINT NOT NULL,

    CONSTRAINT "card_trade_item_pkey" PRIMARY KEY ("tradeId","fromGives","gameId","cardIndex","foil"),
    CONSTRAINT "card_trade_item_qty_positive" CHECK ("qty" > 0)
);

-- CreateIndex
CREATE INDEX "card_trade_toId_status_idx" ON "card_trade"("toId", "status");

-- CreateIndex
CREATE INDEX "card_trade_fromId_status_idx" ON "card_trade"("fromId", "status");

-- AddForeignKey
ALTER TABLE "card_trade" ADD CONSTRAINT "card_trade_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_trade" ADD CONSTRAINT "card_trade_toId_fkey" FOREIGN KEY ("toId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_trade_item" ADD CONSTRAINT "card_trade_item_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "card_trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
