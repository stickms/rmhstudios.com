import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '__fixtures__');
const files = readdirSync(DIR);
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');

describe('cycletrack fixtures', () => {
  it('has fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is non-empty and carries no session secrets', (f) => {
    const body = read(f);
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/csrf-token/i);
    expect(body).not.toMatch(/_csrf_token/i);
    expect(body).not.toMatch(/set-cookie/i);
  });

  it('yale.html is a school page with daily milestone tables', () => {
    const body = read('yale.html');
    expect(body).toContain('daily milestone observations, 2026-2027');
    expect(body).toContain('Hourly update generated');
  });

  it('sitemap.xml lists schools with the raw spellings', () => {
    const body = read('sitemap.xml');
    expect(body).toContain('explorer/school/Texas%20A&amp;M');
    expect(body).toContain('explorer/school/Massachussetts');
  });
});
