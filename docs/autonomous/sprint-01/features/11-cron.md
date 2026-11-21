# 11 · Cron helper (`/tools/cron`)

Category:
Developer.
Branch:
`autonomous/s01-cron`.
Status:
shipped
in
sprint 01.

## User story

As
a
developer
scheduling
a
job
(or
reading
a
crontab
line
in
the
jobs
worker),
I
want
to
check
a
cron
expression
and
see
when
it
will
run
next
so
that
I
do
not
ship
a
schedule
that
fires
at
the
wrong
time.

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
  Parse
  five-field
  cron:
  numbers,
  ranges,
  steps,
  lists,
  month
  and
  weekday
  names,
  7
  as
  Sunday,
  and
  @hourly
  …
  @yearly.
- **F2.**
  Explain
  an
  error
  by
  field
  and
  token.
- **F3.**
  Show
  each
  field's
  values
  (names
  in
  the
  viewer's
  language).
- **F4.**
  List
  the
  next
  eight
  runs
  in
  the
  viewer's
  time
  zone
  or
  UTC,
  skipping
  days
  and
  hours
  that
  cannot
  match,
  giving
  up
  after
  five
  years.
- **F5.**
  Apply
  and
  explain
  Vixie
  cron's
  rule
  that
  restricting
  both
  day
  fields
  means
  either
  may
  match.
- **F6.**
  Keep
  a
  valid
  expression
  in
  ?expr=
  for
  sharing.

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
  `lib/toolbox/cron.ts`
  (pure,
  strict-island
  typed).
- UI:
  `components/toolbox/cron/CronTool.tsx`
  inside
  `ToolFrame`.
- Route:
  `app/routes/_site/tools/cron.tsx`;
  catalog
  entry
  in
  `lib/toolbox/catalog.ts`.
- Tests:
  `lib/toolbox/__tests__/cron.test.ts`
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

- expansion
  of
  steps,
  ranges,
  lists
  and
  names
- 7
  as
  Sunday
  and
  n/step
- macros
- error
  codes
- the
  day-of-month
  OR
  day-of-week
  rule
- next
  runs
  in
  UTC,
  strictly
  after
  now
- leap
  days
  and
  impossible
  dates
- 31st-of-month
  schedules

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

- [x] 0
      0
      30
      2 *
      says
      it
      never
      runs.
- [x] */15
      9-17 * *
      1-5
      lists
      weekday
      quarter-hours.
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
