# Canvas architecture — the Konva frontend overhaul

> Status: **in progress (big-bang branch)**. The `canvas-ui/` framework is
> landed and the first Wave A routes are converted; the conversion guard
> (`testing/canvas/route-conversion-guard.test.ts`) reports live progress.
> Until the final merge gate, converted (canvas) and unconverted (DOM)
> routes coexist — StageHost renders nothing on unconverted routes.

## The paradigm

All visual UI renders into a **single full-viewport HTML5 canvas** driven by
[Konva.js](https://konvajs.org/) via react-konva. The canvas is the only
*visible* element on a converted page. The DOM retains exactly three
sanctioned, non-visible roles:

1. **Hidden helpers** (`canvas-ui/helpers/`) — platform shims the browser
   requires: one shared off-viewport `<textarea>` IME proxy for text input,
   hidden `<video>`/`<audio>` elements piped into the canvas as frame
   sources, transient `<input type=file>` pickers, and (on `/login`)
   transparent full-size input proxies positioned over the drawn fields so
   password managers and WebAuthn keep working.
2. **The mirror** (`canvas-ui/mirror/`, `.sr-mirror` in `app/globals.css`) —
   a visually-hidden (1px-clipped, never `display:none`) semantic DOM copy
   of each route: headings/text/links that SSR for crawlers, plus real
   `<button>`/`<a>` controls auto-registered by every interactive widget
   (`useMirrorControl`) for screen readers and keyboard users. Mirror focus
   draws the canvas focus ring.
3. **Overlays** (`canvas-ui/overlay/`) — absolutely-positioned DOM slots for
   content that physically cannot draw into a 2D canvas: cross-origin
   iframes (YouTube/Twitch in RMHTube, the rmhvibe sandbox, wiki-race) and
   layered WebGL canvases (three.js/R3F games, the altair engine, maplibre
   maps). An `<OverlaySlot kind="...">` in a scene reserves layout space and
   projects DOM content onto its computed rect; every overlay carries
   `data-overlay-allow`, which the Playwright census checks per route.

## Module map (`canvas-ui/`)

| Module | What |
|---|---|
| `runtime/StageHost.tsx` | The single `<Stage>`; mounted from `__root.tsx` (lazy, client-only). Renders only while a scene is registered. Sets `window.__canvasReady` after first layout+draw. |
| `runtime/CanvasPage.tsx` | What a converted route renders: registers the scene + props snapshot, emits the mirror, declares `shell: "site" \| "fullscreen"`. |
| `scene/registry.ts` | Zustand store `routeId → scene component + props`. The seam between the DOM route tree and the stage — loader/query data flows through prop snapshots, no cross-reconciler context needed. |
| `runtime/layout/` | Yoga (WASM flexbox) tree: every `<Box>` owns a yoga node and one Konva `Group`; child order re-derives from the Konva tree each pass; computed rects are written imperatively (no per-frame React renders). Loaded async via `yoga-layout/load` — never on the server. |
| `runtime/tw.ts` | Tailwind-subset parser: `tw("flex items-center gap-2 bg-site-surface rounded-site p-4")` → typed `{layout, paint, text}`. Unknown classes **throw in dev**. Responsive `sm:/md:/lg:/xl:` buckets resolve against stage width. |
| `theme/` | JS token bridge: `THEME_TOKENS` (3 themes, transcribed from `globals.css`), oklab `color-mix` reimplementation for the 14 accent presets, `useTheme()` subscribed to `stores/themeStore.ts`. |
| `text/Text.tsx` | Token typography + yoga-measured wrapping + RTL base direction from the i18n locale. |
| `text/RichText.tsx` | Styled inline runs (bold/links) with manual line-breaking in one Konva.Shape — replaces `<strong>`/`<a>` inside wrapped paragraphs. |
| `text/fonts.ts` | Re-measures all text when `document.fonts` finishes loading. |
| `widgets/` | Button, CanvasLink (mirror `<a>` + router.navigate), ScrollView (wheel/touch/momentum/scrollbar/keyboard), Card, Badge, Divider, Spinner, Skeleton, Icon (lucide geometry as Konva paths). |
| `motion/animate.ts` | Konva.Tween wrapper honoring `prefers-reduced-motion` (reduced = jump to final values). |

## Converting a route (the recipe)

```tsx
// app/routes/example.tsx — head()/loader stay exactly as before
function ExamplePage() {
  const data = Route.useLoaderData();          // runs in the DOM tree
  const sceneProps = useMemo(() => ({ ... }), [data]);
  return (
    <CanvasPage
      routeId="/example"
      scene={ExampleScene}                     // Konva tree (canvas-ui widgets)
      sceneProps={sceneProps}                  // snapshot → scene re-renders on change
      mirror={<ExampleMirror {...sceneProps} />} // semantic DOM, SSRs
      shell="fullscreen"                       // or "site" (sidebar shell scene)
    />
  );
}
```

Then flip the route's entry to `converted: true` in
`testing/canvas/route-manifest.ts` (add `overlayAllow` kinds if it uses
overlays). The guard test enforces: converted routes render CanvasPage and
import none of the banned DOM-era modules (`framer-motion`, `@radix-ui/*`,
`sonner`, `react-markdown`, `@monaco-editor/*`, legacy `@/components/ui/*`,
`PageLayout`).

The first converted examples to copy from: `app/routes/privacy.tsx`,
`terms.tsx`, `cookies.tsx`, `copyright.tsx` +
`components/lockdown/LegalCanvasPage.tsx` (one structured content model
drives both the scene and the mirror).

## Testing layers

1. **Unit (vitest, node):** `canvas-ui/__tests__/` — tw() parser tables,
   theme token parity with globals.css, oklab accent math.
2. **Route-conversion guard (vitest, static analysis):**
   `testing/canvas/route-conversion-guard.test.ts` over
   `testing/canvas/route-manifest.ts` — completeness (every page route
   tracked, no stale entries), converted-means-converted, banned imports.
   **Final merge gate:** flip the commented assertion to
   `expect(CONVERTED_COUNT).toBe(TOTAL_COUNT)`.
3. **Playwright census (planned, per plan):** for every route — load, wait
   `window.__canvasReady`, assert exactly one visible canvas and that every
   other visibly-boxed element sits inside `#overlay-root` with a
   manifest-allowlisted `data-overlay-allow`; screenshot.

## Permanent product costs (accepted, do not re-report as bugs)

- No browser find-in-page, reader mode, Google Translate, or extension
  interaction with page content on canvas routes.
- Arbitrary text selection/copy is gone; provide per-block copy affordances
  where users need them.
- First contentful paint moves to post-hydration first draw (skeleton scenes
  mitigate; an LCP regression is expected and tracked).
- Browser autofill works only through the login proxy pattern.

## SEO posture

Per-route `head()`/`buildMeta`/JSON-LD are unchanged. Crawlers index the
mirror. The mirror must stay an **honest 1:1** of on-canvas text — never add
mirror-only content (that's cloaking risk).
