import { describe, expect, it } from 'vitest';
import { LIST_IMPORT_LIMITS } from '../../engine/import';
import { resolveListName, validateListImport } from './list-validate';
import type { AliasIndex, ImportSchool } from './validate';

const s = (slug: string, name: string, shortName: string, degree: 'MD' | 'DO' = 'MD', state = 'CA'): ImportSchool => ({
  slug,
  name,
  shortName,
  state,
  interviewFormat: null,
  degree,
});
const DIR: ImportSchool[] = [
  s('harvard', 'Harvard Medical School', 'Harvard', 'MD', 'MA'),
  s('ucsf', 'University of California, San Francisco School of Medicine', 'UCSF'),
  s('ucla', 'David Geffen School of Medicine at UCLA', 'UCLA'),
  s('usc', 'Keck School of Medicine of USC', 'Keck'),
  s('touro-ca', 'Touro University California College of Osteopathic Medicine', 'Touro California', 'DO'),
  s('touro-ny', 'Touro College of Osteopathic Medicine, Harlem', 'Touro New York', 'DO', 'NY'),
];
const ALIASES: AliasIndex = new Map([['keck school of medicine of the university of southern california', ['usc']]]);
const run = (text: string, schools: unknown[], aliases: AliasIndex = ALIASES) =>
  validateListImport({ schools }, { text, dir: DIR, aliases });

describe('resolveListName', () => {
  it('resolves a full name, a short name, initials and an alias to one school', () => {
    expect(resolveListName('Harvard Medical School', DIR, ALIASES)?.slug).toBe('harvard');
    expect(resolveListName('Harvard', DIR, ALIASES)?.slug).toBe('harvard');
    expect(resolveListName('UCSF', DIR, ALIASES)?.slug).toBe('ucsf');
    expect(resolveListName('Keck School of Medicine of the University of Southern California', DIR, ALIASES)?.slug).toBe(
      'usc',
    );
    expect(resolveListName('geffen', DIR, ALIASES)?.slug).toBe('ucla');
  });

  it('two schools for one name is ambiguous, and nothing is nothing', () => {
    expect(resolveListName('Touro', DIR, ALIASES)).toBeNull();
    expect(resolveListName('University of California', DIR, ALIASES)?.slug).toBe('ucsf');
    expect(resolveListName('School of Medicine', DIR, ALIASES)).toBeNull();
    expect(resolveListName('Hogwarts School of Medicine', DIR, ALIASES)).toBeNull();
  });
});

describe('validateListImport', () => {
  it('keeps a name only when the text holds it; an invented school is dropped and counted', () => {
    const r = run('My list:\nHarvard\nUCSF', [{ name: 'Harvard' }, { name: 'UCSF' }, { name: 'Stanford University' }]);
    expect(r.rows.map((x) => x.school?.slug)).toEqual(['harvard', 'ucsf']);
    expect(r.dropped).toBe(1);
    expect(JSON.stringify(r)).not.toContain('Stanford');
  });

  it('the text is matched however it is cased or spaced, and the name is shown as written', () => {
    const r = run('harvard   MEDICAL school', [{ name: 'Harvard Medical School' }]);
    expect(r.rows[0]).toMatchObject({ schoolName: 'Harvard Medical School', school: { slug: 'harvard' } });
  });

  it('an ambiguous or unknown name in the text is "Unrecognised school" (school null), for the picker', () => {
    const r = run('Touro\nHogwarts School of Medicine', [{ name: 'Touro' }, { name: 'Hogwarts School of Medicine' }]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.school === null)).toBe(true);
    expect(r.rows.map((x) => x.schoolName)).toEqual(['Touro', 'Hogwarts School of Medicine']);
    expect(new Set(r.rows.map((x) => x.key)).size).toBe(2);
    expect(r.dropped).toBe(0);
  });

  it('never reads a slug or an id from the model', () => {
    const r = run('Hogwarts', [{ name: 'Hogwarts', slug: 'harvard', id: 'harvard', school: 'harvard' }]);
    expect(r.rows[0]?.school).toBeNull();
  });

  it('a malformed entry or envelope costs that entry, or the import, and nothing else', () => {
    expect(validateListImport({ rows: [] }, { text: 'Harvard', dir: DIR, aliases: ALIASES }).rows).toEqual([]);
    expect(validateListImport('Harvard', { text: 'Harvard', dir: DIR, aliases: ALIASES }).rows).toEqual([]);
    const r = run('Harvard\nUCSF', [{ name: 7 }, null, { name: 'H' }, { name: 'MD' }, { name: 'UCSF' }]);
    expect(r.rows.map((x) => x.school?.slug)).toEqual(['ucsf']);
    expect(r.dropped).toBe(4);
  });

  it('a school and program named twice is one row; the file order stays', () => {
    const r = run('UCSF\nHarvard\nHarvard Medical School', [
      { name: 'UCSF' },
      { name: 'Harvard' },
      { name: 'Harvard Medical School' },
    ]);
    expect(r.rows.map((x) => x.school?.slug)).toEqual(['ucsf', 'harvard']);
  });

  it('a program is PHD only when the line holding the name says so, REG for a plain MD or DO, else either', () => {
    const text = 'Harvard | MD-PhD\nUCSF | MD\nKeck\nUCLA | md-phd maybe';
    const r = run(text, [
      { name: 'Harvard', program: 'MD-PhD' },
      { name: 'UCSF', program: 'MD' },
      { name: 'Keck', program: 'MD-PhD' }, // the model says so; the text does not
      { name: 'UCLA', program: 'MD' }, // the line only writes MD-PhD
    ]);
    expect(r.rows.map((x) => [x.school?.slug, x.program])).toEqual([
      ['harvard', 'PHD'],
      ['ucsf', 'REG'],
      ['usc', 'ANY'],
      ['ucla', 'ANY'],
    ]);
  });

  it('MSTP reads as PHD; a lower-case "do" in a sentence is not a program', () => {
    const r = run('Harvard MSTP\nI do like Touro New York', [
      { name: 'Harvard', program: 'MSTP' },
      { name: 'Touro New York', program: 'DO' },
    ]);
    expect(r.rows.map((x) => [x.school?.slug, x.program])).toEqual([
      ['harvard', 'PHD'],
      ['touro-ny', 'ANY'],
    ]);
  });

  it(`caps the preview at ${LIST_IMPORT_LIMITS.schools} schools and says so`, () => {
    const dir = Array.from({ length: 210 }, (_, i) => s(`school-${i}`, `Zeta ${i} Medical College`, `Zeta${i}`));
    const text = dir.map((d) => d.name).join('\n');
    const r = validateListImport({ schools: dir.map((d) => ({ name: d.name })) }, { text, dir, aliases: new Map() });
    expect(r.rows).toHaveLength(LIST_IMPORT_LIMITS.schools);
    expect(r.capped).toBe(true);
    const under = validateListImport(
      { schools: dir.slice(0, 5).map((d) => ({ name: d.name })) },
      { text, dir, aliases: new Map() },
    );
    expect(under.capped).toBe(false);
  });

  it('the model may not name more than twice a list (the envelope fails)', () => {
    const many = Array.from({ length: LIST_IMPORT_LIMITS.modelSchools + 1 }, () => ({ name: 'Harvard' }));
    expect(run('Harvard', many).rows).toEqual([]);
  });
});
