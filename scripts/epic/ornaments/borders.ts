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

/**
 * A 卷云纹 scrolling-cloud flourish: an auspicious cloud with a head and a
 * diminishing curling tail. `scale` sizes it; a negative `scale` mirrors it
 * horizontally (so a left/right pair can flank a title).
 */
export function cloudMotif(cx: number, cy: number, scale: number): string {
  const s = Math.abs(scale);
  const dir = scale < 0 ? -1 : 1;
  const u = 13 * s;
  // three decreasing scroll loops joined by short links — reads as a rolling cloud
  const d = `M ${2.8 * u} 0 a ${0.9 * u} ${0.9 * u} 0 1 0 ${-0.9 * u} ${0.9 * u} h ${-1.2 * u} a ${0.7 * u} ${0.7 * u} 0 1 0 ${-0.7 * u} ${0.7 * u} h ${-1.0 * u} a ${0.5 * u} ${0.5 * u} 0 1 0 ${-0.5 * u} ${0.5 * u}`;
  return `<g fill="none" stroke="${INK}" stroke-width="${1.6 * s}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx} ${cy}) scale(${dir} 1)">
    <path d="${d}"/>
  </g>`;
}
