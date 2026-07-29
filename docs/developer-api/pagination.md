# Pagination

List endpoints are **keyset-paginated** for stable, efficient paging — unlike offset paging, a row inserted while you iterate can't shift items onto a page you already read.

- Pass `?limit=` (1–50, default 20) to size a page.
- Each response is `{ "data": [...], "nextCursor": "<opaque>" | null }`.
- To fetch the next page, pass the returned `nextCursor` as `?cursor=`.
- `nextCursor` is `null` on the last page.

```bash
# First page
curl "https://rmhstudios.com/api/v1/feed?limit=20" -H "Authorization: Bearer $RMH_KEY"

# Next page
curl "https://rmhstudios.com/api/v1/feed?limit=20&cursor=2026-06-20T09:59:00.000Z" \
  -H "Authorization: Bearer $RMH_KEY"
```

Treat the cursor as opaque — it currently looks like a timestamp, but that is an implementation detail and may change. Store it and send it back verbatim; don't construct one.

## Iterating a full list

```js
async function* pages(path, key) {
  let cursor = null;
  do {
    const url = new URL(`https://rmhstudios.com${path}`);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.json()).error?.code}`);
    const body = await res.json();
    yield* body.data;
    cursor = body.nextCursor;
  } while (cursor);
}
```

Stop on `nextCursor === null` — not on an empty `data` array, which is not a guaranteed terminator.
