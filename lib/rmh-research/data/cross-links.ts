/**
 * Citations that cross divisions: paper id → extra archive paper ids it cites.
 * Kept apart from the division files so each division could be written alone.
 * Every id must resolve, and a paper never cites one from a later year
 * (`__tests__/catalog.test.ts`).
 */
export const CROSS_LINKS: Readonly<Record<string, readonly string[]>> = {};
