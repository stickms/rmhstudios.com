import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Person-shaped strings that only the synthetic hostile fixtures may contain. Folded into the shared NEEDLES in Task 2. */
export const ADMIT_HOSTILE_NEEDLES = [
  'drsmith42',
  'jane_doe_md',
  'https://cdn.example/avatars/jd.png',
  'user-hostile-9931',
] as const;

const DIR = join(__dirname, '__fixtures__');
const files = readdirSync(DIR);
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
const HOSTILE = new Set(['recent-updates-hostile.json', 'profile-flag-hostile.json']);
const REQUIRED = [
  'robots.json',
  'recent-updates-all.json',
  'recent-updates-harvard.json',
  'profile-flag-true.json',
  'profile-flag-null.json',
  'profile-flag-missing.json',
  'school-stats-global.json',
  'school-stats-in-state.json',
  'school-stats-out-of-state.json',
  'interview-schools-0.json',
  'interview-schools-200.json',
  'interview-overview-harvard.json',
  'interview-questions-harvard.json',
  'interview-feedback-harvard.json',
  'recent-updates-hostile.json',
  'profile-flag-hostile.json',
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('admit fixtures', () => {
  it('required fixtures exist', () => {
    for (const f of REQUIRED) expect(files, f).toContain(f);
  });

  it.each(files)('%s parses as JSON', (f) => {
    expect(() => JSON.parse(read(f))).not.toThrow();
  });

  it.each(files.filter((f) => !HOSTILE.has(f)))('%s contains no uuid-shaped string except cycle_update_id', (f) => {
    // cycle_update_id values are opaque update ids (spec); P3 also exempts anonymous question/stats ids.
    const stripped = read(f)
      .replace(/"cycle_update_id":\s*"[^"]*"/g, '"cycle_update_id":"x"')
      .replace(/"id":\s*"[^"]*"/g, '"id":"x"');
    expect(stripped).not.toMatch(UUID);
  });

  it('only the hostile fixtures contain the needles', () => {
    for (const f of files) {
      const body = read(f);
      for (const n of ADMIT_HOSTILE_NEEDLES) {
        if (HOSTILE.has(f)) continue;
        expect(body, `${f} leaks ${n}`).not.toContain(n);
      }
    }
    expect(read('recent-updates-hostile.json')).toContain('drsmith42');
    expect(read('recent-updates-hostile.json')).toContain('user-hostile-9931');
  });

  it('non-hostile fixtures carry no person fields', () => {
    for (const f of files.filter((x) => !HOSTILE.has(x))) {
      expect(read(f), f).not.toMatch(/display_name|profile_image|avatar|username/i);
    }
  });
});
