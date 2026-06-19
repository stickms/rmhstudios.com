const INK = '#1a1410';

/** A meander band around the rectangle perimeter (top, right, bottom, left). */
export function fretBorder(x: number, y: number, w: number, h: number, unit = 10): string {
  // Build a horizontal meander run of `count` cells, each `4*unit` wide and `3*unit` tall.
  const cellW = 4 * unit;
  const run = (len: number): string => {
    const count = Math.max(1, Math.floor(len / cellW));
    let d = '';
    for (let i = 0; i < count; i++) {
      const ox = i * cellW;
      d += `M${ox} 0 h${unit} v${-2 * unit} h${2 * unit} v${2 * unit} h${unit} `;
    }
    return d;
  };
  const band = unit * 2;
  return `<g fill="none" stroke="${INK}" stroke-width="${unit * 0.18}">
    <path transform="translate(${x} ${y + band})" d="${run(w)}"/>
    <path transform="translate(${x} ${y + h}) " d="${run(w)}"/>
    <path transform="translate(${x + band} ${y}) rotate(90)" d="${run(h)}"/>
    <path transform="translate(${x + w} ${y}) rotate(90)" d="${run(h)}"/>
  </g>`;
}

/** A scrolling-cloud flourish: two nested spirals. */
export function cloudMotif(cx: number, cy: number, scale: number): string {
  const s = 18 * scale;
  return `<g fill="none" stroke="${INK}" stroke-width="${1.4 * scale}" transform="translate(${cx} ${cy})">
    <path d="M0 0 q ${s} ${-s} ${2 * s} 0 q ${s} ${s} 0 ${1.4 * s} q ${-s} ${s} ${-2 * s} 0"/>
    <circle cx="${s}" cy="${0.2 * s}" r="${0.35 * s}"/>
  </g>`;
}
