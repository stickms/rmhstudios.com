/** Pure SVG renderer for the D2 stat badges (shields.io-style two-part pill). */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// Approximate Verdana 11px advance; good enough for a fixed-height pill.
const textWidth = (s: string) => Math.round(s.length * 6.4) + 12;

export function renderBadge(label: string, value: string, color = '#4c1'): string {
  const lw = textWidth(label);
  const vw = textWidth(value);
  const w = lw + vw;
  const l = esc(label);
  const v = esc(value);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${v}">` +
    `<title>${l}: ${v}</title>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${lw / 2}" y="14">${l}</text><text x="${lw + vw / 2}" y="14">${v}</text></g></svg>`
  );
}
