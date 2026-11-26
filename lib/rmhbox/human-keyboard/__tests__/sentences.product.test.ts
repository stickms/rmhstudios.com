import { statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSentences, parseSentences } from '../data-loader';
import { isValidSentenceText, pickSentence, sentencePool } from '../rules';

const FILE = path.join(process.cwd(), 'data/rmhbox/human-keyboard/sentences.json');
const sentences = loadSentences();

describe('the bundled sentences', () => {
  it('has at least 200 entries and stays under 60 KB', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(200);
    expect(statSync(FILE).size).toBeLessThan(60 * 1024);
  });

  it('drops no entry when it is parsed: every one has the right shape', () => {
    const raw = JSON.parse(JSON.stringify(sentences)) as unknown[];
    expect(raw).toHaveLength(sentences.length);
    expect(parseSentences(JSON.stringify(raw))).toHaveLength(raw.length);
  });

  it('has a unique id on every entry', () => {
    const ids = sentences.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('uses lowercase letters and single spaces only, 20 to 60 characters', () => {
    for (const s of sentences) {
      expect(s.text, s.id).toMatch(/^[a-z]+( [a-z]+)*$/);
      expect(s.text.length, s.id).toBeGreaterThanOrEqual(20);
      expect(s.text.length, s.id).toBeLessThanOrEqual(60);
      expect(isValidSentenceText(s.text), s.id).toBe(true);
    }
  });

  it('has no sentence twice', () => {
    const texts = sentences.map((s) => s.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('fills in a category and a known difficulty on every entry', () => {
    for (const s of sentences) {
      expect(s.category.length, s.id).toBeGreaterThan(0);
      expect(['easy', 'medium', 'hard'], s.id).toContain(s.difficulty);
    }
  });

  it('has enough easy and medium sentences for three or four players', () => {
    expect(sentencePool(sentences, 3).every((s) => s.difficulty !== 'hard')).toBe(true);
    expect(sentencePool(sentences, 4).length).toBeGreaterThanOrEqual(100);
    expect(sentencePool(sentences, 5).length).toBe(sentences.length);
  });
});

describe('pickSentence', () => {
  it('never picks a hard sentence for three players, and skips the ones already used', () => {
    const used = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = pickSentence(sentences, 3, used);
      expect(s).not.toBeNull();
      expect(s!.difficulty).not.toBe('hard');
      expect(used.has(s!.id)).toBe(false);
      used.add(s!.id);
    }
  });

  it('answers null when there are no sentences', () => {
    expect(pickSentence([], 4, new Set())).toBeNull();
  });
});
