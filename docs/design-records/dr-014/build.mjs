import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { figure } from './figures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = '/home/user/rmhstudios.com';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** {{code:relative/path|12-40|Optional title}} — a real, line-numbered excerpt. */
function codeToken(spec) {
  const [path, range, title] = spec.split('|');
  const src = readFileSync(join(REPO, path.trim()), 'utf8').split('\n');
  let from = 1;
  let to = src.length;
  if (range && range.trim()) {
    const m = range.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (m) {
      from = Number(m[1]);
      to = m[2] ? Number(m[2]) : from;
    }
  }
  const lines = src.slice(from - 1, to);
  const width = String(to).length;
  const body = lines
    .map((l, i) => `<span class="ln">${String(from + i).padStart(width, ' ')}</span>${esc(l)}`)
    .join('\n');
  const head = title
    ? `<div class="lst-title" data-toc="skip">${title} <span style="font-weight:400;letter-spacing:0;text-transform:none;color:#6f6f6f">— ${path}:${from}${to !== from ? `–${to}` : ''}</span></div>`
    : '';
  return `${head}<pre class="lst">${body}</pre>`;
}

/** The real RMH mark, path lifted straight out of the shipped component. */
function markSvg(stroke = 0.8) {
  const src = readFileSync(join(REPO, 'components/radial/RmhLogo.tsx'), 'utf8');
  const d = src.match(/d="(m 98[\s\S]*?)"/)[1];
  const tf = src.match(/transform="(matrix\([^"]*\))"/)[1];
  return `<svg viewBox="0 0 150 150" role="img" aria-hidden="true"><g transform="translate(-36.444729,-71.275589)"><path d="${d}" transform="${tf}" fill="none" stroke="#101010" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

function resolve(html) {
  return html
    .replace(/\{\{mark(?::([\d.]+))?\}\}/g, (_, w) => markSvg(w ? Number(w) : 0.8))
    .replace(/\{\{fig:([a-zA-Z0-9_]+)\}\}/g, (_, n) => figure(n))
    .replace(/\{\{code:([^}]+)\}\}/g, (_, spec) => codeToken(spec))
    .replace(/\{\{stat:([a-z]+)\}\}/g, (_, k) => String(STATS[k] ?? ''));
}

const STATS = {
  hubLines: readFileSync(join(REPO, 'components/radial/RadialHub.tsx'), 'utf8').split('\n').length,
  cssLines: readFileSync(join(REPO, 'components/radial/radial.css'), 'utf8').split('\n').length,
};

const parts = [
  'front.html',
  'part1.html',
  'part2.html',
  'part3.html',
  'part4.html',
  'part5.html',
  'part6.html',
  'part7.html',
  'part8.html',
  'appendix.html',
];

const frontRaw = readFileSync(join(HERE, 'src', 'front.html'), 'utf8');
const bodyRaw = parts
  .slice(1)
  .map((f) => {
    const p = join(HERE, 'src', f);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  })
  .join('\n');

const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Redesigning the Home Button — RMH Studios</title>
<style>${readFileSync(join(HERE, 'book.css'), 'utf8')}</style>
</head><body>
<div id="book"></div>
<div id="front" style="display:none">${resolve(frontRaw)}</div>
<div id="flow" style="display:none">${resolve(bodyRaw)}</div>
<script>${readFileSync(join(HERE, 'paginate.js'), 'utf8')}</script>
</body></html>`;

const htmlPath = join(HERE, 'book.html');
writeFileSync(htmlPath, doc);

const out = process.argv[2] || join(HERE, 'out.pdf');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
// Reveal the flow containers so measurement happens against real layout.
await page.evaluate(() => {
  document.getElementById('front').style.display = '';
  document.getElementById('flow').style.display = '';
  document.getElementById('front').style.position = 'absolute';
  document.getElementById('flow').style.position = 'absolute';
  document.getElementById('front').style.visibility = 'hidden';
  document.getElementById('flow').style.visibility = 'hidden';
});
const stats = await page.evaluate(() => window.RMHBook.run());
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: out,
  width: '210mm',
  height: '297mm',
  printBackground: true,
  preferCSSPageSize: false,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});
await browser.close();

if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
}
console.log(JSON.stringify(stats, null, 2));
console.log('wrote ' + out);
