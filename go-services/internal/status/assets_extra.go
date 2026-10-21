package status

// Styles and script for everything the dashboard grew beyond the original
// hero-plus-cards page: the KPI tiles, toolbar, detail panels, charts,
// incident and maintenance lists, the calendar and heatmap, the developer
// section, the secondary pages, and the enhancement script that makes the page
// live. Same rules as assets.go: tokens only, block comments only in CSS.

// themeBootJS runs in <head>, before first paint, so a pinned theme, density
// or history range never flashes the default first. Storage can throw (private
// mode, blocked site data), and a page that fails to render over a preference
// is a worse page than one that forgets it.
const themeBootJS = `(function () {
  try {
    var d = document.documentElement, s = window.localStorage;
    var t = s.getItem('rmh-status:theme');
    if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
    if (s.getItem('rmh-status:density') === 'compact') d.setAttribute('data-density', 'compact');
    if (s.getItem('rmh-status:range') === 'days') d.setAttribute('data-hist', 'days');
  } catch (e) {}
})();`

const extraCSS = `
/* ═══ Utilities ═══════════════════════════════════════════════════════════ */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.skip {
  position: absolute; left: 0.75rem; top: -3rem; z-index: 50;
  padding: 0.5rem 0.9rem; border-radius: var(--site-radius-sm);
  background: var(--site-surface-opaque); color: var(--site-text);
  border: 1px solid var(--site-border);
}
.skip:focus { top: 0.75rem; }
.dim { color: var(--site-text-dim); }
.warn { color: var(--site-danger); }
[data-hidden] { display: none !important; }
a { color: inherit; }
code, kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8em;
}
kbd {
  padding: 0.05rem 0.4rem; border: 1px solid var(--site-border);
  border-bottom-width: 2px; border-radius: 6px; background: var(--site-bg-subtle);
}

/* ═══ Controls ════════════════════════════════════════════════════════════ */
.btn, .seg button, .icon-btn, .toolbar input, .toolbar select {
  font: inherit; color: var(--site-text);
  border: 1px solid var(--site-border); background: var(--site-glass-tint);
  border-radius: 999px;
  transition: border-color 0.15s var(--ease-glass), background-color 0.15s var(--ease-glass);
}
.btn { padding: 0.35rem 0.9rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.btn--small { padding: 0.15rem 0.6rem; font-size: 0.72rem; }
.btn:hover, .seg button:hover, .icon-btn:hover { border-color: var(--site-border-bright); }
.icon-btn {
  display: inline-grid; place-items: center; min-width: 2rem; height: 2rem; padding: 0 0.45rem;
  font-size: 0.78rem; font-weight: 700; cursor: pointer;
}
.icon-btn[aria-pressed='true'] { background: var(--site-text); color: var(--site-bg); }
.linkish {
  font: inherit; color: var(--site-text-muted); background: none; border: 0; padding: 0;
  border-bottom: 1px solid var(--site-border); cursor: pointer;
}
.linkish:hover { color: var(--site-text); border-bottom-color: currentColor; }
.seg { display: inline-flex; gap: 0; }
.seg button {
  padding: 0.35rem 0.8rem; font-size: 0.78rem; font-weight: 600; cursor: pointer;
  border-radius: 0; margin-left: -1px;
}
.seg button:first-child { border-radius: 999px 0 0 999px; margin-left: 0; }
.seg button:last-child { border-radius: 0 999px 999px 0; }
.seg button[aria-pressed='true'] { background: var(--site-text); color: var(--site-bg); border-color: var(--site-text); }
.seg--small { margin: -0.3rem 0 0.85rem; flex-wrap: wrap; }
.seg--small button { padding: 0.2rem 0.65rem; font-size: 0.72rem; }

/* ═══ Top bar tools ═══════════════════════════════════════════════════════ */
.topbar__tag { margin-right: auto; margin-left: 1rem; }
.topbar__tools { display: flex; align-items: center; gap: 0.3rem; }
.live {
  display: inline-flex; align-items: center; gap: 0.35rem; margin-right: 0.35rem;
  font-size: 0.72rem; font-weight: 600; color: var(--site-text-muted);
}
.live__dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--site-success); }
.live[data-state='paused'] .live__dot { background: var(--site-text-dim); }
.live[data-state='offline'] .live__dot { background: var(--site-danger); }
@media (prefers-reduced-motion: no-preference) {
  .live[data-state='live'] .live__dot { animation: live-pulse 2s ease-in-out infinite; }
}
@keyframes live-pulse { 50% { opacity: 0.35; } }
@media (max-width: 640px) {
  .topbar__tag, .live__text { display: none; }
  .icon-btn { min-width: 1.8rem; height: 1.8rem; }
}

/* ═══ Banners ═════════════════════════════════════════════════════════════ */
.banners { max-width: var(--col); margin: 0 auto; padding: 0 var(--gutter); }
.banners:empty { display: none; }
.banner {
  --state: var(--site-info);
  display: flex; align-items: flex-start; gap: 0.75rem; margin-top: 0.85rem;
  padding: 0.8rem 1rem; border-radius: var(--site-radius-sm);
  border: 1px solid color-mix(in srgb, var(--state) 45%, var(--site-border));
  background: color-mix(in srgb, var(--state) 10%, var(--site-surface-opaque));
  font-size: 0.875rem;
}
.banner[data-level='warning'] { --state: var(--site-warning); }
.banner[data-level='critical'] { --state: var(--site-danger); }
.banner p { margin: 0; flex: 1; }
.banner a { font-weight: 600; }
.banner__close {
  flex: none; border: 0; background: none; color: var(--site-text-muted);
  font-size: 1.2rem; line-height: 1; cursor: pointer;
}

/* ═══ Hero meta line ══════════════════════════════════════════════════════ */
.hero__live {
  margin: calc(clamp(2.5rem, 8vw, 4.5rem) * -0.6) 0 clamp(1.5rem, 5vw, 2.5rem);
  text-align: center; color: var(--site-text-dim); font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
@media (min-width: 720px) { .hero__live { text-align: left; } }
.hero--page { display: block; margin-bottom: 1.5rem; text-align: left; justify-items: start; }
.hero--page .hero__headline { font-size: clamp(1.6rem, 4vw, 2.6rem); }
.crumbs { margin: 0 0 1rem; font-size: 0.8rem; color: var(--site-text-dim); }
.crumbs a { text-decoration: none; }

/* ═══ KPI tiles ═══════════════════════════════════════════════════════════ */
.kpis {
  list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
}
.kpi {
  display: flex; flex-direction: column; gap: 0.15rem; padding: 0.85rem 1rem;
  border: 1px solid var(--site-border); border-radius: var(--site-radius-sm);
  background-color: var(--site-glass-tint); box-shadow: var(--site-shadow-sm);
}
.kpi__label {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--site-text-dim);
}
.kpi__value {
  font-family: var(--site-font-display); font-size: 1.45rem; font-weight: 500;
  letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
}
.kpi[data-status] .kpi__value { color: var(--state); }
.kpi[data-status='unknown'] .kpi__value { color: var(--site-text-muted); }
.kpi__sub { font-size: 0.72rem; color: var(--site-text-dim); }

/* ═══ Group chips ═════════════════════════════════════════════════════════ */
.groups {
  list-style: none; margin: 0 0 1.25rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem;
}
.group {
  display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.45rem 0.85rem;
  border: 1px solid var(--site-border); border-radius: 999px; background-color: var(--site-glass-tint);
  text-decoration: none; font-size: 0.8rem;
}
.group__name { font-weight: 600; }
.group__n, .group__up { color: var(--site-text-dim); font-variant-numeric: tabular-nums; }

/* ═══ Toolbar ═════════════════════════════════════════════════════════════ */
.toolbar {
  position: sticky; top: calc(var(--topbar-h) + 0.5rem); z-index: 10;
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
  margin: 0 0 1.25rem; padding: 0.55rem; border: 1px solid var(--site-border);
  border-radius: var(--site-radius); background: var(--site-surface-opaque);
}
.toolbar__search { flex: 1 1 12rem; }
.toolbar input { width: 100%; padding: 0.4rem 0.9rem; font-size: 0.85rem; }
.toolbar select { padding: 0.35rem 0.7rem; font-size: 0.78rem; }

/* ═══ Tier collapse ═══════════════════════════════════════════════════════ */
.tier[data-tier] { position: relative; }
.tier__toggle {
  position: absolute; right: 0; top: -0.2rem; font: inherit; font-size: 0.7rem;
  color: var(--site-text-dim); background: none; border: 0; cursor: pointer;
}
.tier[data-collapsed] .tier__list { display: none; }

/* ═══ Card additions ══════════════════════════════════════════════════════ */
.svc__anchor { color: inherit; text-decoration: none; }
.svc__anchor:hover { text-decoration: underline; text-underline-offset: 3px; }
.svc:target, .svc[data-flash] { border-color: var(--site-border-bright); box-shadow: 0 0 0 3px color-mix(in srgb, var(--state) 25%, transparent); }
.svc__chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.6rem; padding-left: 1.35rem; }
.chip {
  padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700;
  color: var(--state); border: 1px solid color-mix(in srgb, var(--state) 40%, transparent);
  background: color-mix(in srgb, var(--state) 9%, transparent); text-decoration: none;
}
.spark { width: 5rem; height: 1.5rem; flex: none; overflow: visible; }
.spark__line { fill: none; stroke: var(--state); stroke-width: 1.4; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.spark__fail { stroke: var(--site-danger); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
@media (max-width: 560px) { .spark { display: none; } }

[data-range='days'] { display: none; }
html[data-hist='days'] [data-range='days'] { display: flex; }
html[data-hist='days'] [data-range='hours'] { display: none; }

.svc__stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: 0.4rem 0.75rem;
  margin: 0.85rem 0 0; padding-top: 0.75rem; border-top: 1px solid var(--site-border);
}
.svc__stats div { min-width: 0; }
.svc__stats dt { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--site-text-dim); }
.svc__stats dd { margin: 0; font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums; }

.svc__more { margin-top: 0.75rem; }
.svc__more > summary {
  cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--site-text-muted);
  list-style: none; display: inline-flex; align-items: center; gap: 0.35rem;
}
.svc__more > summary::-webkit-details-marker { display: none; }
.svc__more > summary::before { content: '▸'; transition: transform 0.15s var(--ease-glass); }
.svc__more[open] > summary::before { transform: rotate(90deg); }
.detail {
  display: grid; gap: 1rem; margin-top: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
}
.detail__block { min-width: 0; }
.detail__block--wide { grid-column: 1 / -1; }
.detail h4, .dev h4 {
  margin: 0 0 0.5rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--site-text-dim);
}
.detail p { margin: 0.4rem 0 0; font-size: 0.75rem; }
.detail__links { grid-column: 1 / -1; font-size: 0.75rem; color: var(--site-text-dim); }
.detail__links a { color: var(--site-text-muted); }

.dt { width: 100%; border-collapse: collapse; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.dt th, .dt td { padding: 0.3rem 0.4rem; text-align: right; border-bottom: 1px solid var(--site-border); white-space: nowrap; }
.dt th:first-child, .dt td:first-child { text-align: left; }
.dt thead th { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--site-text-dim); }
.detail__block .dt { display: block; overflow-x: auto; }

.kv { margin: 0; display: grid; gap: 0.3rem; font-size: 0.78rem; }
.kv div { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px dashed var(--site-border); padding-bottom: 0.25rem; }
.kv dt { color: var(--site-text-dim); flex: none; }
.kv dd { margin: 0; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.kv--grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); column-gap: 1.5rem;
  padding: 1rem 1.25rem; border: 1px solid var(--site-border); border-radius: var(--site-radius);
  background-color: var(--site-glass-tint);
}
.shell--page .kv--grid { margin-bottom: 1.75rem; }

/* Charts */
.chart { margin: 0.75rem 0 0; }
.chart svg { width: 100%; height: auto; display: block; }
.chart figcaption { font-size: 0.7rem; color: var(--site-text-dim); display: flex; align-items: center; gap: 0.35rem; }
.chart__grid { stroke: var(--site-border); stroke-width: 1; }
.chart__axis { fill: var(--site-text-dim); font-size: 10px; text-anchor: end; }
.chart__axis--budget { fill: var(--site-danger); }
.chart__budget { stroke: var(--site-danger); stroke-dasharray: 4 4; stroke-width: 1; opacity: 0.7; }
.chart__avg { fill: none; stroke: var(--site-text); stroke-width: 1.8; stroke-linejoin: round; }
.chart__p95 { fill: none; stroke: var(--site-warning); stroke-width: 1.3; stroke-dasharray: 3 2; stroke-linejoin: round; }
.key { display: inline-block; width: 0.9rem; height: 2px; margin-left: 0.4rem; }
.key--avg { background: var(--site-text); }
.key--p95 { background: var(--site-warning); }

.histo {
  list-style: none; margin: 0.3rem 0 0; padding: 0; display: flex; align-items: flex-end; gap: 3px; height: 5rem;
}
.histo li { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; min-width: 0; }
.histo__bar { display: block; min-height: 1px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--site-text) 55%, transparent); }
.histo__label { font-size: 0.55rem; color: var(--site-text-dim); text-align: center; white-space: nowrap; overflow: hidden; }

.dist__title { margin: 0.75rem 0 0.3rem !important; font-size: 0.7rem !important; font-weight: 700; color: var(--site-text-dim); }
.dist, .phases { display: flex; height: 0.6rem; border-radius: 999px; overflow: hidden; background: var(--bar-empty); }
.dist__seg, .phase { display: block; height: 100%; }
.dist__legend { list-style: none; margin: 0.4rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 0.85rem; font-size: 0.7rem; color: var(--site-text-muted); }
.dist__legend li { display: inline-flex; align-items: center; gap: 0.3rem; }
.dist__key, .phase__key { width: 0.55rem; height: 0.55rem; border-radius: 2px; display: inline-block; }
[data-k='2xx'] { background: var(--site-success); }
[data-k='3xx'] { background: var(--site-info); }
[data-k='4xx'] { background: var(--site-warning); }
[data-k='5xx'] { background: var(--site-danger); }
[data-k='none'] { background: var(--site-text-dim); }
[data-k='dns'] { background: color-mix(in srgb, var(--site-text) 22%, transparent); }
[data-k='connect'] { background: color-mix(in srgb, var(--site-text) 40%, transparent); }
[data-k='tls'] { background: color-mix(in srgb, var(--site-text) 58%, transparent); }
[data-k='wait'] { background: var(--site-info); }
[data-k='transfer'] { background: var(--site-success); }

.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; font-size: 0.72rem; }
.cats li { display: grid; grid-template-columns: 9rem 1fr auto; gap: 0.5rem; align-items: center; }
.cats__bar { height: 0.4rem; border-radius: 999px; background: var(--bar-empty); overflow: hidden; }
.cats__bar span { display: block; height: 100%; background: var(--site-danger); }
.cats__n { font-variant-numeric: tabular-nums; color: var(--site-text-muted); }

.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; font-size: 0.72rem; font-variant-numeric: tabular-nums; }
.checks li {
  display: grid; grid-template-columns: 0.6rem 6.5rem 6rem 4.5rem 1fr; gap: 0.4rem; align-items: center;
  padding: 0.2rem 0; border-bottom: 1px dashed var(--site-border);
}
.checks__dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--state); }
.checks__st { color: var(--state); font-weight: 600; }
.checks__info { color: var(--site-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 560px) { .checks li { grid-template-columns: 0.6rem 5.5rem 1fr 4rem; } .checks__info { display: none; } }

/* Budget meter */
.meter { height: 0.35rem; margin-top: 0.8rem; border-radius: 999px; background: var(--bar-empty); overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--state); }

/* ═══ Incidents & maintenance ═════════════════════════════════════════════ */
.incidents { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.inc {
  padding: 0.85rem 1.1rem; border: 1px solid var(--site-border); border-radius: var(--site-radius-sm);
  background-color: var(--site-glass-tint);
}
.inc__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.inc__title { font-weight: 600; text-decoration: none; flex: 1 1 auto; }
a.inc__title:hover { text-decoration: underline; }
.inc__state { font-size: 0.72rem; color: var(--site-text-dim); font-weight: 600; }
.inc__meta { margin: 0.3rem 0 0; font-size: 0.75rem; color: var(--site-text-dim); }
.inc__body { margin: 0.35rem 0 0; font-size: 0.82rem; color: var(--site-text-muted); }
.impact {
  --state: var(--site-text-dim);
  padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--state); border: 1px solid color-mix(in srgb, var(--state) 40%, transparent);
}
.impact[data-impact='minor'] { --state: var(--site-warning); }
.impact[data-impact='major'], .impact[data-impact='critical'] { --state: var(--site-danger); }
.impact[data-impact='maintenance'] { --state: var(--site-info); }
.inc[data-state='open'] { border-color: color-mix(in srgb, var(--site-danger) 40%, var(--site-border)); }
.empty { margin: 0; padding: 1rem 1.2rem; border: 1px solid var(--site-border); border-radius: var(--site-radius-sm); background-color: var(--site-glass-tint); color: var(--site-text-muted); font-size: 0.85rem; }
.more { margin: 0.75rem 0 0; font-size: 0.8rem; color: var(--site-text-dim); }
.more a { color: var(--site-text-muted); }

.timeline { list-style: none; margin: 0; padding: 0 0 0 1rem; border-left: 2px solid var(--site-border); }
.timeline__item { position: relative; padding: 0 0 1.1rem 0.9rem; font-size: 0.875rem; }
.timeline__item::before {
  content: ''; position: absolute; left: -1.42rem; top: 0.35rem; width: 0.7rem; height: 0.7rem; border-radius: 50%;
  background: var(--site-surface-opaque); border: 2px solid var(--site-text-dim);
}
.timeline__item[data-state='resolved']::before { border-color: var(--site-success); }
.timeline__item[data-state='investigating']::before { border-color: var(--site-danger); }
.timeline__item[data-state='identified']::before, .timeline__item[data-state='monitoring']::before { border-color: var(--site-warning); }
.timeline__state { font-weight: 700; margin-right: 0.5rem; }
.timeline__item time { color: var(--site-text-dim); font-size: 0.78rem; }
.timeline__item p { margin: 0.25rem 0 0; white-space: pre-wrap; }
.postmortem { padding: 1rem 1.25rem; border: 1px solid var(--site-border); border-radius: var(--site-radius); background-color: var(--site-glass-tint); white-space: pre-wrap; font-size: 0.875rem; line-height: 1.6; }
.filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.25rem; font-size: 0.78rem; }
.filters a, .filters button {
  padding: 0.25rem 0.75rem; border: 1px solid var(--site-border); border-radius: 999px; text-decoration: none;
  color: var(--site-text-muted); background: var(--site-glass-tint); font: inherit; cursor: pointer;
}
.filters a[aria-current='page'] { background: var(--site-text); color: var(--site-bg); }

/* ═══ Calendar ════════════════════════════════════════════════════════════ */
.cal { padding: 1rem 1.25rem; border: 1px solid var(--site-border); border-radius: var(--site-radius); background-color: var(--site-glass-tint); overflow-x: auto; }
.cal__grid {
  list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column;
  grid-template-rows: repeat(7, 0.95rem); grid-auto-columns: 0.95rem; gap: 3px;
}
.cal__day { border-radius: 3px; background: var(--bar-empty); }
.cal__day[data-b='pad'] { background: transparent; }
.cal__day[data-inc] { outline: 1.5px solid var(--site-text); outline-offset: -1.5px; }
[data-b='up'].cal__day, .legend__sw[data-b='up'] { background: var(--site-success); }
[data-b='blip'].cal__day, .legend__sw[data-b='blip'] { background: linear-gradient(to bottom, var(--site-warning) 0 25%, var(--site-success) 25%); }
[data-b='degraded'].cal__day, .legend__sw[data-b='degraded'] { background: var(--site-warning); }
[data-b='down'].cal__day, .legend__sw[data-b='down'] { background: var(--site-danger); }
[data-b='maint'].cal__day { background: var(--site-info); }
.legend { list-style: none; margin: 0.75rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.7rem; color: var(--site-text-dim); }
.legend li { display: inline-flex; align-items: center; gap: 0.35rem; }
.legend__sw { width: 0.7rem; height: 0.7rem; border-radius: 2px; display: inline-block; background: var(--bar-empty); }

/* ═══ Heatmap ═════════════════════════════════════════════════════════════ */
.hm { padding: 0.75rem 1rem; border: 1px solid var(--site-border); border-radius: var(--site-radius); background-color: var(--site-glass-tint); overflow-x: auto; }
.hm__table { border-collapse: separate; border-spacing: 2px; width: 100%; min-width: 34rem; font-size: 0.7rem; table-layout: fixed; }
.hm__table thead th:first-child { width: 9.5rem; }
.hm__table thead th { overflow: visible; white-space: nowrap; }
.hm__table th { font-weight: 600; color: var(--site-text-dim); text-align: left; white-space: nowrap; padding-right: 0.5rem; }
.hm__table thead th { font-size: 0.6rem; font-weight: 600; text-align: left; }
.hm__table th a { text-decoration: none; }
.hm__table td { height: 1.1rem; min-width: 0.7rem; border-radius: 3px; background: var(--bar-empty); }
.hm__table td[data-l='0'] { background: color-mix(in srgb, var(--site-success) 45%, transparent); }
.hm__table td[data-l='1'] { background: var(--site-success); }
.hm__table td[data-l='2'] { background: color-mix(in srgb, var(--site-warning) 60%, transparent); }
.hm__table td[data-l='3'] { background: var(--site-warning); }
.hm__table td[data-l='4'] { background: var(--site-danger); }

/* ═══ Leaderboard ═════════════════════════════════════════════════════════ */
.lb { list-style: none; margin: 0; padding: 0.75rem 1.1rem; border: 1px solid var(--site-border); border-radius: var(--site-radius); background-color: var(--site-glass-tint); display: grid; gap: 0.45rem; }
.lb li { display: grid; grid-template-columns: 1.2rem minmax(6rem, 10rem) 1fr auto; gap: 0.6rem; align-items: center; font-size: 0.8rem; }
.lb__rank { color: var(--site-text-dim); font-variant-numeric: tabular-nums; }
.lb__name { text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb__track { position: relative; height: 0.5rem; border-radius: 999px; background: var(--bar-empty); overflow: hidden; }
.lb__p95, .lb__avg { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; }
.lb__p95 { background: color-mix(in srgb, var(--site-warning) 45%, transparent); }
.lb__avg { background: var(--site-text); }
.lb__v { font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 0.75rem; }
@media (max-width: 560px) { .lb li { grid-template-columns: 1.2rem 1fr auto; } .lb__track { display: none; } }

/* ═══ Developers ══════════════════════════════════════════════════════════ */
.dev {
  display: grid; gap: 1.25rem; padding: 1.1rem 1.25rem; border: 1px solid var(--site-border);
  border-radius: var(--site-radius); background-color: var(--site-glass-tint);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
}
.dev__col { min-width: 0; }
.dev__col h4 + * { margin-top: 0; }
.dev__col h4:not(:first-child) { margin-top: 1rem; }
.endpoints { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; font-size: 0.75rem; }
.endpoints li { display: grid; gap: 0.1rem; }
.endpoints a { text-decoration: none; }
.endpoints code { color: var(--site-text); }
.endpoints span { color: var(--site-text-dim); }
.badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 0.75rem; }
.snippet { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.5rem; align-items: center; margin-bottom: 0.6rem; font-size: 0.72rem; }
.snippet span { grid-column: 1 / -1; color: var(--site-text-dim); font-weight: 600; }
.snippet code {
  display: block; padding: 0.4rem 0.6rem; border-radius: 8px; background: var(--site-bg-subtle);
  overflow-x: auto; white-space: nowrap;
}

/* ═══ Report ══════════════════════════════════════════════════════════════ */
.report { padding: 0.75rem 1rem; border: 1px solid var(--site-border); border-radius: var(--site-radius); background-color: var(--site-glass-tint); overflow-x: auto; }
.dt--report { font-size: 0.8rem; }
.dt--report tbody th { text-align: left; font-weight: 600; }
.dt--report tbody th a { text-decoration: none; }
.dt--report tfoot th, .dt--report tfoot td { font-weight: 600; border-bottom: 0; }
.svc__bars--mini { height: 1rem; margin: 0; min-width: 9rem; }

/* ═══ Floating UI ═════════════════════════════════════════════════════════ */
.tip {
  position: fixed; z-index: 60; max-width: 20rem; padding: 0.45rem 0.65rem; pointer-events: none;
  border-radius: 10px; border: 1px solid var(--site-border-bright); background: var(--site-surface-opaque);
  color: var(--site-text); font-size: 0.72rem; line-height: 1.45; box-shadow: var(--site-shadow-sm);
  white-space: pre-line;
}
.toast {
  position: fixed; left: 50%; bottom: calc(1.25rem + env(safe-area-inset-bottom)); z-index: 60;
  transform: translateX(-50%); padding: 0.55rem 1rem; border-radius: 999px;
  background: var(--site-text); color: var(--site-bg); font-size: 0.8rem; font-weight: 600;
  box-shadow: var(--site-shadow-sm);
}
.help {
  max-width: min(26rem, calc(100vw - 2rem)); padding: 1.25rem 1.5rem; color: var(--site-text);
  border: 1px solid var(--site-border-bright); border-radius: var(--site-radius); background: var(--site-surface-opaque);
}
.help::backdrop { background: color-mix(in srgb, var(--site-bg) 60%, transparent); }
.help h2 { margin: 0 0 0.85rem; font-size: 1rem; }
.help form { margin-top: 1rem; text-align: right; }

/* ═══ Density ═════════════════════════════════════════════════════════════ */
html[data-density='compact'] .svc { padding: 0.6rem 0.9rem; }
html[data-density='compact'] .svc__desc,
html[data-density='compact'] .svc__stats,
html[data-density='compact'] .spark { display: none; }
html[data-density='compact'] .svc__bars { height: 1.1rem; margin-top: 0.5rem; }
html[data-density='compact'] .svc__legend { margin-top: 0.3rem; }
html[data-density='compact'] .tier__list { gap: 0.4rem; }
html[data-density='compact'] .hero { margin-bottom: 1.5rem; }
html[data-density='compact'] .globe { --globe-size: min(40vw, 22dvh, 9rem); }

/* ═══ Print ═══════════════════════════════════════════════════════════════
   A status page gets printed for a postmortem or an SLA review: ink on paper,
   no glass, no globe, every panel open. */
@media print {
  .site-aurora, .backdrop, .globe, .topbar__tools, .toolbar, .tip, .toast, .help,
  .banner__close, .skip, .seg, .tier__toggle, [data-copy], [data-print], #developers { display: none !important; }
  :root { --site-glass-tint: transparent; --site-shadow-sm: none; }
  body { background: #fff; color: #000; }
  .topbar { position: static; background: none; border: 0; }
  .svc, .kpi, .inc, .cal, .hm, .lb, .dev, .report, .kv--grid { break-inside: avoid; box-shadow: none; }
  [data-range='days'] { display: none !important; }
  [data-range='hours'] { display: flex !important; }
  a { text-decoration: none; }
}
`

// enhanceJS is the progressive layer. Everything it does is optional: the
// server-rendered page is complete without it.
const enhanceJS = `
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var P = 'rmh-status:';
  function get(k) { try { return window.localStorage.getItem(P + k); } catch (e) { return null; } }
  function set(k, v) { try { if (v == null) window.localStorage.removeItem(P + k); else window.localStorage.setItem(P + k, v); } catch (e) {} }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  var toastEl = $('[data-toast]'), toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }
  function copy(text, what) {
    function done() { toast((what || 'Copied') + ' to clipboard'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed'); });
      return;
    }
    var ta = doc.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    try { doc.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); }
    doc.body.removeChild(ta);
  }

  /* ── Theme ─────────────────────────────────────────────────────────── */
  var THEMES = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    var b = $('[data-theme-btn]');
    if (b) b.title = 'Theme: ' + t + ' (t)';
    /* The globe resolves its cage ink on resize. */
    window.dispatchEvent(new Event('resize'));
    paintFavicon();
  }
  function cycleTheme() {
    var cur = get('theme') || 'auto';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    set('theme', next === 'auto' ? null : next);
    applyTheme(next);
    toast('Theme: ' + next);
  }

  /* ── Time zone ─────────────────────────────────────────────────────── */
  var tzLocal = get('tz') === 'local';
  var fmts = {};
  function fmt(kind) {
    if (!fmts[kind]) {
      var o = kind === 'time' ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
        : kind === 'date' ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
      try { fmts[kind] = new Intl.DateTimeFormat(undefined, o); } catch (e) { fmts[kind] = null; }
    }
    return fmts[kind];
  }
  function applyTZ(ctx) {
    $$('time[data-ts]', ctx).forEach(function (el) {
      if (!el.hasAttribute('data-utc')) el.setAttribute('data-utc', el.textContent);
      if (tzLocal) {
        var f = fmt(el.getAttribute('data-fmt') || 'datetime');
        if (f) el.textContent = f.format(new Date(+el.getAttribute('data-ts')));
      } else {
        el.textContent = el.getAttribute('data-utc');
      }
    });
    var b = $('[data-tz]');
    if (b) b.textContent = tzLocal ? 'Local' : 'UTC';
  }
  function toggleTZ() { tzLocal = !tzLocal; set('tz', tzLocal ? 'local' : null); applyTZ(); toast(tzLocal ? 'Showing local time' : 'Showing UTC'); }

  /* ── Density + history range ───────────────────────────────────────── */
  function toggleDensity() {
    var on = root.getAttribute('data-density') !== 'compact';
    if (on) root.setAttribute('data-density', 'compact'); else root.removeAttribute('data-density');
    set('density', on ? 'compact' : null);
    var b = $('[data-density]');
    if (b) b.setAttribute('aria-pressed', String(on));
  }
  function setRange(r) {
    if (r === 'days') root.setAttribute('data-hist', 'days'); else root.removeAttribute('data-hist');
    set('range', r === 'days' ? 'days' : null);
    $$('[data-range-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-range-btn') === r)); });
  }

  /* ── Filter, search, sort, collapse ────────────────────────────────── */
  var state = { q: '', filter: get('filter') || 'all', sort: get('sort') || 'default', incFilter: 'all' };
  var RANK = { down: 0, degraded: 1, maintenance: 2, unknown: 3, up: 4 };
  function applyView() {
    var cards = $$('#services li.svc');
    var shown = 0;
    cards.forEach(function (c, i) {
      if (!c.hasAttribute('data-idx')) c.setAttribute('data-idx', String(i));
      var hay = (c.getAttribute('data-name') || '') + ' ' + (c.getAttribute('data-group') || '').toLowerCase();
      var ok = (!state.q || hay.indexOf(state.q) !== -1) && (state.filter !== 'issues' || c.getAttribute('data-issue') === 'true');
      if (ok) { c.removeAttribute('data-hidden'); shown++; } else c.setAttribute('data-hidden', '');
    });
    $$('#services .tier').forEach(function (t) {
      var any = $$('li.svc:not([data-hidden])', t).length > 0;
      if (any) t.removeAttribute('data-hidden'); else t.setAttribute('data-hidden', '');
      var slug = t.getAttribute('data-tier');
      var collapsed = get('collapsed:' + slug) === '1';
      if (collapsed) t.setAttribute('data-collapsed', ''); else t.removeAttribute('data-collapsed');
      var tg = $('[data-collapse]', t);
      if (tg) { tg.setAttribute('aria-expanded', String(!collapsed)); tg.textContent = collapsed ? 'Show' : 'Hide'; }
      var list = $('.tier__list', t);
      if (!list) return;
      var items = $$('li.svc', list);
      items.sort(function (a, b) {
        var k = state.sort;
        if (k === 'name') return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
        if (k === 'uptime') return (+a.getAttribute('data-uptime')) - (+b.getAttribute('data-uptime'));
        if (k === 'latency') return (+b.getAttribute('data-latency')) - (+a.getAttribute('data-latency'));
        if (k === 'status') return (RANK[a.getAttribute('data-status')] || 0) - (RANK[b.getAttribute('data-status')] || 0);
        return (+a.getAttribute('data-idx')) - (+b.getAttribute('data-idx'));
      });
      items.forEach(function (it) { list.appendChild(it); });
    });
    var none = $('[data-no-results]');
    if (none) none.hidden = shown !== 0 || cards.length === 0;
    $$('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === state.filter)); });
    var sel = $('[data-sort]');
    if (sel) sel.value = state.sort;
    $$('[data-inc-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-inc-filter') === state.incFilter)); });
    $$('.incidents li.inc[data-kind]').forEach(function (li) {
      var f = state.incFilter;
      var ok = f === 'all' || li.getAttribute('data-state') === f || li.getAttribute('data-kind') === f;
      if (ok) li.removeAttribute('data-hidden'); else li.setAttribute('data-hidden', '');
    });
  }

  /* ── Tooltips ──────────────────────────────────────────────────────── */
  var tip = $('[data-tip]');
  var TIP_SEL = '.bar[title], .cal__day[title], .hm__table td[title], .histo li[title], .dist__seg[title], .phase[title]';
  function initTips(ctx) {
    $$(TIP_SEL, ctx).forEach(function (el) {
      el.setAttribute('data-tiptext', el.getAttribute('title').split(' — ').join('\n'));
      el.removeAttribute('title');
    });
  }
  function showTip(el, x, y) {
    if (!tip) return;
    tip.textContent = el.getAttribute('data-tiptext');
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    var top = y - r.height - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  doc.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tiptext]');
    if (el) showTip(el, e.clientX, e.clientY);
  });
  doc.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-tiptext]');
    if (el) showTip(el, e.clientX, e.clientY); else if (tip) tip.hidden = true;
  });
  doc.addEventListener('pointerout', function (e) {
    if (tip && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-tiptext]'))) tip.hidden = true;
  });
  window.addEventListener('scroll', function () { if (tip) tip.hidden = true; }, { passive: true });

  /* ── Relative times + countdowns ───────────────────────────────────── */
  function human(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }
  var lastUpdate = Date.now();
  var REFRESH = 30000;
  var nextAt = Date.now() + REFRESH;
  var paused = get('paused') === '1';
  function tick() {
    var now = Date.now();
    $$('[data-ago]').forEach(function (el) { el.textContent = human(now - (+el.getAttribute('data-ago'))) + ' ago'; });
    $$('[data-countdown]').forEach(function (el) {
      var left = +el.getAttribute('data-countdown') - now;
      el.textContent = left > 0 ? (el.getAttribute('data-prefix') || 'in') + ' ' + human(left) : 'now';
    });
    var u = $('[data-updated]');
    if (u) u.textContent = 'Updated ' + (now - lastUpdate < 3000 ? 'just now' : human(now - lastUpdate) + ' ago');
    var c = $('[data-countdown-refresh]');
    if (c) c.textContent = !live ? '' : paused ? ' · live updates paused' : offline ? ' · offline, retrying in ' + human(nextAt - now) : ' · next update in ' + human(nextAt - now);
    if (live && !paused && now >= nextAt && !doc.hidden) refresh();
  }

  /* ── Favicon + title ───────────────────────────────────────────────── */
  function paintFavicon() {
    var link = $('link[data-favicon]');
    if (!link) return;
    var col = getComputedStyle(root).getPropertyValue('--signal').trim() || '#888';
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><g fill='none' stroke='#888' stroke-width='2'><circle cx='16' cy='16' r='13'/><ellipse cx='16' cy='16' rx='13' ry='5'/></g><circle cx='16' cy='16' r='6' fill='" + col + "'/></svg>";
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function issueCount() { return $$('#services li.svc[data-issue="true"]').length; }
  function retitle() {
    var h = $('.hero__headline');
    if (!h) return;
    var n = issueCount();
    doc.title = (n ? '(' + n + ') ' : '') + h.textContent + ' — RMH Studios status';
  }

  /* ── Notifications ─────────────────────────────────────────────────── */
  var notifyOn = get('notify') === '1' && window.Notification && Notification.permission === 'granted';
  function snapshot() {
    var m = {};
    $$('#services li.svc').forEach(function (c) {
      m[c.getAttribute('data-svc')] = { status: c.getAttribute('data-status'), name: ($('.svc__name', c) || c).textContent.trim() };
    });
    return m;
  }
  var LABEL = { up: 'operational', degraded: 'degraded', down: 'down', maintenance: 'in maintenance', unknown: 'unknown' };
  function announce(before, after) {
    var changes = [];
    Object.keys(after).forEach(function (k) {
      if (before[k] && before[k].status !== after[k].status) changes.push(after[k].name + ' is ' + (LABEL[after[k].status] || after[k].status));
    });
    if (!changes.length) return;
    toast(changes.join(' · '));
    if (notifyOn) { try { new Notification('RMH Studios status', { body: changes.join('\n'), tag: 'rmh-status' }); } catch (e) {} }
  }
  function enableNotify() {
    if (!window.Notification) { toast('Notifications are not supported here'); return; }
    if (notifyOn) { notifyOn = false; set('notify', null); toast('Notifications off'); return; }
    Notification.requestPermission().then(function (p) {
      notifyOn = p === 'granted';
      set('notify', notifyOn ? '1' : null);
      toast(notifyOn ? 'You will be notified when a service changes state' : 'Notifications blocked');
    });
  }

  /* ── Live refresh ──────────────────────────────────────────────────── */
  var live = !!$('[data-live]');
  var offline = false, failures = 0, inflight = false;
  var indicator = $('[data-live-indicator]');
  function setIndicator() {
    if (!indicator) return;
    indicator.hidden = !live;
    var st = paused ? 'paused' : offline ? 'offline' : 'live';
    indicator.setAttribute('data-state', st);
    var t = $('.live__text', indicator);
    if (t) t.textContent = st === 'live' ? 'Live' : st === 'paused' ? 'Paused' : 'Offline';
    var pb = $('[data-pause]');
    if (pb) { pb.setAttribute('aria-pressed', String(paused)); pb.textContent = paused ? '▶' : '❚❚'; }
  }
  function refresh() {
    if (!live || inflight) return;
    inflight = true;
    nextAt = Date.now() + REFRESH;
    var before = snapshot();
    var open = $$('details[data-detail][open]').map(function (d) { return d.getAttribute('data-detail'); });
    fetch(window.location.pathname + window.location.search, { cache: 'no-store', headers: { 'Accept': 'text/html' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) {
        var next = new DOMParser().parseFromString(html, 'text/html');
        $$('[data-live]').forEach(function (region) {
          var src = next.querySelector('[data-live="' + region.getAttribute('data-live') + '"]');
          if (src && src.innerHTML !== region.innerHTML) region.innerHTML = src.innerHTML;
        });
        var st = next.documentElement.getAttribute('data-status');
        if (st) root.setAttribute('data-status', st);
        /* The pins belong to the globe's frame loop — recolour, never replace. */
        $$('[data-pin]').forEach(function (pin) {
          var np = next.querySelector('[data-pin][data-svc="' + pin.getAttribute('data-svc') + '"]');
          if (np) { pin.setAttribute('data-status', np.getAttribute('data-status')); pin.title = np.title; }
        });
        open.forEach(function (slug) { var d = $('details[data-detail="' + slug + '"]'); if (d) d.open = true; });
        afterSwap(doc);
        announce(before, snapshot());
        lastUpdate = Date.now();
        offline = false; failures = 0;
      })
      .catch(function () {
        offline = true; failures++;
        nextAt = Date.now() + Math.min(5 * 60000, REFRESH * Math.pow(2, failures - 1));
      })
      .then(function () { inflight = false; setIndicator(); tick(); });
  }
  function togglePause() {
    paused = !paused;
    set('paused', paused ? '1' : null);
    if (!paused) nextAt = Date.now() + 1000;
    setIndicator(); tick();
    toast(paused ? 'Live updates paused' : 'Live updates resumed');
  }
  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden && live && !paused && Date.now() - lastUpdate > REFRESH) refresh();
  });

  function afterSwap(ctx) {
    initTips(ctx);
    applyTZ(ctx);
    applyView();
    retitle();
    paintFavicon();
    $$('[data-dismiss]').forEach(function (b) {
      if (get('dismissed:' + b.getAttribute('data-dismiss')) === '1') b.closest('.banner').setAttribute('data-hidden', '');
    });
    tick();
  }

  /* ── Summary ───────────────────────────────────────────────────────── */
  function summary() {
    var h = $('.hero__headline');
    var lines = [(h ? h.textContent : 'Status') + ' — RMH Studios (' + new Date().toUTCString() + ')'];
    $$('#services li.svc').forEach(function (c) {
      var name = ($('.svc__name', c) || c).textContent.trim();
      var pill = ($('.svc__pill', c) || {}).textContent || '';
      var up = ($('.svc__legend[data-range="hours"] .svc__uptime', c) || {}).textContent || '';
      lines.push('• ' + name + ': ' + pill + (up ? ' (' + up + ')' : ''));
    });
    lines.push(window.location.origin + '/');
    return lines.join('\n');
  }

  /* ── Events ────────────────────────────────────────────────────────── */
  doc.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    if (t.hasAttribute('data-theme-btn')) cycleTheme();
    else if (t.hasAttribute('data-tz')) toggleTZ();
    else if (t.hasAttribute('data-density')) toggleDensity();
    else if (t.hasAttribute('data-refresh')) { refresh(); toast('Refreshing…'); }
    else if (t.hasAttribute('data-pause')) togglePause();
    else if (t.hasAttribute('data-help')) { var dlg = $('[data-help-dialog]'); if (dlg && dlg.showModal) dlg.showModal(); }
    else if (t.hasAttribute('data-filter')) { state.filter = t.getAttribute('data-filter'); set('filter', state.filter === 'all' ? null : state.filter); applyView(); }
    else if (t.hasAttribute('data-range-btn')) setRange(t.getAttribute('data-range-btn'));
    else if (t.hasAttribute('data-inc-filter')) { state.incFilter = t.getAttribute('data-inc-filter'); applyView(); }
    else if (t.hasAttribute('data-expand-all')) toggleAll();
    else if (t.hasAttribute('data-collapse')) {
      var slug = t.getAttribute('data-collapse');
      set('collapsed:' + slug, get('collapsed:' + slug) === '1' ? null : '1');
      applyView();
    }
    else if (t.hasAttribute('data-copy')) { var el = doc.getElementById(t.getAttribute('data-copy')); if (el) copy(el.textContent, 'Snippet copied'); }
    else if (t.hasAttribute('data-copy-link')) copy(window.location.origin + window.location.pathname + '#' + t.getAttribute('data-copy-link'), 'Link copied');
    else if (t.hasAttribute('data-copy-url')) copy(window.location.href, 'Link copied');
    else if (t.hasAttribute('data-copy-summary')) copy(summary(), 'Summary copied');
    else if (t.hasAttribute('data-notify')) enableNotify();
    else if (t.hasAttribute('data-print')) window.print();
    else if (t.hasAttribute('data-dismiss')) {
      set('dismissed:' + t.getAttribute('data-dismiss'), '1');
      t.closest('.banner').setAttribute('data-hidden', '');
    }
  });
  var search = $('[data-search]');
  if (search) search.addEventListener('input', function () { state.q = search.value.trim().toLowerCase(); applyView(); });
  var sortSel = $('[data-sort]');
  if (sortSel) sortSel.addEventListener('change', function () { state.sort = sortSel.value; set('sort', state.sort === 'default' ? null : state.sort); applyView(); });

  function toggleAll() {
    var ds = $$('details[data-detail]');
    var anyClosed = ds.some(function (d) { return !d.open && !d.closest('[data-hidden]'); });
    ds.forEach(function (d) { d.open = anyClosed; });
    var b = $('[data-expand-all]');
    if (b) b.textContent = anyClosed ? 'Collapse all' : 'Expand all';
  }

  doc.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
      if (e.key === 'Escape' && e.target.blur) e.target.blur();
      return;
    }
    switch (e.key) {
      case '/': if (search) { e.preventDefault(); search.focus(); } break;
      case 'i': state.filter = state.filter === 'issues' ? 'all' : 'issues'; set('filter', state.filter === 'all' ? null : state.filter); applyView(); break;
      case 'g': setRange(root.getAttribute('data-hist') === 'days' ? 'hours' : 'days'); break;
      case 'e': toggleAll(); break;
      case 'r': refresh(); toast('Refreshing…'); break;
      case 'p': if (live) togglePause(); break;
      case 'z': toggleTZ(); break;
      case 't': cycleTheme(); break;
      case 'c': toggleDensity(); break;
      case '?': var dlg = $('[data-help-dialog]'); if (dlg && dlg.showModal) dlg.showModal(); break;
    }
  });

  /* Deep link: open and flash the targeted service. */
  function focusHash() {
    var id = window.location.hash.slice(1);
    if (!id) return;
    var el = doc.getElementById(id);
    if (!el || !el.classList.contains('svc')) return;
    var d = $('details[data-detail]', el);
    if (d) d.open = true;
    el.setAttribute('data-flash', '');
    setTimeout(function () { el.removeAttribute('data-flash'); }, 2400);
  }
  window.addEventListener('hashchange', focusHash);
  /* A printed status page is a record: print every panel open. */
  window.addEventListener('beforeprint', function () { $$('details[data-detail]').forEach(function (d) { d.open = true; }); });

  /* ── Boot ──────────────────────────────────────────────────────────── */
  applyTheme(get('theme') || 'auto');
  setRange(root.getAttribute('data-hist') === 'days' ? 'days' : 'hours');
  var db = $('[data-density]');
  if (db) db.setAttribute('aria-pressed', String(root.getAttribute('data-density') === 'compact'));
  afterSwap(doc);
  setIndicator();
  focusHash();
  setInterval(tick, 1000);
})();
`
