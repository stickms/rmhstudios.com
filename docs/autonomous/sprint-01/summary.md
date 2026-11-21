# Sprint 01 — summary

The
Toolbox
shipped:
a
hub
at
`/tools`
and
twenty
private,
client-side
utilities,
each
with
its
own
route,
page
meta,
sitemap
entry,
strings
in
the
`toolbox`
namespace,
unit
tests
and
a
specification
in
`features/`.

## What shipped

| #   | Feature                                         | Route               | One check that holds                                                                              |
| --- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| 01  | [Contrast checker](features/01-contrast.md)     | `/tools/contrast`   | /tools/contrast?fg=999999&bg=ffffff opens with that pair and shows 2.84:1 and a suggested colour. |
| 02  | [Text statistics](features/02-text-stats.md)    | `/tools/text-stats` | Pasting a 10,000-word document keeps typing responsive.                                           |
| 03  | [Case converter](features/03-case.md)           | `/tools/case`       | parseHTTPResponse2 becomes parse_http_response_2 in snake_case.                                   |
| 04  | [Text diff](features/04-diff.md)                | `/tools/diff`       | A one-line change in a 20,000-line paste shows one removed and one added line.                    |
| 05  | [JSON formatter](features/05-json.md)           | `/tools/json`       | A missing colon on line 3 is reported as line 3 with the column of the offending token.           |
| 06  | [CSV and JSON converter](features/06-csv.md)    | `/tools/csv`        | A semicolon-separated export from a European spreadsheet converts without choosing the delimiter. |
| 07  | [Regex tester](features/07-regex.md)            | `/tools/regex`      | x* against ab returns three empty matches and the page stays responsive.                          |
| 08  | [Encoder and decoder](features/08-encode.md)    | `/tools/encode`     | é encodes to w6k= in Base64.                                                                      |
| 09  | [Hash generator](features/09-hash.md)           | `/tools/hash`       | The SHA-256 of 'abc' is ba7816bf….                                                                |
| 10  | [ID generator](features/10-ids.md)              | `/tools/ids`        | A v7 generated now inspects to the current time.                                                  |
| 11  | [Cron helper](features/11-cron.md)              | `/tools/cron`       | 0 0 30 2 * says it never runs.                                                                    |
| 12  | [Number base converter](features/12-base.md)    | `/tools/base`       | -1 shows ff and 255 in the 8-bit view.                                                            |
| 13  | [Loan calculator](features/13-loan.md)          | `/tools/loan`       | 200,000 at 6% for 30 years pays 1,199.10 a month.                                                 |
| 14  | [Bill splitter](features/14-split-bill.md)      | `/tools/split-bill` | Three people splitting 100.00 pay 33.34, 33.33 and 33.33.                                         |
| 15  | [Timestamp converter](features/15-timestamp.md) | `/tools/timestamp`  | 1700000000 reads as 2023-11-14T22:13:20Z.                                                         |
| 16  | [Time zone converter](features/16-timezones.md) | `/tools/timezones`  | 9:00 in Berlin on 1 March shows 08:00 UTC.                                                        |
| 17  | [Date calculator](features/17-date-calc.md)     | `/tools/date-calc`  | 31 January plus one month is 28 February 2026.                                                    |
| 18  | [Password generator](features/18-password.md)   | `/tools/password`   | A 20-character four-set password reports about 128 bits.                                          |
| 19  | [Dice roller](features/19-dice.md)              | `/tools/dice`       | 4d6kh3 never keeps the lowest die.                                                                |
| 20  | [Random picker](features/20-picker.md)          | `/tools/picker`     | Ten people into three teams gives sizes 4, 3, 3.                                                  |

Shared:
the
hub
with
a
filter
(`components/toolbox/ToolboxHub.tsx`),
the
page
frame
and
result
rows
(`ToolFrame.tsx`),
unbiased
crypto
randomness
(`lib/toolbox/random.ts`),
the
catalog,
the
`/tools`
OG
section
card,
sitemap
entries
derived
from
the
catalog,
a
Toolbox
entry
in
the
site's
destination
catalog
(⌘K
and
Explore
find
it
by
any
tool's
name),
and
a
separate
test
suite
(`pnpm test:toolbox`,
`toolbox-tests.yml`).

## Size

`git diff --shortstat origin/main...HEAD`
for
the
squashed
sprint
commit:
**132 files changed, 23371 insertions(+), 12 deletions(-)**.

By
area:
tool
logic
and
tests
in
`lib/toolbox/`
about
5,100
lines;
UI
in
`components/toolbox/`
about
3,750;
routes
about
330;
strings
461
keys;
the
rest
is
the
generated
route
tree
and
inventories
and
these
documents
(which
follow
the
repository's
Prettier
settings
for
Markdown,
one
word
per
line).

## Verification

- `pnpm check:consistency --base main`:
  passed
  (design,
  strings,
  routes,
  eslint,
  `tsc -b`,
  generated
  docs,
  pre-paint,
  facts).
- `pnpm typecheck:strict`:
  island
  clean
  (`lib/toolbox/*.ts`
  joined
  it).
- `pnpm test`
  (main
  suite):
  1,101
  files,
  12,739
  tests
  passed.
- `pnpm test:toolbox`:
  22
  files,
  171
  tests
  passed.
- Every
  route
  rendered
  in
  a
  real
  browser
  (Chromium)
  in
  Day
  and
  Night
  at
  390px
  and
  1280px
  with
  no
  page
  errors,
  no
  hydration
  warnings
  and
  no
  horizontal
  overflow;
  a
  sample
  was
  inspected
  by
  eye,
  and
  two
  pages
  in
  Arabic
  (RTL).

## Found and fixed during review

- The
  bill
  splitter's
  name
  field
  was
  cut
  to
  about
  seventy
  pixels
  on
  a
  phone;
  the
  row
  now
  wraps
  below
  `sm`.
- The
  time
  zone
  converter
  had
  its
  own
  formatter
  cache,
  which
  the
  ad-hoc
  cache
  ratchet
  counted;
  it
  now
  reads
  wall
  clocks
  through
  `lib/core/zoned-time`.
- In
  the
  Arabic
  layout,
  code
  (diffs,
  JSON,
  regex,
  encodings,
  IDs)
  was
  right-aligned;
  code
  fields
  and
  lists
  are
  now
  `dir="ltr"`.
- SSR
  safety:
  everything
  that
  depends
  on
  the
  clock,
  the
  viewer's
  time
  zone,
  the
  browser's
  zone
  list
  or
  randomness
  renders
  after
  hydration.

## Process notes

- No
  subagent
  tool
  was
  available
  in
  this
  session,
  so
  design,
  implementation
  and
  review
  were
  done
  in
  one
  context;
  "fresh-eyes"
  review
  was
  replaced
  by
  the
  full
  gate,
  the
  full
  main
  suite,
  and
  a
  real-browser
  pass
  over
  every
  route.
- Tool
  tests
  are
  not
  mission-critical
  by
  `docs/testing.md`'s
  rule,
  so
  they
  got
  their
  own
  suite
  instead
  of
  growing
  the
  main
  one.
- `pnpm i18n:extract`
  on
  `main`
  rewrites
  about
  twenty
  unrelated
  catalogs
  (existing
  drift);
  only
  `locales/en/toolbox.json`
  was
  kept.
