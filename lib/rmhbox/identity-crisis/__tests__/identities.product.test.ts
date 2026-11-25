import { statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadIdentities } from '../data-loader';
import { normalizeForMatch } from '../rules';

const FILE = path.join(process.cwd(), 'data/rmhbox/identity-crisis/identities.json');
const identities = loadIdentities();

describe('the bundled identities', () => {
  it('has at least 240 entries and stays under 60 KB', () => {
    expect(identities.length).toBeGreaterThanOrEqual(240);
    expect(statSync(FILE).size).toBeLessThan(60 * 1024);
  });

  it('has a unique id on every entry', () => {
    const ids = identities.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('keeps every name under 60 characters and every field filled in', () => {
    for (const i of identities) {
      expect(i.name.length, i.id).toBeGreaterThan(0);
      expect(i.name.length, i.id).toBeLessThan(60);
      expect(i.category.length, i.id).toBeGreaterThan(0);
      expect(['easy', 'medium', 'hard'], i.id).toContain(i.difficulty);
      for (const alias of i.aliases) expect(alias.trim().length, i.id).toBeGreaterThan(0);
    }
  });

  it('shares no alias or name between two entries', () => {
    const owner = new Map<string, string>();
    for (const i of identities) {
      for (const text of [i.name, ...i.aliases]) {
        const key = normalizeForMatch(text);
        const seen = owner.get(key);
        expect(seen === undefined || seen === i.id, `"${key}" is used by ${seen} and ${i.id}`).toBe(true);
        owner.set(key, i.id);
      }
    }
  });

  it('has enough easy identities, in enough categories, to deal ten players the first game', () => {
    const easy = identities.filter((i) => i.difficulty === 'easy');
    expect(easy.length).toBeGreaterThanOrEqual(60);
    expect(new Set(easy.map((i) => i.category)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(identities.map((i) => i.category)).size).toBeGreaterThanOrEqual(10);
  });

  it('has medium and hard entries for later games', () => {
    expect(identities.filter((i) => i.difficulty === 'medium').length).toBeGreaterThanOrEqual(20);
    expect(identities.filter((i) => i.difficulty === 'hard').length).toBeGreaterThanOrEqual(10);
  });
});
