/**
 * One Listing model, read and written through one module.
 *
 * The cosmetics market, the card market and creator storefronts are kinds of
 * `Listing` (lib/listings/listings.server.ts). Two things keep that true:
 *
 *  1. Only `lib/listings/**` touches `listing` / `listingPurchase` through
 *     Prisma, so the escrow claim, the fee and the ledger rows for a sale are
 *     written in one place per kind.
 *  2. Nothing names the deprecated models (`MarketListing`, `CardListing`,
 *     `StorefrontProduct`, `StorefrontPurchase`) any more. They are copied into
 *     `listing` and kept in step by the expand migration's triggers until the
 *     contract release drops them; a new caller would read a table that is
 *     about to disappear.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCES = globSync('{app,components,lib,server,hooks,stores,features,scripts}/**/*.{ts,tsx,mjs}', {
  exclude: (f) => /node_modules|routeTree\.gen|generated/.test(String(f)),
});

const NEW_MODEL = /\b(?:prisma|tx|db)\s*\.\s*listing(?:Purchase)?\s*\./;
const OLD_MODELS = /\.\s*(?:marketListing|cardListing|storefrontProduct|storefrontPurchase)\b/;

describe('listings live in one module', () => {
  it('only lib/listings reads or writes the Listing tables', () => {
    const offenders = SOURCES.filter(
      (f) => !f.startsWith('lib/listings/') && NEW_MODEL.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('nothing reads or writes the deprecated listing models', () => {
    const offenders = SOURCES.filter((f) => {
      if (f === 'lib/listings/__tests__/one-module.test.ts') return false;
      return OLD_MODELS.test(readFileSync(f, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('the scan sees the listing modules (it is not vacuous)', () => {
    for (const f of [
      'lib/listings/listings.server.ts',
      'lib/listings/cosmetic.server.ts',
      'lib/listings/card.server.ts',
      'lib/listings/product.server.ts',
    ]) {
      expect(SOURCES).toContain(f);
      expect(NEW_MODEL.test(readFileSync(f, 'utf8'))).toBe(true);
    }
  });
});
