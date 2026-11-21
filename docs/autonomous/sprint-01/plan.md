# Sprint 01 — implementation plan

How
the
twenty
Toolbox
features
were
built,
in
what
order,
and
why
that
order.

## Shape of the work

Every
feature
is
one
tool
under
`/tools/<slug>`
with
the
same
four
parts,
so
the
plan
is
mostly
about
the
files
they
share:

| Part                    | Path                                       | Shared?                          |
| ----------------------- | ------------------------------------------ | -------------------------------- |
| Pure logic              | `lib/toolbox/<slug>.ts`                    | no                               |
| Unit tests              | `lib/toolbox/__tests__/<slug>.test.ts`     | no                               |
| UI                      | `components/toolbox/<slug>/<Name>Tool.tsx` | no                               |
| Route                   | `app/routes/_site/tools/<slug>.tsx`        | no                               |
| Catalog row             | `lib/toolbox/catalog.ts`                   | **yes**                          |
| Name, description, icon | `components/toolbox/tool-copy.ts`          | **yes** (written once, up front) |
| Strings                 | `locales/en/toolbox.json`                  | **yes** (generated)              |
| Route tree              | `app/routeTree.gen.ts`                     | **yes** (generated)              |
| Route inventory         | `docs/site-reference/pages.md`             | **yes** (generated)              |
| Repo facts              | `docs/_generated/facts.json`               | **yes** (generated)              |
| Pre-paint script        | `lib/prepaint/generated.ts`                | **yes** (generated)              |

## Order

1. **Wave
   0
   —
   infrastructure,
   shipped
   with
   feature 01.**
   The
   hub
   (`/tools`,
   `ToolboxHub`),
   `ToolFrame`
   /
   `ToolSection`
   /
   `ResultRow`
   /
   `FieldError`,
   `lib/toolbox/random.ts`,
   the
   catalog,
   the
   `toolbox`
   i18n
   namespace
   (registered
   in
   `NAMESPACES`),
   the
   `/tools`
   OG
   section
   card
   (`lib/og/static-cards.ts`
   and
   `static-card-index.ts`),
   sitemap
   entries
   derived
   from
   the
   catalog,
   the
   strict
   island
   entry
   (`lib/toolbox/*.ts`),
   and
   the
   separate
   test
   suite
   (`vitest.toolbox.config.ts`,
   `pnpm test:toolbox`,
   `.github/workflows/toolbox-tests.yml`,
   registered
   in
   `lib/__tests__/test-discovery.test.ts`).
   `tool-copy.ts`
   was
   written
   for
   all
   twenty
   tools
   at
   once
   so
   no
   later
   feature
   edits
   it.
2. **Wave
   1
   —
   text
   and
   developer
   tools**
   (02–11):
   text
   statistics,
   case,
   diff,
   JSON,
   CSV,
   regex,
   encode,
   hash,
   IDs,
   cron.
   `ToolSwitch`
   arrived
   with
   the
   diff.
3. **Wave
   2
   —
   numbers
   and
   time**
   (12–17):
   base,
   loan,
   bill
   splitter,
   timestamp,
   time
   zones,
   date
   calculator.
4. **Wave
   3
   —
   everyday**
   (18–20):
   password,
   dice,
   picker.
   The
   picker
   commit
   tightens
   the
   catalog
   test
   to
   exactly
   twenty
   tools.

## Parallelism and conflicts

The
machine
has
4
cores
and
15
GB;
a
cold
`tsc -b`
of
the
site
project
peaks
near
11–13
GB,
so
only
one
typecheck
or
commit
gate
ever
ran
at
a
time.
The
work
was
pipelined
instead
of
parallelised:
while
one
feature's
branch
ran
its
gate,
the
next
feature's
logic,
tests
and
UI
were
drafted
outside
the
checkout
(in
a
scratch
directory)
and
moved
in
only
when
the
previous
merge
landed.
That
kept
every
feature
branch
exactly
one
feature
wide.

Conflicts
on
the
shared
files
were
avoided
by
construction:

- the
  catalog
  row
  is
  written
  by
  the
  ship
  script
  from
  the
  set
  of
  route
  files
  present,
  in
  the
  catalog's
  final
  order,
  so
  two
  features
  never
  edit
  the
  same
  line
  differently;
- every
  generated
  file
  (route
  tree,
  strings,
  page
  inventory,
  facts,
  pre-paint)
  is
  regenerated
  on
  the
  feature
  branch
  after
  its
  files
  are
  in
  place,
  never
  hand-edited;
- `pnpm i18n:extract`
  on
  `main`
  rewrites
  twenty
  unrelated
  catalogs
  (pre-existing
  drift);
  only
  `locales/en/toolbox.json`
  is
  kept
  from
  each
  run.

No
worktrees
were
needed:
features
were
sequential
branches
off
the
sprint
branch
(`autonomous/s01-<slug>`
→
`claude/autonomous-sprint-01`,
merged
with
`--no-ff`,
branch
deleted).

## Per-feature checks (the ship script)

1. Place
   the
   feature's
   files;
   regenerate
   the
   catalog
   row
   and
   the
   route
   tree.
2. Extract
   strings
   (keep
   `toolbox.json`
   only),
   `docs:site`,
   `facts:generate`,
   `prepaint:build`.
3. `pnpm test:toolbox`.
4. `tsc -b --checkers 1`
   alone
   (so
   the
   gate's
   own
   typecheck
   is
   a
   warm
   no-op
   and
   the
   gate
   never
   shares
   memory
   with
   a
   cold
   compile).
5. `pnpm check:consistency`
   on
   the
   staged
   change;
   commit
   only
   on
   a
   pass.
6. Merge
   into
   the
   sprint
   branch.

## Integration checks (sprint branch, before the PR)

- `pnpm check:consistency --base main`
- `pnpm typecheck`
  and
  `pnpm typecheck:strict`
- `pnpm test`
  (main
  suite)
  and
  `pnpm test:toolbox`
- an
  SSR
  smoke
  render
  of
  all
  21
  routes
  (HTTP
  200
  and
  the
  expected
  heading)
