# RMH Vibes inside a Discord Activity

Inside an Activity every request must go through
`https://<application-id>.discordsays.com`. Stored vibe HTML bakes in the site
origin (CSP meta, importmap, `window.RMHVibeAI` endpoint) and `https://esm.sh`,
so `lib/rmhvibe/activity-html.ts` rewrites them to the proxy origin when the
page is served to an Activity. The rewrite applies only when the proxy origin
matches `https://<6-25 digits>.discordsays.com`; any other origin leaves the
HTML unchanged.

## Developer Portal URL mappings

| Prefix       | Target         | Notes                                    |
| ------------ | -------------- | ---------------------------------------- |
| `/`          | the site       | root mapping, serves pages and `/api/**` |
| `/socket`    | the socket hub | already configured                       |
| `/rmhbox-ws` | the RMHBox hub | already configured                       |
| `/esm`       | `esm.sh`       | **new, owner action** in the Portal      |

Mappings other than the root are reached under `/.proxy/<prefix>`, so esm.sh
becomes `https://<application-id>.discordsays.com/.proxy/esm/...`.

## Limitations

- Packages served by esm.sh (the long-tail fallback) that import root-relative
  paths (`/v135/...`) resolve against the site root mapping, not `/esm`, and may
  not load inside Discord. Curated hosted packages (`/api/vibe/pkg/<stem>.js`)
  work.
- Legacy pages that allow `https://cdn.jsdelivr.net` are not rewritten: there is
  no mapping for it, so those scripts will not load in an Activity.
