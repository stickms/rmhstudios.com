# 17 · Date calculator (`/tools/date-calc`)

Category:
Dates
and
time.
Branch:
`autonomous/s01-date-calc`.
Status:
shipped
in
sprint 01.

## User story

As
a
student
counting
days
to
an
exam
or
a
member
planning
an
event,
I
want
to
know
the
days,
weeks
and
weekdays
between
two
dates
and
to
add
time
to
a
date
so
that
I
can
plan
without
counting
on
a
calendar.

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
  Between
  two
  dates:
  signed
  total
  days,
  years/months/days,
  weeks
  and
  days,
  weekdays
  (Mon–Fri)
  and
  hours,
  with
  an
  option
  to
  count
  the
  end
  date.
- **F2.**
  Add
  or
  subtract
  years,
  months,
  weeks
  and
  days,
  clamping
  month
  ends;
  add
  or
  subtract
  weekdays.
- **F3.**
  Plain
  dates
  with
  no
  time
  or
  zone,
  so
  daylight
  saving
  never
  changes
  a
  day
  count.
- **F4.**
  Default
  to
  today
  after
  hydration.

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
  `lib/toolbox/date-calc.ts`
  (pure,
  strict-island
  typed).
- UI:
  `components/toolbox/date-calc/DateCalcTool.tsx`
  inside
  `ToolFrame`.
- Route:
  `app/routes/_site/tools/date-calc.tsx`;
  catalog
  entry
  in
  `lib/toolbox/catalog.ts`.
- Tests:
  `lib/toolbox/__tests__/date-calc.test.ts`
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

- strict
  date
  parsing
  and
  weekday
- total,
  weeks
  and
  calendar
  difference
- month-end
  counting
- signed
  and
  inclusive
- across
  a
  DST
  change
- weekday
  counting
- month-end
  clamping
- business-day
  addition
  both
  ways

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

- [x] 31
      January
      plus
      one
      month
      is
      28
      February 2026.
- [x] Friday
      to
      the
      next
      Friday
      is
      5
      weekdays.
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
