const INK = '#1a1410';

function vlabel(cx: number, top: number, text: string, size: number): string {
  // vertical run of characters, top→down — each char in its own <text> for precise placement.
  return [...text]
    .map((ch, i) =>
      `<text x="${cx}" y="${top + (i + 0.85) * size}" font-family="Songti SC, STSong, serif" font-size="${size}" fill="${INK}" text-anchor="middle">${ch}</text>`)
    .join('');
}

/** A black fishtail (黑鱼尾): a downward-pointing notched triangle. */
function fishtail(cx: number, top: number, w: number): string {
  const h = w * 0.7;
  const half = w / 2;
  const notch = w * 0.22;
  return `<path d="M ${cx - half} ${top} L ${cx + half} ${top} L ${cx + notch} ${top + h} L ${cx} ${top + h * 0.6} L ${cx - notch} ${top + h} Z" fill="${INK}"/>`;
}

export function centerStrip(opts: { x: number; y: number; w: number; h: number; title: string; juan: string; page: string }): string {
  const { x, y, w, h, title, juan, page } = opts;
  const cx = x + w / 2;
  const ftW = w * 0.7;
  const titleSize = w * 0.5;
  const juanSize = w * 0.42;
  return `<g>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="${INK}" stroke-width="0.8"/>
    <line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${INK}" stroke-width="0.8"/>
    ${vlabel(cx, y + 8, title, titleSize)}
    ${fishtail(cx, y + 8 + title.length * titleSize + 10, ftW)}
    ${vlabel(cx, y + 8 + title.length * titleSize + 10 + ftW, juan, juanSize)}
    ${vlabel(cx, y + h - (page.length + 1) * juanSize, page, juanSize)}
  </g>`;
}
