# 05 — Agent protocol

The operating procedure for an agent implementing a workstream. Follow it in
order. Where a step says "the coordinator provides", the value is in your
dispatch prompt.

## 0. Before anything

Read, in this order: [`index.md`](index.md), [`03-rules.md`](03-rules.md), your
section of [`04-workstreams.md`](04-workstreams.md), [`01-method.md`](01-method.md)
§0 and §2–3, [`02-budgets.md`](02-budgets.md) §2–4, and, from Stage B,
`results/ws-0.md`.
Then the repo's `/CLAUDE.md` and the `CLAUDE.md` of every directory you will
edit.

## 0.1 The two stages

You start at the same time as WS0, so you work in two stages
(`index.md` §4):

- **Stage A — now.** No harness yet. Read the code paths, find unbounded reads,
  N+1s, sequential awaits, missing cache policies and per-event work; write the
  scan scripts your workstream calls for; draft fixes with their correctness
  tests. Commit a change only if its evidence is `exact` (`01-method.md` §0):
  query counts from a vitest test that counts Prisma calls, or a `vite dev`
  measurement; payload bytes; cache headers. No latency claims. Do not edit the
  WS0-owned files (`04-workstreams.md` §Concurrency).
- **Stage B — after the coordinator's ready marker.** Between leads, check for
  the marker (the path is in your dispatch prompt). When it exists:
  1. `git merge --no-edit <coordinator branch>` into your branch.
     **Merge, never rebase.**
  2. `pnpm install --frozen-lockfile --offline` if the lockfile changed.
  3. Create your database from the template and copy `.dataset.json` (§1).
  4. Read `results/ws-0.md` and `baseline-querylog.txt`; re-prioritise your
     leads; re-baseline your routes; **re-measure every Stage A change** before
     and after, and revert any that shows no win (§3 step 6).

If Stage A is exhausted and the marker has not appeared, do not busy-poll: wait
with `sleep 120` between checks, at most 30 checks, then finish with what you
have and say so in your final message.

## 1. Workspace

You work in your own git worktree. Inside it:

```bash
export PATH=/opt/node24/bin:$PATH            # Node 24.18 — required (01-method §2)
git checkout -b perf/ws-<N>                  # your branch; never push it
pnpm install --frozen-lockfile --offline     # the store is already populated
cp <env template from the coordinator> .env  # then substitute the three slots:
#   __DB__       → rmh_ws<N>
#   __REDISDB__  → <N>            (Redis logical db — keeps your keys apart)
#   __PORT__     → 71<N>5         (WS1 → 7115, WS2 → 7125, …)
createdb -h localhost -U postgres -T rmh_perf_template rmh_ws<N>   # PGPASSWORD=password
cp <coordinator-provided>/.dataset.json scripts/perf/.dataset.json
```

Your database is yours: migrate it, bloat it, drop and re-create it from the
template whenever you need a clean slate. Never touch another `rmh_ws*`
database or the template.

## 2. Building and serving

The box is shared by several agents. **Every heavy command goes through one
lock** (`01-method.md` §2), or parallel builds, type-checks and commits starve
each other and every latency number in the session is garbage:

```bash
flock /tmp/rmh-perf-build.lock pnpm build
flock /tmp/rmh-perf-build.lock pnpm exec tsc --noEmit
flock /tmp/rmh-perf-build.lock git commit ...     # the hook runs the gate, which runs tsc
```

Targeted `pnpm exec vitest run <paths>` and eslint on single files may run
unlocked; the whole suite and `pnpm build` never do.

Serve the build on your port, with bench headers on:

```bash
NODE_ENV=production PORT=71<N>5 RMH_PERF_HEADERS=1 node .output/server/index.mjs &
```

**Benchmarks also take the lock** — a number measured while another agent
builds is not comparable with one measured while it doesn't:

```bash
flock /tmp/rmh-perf-build.lock node scripts/perf/server-bench.mjs --base http://localhost:71<N>5 ...
```

Keep `--duration` short (≤ 10 s) and run only your routes (`--only`), so you
hold the lock briefly. `vite dev` (no lock needed) is fine for query counts,
payload bytes and headers — never for latency.

## 3. The loop

For each lead in your section, in the order you judge most valuable:

1. **Baseline** the routes it touches (two interleaved runs once you have a
   change to compare against — `01-method.md` §2). In Stage A the baseline is
   the exact count or byte figure on the unchanged tree.
2. **Diagnose** with the instruments: phases, query counts, the query log,
   `EXPLAIN`, a `--cpu-prof` of the server process if time is in `render` or
   unaccounted.
3. **Change** one thing, inside your owned files, obeying `03-rules.md`.
4. **Test** correctness: existing tests for the area
   (`pnpm exec vitest run <paths>`), plus the new test the rules require.
5. **Measure** after, same worktree, same session.
6. **Decide:** a win inside the rules → commit (step 4 of this protocol) and add
   a results row. No win → `git checkout -- .` / revert, and add a **rejected**
   row with the number. Both are progress. A Stage A commit is provisional: in
   Stage B re-measure it for latency, and `git revert` it if it shows none.

Stop a lead when its routes are inside budget. Don't polish a route that is
already inside budget unless it is on every request (the shell, the wrapper).

## 4. Committing

- Run the commit under the lock: `flock /tmp/rmh-perf-build.lock git commit ...`.
- One idea per commit. The message: what changed, why, and the number
  (`/: signed p50 TTFB 182 → 121 ms, queries 19 → 11`).
- The commit hook runs `pnpm check:consistency`. If it fails, fix the cause;
  never `--no-verify`, never `RMH_SKIP_COMMIT_GATE`.
- End every commit message with the attribution lines in your dispatch prompt.
- **Do not push. Do not merge. Do not rebase onto main.** The coordinator
  integrates.

## 5. Your results file

`docs/server-perf-2026-10-21/results/ws-<N>.md`, committed with your last
commit. Exactly this shape, so the coordinator can merge six of them:

```markdown
# WS<N> — <name> — results

Worktree baseline taken <date/time>, commit <sha>. Environment deviations: <none | …>.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Evidence | Commit | Correctness test |
|---|---|---|---|---:|---:|---|---|---|

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |

## Deferred
| # | Lead | Why | What would unblock it |

## Handoffs
| To | file:line | What | Evidence |

## Budget status (owned routes, after)
| Route | Auth | TTFB p50/p95 | Queries | Bytes | In budget? |

## Rule objections
<none, or the rule, the evidence, and the proposed change>

## Commands
<the exact commands that produced the numbers above>
```

`Evidence` is `exact` (counts, bytes, headers) or `latency` (`01-method.md` §0).
A Stage A change later re-measured for latency is moved to Rejected if it showed
no win.

## 6. Finishing

Your final message to the coordinator is short: branch name, commit list
(`git log --oneline <base sha from your dispatch prompt>..`), the Shipped table's headline rows, anything
blocked, and any place you were unsure a cache is safe. Leave the server
stopped and your database in place (the coordinator may re-measure from it).
