# Sprint 01 — the Toolbox

Twenty
small,
private
utilities
under
[`/tools`](https://rmhstudios.com/tools),
built
as
one
coherent
section
of
the
site:
a
hub
and
twenty
tools
that
run
entirely
in
the
browser.
Nothing
a
visitor
types
into
a
tool
is
sent
to
the
server.

- [plan.md](plan.md)
  —
  build
  order,
  shared
  files,
  how
  conflicts
  were
  avoided.
- [summary.md](summary.md)
  —
  what
  shipped,
  line
  counts,
  verification.
- `features/`
  —
  one
  document
  per
  feature:
  user
  story,
  requirements,
  full
  specification
  (functional,
  non-functional,
  testing)
  and
  acceptance
  criteria.

## Why a toolbox

The
site's
members
already
come
here
to
write
(RMHarks,
the
blog,
RMHStudy),
to
code
(RMHCode,
vibes,
the
developer
API),
to
organise
(communities,
group
chats,
events)
and
to
play
(tabletop-style
games,
RMHBox).
Each
of
those
jobs
has
small
chores
beside
it
—
counting
words,
formatting
JSON,
testing
a
pattern,
checking
a
colour,
splitting
a
bill,
rolling
dice,
drawing
a
winner
—
that
people
do
today
by
pasting
their
data
into
ad-funded
third-party
sites.
Doing
them
here,
privately
and
in
the
site's
own
design,
is
a
genuine
value-add;
doing
them
as
one
section
with
one
frame
keeps
them
from
becoming
twenty
one-off
pages
that
look
like
they
came
from
different
sites.

## Brainstorm and selection

Ideas
were
kept
only
if
they
(1)
serve
a
job
the
site's
users
already
have,
(2)
are
complete
on
their
own,
(3)
need
real
logic
worth
testing,
and
(4)
do
not
duplicate
something
the
site
has.
Rejected
on
the
last
test:
a
unit
converter
(RMHCalculator's
notebook
already
converts
units),
a
focus
timer
(RMHStudy
has
body-doubling
sessions),
a
QR
code
maker
(the
feed
already
has
one),
a
world
clock
that
ticks
(Steel
R5:
nothing
moves
at
rest
—
the
time
zone
converter
shows
a
chosen
moment
instead),
and
anything
that
would
hinge
on
a
decision
the
Steel
plan
lists
as
open
in
section 18.

## Features

| #   | Feature                                         | Route               | For                                                                         |
| --- | ----------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| 01  | [Contrast checker](features/01-contrast.md)     | `/tools/contrast`   | member who designs a profile theme, a vibe or a page                        |
| 02  | [Text statistics](features/02-text-stats.md)    | `/tools/text-stats` | member writing a post, an essay for RMHStudy or a talk                      |
| 03  | [Case converter](features/03-case.md)           | `/tools/case`       | developer naming things in RMHCode or a vibe                                |
| 04  | [Text diff](features/04-diff.md)                | `/tools/diff`       | member editing a document, a config or a translation                        |
| 05  | [JSON formatter](features/05-json.md)           | `/tools/json`       | developer using the RMH Studios developer API or debugging a webhook        |
| 06  | [CSV and JSON converter](features/06-csv.md)    | `/tools/csv`        | member exporting data from a spreadsheet or moving API output into one      |
| 07  | [Regex tester](features/07-regex.md)            | `/tools/regex`      | developer writing a pattern for code or for an RMHark automod rule          |
| 08  | [Encoder and decoder](features/08-encode.md)    | `/tools/encode`     | developer                                                                   |
| 09  | [Hash generator](features/09-hash.md)           | `/tools/hash`       | member downloading a build, a game mod or a dataset                         |
| 10  | [ID generator](features/10-ids.md)              | `/tools/ids`        | developer seeding a database or writing tests                               |
| 11  | [Cron helper](features/11-cron.md)              | `/tools/cron`       | developer scheduling a job (or reading a crontab line in the jobs worker)   |
| 12  | [Number base converter](features/12-base.md)    | `/tools/base`       | student or developer reading a register dump, a colour or a permission mask |
| 13  | [Loan calculator](features/13-loan.md)          | `/tools/loan`       | member planning a car loan, a mortgage or student debt                      |
| 14  | [Bill splitter](features/14-split-bill.md)      | `/tools/split-bill` | member out with friends                                                     |
| 15  | [Timestamp converter](features/15-timestamp.md) | `/tools/timestamp`  | developer reading logs or API responses                                     |
| 16  | [Time zone converter](features/16-timezones.md) | `/tools/timezones`  | member organising a game night or a call across countries                   |
| 17  | [Date calculator](features/17-date-calc.md)     | `/tools/date-calc`  | student counting days to an exam or a member planning an event              |
| 18  | [Password generator](features/18-password.md)   | `/tools/password`   | member securing an account (here or anywhere)                               |
| 19  | [Dice roller](features/19-dice.md)              | `/tools/dice`       | member running a tabletop session in a group chat or a Space                |
| 20  | [Random picker](features/20-picker.md)          | `/tools/picker`     | member running a giveaway in a community or splitting players for a match   |

## Shared pieces

- `lib/toolbox/catalog.ts`
  —
  the
  list;
  the
  hub,
  the
  sitemap
  and
  the
  catalog
  test
  read
  it.
- `lib/toolbox/random.ts`
  —
  unbiased
  crypto
  randomness
  (password,
  IDs,
  dice,
  picker).
- `components/toolbox/ToolFrame.tsx`
  —
  page
  frame,
  sections,
  result
  rows,
  field
  errors,
  labelled
  switches.
- `components/toolbox/tool-copy.ts`
  —
  each
  tool's
  translated
  name,
  description
  and
  icon.
- `vitest.toolbox.config.ts`
  —
  the
  tests'
  own
  suite
  (`pnpm test:toolbox`),
  kept
  out
  of
  the
  mission-critical
  main
  suite
  as
  `docs/testing.md`
  requires.
