import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { fuzzyAny, fuzzyTerms, sqlRank } from '../db.server';

// The common-query people plan folds each column once per row and hands the
// folded value to the predicates; `normalized` must then NOT fold it again.
describe('normalized fuzzy predicates', () => {
  const terms = fuzzyTerms('Ada');
  it('folds the column per predicate by default', () => {
    const sql = fuzzyAny([Prisma.sql`u."name"`], terms).sql;
    expect(sql).toContain('rmh_search_norm(u."name")');
  });
  it('uses the supplied folded column as is', () => {
    const col = Prisma.raw('s.n_name');
    expect(fuzzyAny([col], terms, { normalized: true }).sql).not.toContain('rmh_search_norm');
    expect(sqlRank([col], terms, { normalized: true }).sql).not.toContain('rmh_search_norm');
    expect(sqlRank([col], terms).sql).toContain('rmh_search_norm');
  });
});
