import { test, expect } from 'vitest';
import { renderPassageZh, renderPassageEn, buildHtml } from './typeset';
import { SAMPLE_CHAPTER } from '../manuscript/sample';

test('verse zh renders one element per line', () => {
  const verse = SAMPLE_CHAPTER.passages.find(p => p.type === 'verse')!;
  const html = renderPassageZh(verse);
  expect((html.match(/class="verse-line"/g) || []).length).toBe(2);
});

test('prose en renders its english text and a red comment marker', () => {
  const prose = SAMPLE_CHAPTER.passages.find(p => p.type === 'prose')!;
  const html = renderPassageEn(prose);
  expect(html).toContain('age of the great waste');
  expect(html).toContain('red-note');
});

test('buildHtml embeds css and both writing modes', () => {
  const html = buildHtml({
    title: { zh: '天命輓歌', en: 'Elegy of the Mandate' },
    leaves: [{ versoHtml: '<p>甲</p>', rectoHtml: '<p>A</p>', juan: '卷一', pageZh: '一', pageEn: '1' }],
  });
  expect(html).toContain('vertical-rl');
  expect(html).toContain('<style>');
  expect(html).toContain('甲');
  expect(html).toContain('class="leaf verso"');
});
