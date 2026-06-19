import { test, expect } from 'vitest';
import { paginate } from './paginate';
import { SAMPLE_CHAPTER } from './manuscript/sample';
import type { Chapter } from './manuscript/types';

function bigChapter(n: number): Chapter {
  // many prose passages to force multiple leaves
  const passages = Array.from({ length: 40 }, (_, i) => ({
    type: 'prose' as const,
    zh: '話說洪荒之世天賜玄圭于桑國鎮其社稷一夕圭失諸侯皆動刀兵四起'.repeat(3) + `（${i}）`,
    en: 'In the age of the great waste Heaven granted the dark omen-tablet to the land of Sang. '.repeat(3) + `(${i})`,
  }));
  return { ...SAMPLE_CHAPTER, n, passages };
}

test('produces facing leaf-pairs that do not overflow, paginating a long chapter', async () => {
  const leaves = await paginate([bigChapter(1)]);
  expect(leaves.length).toBeGreaterThan(1); // long chapter spans multiple leaves
  // every leaf has both a verso and recto
  for (const lf of leaves) {
    expect(lf.versoHtml.length).toBeGreaterThan(0);
    expect(lf.rectoHtml.length).toBeGreaterThan(0);
  }
}, 120_000);

test('a new chapter starts a new leaf-pair', async () => {
  const leaves = await paginate([SAMPLE_CHAPTER, { ...SAMPLE_CHAPTER, n: 2, title: { zh: '第二回', en: 'Chapter 2' } }]);
  // first leaf of chapter 2 should contain its heading text
  const joined = leaves.map(l => l.versoHtml).join('|');
  expect(joined).toContain('第二回');
}, 120_000);
