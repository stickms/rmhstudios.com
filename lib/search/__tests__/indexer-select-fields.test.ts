/**
 * The embedding sweep's `select` blocks must name fields that exist. `news` selected `summary` on NewsArticle (which has
 * `description`), so with EMBEDDING_API_KEY set the sweep threw at the news kind every run; the nested `select` is not
 * checked by tsc through the `...page` spread. Contract: every key in each findMany `select` of the indexer is a field of
 * the model it queries (lib/search/indexer.server.ts <-> prisma/schema.prisma).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const indexer = readFileSync(join(ROOT, 'lib/search/indexer.server.ts'), 'utf8');
const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');

/** model name (lowercased) -> the field names declared in its block. */
function modelFields(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields = new Set<string>();
    for (const line of m[2]!.split('\n')) {
      const f = line.trim().match(/^([A-Za-z_]\w*)\s+\S/);
      if (f && !line.trim().startsWith('@@') && !line.trim().startsWith('//')) fields.add(f[1]!);
    }
    out.set(m[1]!.toLowerCase(), fields);
  }
  return out;
}

describe('search indexer select fields', () => {
  const models = modelFields();
  const blocks = [...indexer.matchAll(/prisma\.(\w+)\.findMany\(\{[\s\S]*?select: \{([^}]*)\}/g)];

  it('finds the five row-backed per-kind selects (games and apps are a static catalog)', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  it.each(blocks.map((b) => [b[1]!, b[2]!] as const))(
    '%s selects only fields that exist',
    (delegate, sel) => {
      const fields = models.get(delegate.toLowerCase());
      expect(fields, `no model for prisma.${delegate}`).toBeDefined();
      const keys = [...sel.matchAll(/(\w+):\s*true/g)].map((k) => k[1]!);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) expect(fields!.has(k), `${delegate}.${k} is not a field`).toBe(true);
    },
  );
});
