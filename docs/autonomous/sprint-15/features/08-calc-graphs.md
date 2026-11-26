# 08 — Keep your RMHCalculator graphs, open them again without waiting, and send one as a link

Surface: RMHCalculator's Graphing tab (`/rmhcalculator`), a "Saved graphs" list, a graph link, the data export.
Wave 4. Namespace `calc-graphs`. A full-screen app (`app/routes/rmhcalculator.tsx`, outside the shell) that uses the site theme (`usesSiteTheme: true`): site tokens and Steel type, its own stylesheet `components/rmhcalculator/rmhcalculator.css`.

## User story

As a student graphing functions in RMHCalculator, I want to save a graph I plotted, reopen it later without waiting for
it to be computed again, and send a classmate a link that opens the same functions in their calculator, so that my
graphs outlive the tab I made them in.

## Requirements elicitation

- **What exists (verified):**
  - The Graphing tab (`components/rmhcalculator/GraphingCalculator.tsx`) keeps up to four functions and an optional
    domain in React state only; every plot is a streamed model call (`graphStream`, `lib/rmhcalculator/client.ts`, to
    `POST /api/rmhcalculator/graph`, `app/routes/api/rmhcalculator/graph.ts`) that returns a validated `GraphResult`
    (`lib/rmhcalculator/types.ts`: `graphResultSchema`, at most 4 series of 400 points, ticks, view, notes). Reloading the
    page loses the graph, and seeing it again costs a second model call and its wait.
  - The Notebook tab saves notebooks to the account (`CalcNotebook`, `prisma/schema/rmhstudy.prisma`;
    `lib/tools/api/calc-notebooks.server.ts`, `calc-notebooks.$id.server.ts`), but through the raw `toolsApi` fetch helper
    (`lib/tools/client.ts`) inside a `useEffect` (`components/rmhcalculator/NotebookTab.tsx`): untyped call sites with
    hand-written URL strings. (Validation: neither `lib/__tests__/raw-api-fetch-ratchet.test.ts` nor
    `lib/__tests__/useeffect-fetch-ratchet.test.ts` counts a `toolsApi(...)` call, so the move lowers neither ratchet.)
  - Neither notebooks nor anything else of the calculator is in the data export (`CalcNotebook` is erased:
    `erase` in `lib/account/erasure-registry.ts`).
- **Decisions:**
  - **Saved graphs:** a new table `CalcGraph` (`userId`, `title` 80, `functions` text array of 1–4 expressions of up
    to 200 characters, `domainMin` / `domainMax` nullable floats, `result` JSON (the validated `GraphResult`, stored
    only after `graphResultSchema.safeParse` on the server), `createdAt`, `updatedAt`). At most 50 per member
    (`CALC_GRAPH_LIMIT`, checked under `lockKey(tx, 'calc-graphs:<userId>')`).
  - **Reopening** a saved graph renders the stored result at once, with no model call; "Plot again" recomputes and,
    if saved, updates the row.
  - **A graph link** carries the functions and the domain in the URL (`/rmhcalculator?tab=graph&f=…&min=…&max=…`,
    parsed and length-checked by a pure parser); opening it fills the recipient's Graphing tab and waits for them to
    press Plot (their own model call, under their own rate limit). No graph is stored for sharing, so a link never
    exposes anyone's saved list, and needs no report path.
  - **Notebooks move onto contracts:** the four notebook calls get `*.contract.ts` declarations and `api()` calls through
    React Query, so the notebook calls are typed against their routes and no longer fetched from an effect (the
    ratchets do not move: they never counted `toolsApi`).
  - **Export:** saved graphs (title, functions, domain, times; not the points) and notebooks (title, body, times).
  - **Erasure:** `CalcGraph` is `erase` (the member's own tool data), deleted under the Wave 0 anchor.

## Functional requirements

1. FR-1 Schema: `CalcGraph` with `@@index([userId, updatedAt(sort: Desc)])`, a `User` back-relation under the anchor;
   migration `20270105040200_s15_calc_graphs`.
2. FR-2 `lib/rmhcalculator/graphs.server.ts` (new): list (newest first), get, create (cap), update, delete,
   `exportCalcTools(userId)`, `calcGraphErasureOps(userId)`; `lib/rmhcalculator/graphs.contract.ts` and
   `lib/rmhcalculator/api/rmhcalculator.graphs.server.ts`, `rmhcalculator.graphs.$id.server.ts` (new, registered modules).
3. FR-3 `lib/rmhcalculator/graph-link.ts` (new, pure): build and parse the link; the calculator reads it on load.
4. FR-4 UI: "Save graph" (title prompt through `usePrompt`), "Saved graphs" list (open, rename, delete with confirm),
   "Copy link"; the Graphing tab renders a stored result without streaming.
5. FR-5 Notebooks: `lib/tools/calc-notebooks.contract.ts` (new) and `NotebookTab.tsx` on React Query; the routes bound
   with `implement()`.
6. FR-6 Refusal `CALC_GRAPH_LIMIT` (param `max`) under the anchor; erasure registry entry; export under the anchor.

## Non-functional requirements

- **The stored result is trusted only after validation** on the server (the client could send any JSON); a row whose
  `result` no longer parses is shown as "Plot again" rather than drawn.
- **Size:** a result is at most 4 × 400 points; the route refuses a body over 64 KB.
- **The link parser** rejects more than 4 functions, any over 200 characters, and non-finite or reversed domains.
- **Query shapes (verify against the schema):** `functions` is `String[]`; `domainMin`/`domainMax` are optional
  floats; `result` is `Json` (never filtered on).
- **Ratchets never rise:** every new or moved call is `api()` through React Query; no `.tsx` gains `api(xxxApi` or
  `fetch('/api/` next to a `useEffect`, so `useeffect-fetch-ratchet` stays at its BASELINE; `raw-api-fetch-ratchet`
  too.

## Testing requirements

- Main suite `lib/rmhcalculator/__tests__/graphs.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): ownership on every route, the cap under the lock, an invalid result refused, export and erasure.
- Product suite `lib/rmhcalculator/__tests__/graph-link.product.test.ts`: round trip, limits, junk input.
- Main suite `lib/tools/__tests__/calc-notebooks-contract.test.ts`: the contract routes keep ownership.
- `lib/account/__tests__/erasure-coverage.test.ts`, `lib/account/__tests__/erasure-plain-columns.test.ts`, the
  export test, both fetch ratchets (unchanged).

## Acceptance criteria

- [ ] A member saves a graph, reloads, opens it from "Saved graphs", and it appears at once without a wait.
- [ ] A copied link opens the same functions in another member's calculator, ready to plot.
- [ ] A 51st graph is refused with the limit sentence.
- [ ] Notebooks behave as before.
- [ ] The data export lists the member's graphs and notebooks.

## Out of scope

Public galleries of graphs, sharing the computed points, graphing on the server without a model, the Scientific tab's
history.
