/**
 * QR helpers for the profile card (P10) — pure, client- and server-safe.
 *
 * The site already ships a QR encoder (`qrcode-generator`, used by the share
 * dialog), so this does not write another: it adapts it to what a card renderer
 * needs — the module matrix, and a compact SVG built from it. Byte mode, error
 * correction M, smallest version that fits.
 */
import qrcode from 'qrcode-generator';

/** The module matrix for `text` (`true` = dark). Throws if the text cannot fit. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/**
 * A self-contained SVG for `text`: black modules, no background (callers draw the
 * white plate), a quiet-zone `margin` measured in modules. One `<path>` of
 * horizontal runs, so a version-4 code is ~1 KB rather than hundreds of rects.
 */
export function qrSvg(text: string, margin = 0): string {
  const m = qrMatrix(text);
  const n = m.length;
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r]![c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && m[r]![c + run]) run++;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<path d="${d}" fill="#000000"/></svg>`
  );
}

/** `data:` URI form of {@link qrSvg}, for an `<img>` in a satori tree. */
export function qrSvgDataUri(text: string, margin = 0): string {
  return `data:image/svg+xml;base64,${Buffer.from(qrSvg(text, margin)).toString('base64')}`;
}
