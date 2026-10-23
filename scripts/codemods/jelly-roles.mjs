#!/usr/bin/env node
/* eslint-disable no-console -- codemod CLI reports what it found and changed */
/**
 * jelly-roles — move hand-rolled surfaces onto the glass role classes.
 *
 * Plasmatic Jelly (docs/plans/plasmatic-jelly/04-coverage-a11y-perf.md §2.4) reaches
 * a surface through its role class (`.glass-fill` / `.glass-pane` / `.glass-chrome` /
 * `.glass-overlay` / `.glass-inset`), the `components/ui` primitives and
 * `JELLY_SELECTOR`. A box built from `bg-site-surface border rounded-site` gets none of
 * it. This codemod finds those boxes and, where the rewrite is unambiguous, swaps the
 * hand-rolled background / hairline / radius for the role class.
 *
 * Usage:
 *   node scripts/codemods/jelly-roles.mjs [paths…]           dry run (default): print the plan
 *   node scripts/codemods/jelly-roles.mjs --write [paths…]   apply the safe rewrites
 *   node scripts/codemods/jelly-roles.mjs --report [paths…]  counts only (site / apps / games)
 *   --games                                                  also touch the full-screen dirs
 *
 * Paths default to `components app`. `components/ui/**` is never rewritten (the
 * primitives own their own roles) but is still counted by `--report`.
 *
 * What it rewrites — ONLY when every condition holds, otherwise it prints the site for
 * a human:
 *   - the surface tokens (`bg-site-surface|surface-opaque|bg|elevated[/nn]`, a bare
 *     `border`, a `rounded*`) sit together in ONE plain string literal that is the whole
 *     className, or the FIRST (unconditional) argument of `cn()` / `clsx()`;
 *   - none of them carries a variant prefix (`hover:`, `dark:` …);
 *   - the element is not a raw `<button>` (those go to `<Button>` by hand: props differ);
 *   - it is not `sticky` (chrome) and not positioned without an edge anchor.
 *
 * The rewrite drops `bg-site-{surface,surface-opaque,bg,elevated}[/nn]`, the bare
 * `border` (kept on fields: `.glass-inset` colours an edge but sets no width),
 * `border-site-border[/nn]` and `rounded-site` (the role supplies them),
 * keeps every other class (spacing, layout, `rounded-full`, accent borders …) and adds:
 *   - `glass-inset`   on `<input>` / `<textarea>` / `<select>` and `*Input` / `*Textarea` components;
 *   - `glass-overlay` when positioned + z-indexed + edge-anchored (the same detection as
 *     design-consistency rule 7);
 *   - `glass-fill`    otherwise (repeated content is the default). When it is the file's
 *     only surface, the plan marks it `pane?` so a reviewer can promote it.
 *
 * Raw `role="dialog"`, `role="switch"`, `type="range"` and `<select>` outside
 * `components/ui` are listed, never rewritten.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const REPORT = argv.includes('--report');
const GAMES = argv.includes('--games');
const roots = argv.filter((a) => !a.startsWith('--'));
const ROOTS = roots.length ? roots : ['components', 'app'];

/** Mirrors FULLSCREEN_TIER_DIRS in lib/__tests__/design-consistency.test.ts. */
const GAME_DIRS = new Set([
  'altair', 'bums-rush', 'cookgame', 'cursed-logic', 'daily-puzzles', 'dream-rift',
  'forest-explorer', 'gabriels-horn', 'game', 'house-always-wins', 'isleworks',
  'kowloon-knockout', 'laundry-sort', 'lights-out', 'massive-march', 'neon-driftway',
  'nightrail', 'rmh-farming-sim', 'signal-forge', 'slice-it', 'synapse-storm',
  'temple-of-joy', 'vega', 'velum2099', 'versecraft', 'void-breaker', 'rmhbox', 'blm',
  'pf2ecal', 'dunesday', 'rebar-rutabaga',
]);
const APP_DIRS = new Set([
  'rmhcode', 'rmhmusic', 'rmhstudy', 'rmhtube', 'rmhtype', 'rmhvibe', 'shared', 'studio',
  'rmhcalculator',
]);

function tierOf(file) {
  const parts = file.split(sep);
  if (parts[0] !== 'components') return 'site';
  if (GAME_DIRS.has(parts[1])) return 'games';
  if (APP_DIRS.has(parts[1])) return 'apps';
  return 'site';
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    try {
      if (statSync(dir).isFile()) out.push(dir);
    } catch {
      /* missing path: nothing to scan */
    }
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(p, out);
    } else if (e.name.endsWith('.tsx') && !/\.test\.tsx$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

// Same className capture as design-consistency.test.ts.
const CLASS_ATTR =
  /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{([\s\S]{0,1200}?)\}\s*(?=[\s/>]))/g;

const SURFACE_BG = /(?<![\w:/-])bg-(?:site-(?:surface|surface-opaque|bg|elevated)|\(--app-surface\))(?:\/[\w.[\]]+)?(?![\w-])/;
const ROUNDED = /(?<![\w:/-])rounded(?:-[\w[\]().-]+)?(?![\w-])/;
const BORDER = /(?<![\w:/-])border(?:-(?:\d|x|y|t|b|l|r|site-border))?[\w/-]*(?![\w-])/;
const ROLE = /glass-|app-glass|data-liquid/;

const positioned = /(?<![\w:-])(?:absolute|fixed)(?![\w-])/;
const stacked = /(?<![\w:-])z-(?:\d{1,3}|\[\d+\])(?![\w-])/;
const edgeAnchored = /(?<![\w:-])(?:top-full|bottom-full|mt-\d|mb-\d|left-0|right-0|inset-x-0)(?![\w-])/;
const sticky = /(?<![\w:-])sticky(?![\w-])/;

const DROP = [
  /^bg-site-(?:surface|surface-opaque|bg|elevated)(?:\/[\w.[\]]+)?$/,
  /^border$/,
  /^border-site-border(?:\/[\w.[\]]+)?$/,
  /^rounded-site$/,
];

function isSurface(value) {
  return SURFACE_BG.test(value) && ROUNDED.test(value) && BORDER.test(value) && !ROLE.test(value);
}

function lineAt(src, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** The JSX tag that owns the attribute at `idx` (nearest `<Tag` before it). */
function tagAt(src, idx) {
  const before = src.slice(Math.max(0, idx - 2000), idx);
  const re = /<([A-Za-z][\w.]*)/g;
  let m;
  let last = null;
  while ((m = re.exec(before))) last = m[1];
  return last;
}

function planRewrite(src, m, tag) {
  const [whole, dq, sq, bt, braced] = m;
  const open = braced !== undefined ? '{' : dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
  const valueStart = m.index + whole.indexOf(open, whole.indexOf('=')) + 1;
  let lit;
  let litStart;
  if (dq !== undefined || sq !== undefined || bt !== undefined) {
    lit = dq ?? sq ?? bt;
    litStart = valueStart;
  } else {
    const inner = braced.trim();
    const head = braced.indexOf(inner);
    const plain = /^(["'`])([^"'`$\n]*)\1$/.exec(inner);
    const call = /^(?:cn|clsx|cx)\(\s*(["'`])([^"'`$\n]*)\1/.exec(inner);
    const hit = plain ?? call;
    if (!hit) return { reason: 'surface classes are dynamic / conditional (manual)' };
    lit = hit[2];
    litStart = valueStart + head + inner.indexOf(hit[1] + lit) + 1;
  }
  if (!isSurface(lit)) return { reason: 'surface classes split across conditional parts (manual)' };
  const tokens = lit.split(/\s+/).filter(Boolean);
  if (!tokens.includes('border')) return { reason: 'no bare `border` (custom border width/colour — manual)' };
  if (tag === 'button') return { reason: 'raw <button> with a surface → <Button>/<IconButton> by hand' };
  if (sticky.test(lit)) return { reason: 'sticky surface → glass-chrome candidate (manual)' };
  let role;
  if (/^(?:input|textarea|select)$|(?:Input|Textarea|TextArea)$/.test(tag ?? '')) role = 'glass-inset';
  else if (positioned.test(lit) && stacked.test(lit) && edgeAnchored.test(lit)) role = 'glass-overlay';
  else if (positioned.test(lit)) return { reason: 'positioned surface without an edge anchor (manual)' };
  else role = 'glass-fill';
  // `.glass-inset` sets a field's border COLOUR but not its width (fields are a flush pool,
  // components/ui/input.tsx). Keep the bare `border` on a migrated field so a
  // `focus:border-site-accent` focus cue still has an edge to colour.
  const drop = role === 'glass-inset' ? DROP.filter((d) => !d.test('border')) : DROP;
  const kept = tokens.filter((t) => !drop.some((d) => d.test(t)));
  const next = [role, ...kept].join(' ');
  return { role, from: lit, to: next, start: litStart, end: litStart + lit.length };
}

function scanControls(file, src, out) {
  if (file.startsWith(join('components', 'ui') + sep)) return;
  const rules = [
    [/role="dialog"/g, 'raw role="dialog" → <Dialog>/<Sheet>/<OverlayPanel>'],
    [/role="switch"/g, 'raw role="switch" → <Switch>'],
    [/type="range"/g, 'raw range input (central rule in app/jelly-coverage.css, or <Slider>)'],
    [/<select(?:\s|>|$)/gm, 'raw <select> → <Select>'],
  ];
  for (const [re, why] of rules) {
    for (const m of src.matchAll(re)) out.push({ file, line: lineAt(src, m.index), reason: why });
  }
}

const files = ROOTS.flatMap((r) => walk(r)).map((f) => relative(ROOT, join(ROOT, f)));
const counts = { site: [0, new Set()], apps: [0, new Set()], games: [0, new Set()] };
const rewrites = [];
const manual = [];
const controls = [];
let scanned = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  scanned++;
  const tier = tierOf(file);
  const hits = [];
  CLASS_ATTR.lastIndex = 0;
  let m;
  while ((m = CLASS_ATTR.exec(src))) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    if (!isSurface(value)) continue;
    // `bg-(--app-surface)` is covered by the app-theme adapter (04 §2.4): count, never rewrite.
    const appAdapter = /bg-\(--app-surface\)/.test(value) && !/bg-site-/.test(value);
    hits.push({ m: [...m], index: m.index, appAdapter });
  }
  scanControls(file, src, controls);
  if (!hits.length) continue;
  counts[tier][0] += hits.length;
  counts[tier][1].add(file);
  if (REPORT) continue;
  if (tier !== 'site' && !GAMES) continue;
  if (file.startsWith(join('components', 'ui') + sep)) continue;
  const fileEdits = [];
  for (const h of hits) {
    const line = lineAt(src, h.index);
    if (h.appAdapter) continue;
    const mm = Object.assign(h.m, { index: h.index });
    const plan = planRewrite(src, mm, tagAt(src, h.index));
    if (plan.reason) manual.push({ file, line, reason: plan.reason });
    else fileEdits.push({ ...plan, line });
  }
  for (const e of fileEdits) {
    e.pane = hits.length === 1 && e.role === 'glass-fill';
    rewrites.push({ file, ...e });
  }
  if (WRITE && fileEdits.length) {
    let out = src;
    for (const e of [...fileEdits].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, e.start) + e.to + out.slice(e.end);
    }
    writeFileSync(file, out);
  }
}

const total = counts.site[0] + counts.apps[0] + counts.games[0];
const nfiles = counts.site[1].size + counts.apps[1].size + counts.games[1].size;
console.log(`jelly-roles: scanned ${scanned} .tsx files under ${ROOTS.join(', ')}`);
console.log(`hand-rolled surfaces: ${total} in ${nfiles} files`);
for (const t of ['site', 'apps', 'games']) {
  console.log(`  ${t.padEnd(6)} ${String(counts[t][0]).padStart(4)} surfaces  ${counts[t][1].size} files`);
}
if (REPORT) {
  console.log(`raw controls outside components/ui: ${controls.length}`);
  process.exit(0);
}

console.log(`\n${WRITE ? 'rewrote' : 'would rewrite'} ${rewrites.length}:`);
for (const r of rewrites) {
  console.log(`  ${r.file}:${r.line}  [${r.role}${r.pane ? ', pane?' : ''}]`);
  console.log(`    - ${r.from}`);
  console.log(`    + ${r.to}`);
}
console.log(`\nmanual review ${manual.length + controls.length}:`);
for (const x of [...manual, ...controls]) console.log(`  ${x.file}:${x.line}  ${x.reason}`);
if (!WRITE && rewrites.length) console.log('\n(dry run — pass --write to apply)');
