import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
// The repo's formatter breaks calls across lines and adds trailing commas; compare without either.
const squash = (s: string) => s.replace(/\s+/g, '').replace(/,\)/g, ')').replace(/,}/g, '}');
const route = read('../../../app/routes/_site/admin/medschools.tsx');
const panel = read('./AliasMissesPanel.tsx');
const link = read('./AdminMedSchoolsLink.tsx');

describe('medschools admin page', () => {
  it('route file registers /_site/admin/medschools with the panel', () => {
    expect(squash(route)).toContain("createFileRoute('/_site/admin/medschools')");
    expect(squash(route)).toContain('component:AliasMissesPanel');
    expect(route).toContain('Med Schools aliases | Admin | RMH Studios');
  });

  it('panel strings all go through t() with the medschools namespace', () => {
    for (const src of [panel, link]) {
      expect(squash(src)).toContain("useTranslation('medschools')");
      // No JSX text literal: prose between a tag and the next tag.
      const literals = [...src.matchAll(/<\/?[A-Za-z][^<>]*[\w"'}/]>([^<>{}()=?:;]*[A-Za-z][^<>{}()=?:;]*)</g)].map(
        (m) => (m[1] ?? '').trim(),
      );
      expect(literals.filter(Boolean)).toEqual([]);
    }
  });

  it('shows a message for each 409 code', () => {
    for (const code of ['CONFLICT_RETRY', 'ALREADY_MAPPED', 'KEY_MAPPED_ELSEWHERE', 'SCHOOL_ALREADY_HAS_KEY']) {
      expect(squash(panel)).toContain(`'${code}'`);
    }
  });

  it('calls the API through contracts, not raw fetch', () => {
    expect(panel).not.toMatch(/\bfetch\(/);
    expect(squash(panel)).toContain('api(mapAliasMissApi');
  });
});
