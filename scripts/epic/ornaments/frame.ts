const INK = '#1a1410';

/** 文武边栏: a thick outer rule and a thin inner rule, inset in a w×h box. */
export function blockFrame(w: number, h: number): string {
  const m = Math.round(Math.min(w, h) * 0.035); // outer margin
  const gap = 6; // space between the two rules
  const ow = w - 2 * m;
  const oh = h - 2 * m;
  return `<g fill="none" stroke="${INK}">
    <rect x="${m}" y="${m}" width="${ow}" height="${oh}" stroke-width="3.2"/>
    <rect x="${m + gap}" y="${m + gap}" width="${ow - 2 * gap}" height="${oh - 2 * gap}" stroke-width="1"/>
  </g>`;
}

/** 界行: cols-1 evenly spaced vertical rules across the text box. */
export function columnRules(x: number, y: number, w: number, h: number, cols: number): string {
  const lines: string[] = [];
  for (let i = 1; i < cols; i++) {
    const cx = x + (w * i) / cols;
    lines.push(`<line x1="${cx.toFixed(1)}" y1="${y}" x2="${cx.toFixed(1)}" y2="${y + h}" stroke="${INK}" stroke-width="0.6" opacity="0.55"/>`);
  }
  return `<g>${lines.join('')}</g>`;
}
