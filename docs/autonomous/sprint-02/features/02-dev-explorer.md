# 02 — API explorer

Surface: developer platform. Wave 4. Namespace `dev-explorer`.

## User story

As a developer trying the RMH Studios API for the first time, I want to browse
every endpoint on the site, fill in its parameters, send a real request with my
key and see the response, headers and a ready-to-paste `curl` command, so that I
can learn the API in minutes without leaving the page or writing a script.

## Requirements elicitation

- **What exists (verified):** `lib/api/registry.ts` (`ENDPOINTS`,
  `endpointsByGroup()`) is the single source for every v1 endpoint and drives
  `/api/v1/openapi.json` (`lib/api/openapi.ts`). The human docs are an external
  Read the Docs site (`DEVELOPER_DOCS_URL`, `lib/docs-site.ts`); nothing on the
  site renders the registry, and there is no try-it console. Test keys exist
  (`lib/api/test-mode.ts`, `components/developer/TestKeyCreator.tsx`): calls
  made with one never touch real data.
- **Decisions:** the explorer is a client page that reads the registry; it adds
  no server endpoint. The key is pasted by the member and held in memory; an
  opt-in "Keep for this tab" stores it in `sessionStorage` through
  `lib/core/persist.ts` (`{ storage: 'session' }`), never in `localStorage`,
  never sent anywhere but the request's `Authorization` header. The page is
  public so it can be linked from the docs; sending needs a key, not a session.

## Functional requirements

1. FR-1 A list of endpoints grouped as `endpointsByGroup()` returns, with a
   filter field matching method, path, summary and scope.
2. FR-2 Selecting an endpoint shows method, path, summary, description, required
   scope, path and query parameters (typed inputs: text, integer, boolean
   switch), and for write methods a JSON body editor prefilled from
   `requestBody.example`.
3. FR-3 A key field (password input with show toggle). The page detects a test
   key and labels it; for a live key, POST, PATCH and DELETE need a confirmation
   checkbox ("This changes real data") before Send is enabled.
4. FR-4 Send builds the URL from the registry path and the inputs (path params
   encoded, empty query params dropped), sends it same-origin with
   `Authorization: Bearer <key>`, and shows status, duration, the
   `X-RateLimit-*` and `X-Request-Id` headers, and the body pretty-printed
   (JSON) or as text, with a copy button.
5. FR-5 Snippets for the current request: `curl`, JavaScript `fetch`, and Python
   `requests`, with the key replaced by `$RMH_API_KEY` unless the member ticks
   "Include my key".
6. FR-6 Deep links: `/developer/explorer?op=<operationId>` opens that endpoint;
   parameter values are not put in the URL.
7. FR-7 Invalid JSON in the body editor is reported with line and column before
   sending, and Send stays disabled.
8. FR-8 The developer index links to the explorer; each explorer endpoint links
   to its section in the external docs where one exists.

## Non-functional requirements

- **Security:** no key ever goes into a URL, the snippets (unless opted in),
  analytics or error reports; the request is same-origin to `/api/v1/**` only —
  the URL builder refuses any registry path that does not start with `/api/v1/`.
  Responses render as text, never as HTML.
- **Performance:** the registry is imported by the route chunk only (it is a
  pure module); nothing is added to the entry chunk. Sending is a single
  request; there is no polling.
- **Accessibility:** the endpoint list is a listbox-like list of buttons with
  `aria-current`; the response region is `aria-live="polite"` announcing status
  only; method is text, not colour.
- **i18n:** UI strings in `dev-explorer`; registry summaries are English source
  data and are shown as they are (documented limitation, same as the docs).
- **Steel:** two columns at ≥1024 px divided by a 1px rule, one column on a
  phone; code in `t-meta` mono blocks on `--site-bg-subtle`; Send is the one ink
  primary.

## Data model and API

None. Pure modules: `lib/developer/explorer.ts` (`buildRequest`, `toCurl`,
`toFetch`, `toPython`, `isTestKey` re-using `lib/api/test-mode.ts`'s prefix,
`parseJsonWithPosition`). Route `app/routes/_site/developer/explorer.tsx`,
public: a `STATIC_ROUTES` entry in `lib/sitemap.ts`; it resolves to the
`/developer` section card (prefix match in `lib/og/static-cards.ts`) with its
own `buildMeta` title and description.

## Testing requirements

- Product suite `lib/developer/__tests__/explorer.product.test.ts`: path params
  are percent-encoded; empty query params are dropped; a path outside `/api/v1/`
  is refused; the curl snippet quotes single quotes safely and omits the key by
  default; JSON errors report line and column.
- Main suite `lib/developer/__tests__/explorer-key.test.ts`: the key is never
  present in the generated URL or default snippets (credential leakage is a
  privacy criterion).

## Acceptance criteria

- [ ] `/developer/explorer?op=<an operationId>` opens with that endpoint.
- [ ] A GET with a valid key shows status 200, the rate-limit headers and the
      JSON body; with no key, the API's own 401 envelope.
- [ ] A live-key DELETE cannot be sent until the confirmation is ticked.
- [ ] The curl snippet runs as pasted in a POSIX shell with `RMH_API_KEY` set.
- [ ] Works at 390 px (one column) and 1280 px, Day and Night, and in `ar` with
      code kept left-to-right.

## Out of scope

OAuth flows, websocket endpoints, saving request collections, and rendering the
external docs inside the site.
