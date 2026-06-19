import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEpic } from './build-epic';
import { SAMPLE_CHAPTER } from './manuscript/sample';

test('buildEpic produces a non-empty PDF and a cover image', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'epic-'));
  mkdirSync(join(dir, 'manuscript'), { recursive: true });
  writeFileSync(join(dir, 'manuscript', 'bible.json'), JSON.stringify({
    titleOptions: [{ zh: '天命輓歌', en: 'Elegy of the Mandate' }],
    chosenTitle: { zh: '天命輓歌', en: 'Elegy of the Mandate' },
    synopsis: 's', characters: [], outline: [],
  }));
  writeFileSync(join(dir, 'manuscript', 'ch01.json'), JSON.stringify(SAMPLE_CHAPTER));

  const outPdf = join(dir, 'out.pdf');
  const outCover = join(dir, 'cover.jpg');
  const res = await buildEpic({ manuscriptDir: join(dir, 'manuscript'), outPdf, outCover });

  expect(res.pages).toBeGreaterThanOrEqual(2);
  expect(existsSync(outPdf)).toBe(true);
  expect(statSync(outPdf).size).toBeGreaterThan(1000);
  expect(existsSync(outCover)).toBe(true);
}, 180_000);
