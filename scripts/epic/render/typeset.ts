import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Passage } from '../manuscript/types';
import type { LeafPair } from './types';

const __dir = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dir, 'epic.css'), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteMarkers(p: Extract<Passage, { redComment?: any }>): string {
  if (!('redComment' in p) || !p.redComment?.length) return '';
  return p.redComment.map(n => ` <span class="red-note">${esc(n.zh)}</span>`).join('');
}
function noteMarkersEn(p: Extract<Passage, { redComment?: any }>): string {
  if (!('redComment' in p) || !p.redComment?.length) return '';
  return p.redComment.map(n => ` <span class="red-note">${esc(n.en)}</span>`).join('');
}

export function renderPassageZh(p: Passage): string {
  switch (p.type) {
    case 'heading': return `<div class="heading">${esc(p.zh)}</div>`;
    case 'couplet': return `<div class="couplet">${p.zh.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}</div>`;
    case 'prose': return `<p class="prose">${esc(p.zh)}${noteMarkers(p)}</p>`;
    case 'verse': return `<div class="verse">${p.zh.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}${noteMarkers(p)}</div>`;
  }
}

export function renderPassageEn(p: Passage): string {
  switch (p.type) {
    case 'heading': return `<div class="heading">${esc(p.en)}</div>`;
    case 'couplet': return `<div class="couplet">${p.en.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}</div>`;
    case 'prose': return `<p class="prose">${esc(p.en)}${noteMarkersEn(p)}</p>`;
    case 'verse': return `<div class="verse">${p.en.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}${noteMarkersEn(p)}</div>`;
  }
}

export function buildHtml(opts: { title: { zh: string; en: string }; leaves: LeafPair[] }): string {
  const body = opts.leaves
    .map(
      (lf) => `
    <section class="leaf verso"><div class="textbox">${lf.versoHtml}</div></section>
    <section class="leaf recto"><div class="textbox">${lf.rectoHtml}</div></section>`,
    )
    .join('');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${esc(opts.title.zh)}</title><style>${CSS}</style></head>
<body>${body}</body></html>`;
}
