import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Bible, Chapter } from './manuscript/types';
import { validateChapter } from './manuscript/validate';
import { paginate } from './paginate';
import type { LeafPair } from './render/types';
import { blockFrame, columnRules } from './ornaments/frame';
import { centerStrip } from './ornaments/center-strip';
import { frontispiece, xiuxiangPlate, colophon } from './ornaments/plates';

const __dir = dirname(fileURLToPath(import.meta.url));

const W = 800, H = 1100;

export async function loadManuscript(dir: string): Promise<{ bible: Bible; chapters: Chapter[] }> {
  const bible = JSON.parse(readFileSync(join(dir, 'bible.json'), 'utf8')) as Bible;
  const files = readdirSync(dir).filter(f => /^ch\d+\.json$/.test(f)).sort();
  const chapters = files.map(f => validateChapter(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  return { bible, chapters };
}

/** Build the ornament SVG layer for one leaf (frame + rules + center strip). */
function ornamentLayer(side: 'verso' | 'recto', juan: string, title: string, pageLabel: string): string {
  const inner = side === 'verso'
    ? `${blockFrame(W, H)}${columnRules(64, 96, W - 128, H - 176, 12)}${centerStrip({ x: W / 2 - 18, y: 40, w: 36, h: H - 80, title, juan, page: pageLabel })}`
    : `${blockFrame(W, H)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ornaments" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${inner}</svg>`;
}

export function composeLeafHtml(leaf: LeafPair, title: { zh: string; en: string }) {
  return {
    verso: `${ornamentLayer('verso', leaf.juan, title.zh, leaf.pageZh)}<div class="textbox">${leaf.versoHtml}</div>`,
    recto: `${ornamentLayer('recto', leaf.juan, title.en, leaf.pageEn)}<div class="textbox">${leaf.rectoHtml}</div>`,
  };
}

export async function buildEpic(opts: { manuscriptDir: string; outPdf: string; outCover: string }): Promise<{ pages: number }> {
  const { bible, chapters } = await loadManuscript(opts.manuscriptDir);
  const title = bible.chosenTitle ?? bible.titleOptions[0];

  const leaves = await paginate(chapters);

  // Wrap each leaf with ornaments; frontispiece/colophon are standalone full-page svgs.
  const composed = leaves.map(lf => composeLeafHtml(lf, title));
  const leafSections = composed
    .map(c => `<section class="leaf verso">${c.verso}</section><section class="leaf recto">${c.recto}</section>`)
    .join('');

  const frontPlate = `<section class="leaf plate">${frontispiece({ titleZh: title.zh, titleEn: title.en, W, H })}</section>`;
  // 绣像 figure-portrait gallery of the principal characters (classic woodblock-novel front matter).
  // An EVEN number of plates keeps the front-matter page count odd (frontispiece + gallery),
  // so the first Chinese leaf lands on an even page and stays on the left of each facing spread.
  const galleryChars = bible.characters.slice(0, 2);
  const galleryPlates = galleryChars
    .map((c) => `<section class="leaf plate">${xiuxiangPlate({ nameZh: c.zh, nameEn: c.en, W, H })}</section>`)
    .join('');
  const backPlate = `<section class="leaf plate">${colophon({ lines: ['歲在丙午', '夢餘堂刊', '頒行於世'], W, H })}</section>`;

  const css = readFileSync(join(__dir, 'render', 'epic.css'), 'utf8');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title.zh}</title>
    <style>${css}.leaf.plate{padding:0}.leaf.plate svg{display:block}</style></head>
    <body>${frontPlate}${galleryPlates}${leafSections}${backPlate}</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({ path: opts.outPdf, width: `${W}px`, height: `${H}px`, printBackground: true });

    // cover = render the frontispiece alone and screenshot → jpg
    const cover = await browser.newPage({ viewport: { width: W, height: H } });
    await cover.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${frontispiece({ titleZh: title.zh, titleEn: title.en, W, H })}</body></html>`);
    const png = await cover.screenshot({ type: 'png' });
    await sharp(png).jpeg({ quality: 88 }).toFile(opts.outCover);
  } finally {
    await browser.close();
  }

  // pages = frontispiece + gallery plates + colophon + 2 per leaf
  return { pages: leaves.length * 2 + 2 + galleryChars.length };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = 'elegy-of-the-mandate';
  const root = join(__dir, '..', '..');
  buildEpic({
    manuscriptDir: join(__dir, 'manuscript'),
    outPdf: join(root, 'public', 'library', `${slug}.pdf`),
    outCover: join(root, 'public', 'library', 'covers', `${slug}.jpg`),
  }).then(r => console.log(`Built ${r.pages}-page epic → public/library/${slug}.pdf`));
}
