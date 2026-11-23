<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes

Every page the site serves, split by the first letter of its URL so that adding a page edits one small file. Each table is divided into the pages that render inside the standard site shell (sidebar, nav, context rail) and the full-screen ones, which is how games, the login page and the legal pages are meant to render. Placement decides chrome: a file under `app/routes/_site/` gets the shell, a top-level file does not. Counts are in `docs/_generated/facts/routes.json`.

Params appear as `:name`; `*` is a catch-all splat.

**Access** is derived from the route file and every layout above it: `admin` (bounced unless `isAdmin`), `sign-in` (redirected to `/login`), or `public`. `public` describes the *route*, not necessarily everything on it — several public pages render a sign-in prompt in place of their content rather than redirecting, `/developer` being one.

- [A](./pages/a.md)
- [B](./pages/b.md)
- [C](./pages/c.md)
- [D](./pages/d.md)
- [E](./pages/e.md)
- [F](./pages/f.md)
- [G](./pages/g.md)
- [H](./pages/h.md)
- [J](./pages/j.md)
- [K](./pages/k.md)
- [L](./pages/l.md)
- [M](./pages/m.md)
- [N](./pages/n.md)
- [O](./pages/o.md)
- [Other](./pages/other.md)
- [P](./pages/p.md)
- [Q](./pages/q.md)
- [R](./pages/r.md)
- [S](./pages/s.md)
- [T](./pages/t.md)
- [U](./pages/u.md)
- [V](./pages/v.md)
- [W](./pages/w.md)

```{toctree}
:hidden:
:maxdepth: 1

pages/a
pages/b
pages/c
pages/d
pages/e
pages/f
pages/g
pages/h
pages/j
pages/k
pages/l
pages/m
pages/n
pages/o
pages/other
pages/p
pages/q
pages/r
pages/s
pages/t
pages/u
pages/v
pages/w
```
