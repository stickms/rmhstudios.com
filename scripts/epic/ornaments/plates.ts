import { blockFrame } from './frame';
import { fretBorder, cloudMotif } from './borders';
import { seal } from './seal';

const INK = '#1a1410';
const PAPER = '#efe7d4';

function page(W: number, H: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    ${inner}
  </svg>`;
}

function vtitle(cx: number, top: number, text: string, size: number): string {
  return [...text]
    .map((ch, i) => `<text x="${cx}" y="${top + (i + 0.85) * size}" font-family="Kaiti SC, STKaiti, serif" font-weight="700" font-size="${size}" fill="${INK}" text-anchor="middle">${ch}</text>`)
    .join('');
}

export function frontispiece(opts: { titleZh: string; titleEn: string; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const tSize = 96;
  return page(W, H, `
    ${blockFrame(W, H)}
    ${fretBorder(W * 0.1, H * 0.08, W * 0.8, H * 0.84, 12)}
    ${cloudMotif(W * 0.2, H * 0.16, 1.6)}
    ${cloudMotif(W * 0.8, H * 0.16, -1.6)}
    ${vtitle(W / 2, H * 0.2, opts.titleZh, tSize)}
    <text x="${W / 2}" y="${H * 0.82}" font-family="Baskerville, Georgia, serif" font-style="italic" font-size="34" fill="${INK}" text-anchor="middle">${opts.titleEn}</text>
    ${seal({ x: W / 2 - 55, y: H * 0.86, size: 110, text: opts.titleZh.slice(0, 4), style: 'intaglio' })}
  `);
}

export function xiuxiangPlate(opts: { nameZh: string; nameEn: string; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const cx = W / 2;
  // a minimal robed standing figure built from vector strokes
  // a robed standing figure (绣像) with hands clasped (拱手), built from flowing strokes
  const s = 1.6;
  const u = (n: number) => (n * s).toFixed(1);
  const figure = `<g fill="none" stroke="${INK}" stroke-width="${2.4 * s}" stroke-linejoin="round" stroke-linecap="round" transform="translate(${cx} ${H * 0.12})">
    <path d="M ${-u(12)} ${u(2)} q ${u(12)} ${-u(18)} ${u(24)} 0"/>
    <ellipse cx="0" cy="${u(28)}" rx="${u(26)}" ry="${u(30)}" fill="${PAPER}"/>
    <path d="M ${-u(20)} ${u(56)} Q 0 ${u(70)} ${u(20)} ${u(56)}"/>
    <path d="M ${-u(22)} ${u(58)} C ${-u(70)} ${u(72)} ${-u(96)} ${u(150)} ${-u(86)} ${u(300)} C ${-u(80)} ${u(360)} ${-u(70)} ${u(390)} ${-u(60)} ${u(404)} Q 0 ${u(420)} ${u(60)} ${u(404)} C ${u(70)} ${u(390)} ${u(80)} ${u(360)} ${u(86)} ${u(300)} C ${u(96)} ${u(150)} ${u(70)} ${u(72)} ${u(22)} ${u(58)} Z" fill="${PAPER}"/>
    <path d="M ${-u(58)} ${u(120)} C ${-u(96)} ${u(150)} ${-u(96)} ${u(210)} ${-u(46)} ${u(214)} L ${u(46)} ${u(214)} C ${u(96)} ${u(210)} ${u(96)} ${u(150)} ${u(58)} ${u(120)}"/>
    <path d="M 0 ${u(72)} L 0 ${u(214)}"/>
    <path d="M ${-u(40)} ${u(214)} Q 0 ${u(228)} ${u(40)} ${u(214)}"/>
    <path d="M ${-u(30)} ${u(240)} q ${-u(6)} ${u(90)} ${-u(2)} ${u(150)}"/>
    <path d="M ${u(30)} ${u(240)} q ${u(6)} ${u(90)} ${u(2)} ${u(150)}"/>
  </g>`;
  return page(W, H, `
    ${blockFrame(W, H)}
    ${fretBorder(W * 0.08, H * 0.06, W * 0.84, H * 0.88, 11)}
    ${figure}
    <rect x="${cx - 70}" y="${H * 0.86}" width="140" height="64" fill="none" stroke="${INK}" stroke-width="2"/>
    ${vtitle(cx, H * 0.865, opts.nameZh, 36)}
    <text x="${cx}" y="${H * 0.955}" font-family="Baskerville, Georgia, serif" font-style="italic" font-size="22" fill="${INK}" text-anchor="middle">${opts.nameEn}</text>
  `);
}

export function colophon(opts: { lines: string[]; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const cx = W / 2;
  const colGap = 56;
  const startX = cx + ((opts.lines.length - 1) * colGap) / 2; // right→left columns
  const cols = opts.lines
    .map((line, i) => vtitle(startX - i * colGap, H * 0.3, line, 40))
    .join('');
  return page(W, H, `
    ${blockFrame(W, H)}
    <rect x="${W * 0.3}" y="${H * 0.22}" width="${W * 0.4}" height="${H * 0.5}" fill="none" stroke="${INK}" stroke-width="2.5"/>
    ${cols}
    ${seal({ x: cx - 50, y: H * 0.74, size: 100, text: '頒行', style: 'intaglio' })}
  `);
}
