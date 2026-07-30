/**
 * Figure generator for "Redesigning the Home Button".
 *
 * The dial geometry here is a faithful port of the shipped implementation in
 * components/radial/RadialHub.tsx — the same RINGS, the same SINGLE_RING, the
 * same INNER_MAX/SINGLE_RING_MAX split, the same ringSector() polygon walk and
 * the same ART_BLEED_DEG. Every dial figure in the document is therefore drawn
 * by the production algorithm rather than by hand, so a figure cannot disagree
 * with the code it illustrates.
 */

const DEG = Math.PI / 180;

export const RINGS = [
  { r0: 19, r1: 34 },
  { r0: 36, r1: 50 },
];
export const SINGLE_RING = { r0: 19, r1: 50 };
export const ART_BLEED_DEG = 0.25;
export const SINGLE_RING_MAX = 6;
export const INNER_MAX = 6;
export const MOTION_MS = 500;

/** The shipped nav catalog, flattened the way RadialHub flattens SIDEBAR_NAV. */
export const NAV = [
  { id: '/', label: 'Home', glyph: 'home' },
  { id: '/search', label: 'Explore', glyph: 'compass' },
  { id: '/messages', label: 'Inbox', glyph: 'inbox', auth: true },
  { id: '/create', label: 'Creator Studio', glyph: 'wand' },
  { id: '/library', label: 'Library', glyph: 'library' },
  { id: '/communities', label: 'Communities', glyph: 'users' },
  { id: '/store', label: 'Store', glyph: 'bag' },
  { id: '/arcade', label: 'Arcade', glyph: 'pad' },
  { id: '/predictions', label: 'Predictions', glyph: 'trend' },
  { id: '/developer', label: 'Developer', glyph: 'term' },
  { id: '/services', label: 'Services', glyph: 'grid' },
  { id: '/rmh-capital', label: 'RMH Capital', glyph: 'bank' },
  { id: '/rmh-pmc', label: 'RMH PMC', glyph: 'shield' },
  { id: '/adaptive-intelligence', label: 'Adaptive Intelligence', glyph: 'atom' },
  { id: '/deeplink', label: 'RMH Deeplink', glyph: 'brain' },
  { id: '/admin', label: 'Admin', glyph: 'check', admin: true },
];

export function visibleNav({ auth = true, admin = true } = {}) {
  return NAV.filter((n) => (n.auth ? auth : true) && (n.admin ? admin : true));
}

/** Verbatim port of RadialHub's ringSector(). */
export function ringSector(a0, a1, r0, r1) {
  const pts = [];
  const steps = 10;
  const at = (k) => (a0 + ((a1 - a0) * k) / steps) * DEG;
  for (let k = 0; k <= steps; k++) {
    const t = at(k);
    pts.push(`${(50 + r1 * Math.cos(t)).toFixed(2)},${(50 + r1 * Math.sin(t)).toFixed(2)}`);
  }
  for (let k = steps; k >= 0; k--) {
    const t = at(k);
    pts.push(`${(50 + r0 * Math.cos(t)).toFixed(2)},${(50 + r0 * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Verbatim port of the wedge-carving useMemo in RadialHub. */
export function carve(leaves) {
  if (leaves.length === 0) return { wedges: [], bounds: [] };
  const groups =
    leaves.length <= SINGLE_RING_MAX
      ? [{ items: leaves, band: SINGLE_RING, ring: 0 }]
      : (() => {
          const innerCount = Math.min(INNER_MAX, Math.ceil(leaves.length / 2));
          return [
            { items: leaves.slice(0, innerCount), band: RINGS[0], ring: 0 },
            { items: leaves.slice(innerCount), band: RINGS[1], ring: 1 },
          ];
        })();

  const out = [];
  let order = 0;
  for (const { items, band, ring } of groups) {
    const n = Math.max(1, items.length);
    const seg = 360 / n;
    const gap = Math.min(1.4, seg * 0.06);
    const rm = (band.r0 + band.r1) / 2;
    for (let i = 0; i < items.length; i++) {
      const a0 = -90 + i * seg + gap / 2;
      const a1 = -90 + (i + 1) * seg - gap / 2;
      const am = ((a0 + a1) / 2) * DEG;
      out.push({
        ...items[i],
        a0,
        a1,
        seg,
        gap,
        band,
        points: ringSector(a0, a1, band.r0, band.r1),
        pointsArt: ringSector(
          a0 - gap * ART_BLEED_DEG,
          a1 + gap * ART_BLEED_DEG,
          band.r0,
          band.r1,
        ),
        cx: 50 + rm * Math.cos(am),
        cy: 50 + rm * Math.sin(am),
        ring,
        order: order++,
      });
    }
  }
  const bounds = [...new Set(groups.flatMap(({ band }) => [band.r0, band.r1]))].sort(
    (a, b) => a - b,
  );
  return { wedges: out, bounds };
}

/* ─────────────────────────── tiny glyph set ─────────────────────────────
   Miniature line-art stand-ins for the lucide icons the real dial uses. Drawn
   in a 24-unit box centred on the origin, stroked in currentColor. */
const G = {
  home: 'M-7 1 0-6 7 1M-5-0.6V7h10V-0.6',
  compass: 'M0-8a8 8 0 100 16 8 8 0 100-16M3.5-3.5-1.4 1.4-3.5 3.5 1.4-1.4Z',
  inbox: 'M-8-2 -5-7h10l3 5v7a1 1 0 01-1 1h-14a1 1 0 01-1-1zM-8-2h4l1 2h6l1-2h4',
  wand: 'M4-8 8-4 -5 9-9 5ZM-6-8v4M-8-6h4M6 4v3M5 5.5h3',
  library: 'M-7-8v16M-3-8v16M2-7 7 8',
  users: 'M-2-3a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4M-8 8v-2a4 4 0 014-4h4a4 4 0 014 4v2M6-9.2a3.2 3.2 0 010 6.2M9 8V6a4 4 0 00-3-3.8',
  bag: 'M-7-4h14l-1 12h-12ZM-3.5-4v-2.5a3.5 3.5 0 017 0V-4',
  pad: 'M-5-1h-1.5M-5-1v0M-4-2.5v3M-5.5-1H-3M4-2h.1M6 1h.1M-7 5.5A5.5 5.5 0 01-7-5.5h14A5.5 5.5 0 017 5.5Z',
  trend: 'M-8 5 -2-2 2 2 8-5M8-5H3.5M8-5v4.5',
  term: 'M-5-3 -1 1-5 5M1 5h5M-9-8h18v16h-18Z',
  grid: 'M-8-8h7v7h-7ZM1-8h7v7h-7ZM-8 1h7v7h-7ZM1 1h7v7h-7Z',
  bank: 'M0-8 8-3h-16ZM-6-3v8M-2-3v8M2-3v8M6-3v8M-8 6h16',
  shield: 'M0-9 7-6.5V0c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9v-6.5Z',
  atom: 'M0 0a9 3.4 0 100 .1M0 0a9 3.4 0 100 .1M0-1.4a1.4 1.4 0 100 2.8 1.4 1.4 0 100-2.8',
  brain: 'M-1-8a3.4 3.4 0 00-3.4 3.4 3 3 0 00-2.6 3 3 3 0 00.6 5.5A3 3 0 003 8.2V-4.6A3.4 3.4 0 00-1-8ZM3-8a3.4 3.4 0 013.4 3.4 3 3 0 012.6 3 3 3 0 01-.6 5.5',
  check: 'M0-9 7-6.5V0c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9v-6.5ZM-3.2-.4 -.6 2.2 3.6-2',
  settings: 'M0-3a3 3 0 100 6 3 3 0 100-6M0-8v2M0 6v2M-5.7-5.7 -4.3-4.3M4.3 4.3 5.7 5.7M-8 0h2M6 0h2M-5.7 5.7 -4.3 4.3M4.3-4.3 5.7-5.7',
  logout: 'M-2-8h-5v16h5M2-4 6 0 2 4M-1 0H6',
  x: 'M-6-6 6 6M6-6 -6 6',
};

function glyph(name, x, y, s = 1, extra = '') {
  const d = G[name] || G.grid;
  return `<g transform="translate(${x} ${y}) scale(${s / 24})" fill="none" stroke="currentColor" stroke-width="${2.1 * (1 / s) * s}" stroke-linecap="round" stroke-linejoin="round" ${extra}><path d="${d}"/></g>`;
}

/* Atom needs two crossed ellipses; patch it as real elements. */
function atomGlyph(x, y, s) {
  const k = s / 24;
  return `<g transform="translate(${x} ${y}) scale(${k}) " fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
    <ellipse cx="0" cy="0" rx="9" ry="3.4" transform="rotate(30)"/>
    <ellipse cx="0" cy="0" rx="9" ry="3.4" transform="rotate(-30)"/>
    <circle cx="0" cy="0" r="1.5" fill="currentColor" stroke="none"/></g>`;
}

const svg = (w, h, body, cls = '') =>
  `<svg class="fig-svg ${cls}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-hidden="true">${body}</svg>`;

/* ═════════════════════════════ FIGURES ═════════════════════════════════ */

/**
 * The dial, drawn by the production carve(). `mode` selects what is emphasised.
 *   plain    — resting sectors + hairlines + glyphs + labels
 *   hit      — the same geometry as hit regions, alternating fills
 *   bleed    — art layer (bled) over hit layer, bleed exaggerated
 *   labels   — label boxes drawn as rectangles at each centroid
 *   spin     — a mid-open frame: decks counter-rotated by `spin` degrees
 */
export function figDial({
  auth = true,
  admin = true,
  labels = true,
  mode = 'plain',
  active = '/',
  spin = 0,
  scale = 1,
  bleedFactor = 1,
  size = 420,
  caption = null,
} = {}) {
  const leaves = visibleNav({ auth, admin });
  const { wedges, bounds } = carve(leaves);
  const P = size / 100; // percent → user units
  const p = (v) => (v * P).toFixed(2);
  const poly = (pts, attrs) =>
    `<polygon points="${pts
      .split(' ')
      .map((pair) => pair.split(',').map((n) => (Number(n) * P).toFixed(2)).join(','))
      .join(' ')}" ${attrs}/>`;

  const rot = (ring) => (ring === 0 ? -spin : spin);
  const body = [];

  // divider bed
  body.push(
    `<circle cx="${p(50)}" cy="${p(50)}" r="${p(50)}" fill="#f2f2f2" stroke="#111" stroke-width="0.8"/>`,
    `<circle cx="${p(50)}" cy="${p(50)}" r="${p(bounds[0] ?? 19)}" fill="#fff"/>`,
  );

  for (const w of wedges) {
    const g = `transform="rotate(${rot(w.ring)} ${p(50)} ${p(50)}) scale(${scale} ${scale}) translate(${(((1 - scale) * size) / 2 / scale).toFixed(2)} ${(((1 - scale) * size) / 2 / scale).toFixed(2)})"`;
    const isActive = w.id === active;
    if (mode === 'bleed') {
      const bleed = ringSector(
        w.a0 - w.gap * ART_BLEED_DEG * bleedFactor,
        w.a1 + w.gap * ART_BLEED_DEG * bleedFactor,
        w.band.r0,
        w.band.r1,
      );
      body.push(`<g ${g}>${poly(bleed, 'fill="#111" opacity="0.18"')}</g>`);
      body.push(`<g ${g}>${poly(w.points, 'fill="#fff" stroke="#111" stroke-width="0.6"')}</g>`);
      continue;
    }
    const fill =
      mode === 'hit'
        ? w.order % 2
          ? '#e4e4e4'
          : '#f7f7f7'
        : isActive
          ? '#111'
          : '#fafafa';
    body.push(
      `<g ${g}>${poly(w.points, `fill="${fill}" stroke="#111" stroke-width="${mode === 'hit' ? 0.9 : 0.5}" ${mode === 'hit' ? 'stroke-dasharray="2 1.6"' : ''}/>`.replace('/>/>', '/>'))}</g>`,
    );
  }

  // level hairlines
  for (const r of bounds) {
    body.push(
      `<circle cx="${p(50)}" cy="${p(50)}" r="${p(r)}" fill="none" stroke="#111" stroke-width="1.4" opacity="0.55"/>`,
    );
  }

  // glyphs + labels on the unfiltered layer
  for (const w of wedges) {
    const gx = w.cx * P;
    const gy = w.cy * P;
    const isActive = w.id === active;
    const ink = isActive && mode === 'plain' ? '#fff' : '#111';
    const gs = size / 20;
    const inner = w.glyph === 'atom' ? atomGlyph(gx, gy - (labels ? gs * 0.42 : 0), gs) : glyph(w.glyph, gx, gy - (labels ? gs * 0.42 : 0), gs);
    body.push(`<g color="${ink}" style="color:${ink}">${inner}</g>`);
    if (mode === 'labels') {
      const bw = (w.ring === 0 ? 4.1 : 5.4) * 16 * (size / 420);
      const bh = gs * 1.5;
      body.push(
        `<rect x="${(gx - bw / 2).toFixed(1)}" y="${(gy - bh / 2 + gs * 0.5).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="#111" stroke-width="0.7" stroke-dasharray="2 1.5" opacity="0.85"/>`,
      );
    }
    if (labels) {
      const words = w.label.split(' ');
      const budget = w.ring === 0 ? 11 : 13;
      const lines = words.length > 1 && w.label.length > budget ? words : [w.label];
      const fs = (size / 420) * 8.4;
      lines.forEach((ln, i) => {
        body.push(
          `<text x="${gx.toFixed(1)}" y="${(gy + gs * 0.55 + i * fs * 1.12).toFixed(1)}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="${fs.toFixed(1)}" font-weight="600" fill="${ink}">${ln}</text>`,
        );
      });
    }
  }

  // the orb in the hole
  const orbR = size * 0.062;
  body.push(
    `<circle cx="${p(50)}" cy="${p(50)}" r="${orbR.toFixed(1)}" fill="#111"/>`,
    `<circle cx="${p(50)}" cy="${p(50)}" r="${(orbR * 0.52).toFixed(1)}" fill="none" stroke="#fff" stroke-width="1"/>`,
    `<circle cx="${p(50)}" cy="${p(50)}" r="${(orbR * 0.3).toFixed(1)}" fill="none" stroke="#fff" stroke-width="0.7"/>`,
  );

  const out = svg(size, size, body.join(''), 'fig-dial');
  return caption ? `<figure class="fig">${out}<figcaption>${caption}</figcaption></figure>` : out;
}

/** The radial band ruler: 0 — 19 — 34 — 36 — 50. */
export function figBands({ single = false } = {}) {
  const W = 620;
  const H = 150;
  const x0 = 40;
  const x1 = W - 40;
  const sx = (r) => x0 + (r / 50) * (x1 - x0);
  const y = 92;
  const marks = single ? [0, 19, 50] : [0, 19, 34, 36, 50];
  const spans = single
    ? [
        [0, 19, 'hole'],
        [19, 50, 'single ring'],
      ]
    : [
        [0, 19, 'hole'],
        [19, 34, 'inner ring'],
        [34, 36, 'gap'],
        [36, 50, 'outer ring'],
      ];
  const b = [`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#111" stroke-width="1.2"/>`];
  for (const r of marks) {
    b.push(
      `<line x1="${sx(r)}" y1="${y - 13}" x2="${sx(r)}" y2="${y + 13}" stroke="#111" stroke-width="1.2"/>`,
      `<text x="${sx(r)}" y="${y + 30}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="11">${r}</text>`,
    );
  }
  for (const [a, c, name] of spans) {
    const mid = (sx(a) + sx(c)) / 2;
    b.push(
      `<rect x="${sx(a)}" y="${y - 30}" width="${sx(c) - sx(a)}" height="18" fill="${name === 'gap' ? '#fff' : name === 'hole' ? '#fff' : '#ececec'}" stroke="#111" stroke-width="0.7"/>`,
      `<text x="${mid}" y="${y - 38}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="10.5" letter-spacing="0.06em">${name.toUpperCase()}</text>`,
    );
  }
  b.push(
    `<text x="${x0}" y="${y + 52}" font-family="Liberation Sans, sans-serif" font-size="10" fill="#555">centre of dial</text>`,
    `<text x="${x1}" y="${y + 52}" text-anchor="end" font-family="Liberation Sans, sans-serif" font-size="10" fill="#555">rim (r = 50% of dial width)</text>`,
  );
  return svg(W, H, b.join(''));
}

/** ringSector's polygon walk, exploded: 11 outer samples, then 11 inner. */
export function figSectorWalk() {
  const S = 360;
  const P = S / 100;
  const a0 = -60;
  const a1 = 20;
  const r0 = 22;
  const r1 = 44;
  const b = [];
  const at = (k) => (a0 + ((a1 - a0) * k) / 10) * DEG;
  const pt = (r, t) => [(50 + r * Math.cos(t)) * P, (50 + r * Math.sin(t)) * P];
  b.push(
    `<circle cx="${50 * P}" cy="${50 * P}" r="${r1 * P}" fill="none" stroke="#bbb" stroke-width="0.8" stroke-dasharray="3 3"/>`,
    `<circle cx="${50 * P}" cy="${50 * P}" r="${r0 * P}" fill="none" stroke="#bbb" stroke-width="0.8" stroke-dasharray="3 3"/>`,
  );
  const pts = ringSector(a0, a1, r0, r1)
    .split(' ')
    .map((s) => s.split(',').map((n) => Number(n) * P).join(','))
    .join(' ');
  b.push(`<polygon points="${pts}" fill="#f0f0f0" stroke="#111" stroke-width="1.1"/>`);
  for (let k = 0; k <= 10; k++) {
    const [x, y] = pt(r1, at(k));
    b.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#111"/>`);
    if (k === 0 || k === 10)
      b.push(
        `<text x="${(x + 9).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-family="DejaVu Sans Mono, monospace" font-size="9.5">k=${k}</text>`,
      );
  }
  for (let k = 10; k >= 0; k--) {
    const [x, y] = pt(r0, at(k));
    b.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff" stroke="#111" stroke-width="1.1"/>`,
    );
  }
  const [cx, cy] = pt((r0 + r1) / 2, ((a0 + a1) / 2) * DEG);
  b.push(
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="none" stroke="#111" stroke-width="1"/>`,
    `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + 34).toFixed(1)}" y2="${(cy - 22).toFixed(1)}" stroke="#111" stroke-width="0.8"/>`,
    `<text x="${(cx + 37).toFixed(1)}" y="${(cy - 24).toFixed(1)}" font-family="Liberation Sans, sans-serif" font-size="10">centroid (cx, cy)</text>`,
    `<circle cx="${50 * P}" cy="${50 * P}" r="2" fill="#111"/>`,
    `<text x="${50 * P + 6}" y="${50 * P + 14}" font-family="Liberation Sans, sans-serif" font-size="10" fill="#555">50% 50%</text>`,
  );
  return svg(S, S, b.join(''), 'fig-mid');
}

/** The open motion, as a timing chart over 500ms. */
export function figTimeline() {
  const W = 620;
  const rows = [
    ['orb → centre', 0, 500, 'transform · ease-glass'],
    ['circular blur', 0, 500, 'clip-path circle(0 → 150vmax)'],
    ['dial opacity', 0, 400, 'opacity 0 → 1'],
    ['dial scale', 0, 500, 'scale .82 → 1'],
    ['deck spin', 0, 550, 'rotate ∓55° → 0°'],
    ['wedge fade', 0, 340, '+ 20ms × i stagger'],
    ['level hairlines', 0, 340, 'opacity 0 → 1'],
    ['foot pill', 0, 500, 'opacity + translateY 10px'],
    ['aura', 0, 500, 'rides the orb'],
  ];
  const H = 46 + rows.length * 26 + 26;
  const x0 = 128;
  const x1 = W - 108;
  const T = 600;
  const sx = (t) => x0 + (t / T) * (x1 - x0);
  const b = [];
  for (const t of [0, 100, 200, 300, 400, 500, 600]) {
    b.push(
      `<line x1="${sx(t)}" y1="26" x2="${sx(t)}" y2="${H - 26}" stroke="${t === 500 ? '#111' : '#ddd'}" stroke-width="${t === 500 ? 1 : 0.7}" ${t === 500 ? 'stroke-dasharray="4 3"' : ''}/>`,
      `<text x="${sx(t)}" y="18" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="9">${t}</text>`,
    );
  }
  rows.forEach(([name, a, c, note], i) => {
    const y = 40 + i * 26;
    b.push(
      `<text x="${x0 - 10}" y="${y + 11}" text-anchor="end" font-family="Liberation Sans, sans-serif" font-size="10">${name}</text>`,
      `<rect x="${sx(a)}" y="${y}" width="${sx(c) - sx(a)}" height="15" fill="${c > 500 ? '#ddd' : '#111'}" opacity="${c > 500 ? 1 : 0.86}"/>`,
      `<text x="${sx(c) + 7}" y="${y + 11}" font-family="Liberation Sans, sans-serif" font-size="8.6" fill="#555">${note}</text>`,
    );
  });
  b.push(
    `<text x="${sx(500)}" y="${H - 10}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9" fill="#555">MOTION_MS = 500 — the unmount gate</text>`,
  );
  return svg(W, H, b.join(''));
}

/** closed → open → closing → closed. */
export function figPhases() {
  const W = 620;
  const H = 190;
  const box = (x, y, w, h, label, sub) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width="1.2" rx="2"/>` +
    `<text x="${x + w / 2}" y="${y + 21}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="12" font-weight="bold">${label}</text>` +
    `<text x="${x + w / 2}" y="${y + 37}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9" fill="#555">${sub}</text>`;
  const arrow = (x1, y1, x2, y2, label, above = true) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="1.1" marker-end="url(#ah)"/>` +
    `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + (above ? -8 : 17)}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9.4">${label}</text>`;
  const b = [
    `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#111"/></marker></defs>`,
    box(24, 60, 150, 50, 'closed', 'overlay unmounted'),
    box(236, 60, 150, 50, 'open', 'everything animates in'),
    box(448, 60, 150, 50, 'closing', 'everything animates out'),
    arrow(178, 78, 232, 78, 'tap orb'),
    arrow(390, 78, 444, 78, 'tap · Esc · nav · scrim'),
    `<path d="M523 114 C523 160 300 168 99 160 L99 114" fill="none" stroke="#111" stroke-width="1.1" marker-end="url(#ah)"/>`,
    `<text x="311" y="176" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9.4">setTimeout(MOTION_MS) — 0ms under reduced motion</text>`,
    `<path d="M311 56 C311 30 178 30 178 52" fill="none" stroke="#111" stroke-width="1.1" stroke-dasharray="3 2.6" marker-end="url(#ah)"/>`,
    `<text x="255" y="26" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9.4" fill="#555">tap orb again mid-open → clearTimer, re-enter closing</text>`,
  ];
  return svg(W, H, b.join(''));
}

/** Exploded z-stack of the hub's layers. */
export function figLayers() {
  const W = 620;
  const layers = [
    ['--z-hub-orb-open', 'the orb (above the overlay for the whole motion)', 'orb'],
    ['--z-hub-aura-open', 'metaball aura — shapes only, goo-filtered', 'aura'],
    ['2 · dial', 'hit layer: the real links, unfiltered, clip-path per sector', 'hit'],
    ['2 · dial', 'level hairlines — drawn circles at every band boundary', 'lvl'],
    ['2 · dial', 'art layer: sector fills, the ONLY thing the goo touches', 'art'],
    ['2 · dial', 'divider bed + centre-hole mask', 'bed'],
    ['1', 'the expanding circular blur (backdrop-filter)', 'blur'],
    ['0', 'transparent scrim — outside-tap dismiss', 'scrim'],
    ['—', 'the page, still in its own scroll position', 'page'],
  ];
  const H = 40 + layers.length * 34 + 18;
  const b = [];
  layers.forEach(([z, what], i) => {
    const y = 24 + i * 34;
    const skew = 26;
    const x = 150 - i * 3;
    b.push(
      `<path d="M${x} ${y + 18} L${x + skew} ${y} L${x + skew + 250} ${y} L${x + 250} ${y + 18} Z" fill="${i === 8 ? '#f6f6f6' : '#fff'}" stroke="#111" stroke-width="1"/>`,
      `<text x="${x - 12}" y="${y + 14}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="8.6" fill="#333">${z}</text>`,
      `<text x="${x + skew + 264}" y="${y + 12}" font-family="Liberation Sans, sans-serif" font-size="9.4">${what}</text>`,
    );
  });
  return svg(W, H, b.join(''));
}

/** The goo alpha ramp: input alpha → output alpha for the three filters. */
export function figRamp() {
  const W = 560;
  const H = 250;
  const x0 = 56;
  const y0 = H - 44;
  const x1 = W - 150;
  const y1 = 24;
  const sx = (a) => x0 + a * (x1 - x0);
  const sy = (a) => y0 - a * (y0 - y1);
  const b = [
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="#111" stroke-width="1"/>`,
    `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#111" stroke-width="1"/>`,
    `<text x="${(x0 + x1) / 2}" y="${y0 + 30}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="10">blurred alpha in</text>`,
    `<text x="${x0 - 34}" y="${(y0 + y1) / 2}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="10" transform="rotate(-90 ${x0 - 34} ${(y0 + y1) / 2})">alpha out</text>`,
    `<line x1="${sx(0.5)}" y1="${y0}" x2="${sx(0.5)}" y2="${y1}" stroke="#ccc" stroke-width="0.8" stroke-dasharray="3 3"/>`,
    `<text x="${sx(0.5)}" y="${y1 - 8}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="9" fill="#555">α = 0.5 → the fuse threshold</text>`,
  ];
  const ramps = [
    [15, '#999', 'rmh-liquid-sm  ramp 15  blur 4'],
    [19, '#555', 'rmh-liquid     ramp 19  blur 8'],
    [24, '#111', 'rmh-liquid-lg  ramp 24  blur 16'],
  ];
  ramps.forEach(([r, col, label], i) => {
    const pts = [];
    for (let k = 0; k <= 120; k++) {
      const a = k / 120;
      const o = Math.min(1, Math.max(0, a * r - (r - 1) / 2));
      pts.push(`${sx(a).toFixed(1)},${sy(o).toFixed(1)}`);
    }
    b.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.8"/>`);
    b.push(
      `<line x1="${x1 + 14}" y1="${y1 + 12 + i * 20}" x2="${x1 + 34}" y2="${y1 + 12 + i * 20}" stroke="${col}" stroke-width="1.8"/>`,
      `<text x="${x1 + 40}" y="${y1 + 15 + i * 20}" font-family="DejaVu Sans Mono, monospace" font-size="8">${label}</text>`,
    );
  });
  return svg(W, H, b.join(''));
}

/** Docked orb → centred orb, with the translateY arithmetic annotated. */
export function figGlide() {
  const W = 620;
  const H = 300;
  const phone = (x, label, centred) => {
    const w = 150;
    const h = 250;
    const y = 26;
    const cx = x + w / 2;
    const orbY = centred ? y + h / 2 : y + h - 34;
    const out = [
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#fff" stroke="#111" stroke-width="1.3"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="26" fill="#f4f4f4" stroke="#111" stroke-width="0.7"/>`,
    ];
    if (centred) {
      out.push(
        `<clipPath id="cp${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath>`,
        `<g clip-path="url(#cp${x})"><circle cx="${cx}" cy="${orbY}" r="120" fill="#f0f0f0"/><circle cx="${cx}" cy="${orbY}" r="120" fill="none" stroke="#111" stroke-width="0.6" stroke-dasharray="3 3"/></g>`,
      );
      for (const r of [34, 52, 66]) {
        out.push(
          `<circle cx="${cx}" cy="${orbY}" r="${r}" fill="none" stroke="#111" stroke-width="0.8" opacity="0.5"/>`,
        );
      }
    } else {
      for (let i = 0; i < 4; i++) {
        out.push(
          `<rect x="${x + 14}" y="${y + 42 + i * 46}" width="${w - 28}" height="36" fill="none" stroke="#ccc" stroke-width="0.8"/>`,
        );
      }
    }
    out.push(
      `<circle cx="${cx}" cy="${orbY}" r="13" fill="#111"/>`,
      `<circle cx="${cx}" cy="${orbY}" r="7" fill="none" stroke="#fff" stroke-width="1"/>`,
      `<text x="${cx}" y="${y + h + 20}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="10" font-weight="600">${label}</text>`,
    );
    if (!centred) {
      out.push(
        `<line x1="${x + w + 6}" y1="${orbY}" x2="${x + w + 6}" y2="${y + h}" stroke="#111" stroke-width="0.8"/>`,
        `<text x="${x + w + 11}" y="${orbY + 20}" font-family="DejaVu Sans Mono, monospace" font-size="8">--orb-bottom</text>`,
      );
    }
    return out.join('');
  };
  const b = [
    phone(40, 'closed — docked, bottom-centre', false),
    phone(400, 'open — centred, the hub the dial radiates from', true),
    `<path d="M242 150 C300 150 320 150 378 150" fill="none" stroke="#111" stroke-width="1.2" marker-end="url(#ah2)"/>`,
    `<defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#111"/></marker></defs>`,
    `<text x="310" y="142" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="8.4">translate(-50%,</text>`,
    `<text x="310" y="167" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="8.4">calc(orb-bottom + 50% - 50dvh))</text>`,
  ];
  return svg(W, H, b.join(''));
}

/** The three-track desktop frame at each breakpoint. */
export function figFrame() {
  const W = 620;
  const H = 300;
  const rows = [
    [0, '< 1120px', ['content'], 'one track — the page’s own targetWidth'],
    [1, '≥ 1120px', ['nav', 'content'], 'content ≥ 44rem'],
    [2, '≥ 1440px', ['nav', 'content', 'live'], 'content ≥ 50rem'],
    [3, '≥ 1800px', ['nav', 'content', 'live'], 'wider rails, frame capped at 116rem'],
  ];
  const b = [];
  rows.forEach(([i, label, tracks, note]) => {
    const y = 22 + i * 70;
    const x = 96;
    const total = 380 + i * 22;
    const widths = tracks.map((t) => (t === 'content' ? 0 : t === 'nav' ? 62 + i * 6 : 76 + i * 6));
    const flex = total - widths.reduce((a, c) => a + c, 0) - (tracks.length - 1) * 8;
    let cx = x;
    b.push(
      `<text x="${x - 12}" y="${y + 26}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="9.4">${label}</text>`,
    );
    tracks.forEach((t, k) => {
      const w = t === 'content' ? flex : widths[k];
      b.push(
        `<rect x="${cx}" y="${y}" width="${w}" height="44" fill="${t === 'content' ? '#fff' : '#f1f1f1'}" stroke="#111" stroke-width="1"/>`,
        `<text x="${cx + w / 2}" y="${y + 27}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9.4">${t}</text>`,
      );
      cx += w + 8;
    });
    b.push(
      `<text x="${cx + 10}" y="${y + 27}" font-family="Liberation Sans, sans-serif" font-size="8.8" fill="#555">${note}</text>`,
    );
  });
  return svg(W, H, b.join(''));
}

/** Floating-bottom stack: what lifts above the orb. */
export function figStack() {
  const W = 560;
  const H = 250;
  const items = [
    ['cookie consent bar', 4],
    ['mini player', 3],
    ['back-to-top', 2],
    ['compose FAB', 1],
    ['the hub orb — data-floating="hub"', 0],
  ];
  const b = [
    `<rect x="150" y="18" width="260" height="200" rx="10" fill="#fff" stroke="#111" stroke-width="1.2"/>`,
    `<line x1="150" y1="200" x2="410" y2="200" stroke="#111" stroke-width="0.7" stroke-dasharray="3 3"/>`,
    `<text x="416" y="204" font-family="DejaVu Sans Mono, monospace" font-size="8">env(safe-area-inset-bottom)</text>`,
  ];
  items.forEach(([label, level], i) => {
    const y = 190 - level * 34;
    b.push(
      `<rect x="164" y="${y - 20}" width="232" height="24" fill="${level === 0 ? '#111' : '#f2f2f2'}" stroke="#111" stroke-width="0.9" rx="${level === 0 ? 12 : 3}"/>`,
      `<text x="280" y="${y - 4}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9" fill="${level === 0 ? '#fff' : '#111'}">${label}</text>`,
    );
  });
  return svg(W, H, b.join(''));
}

/** Label box spill: angular clipping vs radial room. */
export function figSpill() {
  const S = 340;
  const P = S / 100;
  const a0 = -22;
  const a1 = 22;
  const r0 = 36;
  const r1 = 50;
  const pts = ringSector(a0, a1, r0, r1)
    .split(' ')
    .map((s) => s.split(',').map((n) => Number(n) * P).join(','))
    .join(' ');
  const am = 0;
  const rm = (r0 + r1) / 2;
  const cx = (50 + rm * Math.cos(am * DEG)) * P;
  const cy = (50 + rm * Math.sin(am * DEG)) * P;
  const b = [
    `<polygon points="${pts}" fill="#f6f6f6" stroke="#111" stroke-width="1.1"/>`,
    // too-wide box
    `<rect x="${cx - 62}" y="${cy - 12}" width="124" height="24" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="3 2"/>`,
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9">Adaptive Intelligence</text>`,
    `<text x="${cx - 66}" y="${cy - 20}" text-anchor="end" font-family="Liberation Sans, sans-serif" font-size="8.6" fill="#111">clipped</text>`,
    `<text x="${cx + 66}" y="${cy - 20}" font-family="Liberation Sans, sans-serif" font-size="8.6" fill="#111">clipped</text>`,
    // correct box
    `<rect x="${cx - 30}" y="${cy + 34}" width="60" height="34" fill="none" stroke="#111" stroke-width="1.2"/>`,
    `<text x="${cx}" y="${cy + 47}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9">Adaptive</text>`,
    `<text x="${cx}" y="${cy + 60}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="9">Intelligence</text>`,
    `<text x="${cx}" y="${cy + 82}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="8.6" fill="#555">narrow box, depth is free</text>`,
    `<circle cx="${50 * P}" cy="${50 * P}" r="2.5" fill="#111"/>`,
  ];
  return svg(S, S, b.join(''), 'fig-mid');
}

/** Sector angular width as destination count rises. */
export function figSlivers() {
  const W = 600;
  const H = 250;
  const x0 = 54;
  const y0 = H - 46;
  const x1 = W - 20;
  const y1 = 22;
  const sx = (n) => x0 + ((n - 1) / 15) * (x1 - x0);
  const sy = (d) => y0 - (d / 360) * (y0 - y1);
  const b = [
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="#111" stroke-width="1"/>`,
    `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#111" stroke-width="1"/>`,
    `<text x="${(x0 + x1) / 2}" y="${y0 + 32}" text-anchor="middle" font-family="Liberation Sans, sans-serif" font-size="10">destinations on one ring</text>`,
  ];
  for (const d of [0, 60, 120, 180, 240, 300, 360]) {
    b.push(
      `<text x="${x0 - 8}" y="${sy(d) + 3.5}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="8.6">${d}°</text>`,
      `<line x1="${x0}" y1="${sy(d)}" x2="${x1}" y2="${sy(d)}" stroke="#eee" stroke-width="0.7"/>`,
    );
  }
  const one = [];
  const two = [];
  for (let n = 1; n <= 16; n++) {
    one.push(`${sx(n).toFixed(1)},${sy(360 / n).toFixed(1)}`);
    const inner = Math.min(6, Math.ceil(n / 2));
    const outer = n - inner;
    two.push(`${sx(n).toFixed(1)},${sy(360 / Math.max(inner, outer || 1)).toFixed(1)}`);
  }
  b.push(
    `<polyline points="${one.join(' ')}" fill="none" stroke="#111" stroke-width="1.8"/>`,
    `<polyline points="${two.join(' ')}" fill="none" stroke="#111" stroke-width="1.4" stroke-dasharray="5 3"/>`,
    `<text x="${sx(9)}" y="${sy(360 / 9) - 10}" font-family="Liberation Sans, sans-serif" font-size="9">one ring</text>`,
    `<text x="${sx(11)}" y="${sy(36) - 12}" font-family="Liberation Sans, sans-serif" font-size="9">double deck (widest ring)</text>`,
    `<line x1="${sx(SINGLE_RING_MAX)}" y1="${y0}" x2="${sx(SINGLE_RING_MAX)}" y2="${y1}" stroke="#111" stroke-width="0.9" stroke-dasharray="3 3"/>`,
    `<text x="${sx(SINGLE_RING_MAX) + 5}" y="${y1 + 10}" font-family="DejaVu Sans Mono, monospace" font-size="8.4">SINGLE_RING_MAX = 6</text>`,
    `<line x1="${x0}" y1="${sy(22.5)}" x2="${x1}" y2="${sy(22.5)}" stroke="#111" stroke-width="0.8" stroke-dasharray="2 3"/>`,
    `<text x="${x1 - 4}" y="${sy(22.5) - 6}" text-anchor="end" font-family="Liberation Sans, sans-serif" font-size="8.6" fill="#555">22.5° — one ring at 16 destinations</text>`,
  );
  return svg(W, H, b.join(''));
}

/** Five frames of the counter-rotating open. */
export function figSpinFrames() {
  const frames = [0, 0.25, 0.5, 0.75, 1];
  const cells = frames
    .map((t) => {
      const spin = 55 * (1 - t);
      const scale = 0.9 + 0.1 * t;
      return `<div class="frame"><div class="frame-t">${Math.round(t * 550)}ms</div>${figDial({
        labels: false,
        spin,
        scale,
        size: 200,
        active: null,
      })}</div>`;
    })
    .join('');
  return `<div class="frames">${cells}</div>`;
}

export const FIGURES = {
  dial16: () =>
    figDial({
      caption:
        'Figure — The shipped dial, signed in as an admin: sixteen destinations, six on the inner deck, ten on the outer. Drawn by the production <code>carve()</code>.',
    }),
  dialSignedOut: () =>
    figDial({
      auth: false,
      admin: false,
      caption:
        'Figure — Signed out: fourteen destinations. Auth and admin gating changes the count, so the geometry re-derives; nothing about the layout is hand-placed.',
    }),
  dialSix: () => {
    const leaves = visibleNav().slice(0, 6);
    const orig = NAV.length;
    void orig;
    // temporarily present a six-item nav through the same carve
    const saved = NAV.splice(0, NAV.length, ...leaves);
    const out = figDial({
      caption:
        'Figure — Six or fewer destinations: <code>SINGLE_RING</code> takes over and one wide band reads better than two thin ones.',
    });
    NAV.splice(0, NAV.length, ...saved);
    return out;
  },
  bands: () => figBands(),
  bandsSingle: () => figBands({ single: true }),
  sectorWalk: () => figSectorWalk(),
  timeline: () => figTimeline(),
  phases: () => figPhases(),
  layers: () => figLayers(),
  ramp: () => figRamp(),
  glide: () => figGlide(),
  frame: () => figFrame(),
  stack: () => figStack(),
  spill: () => figSpill(),
  slivers: () => figSlivers(),
  spinFrames: () => figSpinFrames(),
  dialHit: () =>
    figDial({
      labels: false,
      mode: 'hit',
      active: null,
      caption:
        'Figure — The hit map. Each dashed region is one anchor’s <code>clip-path</code>, and a clip bounds hit-testing as well as paint, so the sectors tile the disc with no gap for a click to fall through.',
    }),
  dialBleed: () =>
    figDial({
      labels: false,
      mode: 'bleed',
      active: null,
      bleedFactor: 26,
      caption:
        'Figure — <code>ART_BLEED_DEG</code>, exaggerated ×26 for legibility. Grey is the art sector, outlined white is the hit sector. The bleed is angular only: it pays back the couple of pixels the goo threshold erodes off each divider, and never touches the radial boundaries, where erosion is welcome.',
    }),
  dialLabels: () =>
    figDial({
      labels: false,
      mode: 'labels',
      active: null,
      caption:
        'Figure — The per-ring label budget as boxes: 4.1rem on the inner deck, 5.4rem on the outer. Each box is centred on its sector’s centroid, so width spills angularly — through the clip — while height spills radially, into the band, where there is room.',
    }),
};

/** Appendix A's sector table, computed by carve() rather than typed. */
export function sectorTable() {
  const { wedges, bounds } = carve(visibleNav());
  const rows = wedges
    .map(
      (w, i) => `<tr><td class="num">${i}</td><td>${w.label}</td><td class="num">${w.ring}</td>
      <td class="num">${w.a0.toFixed(2)}</td><td class="num">${w.a1.toFixed(2)}</td>
      <td class="num">${(w.a1 - w.a0).toFixed(2)}</td>
      <td class="num">${w.cx.toFixed(2)}</td><td class="num">${w.cy.toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<table class="compact"><caption>The sixteen sectors, as carved</caption>
    <thead><tr><th class="num">#</th><th>Destination</th><th class="num">Deck</th><th class="num">a₀</th><th class="num">a₁</th><th class="num">Span</th><th class="num">cx</th><th class="num">cy</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>Boundary radii handed to CSS: <code>[${bounds.join(', ')}]</code>. Angles are degrees
    clockwise from twelve o'clock, where twelve o'clock is <code>−90°</code> in CSS coordinates;
    radii and centroids are percentages of the dial's width. Inner deck: six sectors, 60°
    nominal, 1.40° gap, band 19–34, mid-radius 26.5. Outer deck: ten sectors, 36° nominal, 1.40°
    gap, band 36–50, mid-radius 43.0. Centre-hole mask:
    <code>calc(38% − var(--dial-level-w))</code>.</p>`;
}

/** The single-ring case, for comparison. */
export function sectorTableSix() {
  const six = visibleNav().slice(0, 6);
  const { wedges, bounds } = carve(six);
  const rows = wedges
    .map(
      (w, i) => `<tr><td class="num">${i}</td><td>${w.label}</td><td class="num">${w.ring}</td>
      <td class="num">${w.a0.toFixed(2)}</td><td class="num">${w.a1.toFixed(2)}</td>
      <td class="num">${(w.a1 - w.a0).toFixed(2)}</td>
      <td class="num">${w.cx.toFixed(2)}</td><td class="num">${w.cy.toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<table class="compact"><caption>Single-ring mode — the same function, six destinations</caption>
    <thead><tr><th class="num">#</th><th>Destination</th><th class="num">Deck</th><th class="num">a₀</th><th class="num">a₁</th><th class="num">Span</th><th class="num">cx</th><th class="num">cy</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>Boundary radii: <code>[${bounds.join(', ')}]</code> — two, not four, so the dial draws two
    hairlines and the mask still reads <code>bounds[0]</code>. Every centroid sits at mid-radius
    34.5.</p>`;
}

export function figure(name) {
  if (name === 'sectorTable') return sectorTable();
  if (name === 'sectorTableSix') return sectorTableSix();
  const f = FIGURES[name];
  if (!f) throw new Error(`unknown figure: ${name}`);
  return f();
}
