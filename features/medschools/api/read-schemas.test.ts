import { describe, expect, it } from 'vitest';
import { listSchoolsQuery, liveQuery } from './read-schemas';

describe('the state filter on the public reads (owner 2026-11-24: several at once)', () => {
  it('takes one or several known codes, comma separated', () => {
    for (const schema of [listSchoolsQuery, liveQuery]) {
      expect(schema.safeParse({ state: 'NC' }).success).toBe(true);
      expect(schema.safeParse({ state: 'CA,NY,PR' }).success).toBe(true);
    }
  });
  it('refuses an unknown code, lower case, a malformed list and more than ten', () => {
    for (const schema of [listSchoolsQuery, liveQuery]) {
      for (const bad of ['ZZ', 'NC,ZZ', 'nc', 'NC,', 'NC;TX', 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI'])
        expect(schema.safeParse({ state: bad }).success, bad).toBe(false);
    }
  });
});
