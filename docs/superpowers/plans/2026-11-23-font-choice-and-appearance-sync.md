# Font Choice and Per-Device Appearance Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DM Sans/DM Mono become the default faces; readers choose a main, reading and mono font from a fixed catalogue,
loaded only when used and right on first paint; a per-device switch turns appearance sync off and on (most recent wins).

**Architecture:** A client-safe catalogue (`lib/appearance/fonts.ts`) names every face. Each non-default face is its own
generated stylesheet; the site sheet carries only the default faces and a small `html[data-font-*]` → variable rules
file. The root loader resolves the choice (account → `rmh-fonts` cookie → default, skipping the account when
`rmh-appearance-sync=0`) and the root `head()` links the chosen sheets, preloads their Latin files and stamps the
attributes. A pre-paint step repairs a device whose cookie is missing. The existing account sync in `Providers.tsx`
learns the three font fields and the per-device switch.

**Tech Stack:** TanStack Start (React 19 SSR), Vite 8, Tailwind v4, Prisma 7, Zustand, Fontsource, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md`

## Global Constraints

- Catalogue ids and packages exactly as the spec's table; defaults `dm-sans` (main), `same` (reading), `dm-mono` (mono).
- Main/Reading offer the 12 sans + serif ids; Mono offers `dm-mono`, `jetbrains-mono`, `geist-mono`, `ibm-plex-mono`.
- Weights used: 400/500/600 (Steel Y1). Charis SIL has 400/700: its generated rules map weight 600 to the 700 file.
- `font-display: swap` for main/reading faces (with a metric-matched fallback each), `optional` for mono faces.
- Storage names: `localStorage` `rmh-font-main`, `rmh-font-reading`, `rmh-font-mono`, `rmh-appearance-sync` (`'0'` = off),
  `rmh-appearance-changed-at` (ms epoch); cookies `rmh-fonts` (`main.reading.mono`) and `rmh-appearance-sync=0`, both
  `Path=/; Max-Age=31536000; SameSite=Lax`, not HttpOnly. Write `rmh-fonts` only when a slot is non-default; delete it
  otherwise.
- Account: `AppearancePreference.fontMain/fontReading/fontMono String? @db.VarChar(32)` and `updatedAt DateTime @updatedAt`.
  A stored font is always an explicit id (`dm-sans`, `dm-mono`, `same` included); `null` = never chosen.
- `lib/appearance/prefs.ts` and the new `fonts.ts` stay zod-free (zod only in `prefs-schema.ts`).
- Every string through `t(key, { defaultValue })` in `settings-appearance`; run `pnpm i18n:extract`.
- Never hand-edit `lib/prepaint/generated.ts` (`pnpm prepaint:build`), `app/fonts/*.css` (`pnpm fonts:generate`),
  `lib/api/route-table.server.ts`, `docs/_generated/facts.json` (`pnpm facts:generate`).
- Steel rules for the UI (rows on rules, `components/ui/` primitives, one primary per view); no new `@keyframes`.
- `pnpm check:consistency` before each commit; `scripts/check-bundle-budget.ts` must pass at the end.

## Review Focus

1. A stored id that is no longer in the catalogue (cookie edited by hand, a face removed later) → treated as the default
   for that slot, never an unstyled page or a thrown loader. Test in Task 1 (`parseFontsCookie('evil.x.y')`).
2. Signed-in user with sync off on this device → the server must not seed the account's theme or fonts into the page.
   Test in Task 5 (`resolveRequestFonts` with `syncOff: true`) and Task 7 (Providers skips GET/PUT).
3. Readable font on → main and reading show Atkinson stack whatever is chosen. Test in Task 3 (CSS order assertion).
4. Arabic (`ar`) or another script the chosen face lacks → falls through to the OS face, no tofu. Checked by eye in
   Task 10 (`/` in `ar` with Literata chosen).
5. Turning sync on with an account row that has never been written (`updatedAt` absent / no row) → device values are
   pushed. Test in Task 7 (`mergeOnSyncEnable` with `account: null`).

---

### Task 1: Font catalogue and cookie codec

**Files:**
- Create: `lib/appearance/fonts.ts`
- Test: `lib/appearance/__tests__/fonts.test.ts`

**Interfaces:**
- Produces:
  - `type FontSlot = 'main' | 'reading' | 'mono'`
  - `type TextFontId` (the 12 ids) · `type MonoFontId` (the 4) · `type ReadingFontId = TextFontId | 'same'`
  - `interface FontChoice { main: TextFontId; reading: ReadingFontId; mono: MonoFontId }`
  - `const FONT_CATALOGUE: ReadonlyArray<{ id: TextFontId | MonoFontId; label: string; kind: 'sans' | 'serif' | 'mono'; family: string }>`
    (`family` is the CSS family name: `'DM Sans'`, `'Charis SIL'`, …; labels are the spec's "Face" column, Charter shown as `Charter`)
  - `const DEFAULT_FONTS: FontChoice = { main: 'dm-sans', reading: 'same', mono: 'dm-mono' }`
  - `const FONT_KEYS: Record<FontSlot, string>` (the three localStorage keys) · `APPEARANCE_SYNC_KEY`, `APPEARANCE_CHANGED_AT_KEY`,
    `FONTS_COOKIE = 'rmh-fonts'`, `APPEARANCE_SYNC_COOKIE = 'rmh-appearance-sync'`
  - `isFontFor(slot: FontSlot, v: unknown): boolean`
  - `normalizeFonts(partial: Partial<Record<FontSlot, unknown>>): FontChoice` (unknown/invalid → default per slot)
  - `parseFontsCookie(cookieHeader: string | null | undefined): FontChoice | null` (null when the cookie is absent)
  - `formatFontsCookie(choice: FontChoice): string | null` (null when equal to `DEFAULT_FONTS`)
  - `fontsInUse(choice: FontChoice): Array<TextFontId | MonoFontId>` (distinct non-default faces actually rendered; `same` resolves to main)
  - `appearanceSyncOff(cookieHeader: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips a choice through the cookie', () => {
  const c = { main: 'inter', reading: 'literata', mono: 'jetbrains-mono' } as const;
  expect(parseFontsCookie(`a=1; rmh-fonts=${formatFontsCookie(c)}`)).toEqual(c);
});
it('the default writes no cookie', () => expect(formatFontsCookie(DEFAULT_FONTS)).toBeNull());
it('an unknown id falls back per slot', () =>
  expect(parseFontsCookie('rmh-fonts=evil.literata.x')).toEqual({ main: 'dm-sans', reading: 'literata', mono: 'dm-mono' }));
it('a mono face is not a main face', () => expect(isFontFor('main', 'dm-mono')).toBe(false));
it('fontsInUse skips defaults and resolves same', () => {
  expect(fontsInUse(DEFAULT_FONTS)).toEqual([]);
  expect(fontsInUse({ main: 'inter', reading: 'same', mono: 'dm-mono' })).toEqual(['inter']);
});
it('reads the sync switch from the cookie', () => {
  expect(appearanceSyncOff('rmh-appearance-sync=0')).toBe(true);
  expect(appearanceSyncOff(null)).toBe(false);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run lib/appearance/__tests__/fonts.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `lib/appearance/fonts.ts`** with the interfaces above (cookie parsing in the style of
  `dataSaverCookieValue` in `lib/data-saver-request.ts`; no zod). Add the file to `tsconfig.strict.json` `include`.
- [ ] **Step 4: Run** the test — Expected: PASS. Run `pnpm typecheck:strict` — Expected: no errors.
- [ ] **Step 5: Commit** `feat(appearance): font catalogue and cookie codec`.

### Task 2: Self-hosted faces, one stylesheet each

**Files:**
- Modify: `package.json` (add the 11 new Fontsource packages from the spec table; `pnpm add`), `scripts/gen-self-hosted-fonts.ts`
  (one `Group` per catalogue face → `app/fonts/choice/<id>.css`; `display` per Global Constraints; Charis SIL 600→700 map),
  `scripts/gen-font-metrics.ts` (fallback faces for each text face → included in the face's own sheet as `'<Family> Fallback'`)
- Create (generated): `app/fonts/choice/*.css` (15 files; `dm-sans` and `dm-mono` included), `app/fonts/choice-rules.css`
  (`html[data-font-main='<id>'] { --site-font-body: '<Family>', '<Family> Fallback', system-ui, sans-serif }`, the
  `reading` rules set `--site-font-reading`, `mono` set `--site-font-mono`; no `@font-face`)
- Create: `lib/appearance/font-assets.ts` — `FONT_ASSETS: Record<id, { sheet: string; latin: string }>` from Vite `?url`
  imports of each generated sheet and its Latin woff2 (pattern: `geistLatinWoff2` import in `app/routes/__root.tsx`)
- Modify: `app/globals.css` (drop `@import '@fontsource-variable/geist/wght.css'` and `./fonts/site-display.css`; import
  `./fonts/choice/dm-sans.css`, `./fonts/choice/dm-mono.css`, `./fonts/choice-rules.css`)
- Test: `lib/__tests__/font-choice-assets.test.ts`

**Interfaces:**
- Consumes: `FONT_CATALOGUE` (Task 1).
- Produces: `FONT_ASSETS` (Task 5 reads it); generated sheets at `app/fonts/choice/<id>.css`.

- [ ] **Step 1: Write the failing test**: every catalogue id has a generated sheet and a `FONT_ASSETS` entry; the site
  entry (`app/globals.css` and what it `@import`s) contains `@font-face` only for `DM Sans`, `DM Mono` and their
  fallbacks; `app/fonts/choice/charter.css` has no `font-weight: 600` rule pointing at a missing file; mono sheets say
  `font-display: optional`, text sheets `swap`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/__tests__/font-choice-assets.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the generator changes, run `pnpm fonts:generate` and the metrics generator, write `font-assets.ts`.
- [ ] **Step 4: Run** the test and `pnpm fonts:check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(fonts): self-host the catalogue, one sheet per face`.

### Task 3: Tokens, reading variable, smoothing, docs and design tests

**Files:**
- Modify: `app/globals/tokens-themes.css` (`--font-geist`/`--font-geist-mono` → `--font-sans: 'DM Sans', 'DM Sans Fallback'`
  / `--font-mono: 'DM Mono'`; `--site-font-reading: var(--site-font-body)`; remove the Geist Fallback face),
  `app/styles/steel-type.css` (`.t-post`, `.t-prose` get `font-family: var(--site-font-reading)`),
  base CSS (`html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }`),
  `app/globals/comfort-suite.css` (`html.readable-font` also sets `--site-font-reading` to its stack so it wins),
  `components/shared/app-theme.css` lines 78–80 (point at the new `--font-*`), every other `--font-geist` reference (`rg`),
  `lib/__tests__/steel-tokens.test.ts` (pin the new names), `design.md` §Type, the Steel plan §3 and §13, `CLAUDE.md`
  "Identity"/"Performance" lines that say Geist only (state: DM Sans default, catalogue in `lib/appearance/fonts.ts`,
  owner decision 2026-11-23)
- Test: extend `lib/__tests__/steel-tokens.test.ts`

- [ ] **Step 1: Write the failing assertions**: `t-post`/`t-prose` font-family is `var(--site-font-reading)`;
  `--site-font-reading` defaults to `var(--site-font-body)`; the readable-font rule sets both variables and comes after
  `choice-rules.css` in cascade order; no `--font-geist` remains in `app/` or `components/`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/__tests__/steel-tokens.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the CSS and doc edits.
- [ ] **Step 4: Run** the test and `pnpm check:consistency --fast` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(type): DM Sans default, a reading-font variable, grayscale smoothing`.

### Task 4: Account columns and the appearance API

**Files:**
- Modify: `prisma/schema/profile.prisma` (`AppearancePreference`: the three font columns and `updatedAt`); create the
  migration with `pnpm db:migrate --name appearance_fonts` (existing rows get `updatedAt = now()` via `@default(now())`
  alongside `@updatedAt`)
- Modify: `lib/appearance/prefs-schema.ts` (`fontMain`, `fontReading`, `fontMono`: refined with `isFontFor`, nullable optional),
  `lib/preferences/preferences.contract.ts` (response adds the three fields and `updatedAt: string | null`),
  `lib/preferences/api/preferences.appearance.server.ts` (GET returns them; PUT writes them)
- Test: the route's existing test file (find with `rg -l "preferences/appearance" lib/**/__tests__`), else
  `lib/preferences/__tests__/appearance-fonts.test.ts`

**Interfaces:**
- Produces: GET `/api/preferences/appearance` → `{ …existing, fontMain, fontReading, fontMono, updatedAt }`; PUT accepts the three.

- [ ] **Step 1: Write the failing tests**: PUT `{ fontMain: 'dm-mono' }` → 400; PUT `{ fontReading: 'same' }` → 200 and GET
  returns `'same'`; GET with no row → fonts `null`, `updatedAt` `null`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** schema, migration, contract and handler (the PUT already invalidates `appearanceSeedKey`).
- [ ] **Step 4: Run** the tests, `pnpm exec prisma validate`, `pnpm api:routes` — Expected: PASS, table unchanged.
- [ ] **Step 5: Commit** `feat(appearance): store font choice and updatedAt on the account`.

### Task 5: Server first paint

**Files:**
- Create: `lib/appearance/fonts-request.ts` — `resolveRequestFonts({ row, cookieHeader }): { choice: FontChoice; syncOff: boolean }`
  (per slot: account's non-null value when `!syncOff`, else cookie, else default)
- Modify: `lib/appearance/account-seed.ts` (`AccountAppearanceRow` gains the font columns; seed writes `FONT_KEYS`
  from non-null columns, `null` for a default id), `app/routes/__root.tsx`:
  `getInitialUser` selects the font columns, skips the account seed entirely when `appearanceSyncOff(cookie)`;
  the loader returns `fonts: FontChoice`; `head()` replaces the Geist preload with, for each `fontsInUse(choice)` plus the
  defaults actually rendered, a `preload` of `FONT_ASSETS[id].latin` and a `stylesheet` of `FONT_ASSETS[id].sheet`
  (defaults have no sheet link: they are in the site sheet; DM Sans's Latin file is preloaded only when main or reading
  renders in it); `hintDocumentAssets` hints the main face's Latin file;
  the `<html>` element renders `data-font-main/-reading/-mono` (only for non-default values) and they are added to the
  pre-paint config (`cfg.fonts = { choice, sheets: Record<id, string> }`) for Task 6
- Test: `lib/appearance/__tests__/fonts-request.test.ts`, extend `lib/appearance/__tests__/account-seed*.test.ts` if present

**Interfaces:**
- Consumes: Task 1 codec, Task 2 `FONT_ASSETS`, Task 4 columns.
- Produces: loader data `fonts: FontChoice`; pre-paint config field `fonts`.

- [ ] **Step 1: Write the failing tests**: account non-null beats cookie; account null slot falls to cookie; `syncOff`
  ignores the account; no row and no cookie → `DEFAULT_FONTS`; seed maps `fontMain: 'dm-sans'` to removing the key and
  `fontMain: 'inter'` to `'inter'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the resolver and the root changes.
- [ ] **Step 4: Run** the tests; then load `/` signed out with `rmh-fonts=inter.literata.jetbrains-mono` and with no cookie
  (`curl -s -b … http://127.0.0.1:7005/ | grep -o 'fonts/choice/[a-z0-9-]*'`) — Expected: the three sheets in the first,
  none in the second.
- [ ] **Step 5: Commit** `feat(appearance): render the chosen fonts on first paint`.

### Task 6: Pre-paint repair step

**Files:**
- Create: `lib/prepaint/fonts.ts` — `fontsStep(ctx)`: read the three `FONT_KEYS`; when they differ from
  `html.dataset` (set by the server), set the `data-font-*` attributes, append `<link rel=stylesheet>` for any face in
  `cfg.fonts.sheets` not already linked, and rewrite the `rmh-fonts` cookie with the Task 1 format (inline, no import of
  the codec beyond what the bundle allows — check `lib/prepaint/index.ts` limits)
- Modify: `lib/prepaint/index.ts` (register after `account-seed`, `discord: false`), `lib/prepaint/types.ts`
  (`PrepaintConfig.fonts`), `lib/prepaint/config.ts`; run `pnpm prepaint:build`
- Test: `lib/prepaint/__tests__/fonts.test.ts` (fake ctx like `media-reveal.test.ts`)

- [ ] **Step 1: Write the failing tests**: storage says `inter`, html has none → attribute set, one link appended, cookie
  written; storage agrees with html → nothing appended; storage holds an unknown id → nothing set.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** tests and `pnpm prepaint:build` — PASS.
- [ ] **Step 5: Commit** `feat(prepaint): repair a device whose font cookie is missing`.

### Task 7: Store, per-device switch and the sync merge

**Files:**
- Modify: `stores/themeStore.ts` (`fonts: FontChoice`, `setFont(slot, id)`; `appearanceSync: boolean`,
  `setAppearanceSync(on)`; every appearance setter stamps `APPEARANCE_CHANGED_AT_KEY = Date.now()`), the store applier in
  `components/Providers.tsx` (writes `FONT_KEYS`, the `rmh-fonts` cookie, `html.dataset`, appends a missing sheet using a
  client map from `FONT_ASSETS`), and the account-sync effect there: skip the GET/PUT entirely when sync is off; include
  the three font fields in pull and push (push explicit ids)
- Create: `lib/appearance/sync-merge.ts` — `mergeOnSyncEnable({ device, deviceChangedAt, account, accountUpdatedAt })
  : { push: Partial<AppearanceFields>; apply: Partial<AppearanceFields> }`, per field, skipping fields the device never
  set (`style` when following the OS; `readableFont` always takes the account, as today)
- Test: `lib/appearance/__tests__/sync-merge.test.ts`

**Interfaces:**
- Produces: `useThemeStore` `fonts`, `setFont`, `appearanceSync`, `setAppearanceSync` (Task 8 uses them).

- [ ] **Step 1: Write the failing tests**: device newer → its set fields in `push`, nothing in `apply`; account newer →
  account's non-null fields in `apply`; `account: null` → everything the device set is pushed; device following the OS
  never pushes `style`; equal times → account wins.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** merge, store and Providers changes (turning the switch on runs
  the merge once, then normal sync resumes; turning it off writes `rmh-appearance-sync=0` to storage and cookie).
- [ ] **Step 4: Run** the tests — PASS.
- [ ] **Step 5: Commit** `feat(appearance): per-device sync switch, most recent wins on enable`.

### Task 8: Settings UI

**Files:**
- Modify: `components/settings/AppearancePanel.tsx` — a `ToggleRow` "Sync appearance across devices" (hint "Off: this
  device keeps its own theme and fonts.") at the top, signed-in only; a "Fonts" `Section` with three
  `SettingsSelectRow`s (Main font, Reading font with "Same as main font" first, Mono font), each option label rendered in
  its own face (load candidate sheets with `<link>` only while the select is open); `persist()` sends the font field only
  when sync is on
- Run: `pnpm i18n:extract`; check `locales/en/settings-appearance.json` has the new keys
- Test: `components/settings/__tests__/AppearancePanel.fonts.test.tsx` — choosing Literata in Reading calls
  `setFont('reading','literata')`; with sync off no PUT is sent; signed out, the sync row is absent.

- [ ] **Step 1: Write the failing test.** **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, and
  `pnpm check:consistency --fast` passes (no hand-rolled tab strip, tokens only).
- [ ] **Step 5: Commit** `feat(settings): font pickers and the appearance sync switch`.

### Task 9: Edge cache bypass

**Files:**
- Modify: `server/nitro/anon-html-cache.ts` (bypass when the cookie header has `rmh-fonts=` or `rmh-appearance-sync=0`),
  `deploy/apply-cloudflare-cache-rules.sh` (text only, so `anon-html-cache.test.ts`'s drift check passes and the file
  records the live rule: rule 4 expression gains
  `and not (http.cookie contains "rmh-fonts=") and not (http.cookie contains "rmh-appearance-sync=0")`). The owner applies
  the change in the Cloudflare dashboard by hand (owner, 2026-11-23); nobody runs the script.
- Test: `lib/__tests__/anon-html-cache.test.ts` (it already parses the script's expression against the plugin; add cases)

- [ ] **Step 1: Write the failing cases**: `/` with `rmh-fonts=inter.same.dm-mono` is not cacheable; with
  `rmh-appearance-sync=0` not cacheable; with neither, cacheable. **Step 2: Run** — FAIL. **Step 3: Implement.**
  **Step 4: Run** — PASS (including the script/plugin drift check). **Step 5: Commit**
  `feat(cache): a chosen font bypasses the anonymous edge cache`.

### Task 10: Verify in a real browser and open the PR

- [ ] **Step 1:** `pnpm dev`; signed in, pick Inter / Literata / JetBrains Mono; reload; with a Playwright script confirm
  the first screenshot after `load` is already in Literata on a post (`getComputedStyle(.t-post).fontFamily` starts with
  `"Literata"`) and the network log fetches the `inter`, `literata` and `jetbrains-mono` sheets and woff2 files, and no DM Sans or DM Mono woff2.
- [ ] **Step 2:** Default visitor: the HTML links no `fonts/choice/` sheet; network shows only DM Sans + DM Mono woff2.
- [ ] **Step 3:** Sync off on context A, change theme in context B: A unchanged after reload; turn A on: newer side wins.
- [ ] **Step 4:** Day and Night at 390 and 1280; `ar` with Literata chosen (OS face for Arabic, no tofu).
- [ ] **Step 5:** `pnpm -s exec tsx scripts/check-bundle-budget.ts`, `pnpm facts:generate`, `pnpm check:consistency --base main`.
- [ ] **Step 6:** Commit, push, open the PR (template headings); its body names the manual step: after deploy, append
  the two conditions above to the anonymous HTML cache rule in the Cloudflare dashboard.
