import { describe, expect, it } from 'vitest';
import { findBreakingChanges } from '../../.github/scripts/check-migrations-additive.mjs';

describe('additive migration gate', () => {
  it('allows additive changes', () => {
    expect(
      findBreakingChanges(`
        CREATE TABLE "Flag" ("id" TEXT NOT NULL, CONSTRAINT "Flag_pkey" PRIMARY KEY ("id"));
        ALTER TABLE "User" ADD COLUMN "bio" TEXT;
        ALTER TABLE "User" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX "User_bio_idx" ON "User"("bio");
        ALTER TYPE "Role" ADD VALUE 'mod';
        DROP INDEX "old_idx";
      `),
    ).toEqual([]);
  });
  it.each([
    ['DROP TABLE "Old";', 'DROP TABLE'],
    ['ALTER TABLE "User" DROP COLUMN "bio";', 'DROP COLUMN'],
    ['ALTER TABLE "User" RENAME COLUMN "a" TO "b";', 'RENAME'],
    ['ALTER TABLE "User" RENAME TO "Person";', 'RENAME'],
    ['ALTER TABLE "User" ALTER COLUMN "a" SET NOT NULL;', 'SET NOT NULL'],
    ['ALTER TABLE "User" ALTER COLUMN "a" DROP DEFAULT;', 'DROP DEFAULT'],
    ['ALTER TABLE "User" ALTER COLUMN "a" TYPE BIGINT;', 'column type'],
    ['ALTER TABLE "User" ADD COLUMN "a" TEXT NOT NULL;', 'NOT NULL column'],
    ['DROP TYPE "Role";', 'DROP TYPE'],
  ])('flags %s', (sql, expected) => {
    expect(findBreakingChanges(sql).join()).toContain(expected);
  });
  it('ignores keywords inside comments and string literals', () => {
    expect(
      findBreakingChanges(`-- DROP TABLE x\nINSERT INTO "T"("n") VALUES ('drop column y');`),
    ).toEqual([]);
  });
  it('honours an explained opt-out, but not a bare one', () => {
    const sql = 'ALTER TABLE "User" DROP COLUMN "bio";';
    expect(findBreakingChanges(`-- rmh:contract-ok bio unused since #900\n${sql}`)).toEqual([]);
    expect(findBreakingChanges(`-- rmh:contract-ok\n${sql}`)).not.toEqual([]);
  });
});
