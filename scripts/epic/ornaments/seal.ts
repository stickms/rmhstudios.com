const RED = '#b03a2e';
const PAPER = '#efe7d4';

/** Lay text into an n×n grid filling a size×size square (read top→down, right→left like a seal). */
function grid(text: string, x: number, y: number, size: number, color: string): string {
  const n = Math.ceil(Math.sqrt(text.length));
  const cell = size / n;
  const chars = [...text];
  const out: string[] = [];
  // seal reading order: columns right→left, top→bottom
  let idx = 0;
  for (let col = n - 1; col >= 0; col--) {
    for (let row = 0; row < n && idx < chars.length; row++) {
      const cx = x + col * cell + cell / 2;
      const cy = y + row * cell + cell * 0.78;
      out.push(`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Kaiti SC, STKaiti, serif" font-weight="700" font-size="${(cell * 0.82).toFixed(1)}" fill="${color}" text-anchor="middle">${chars[idx++]}</text>`);
    }
  }
  return out.join('');
}

export function seal(opts: { x: number; y: number; size: number; text: string; style?: 'relief' | 'intaglio' }): string {
  const { x, y, size, text, style = 'intaglio' } = opts;
  const r = size * 0.06; // rounded carved corners
  if (style === 'intaglio') {
    return `<g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${RED}"/>
      ${grid(text, x + size * 0.08, y + size * 0.08, size * 0.84, PAPER)}
    </g>`;
  }
  return `<g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="none" stroke="${RED}" stroke-width="${size * 0.04}"/>
    ${grid(text, x + size * 0.08, y + size * 0.08, size * 0.84, RED)}
  </g>`;
}
