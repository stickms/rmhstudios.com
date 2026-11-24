#!/usr/bin/env node
/**
 * Renders the RMH Med Schools painterly wash to two static WebP tiles (light and dark).
 *
 *   node scripts/medschools/render-wash.mjs
 *
 * Why a script and not CSS: the owner-approved mockup paints the wash with SVG filters (feTurbulence, feDisplacementMap,
 * feGaussianBlur) over a document-sized layer. In the page that re-rasterises and the app tier forbids it, so the filter
 * runs ONCE here, in headless Chromium, and the page only ever shows the result: a vertically tileable image with an
 * alpha channel, set as a `background-image` in `features/medschools/ui/medschools.css`. Nothing is animated, fixed or
 * scripted at run time. The tile fades to nothing at its top and bottom, so the first and last pixels of the document
 * are exactly the ground colour (iOS Safari fills its status and tab strips from the ground) and each repeat meets the
 * next one without a seam.
 *
 * The blob colours are the mockup's `wash1..4` and blob opacity for each mode (`--app-med-wash-*` in the stylesheet).
 * Output is committed: public/images/medschools/wash-{light,dark}.webp. Re-run this only to change the wash.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/images/medschools');
const W = 1280;
const H = 1600;
/** The tile is drawn at half size: the wash is low-frequency, so the browser's upscale costs nothing visible. */
const SCALE = 0.5;
const FADE = 240;

const MODES = {
  light: { colors: ['#E9D5EC', '#CFE3EF', '#F6DCC8', '#D8EAD3'], opacity: 0.85 },
  dark: { colors: ['#4A3F6B', '#3E5B73', '#5B4A5E', '#3F5A4C'], opacity: 0.55 },
};

/** The mockup's four ellipses, as shares of the tile (its page was 1180 px tall; these keep the same spread). */
const BLOBS = [
  { cx: 0.12, cy: 0.1, rx: 340, ry: 190 },
  { cx: 0.88, cy: 0.3, rx: 300, ry: 210 },
  { cx: 0.7, cy: 0.62, rx: 380, ry: 230 },
  { cx: 0.08, cy: 0.82, rx: 260, ry: 210 },
];

const html = (mode) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${W}px;height:${H}px;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 ${FADE}px,#000 ${H - FADE}px,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 ${FADE}px,#000 ${H - FADE}px,transparent 100%)">
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="paint" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7"/>
    <feDisplacementMap in="SourceGraphic" scale="60"/>
    <feGaussianBlur stdDeviation="6"/>
  </filter></defs>
  <g filter="url(#paint)" opacity="${MODES[mode].opacity}">
    ${BLOBS.map((b, i) => `<ellipse cx="${b.cx * W}" cy="${b.cy * H}" rx="${b.rx}" ry="${b.ry}" fill="${MODES[mode].colors[i]}"/>`).join('\n    ')}
  </g>
</svg></div></body></html>`;

await mkdir(OUT, { recursive: true });
// CHROMIUM_PATH points at a browser the installed Playwright did not download itself.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const mode of Object.keys(MODES)) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
    await page.setContent(html(mode));
    const png = await page.screenshot({ omitBackground: true });
    await page.close();
    const webp = await sharp(png).webp({ quality: 68, alphaQuality: 70, effort: 6 }).toBuffer();
    await writeFile(join(OUT, `wash-${mode}.webp`), webp);
    console.log(`wash-${mode}.webp ${webp.length} bytes`);
  }
} finally {
  await browser.close();
}
