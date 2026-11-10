/** Near-term committed eras (Year 1–3) get the gold spine/node; everything
 *  further out is aspirational and gets the sky-blue accent. Encodes
 *  "committed vs aspirational," which is true about the content. */
export const COMMITTED_YEARS = new Set(["Year 1", "Year 2", "Year 3"]);

/** The CSS colour token an era's spine, node and year are drawn in. */
export function eraColorFor(year: string): string {
  return COMMITTED_YEARS.has(year) ? "var(--site-warning)" : "var(--site-accent)";
}
