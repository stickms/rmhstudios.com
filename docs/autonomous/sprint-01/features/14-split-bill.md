# 14 · Bill splitter (`/tools/split-bill`)

Category:
Numbers
and
money.
Branch:
`autonomous/s01-split-bill`.
Status:
shipped
in
sprint 01.

## User story

As
a
member
out
with
friends,
I
want
to
add
tax
and
tip
and
split
the
bill
fairly,
evenly
or
by
shares,
so
that
the
shares
add
up
to
exactly
what
the
restaurant
charges.

## Requirements elicitation

Who:
members
of
the
site
(and
signed-out
visitors,
since
every
tool
is
public)
who
would
otherwise
paste
the
same
data
into
an
unknown
third-party
website.
Why
here:
the
site
already
hosts
the
developer
API,
RMHCode,
RMHStudy,
the
vibes
platform,
communities
and
group
chats;
these
are
the
jobs
those
users
do
next
to
them.
Constraints
from
the
repository:
Steel
design
language,
`t()`
for
every
string,
a
public
route
with
its
own
meta
and
an
OG
card,
no
server
round
trip
for
user
data,
and
no
new
dependency.

## Specification

### Functional requirements

- **F1.**
  Inputs:
  bill
  before
  tax,
  tax
  %,
  tip
  %,
  tip
  on
  the
  pre-tax
  or
  post-tax
  bill.
- **F2.**
  People
  with
  optional
  names
  and
  share
  weights;
  add
  and
  remove
  people
  (1–50).
- **F3.**
  Shares
  in
  whole
  cents
  with
  leftover
  cents
  by
  largest
  remainder,
  so
  they
  add
  up
  to
  the
  total.
- **F4.**
  Optional
  rounding
  of
  each
  share
  up
  to
  0.05,
  0.50
  or
  1.00,
  with
  the
  surplus
  shown.
- **F5.**
  Show
  tax,
  tip
  and
  total.

### Non-functional requirements

- **Privacy
  and
  security.**
  Everything
  runs
  in
  the
  browser;
  no
  input
  is
  sent
  to
  the
  server,
  logged
  or
  stored,
  except
  where
  a
  requirement
  above
  names
  local
  storage.
  Randomness,
  where
  used,
  is
  `crypto.getRandomValues`
  through
  `lib/toolbox/random.ts`
  (rejection-sampled),
  never
  `Math.random()`.
- **Performance.**
  Pure
  functions
  with
  no
  dependency;
  work
  proportional
  to
  the
  input,
  bounded
  by
  explicit
  limits;
  expensive
  recomputation
  deferred
  with
  `useDeferredValue`
  where
  input
  is
  long.
  Nothing
  animates
  or
  polls
  at
  rest
  (Steel
  R5);
  no
  worker,
  observer
  or
  animation
  frame.
- **Accessibility.**
  Every
  control
  is
  labelled
  (`Label`/`aria-label`),
  results
  that
  change
  are
  in
  an
  `aria-live`
  region,
  errors
  use
  `role="alert"`,
  state
  is
  never
  conveyed
  by
  colour
  alone,
  focus
  ring
  is
  the
  global
  K10
  outline,
  and
  tab
  switchers
  use
  the
  shared
  `Tabs`
  (roving
  keyboard).
- **Design
  system
  (Steel).**
  `ToolFrame`
  (PageLayout),
  rows
  on
  1px
  rules
  (R3),
  `--site-*`
  token
  utilities
  only,
  `t-*`
  type
  classes,
  at
  most
  one
  ink
  primary
  button
  per
  view
  (R4),
  no
  gradient,
  blur,
  shadow
  or
  translucency
  (R1).
- **i18n.**
  All
  strings
  through
  `t()`
  in
  the
  `toolbox`
  namespace
  with
  literal
  defaults;
  numbers
  and
  dates
  through
  `Intl`
  in
  the
  active
  locale;
  layouts
  survive
  RTL
  (`ar`).
- **SSR.**
  Output
  that
  depends
  on
  the
  clock,
  the
  viewer's
  time
  zone
  or
  randomness
  renders
  only
  after
  hydration,
  so
  server
  and
  client
  agree.
- **SEO.**
  `definePage`
  gives
  the
  route
  its
  own
  title,
  description
  and
  canonical;
  it
  unfurls
  with
  the
  `/tools`
  section
  card;
  it
  is
  listed
  in
  the
  sitemap
  from
  the
  catalog.

### Implementation

- Logic:
  `lib/toolbox/split-bill.ts`
  (pure,
  strict-island
  typed).
- UI:
  `components/toolbox/split-bill/SplitBillTool.tsx`
  inside
  `ToolFrame`.
- Route:
  `app/routes/_site/tools/split-bill.tsx`;
  catalog
  entry
  in
  `lib/toolbox/catalog.ts`.
- Tests:
  `lib/toolbox/__tests__/split-bill.test.ts`
  in
  the
  Toolbox
  suite
  (`pnpm test:toolbox`).

## Testing requirements

Unit
tests
(Toolbox
suite)
must
cover:

- largest-remainder
  split
  always
  sums
  to
  the
  total
- weights
- tax
  then
  tip
- post-tax
  tip
- rounding
  surplus
- weighted
  shares

Plus:
the
catalog
test
(route
file
exists,
sitemap
entry),
the
main
suite's
OG/sitemap/i18n
gates,
eslint,
`tsc -b`,
the
strict
island,
and
an
SSR
smoke
render
(HTTP
200
with
the
tool's
heading).

## Acceptance criteria

- [x] Three
      people
      splitting
      100.00
      pay
      33.34,
      33.33
      and
      33.33.
- [x] Shares
      always
      sum
      to
      the
      total.
- [x] All
      functional
      requirements
      above
      work
      in
      Day
      and
      Night
      editions
      at
      390px
      and
      1280px.
- [x] No
      string
      is
      hard-coded;
      `locales/en/toolbox.json`
      holds
      every
      key.
- [x] The
      route
      renders
      server-side
      without
      errors
      and
      passes
      `pnpm check:consistency`.
