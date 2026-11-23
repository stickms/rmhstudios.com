<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier: the route files under `app/routes/api` and the registered modules that the one dispatcher route `app/routes/api/$.ts` serves (the Source column says which). The inventory is split by the first letter of the group (`/api/<group>`) so that adding an endpoint edits one small file. This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable. Counts are in `docs/_generated/facts/routes.json`.

Methods are read from each file's `server.handlers` block, or from the handlers a registered module passes to `apiRoute`. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

- [A](./api/a.md)
- [B](./api/b.md)
- [C](./api/c.md)
- [D](./api/d.md)
- [E](./api/e.md)
- [F](./api/f.md)
- [G](./api/g.md)
- [H](./api/h.md)
- [I](./api/i.md)
- [J](./api/j.md)
- [K](./api/k.md)
- [L](./api/l.md)
- [M](./api/m.md)
- [N](./api/n.md)
- [O](./api/o.md)
- [P](./api/p.md)
- [Q](./api/q.md)
- [R](./api/r.md)
- [S](./api/s.md)
- [T](./api/t.md)
- [U](./api/u.md)
- [V](./api/v.md)
- [W](./api/w.md)

```{toctree}
:hidden:
:maxdepth: 1

api/a
api/b
api/c
api/d
api/e
api/f
api/g
api/h
api/i
api/j
api/k
api/l
api/m
api/n
api/o
api/p
api/q
api/r
api/s
api/t
api/u
api/v
api/w
```
