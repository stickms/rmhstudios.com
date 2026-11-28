# server/ — Node service tier (realtime hubs + workers)

> Scope: guidance for working inside `server/`. Repo-wide context: [`/CLAUDE.md`](../CLAUDE.md). The Go services
> (status, assets): [`go-services/CLAUDE.md`](../go-services/CLAUDE.md). Runtime topology & deploy:
> [`docs/architecture.md`](../docs/architecture.md).

## Read this first: what actually runs in production

Two runtimes coexist. Node runs every service here and every background worker; `go-services/` runs only `status` and
`assets` (the Go workers were ported back to `jobs` and deleted, D3). **The source of truth for what runs in production
is the `command:` lines in `docker-compose.yml`** — not the README, not old docs.

Current production (Docker Compose on the VPS):

| Service                                        | Runtime  | Port                          | Entry                                                  |
| ---------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------ |
| `web` (Nitro SSR)                              | **Node** | 7005 (blue/green spare: 7015) | `server/web-cluster.mjs` → `.output/server/worker.mjs` |
| `socket` (games hub)                           | **Node** | 7001                          | `dist-server/server/socket-server/index.cjs`           |
| `rmhbox` (party games)                         | **Node** | 7676                          | `dist-server/server/rmhbox/index.cjs`                  |
| `rmhtube` (watch together)                     | **Node** | 7003                          | `dist-server/server/rmhtube/index.cjs`                 |
| `ladder-worker` (job cron)                     | **Node** | —                             | `dist-server/server/ladder-worker/index.cjs`           |
| `homes-worker` (listings cron)                 | **Node** | —                             | `dist-server/server/homes-worker/index.cjs`            |
| `medschools-worker` (CycleTrack + Admit + SDN) | **Node** | —                             | `dist-server/server/medschools-worker/index.cjs`       |
| `jobs` (pg-boss async backbone)                | **Node** | —                             | `dist-server/server/jobs/index.cjs`                    |
| `status`                                       | **Go**   | 7008                          | `/app/bin/status`                                      |
| `assets`                                       | **Go**   | 7007                          | `/app/bin/assets`                                      |
| `minio`                                        | infra    | 9000/9001                     | S3-compatible store                                    |

Consequences:

- `server/status/` was **replaced by Go** (the Go `status` binary) and its dead Node source was **deleted in the rewrite
  reap (R0-T5)**; `server/vibe-worker/` and `server/bot-worker/` were deleted too and their Go replacements have since
  moved to the `jobs` worker (D3, below) — recover from git history (or the `pre-rewrite-*` tags) if a rollback ever
  needs them.
- The Go realtime hubs (gamehub/rmhbox/rmhtube) and the `gateway` were **removed in the rewrite** — they never served
  production traffic. Apache routes `/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/` and `/` straight to the Node ports; these
  hubs here are the realtime tier. RMHMusic (the piano & guitar learning app) has no hub or socket handler: it is web
  tier only, over HTTP routes under `app/routes/api/rmhmusic/learn/`.

## Directory guide

### Active in production

- **`socket-server/`** — unified Socket.IO hub, port 7001, path `/socket/`. Hosts many games/apps on one default
  namespace: Slice It, Neon Driftway, Synapse Storm, RMH Type, RMH Study, Altair, Kowloon Knockout, Rochester Offensive,
  casino games (Blackjack/Hold'em/Baccarat/Roulette), Lights Out, Doctrine, Velum, Dream Rift, RMH TF2 (server browser
  and peer-to-peer signaling only — every match runs in a player's browser; see `docs/tf2-game.md` §Multiplayer hosting;
  Hearthworks co-op signaling and host migration, `features/hearthworks/server/p2p.ts` over the generic
  `p2p/signal-hub.ts`, contract `features/hearthworks/engine/net/events.ts` — the hub never carries game state).
  - **Soft auth**: anonymous connections allowed; a valid Better Auth session token attaches
    `socket.data.userId/userName/avatarUrl`.
  - **Handler contract**: `handlers/<game>.ts` exports `register<Game>Handlers(io, socket)` +
    `handle<Game>Disconnect(io, socket)` (casino games also `initialize<Game>(io)` at boot, and a `…OnShutdown()`
    (casino: now `features/casino/server/`, order in `CASINO_SHUTDOWN_REFUNDS`) that `shutdown()` in `index.ts` calls
    before `io.close()` to refund every debited-but-unsettled stake and kill the tables — contract in
    `features/casino/server/casino-shutdown.ts`; a new casino game needs one). Registered per-connection in `index.ts`.
    Isolation is by event-name prefix (`rmhtype:*`, `altair:*`, `bj:*`, …) + socket.io rooms — **no namespaces**.
  - **Durable casino tables (third-pass audit OP3, OFF by default).** Enabled only when `CASINO_DURABLE_TABLES=1` AND
    `REDIS_STATE_URL` (the `redis-state` plane, never the cache-plane `REDIS_URL`) is reachable at boot; otherwise
    `openCasinoTableStore()` returns `null`, nothing is constructed and every casino game refunds at shutdown as above.
    **Blackjack, roulette and baccarat are on it. Hold'em is not** and cashes out at shutdown either way (why: last
    bullet). Files, all in `features/casino/server/`: `table-store.ts` (the `CasinoTableStore` contract, Redis and
    in-memory; one key per table `casino:table:<game>:<roomId>`, set index `casino:tables:<game>`, **no TTL**: an
    expired table would be lost coins; the boot connect is `server/shared/redis-state.ts`, shared with rmhbox's lobby
    store), `table-persistence.ts` (coalesced 500 ms save per table from `broadcastTableState`, an immediate save after
    any stake moves, remove on destroy), `<game>-table-state.ts` (the stored shape, zod-validated, `v: 1`; no timers,
    socket ids or deadlines), `stake-keys.ts` / `stake-ledger.ts` (the ledger keys and the read at restore),
    `durable-shutdown.ts` (save or refund). `restoreCasinoTables(io)` runs **before `listen()`**, one game after
    another; one game failing does not stop the next.
    - **What is stored.** Blackjack: seats, bets, hands, dealer cards, turn order and the whole shoe in draw order.
      Roulette: seats, every bet, the history and, while the wheel spins, the number it landed on (`lastResult`; an
      entry that says `spinning` with no number does not parse). Baccarat: seats, bets, both hands as drawn so far, the
      history and the whole shoe. Roulette and baccarat also store `settling` (the settlement had started, so its
      history and statistics are already counted).
    - **Saved or refunded, never both.** With the store on, each game's entry in `CASINO_SHUTDOWN_REFUNDS` snapshots
      every table synchronously (before `io.close()`, so the disconnect fan-out cannot forfeit a turn or refund the
      betting phase), empties its maps and writes the snapshots in one call. Nothing is refunded. If the store does not
      acknowledge the write within half the casino deadline, every unsettled stake is refunded instead, under the key
      `<game>-return:<stakeId>` (`saveTablesOrRefund`).
    - **Ledger keys.** Prefixes `bj`, `rl`, `bacc`. A blackjack bet mints a `stakeId` on its seat; in roulette and
      baccarat the first bet on a seat mints it, later bets ride on it, and clearing the bets drops it (the next bet is
      a new stake). With the store on, the round's payout is credited under `<game>-payout:<stakeId>` and a stake given
      back unplayed (cleared, the player left during betting, or the failed-save refund above) under
      `<game>-return:<stakeId>`. Restore reads both for every staked seat it is about to bring back. A `return` row: the
      stake comes off the seat. A `payout` row for ANY stake at a table: the old process settled that round after the
      stored copy was written (one transaction pays the whole table), so the round is not paid or played again and takes
      no new stake; the table comes back between rounds. A settlement that does run a second time (saved mid-payout
      before its transaction committed) credits nothing twice. If that ledger read fails at boot, tables with a stake
      are not restored on that boot and stay in the store.
    - **Restore.** Every seat comes back disconnected; the player returns through the game's ordinary `join_room`
      reconnect branch (these three clients already rejoin their seat). Clocks: every betting window reopens at its full
      length (blackjack 15 s, roulette 25 s, baccarat 20 s) with the bets already placed still on their seats; blackjack
      insurance 10 s and turn 30 s restart in full; a blackjack round waiting on the dealer's reveal, a roulette spin
      that had landed and a baccarat deal in progress each pay 10 s after the restore. The roulette wheel is not spun
      again: the stored number is paid. A baccarat deal is not replayed card by card: the third cards are drawn at once
      from the stored shoe by the rules and the whole hands are shown to whoever rejoins. A player who does not return
      is handled by the existing rules: the blackjack turn clock stands the hand, every payout is credited by user id,
      the results sweep prunes the seat; 30 s after the restore a seat still absent outside a round leaves the table (a
      bet placed in the betting phase is refunded under its `return` key). An entry that does not parse is logged
      (`<bj|rl|bacc>_table_unreadable`) and left in the store.
    - **Turning it off** with tables still in the store leaves their stakes there: the off path never reads the store.
      Turn it off only after a boot with it on has logged `bj_tables_restored`, `rl_tables_restored` and
      `bacc_tables_restored` and those rounds have ended.
    - **Known gaps.** After a crash (no shutdown) a table comes back as of its last acknowledged save, so a stake
      debited after that save is lost, as every stake is with the switch off. If the saves had been failing since before
      a round was settled, and every seat lost that round (no `payout` row exists: the ledger holds no zero-amount
      rows), the stored round is played again; closing that needs a settled marker outside the coin ledger, which means
      a table and a migration. A change to a stored shape needs a migration or an empty store: an entry of another
      version is left unread.
    - **Why Hold'em is not on the store.** (1) Its chips move between seats in memory (blinds, calls, pots) and only the
      buy-in and the cash-out touch the ledger, so no per-stake key can tell a restore that an older stored copy is
      wrong: a seat cashed out after the copy was written took chips the copy still shows on other seats, and restoring
      it mints or loses coins. It needs a cash-out key per seat and a rule for a copy older than a cash-out (for
      example, the stored table total less the cash-out rows since), which is an owner decision. (2) It has no rejoin
      path: the hub folds and cashes out a seat the moment its socket drops, and the client goes back to the lobby on
      reconnect because `holdem:join_room` is a buy-in (`features/casino/engine/holdem/socket.ts`). A restored table
      would hold seats nobody can return to; that needs a seat hold on disconnect and a client change. (3) `endHand`
      finishes through a closure and two timed showdown steps that would have to become restorable states.
    - Tests: `features/casino/server/__tests__/{blackjack,roulette,baccarat}-durable-tables.test.ts` (fake timers,
      in-memory store and ledger) and `testing/integration/casino-restart.test.ts` (real Socket.IO, Postgres ledger,
      Redis when `INTEGRATION_REDIS_STATE_URL` is set; blackjack and baccarat).
  - **Feature handlers (redesign A1):** a moved feature keeps its handlers in `features/<id>/server/` and
    default-exports one `FeatureSocketServer` from `features/<id>/server/index.ts`; `socket-server/features.ts` lists
    them and `index.ts` calls `registerFeatureHandlers` / `handleFeatureDisconnects` at the spot the hand-written calls
    sat (list order
    =
    registration order). Balatro is the first (`features/balatro/server/{p2p,queue}.ts`, hub state in `server/hub/`).
    The Dockerfile `server-builder` stage copies `features/` as well as `server/` and `lib/`.
  - The rate-limit rule map in `config.ts` doubles as the catalog of valid inbound events — add new events there.
  - State: module-level in-memory `Map`s. Persistence (leaderboards, match results) via Prisma on completion.
- **`rmhbox/`** — party-game lobby hub, port 7676, path `/rmhbox-ws/`. **Hard auth** (Better Auth session OR Discord
  Activity OAuth token; unlinked Discord users get transient `discord:<id>` identities).
  - Lobby FSM:
    `WAITING → (VOTING|GAME_SETTINGS) → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING` (+
    `SESSION_RESULTS`, `DISBANDED`), driven by `StateSyncService` timers; host controls (skip/end/pause).
  - **Adding a minigame** requires touching THREE places: (1) `minigames/<id>/handler.ts` extending `BaseMinigame`
    (implement `start`, `handleInput`, `getStateForPlayer`, `getStateForSpectator`, `computeResults`, `spectatorMode`);
    (2) register the class in `MINIGAME_SERVER_REGISTRY` in `game-coordinator.ts` (import + map entry); (3) add client
    metadata + settings schema in `lib/rmhbox/minigame-registry.ts`. The two registries must stay in sync.
  - Lobbies live in memory; 15 s disconnect grace (`PEER_GRACE_MS`); match results persist fire-and-forget via
    `leaderboard.ts`.
  - **Durable lobbies (redesign D2 step 2, OFF by default).** Enabled only when `RMHBOX_DURABLE_LOBBIES=1` AND
    `REDIS_STATE_URL` (the `redis-state` plane: AOF, noeviction — never the cache-plane `REDIS_URL`) is reachable at
    boot; otherwise `openLobbyStore()` returns `null`, no hook is installed and lobbies are lost on restart exactly as
    before. `lobby-store.ts` holds the pure `serializeLobby` / `deserializeLobby` / `planRestore`, the `LobbyStore`
    contract and its Redis (`rmhbox:lobby:<id>` JSON `{ v: 1, … }`, 30 min TTL refreshed per save, set index
    `rmhbox:lobbies`) and in-memory implementations. `lobby-persistence.ts` wires it in: `LobbyManager.markChanged`
    (called from `broadcastAction`, except `TIMER_TICK`, and from `StateSyncService.broadcastFullSync`, lobby creation
    and session end) arms one coalesced save per lobby (500 ms); disband removes the key; `shutdown()` in `index.ts`
    awaits a full `saveAll()` before exit (bounded by the forced-exit timer); boot restores before `listen()`.
    **Survives a restart:** the lobby, host, settings, seats, cumulative scores, match history, round number, chat, the
    Discord voice-channel binding. **Does not:** a round in progress (or a vote / game-settings draft) — the lobby
    returns to `WAITING` with "The server restarted; the round was cancelled.", round scores cleared. Lobbies in
    `SESSION_RESULTS` are not restored. Every restored member starts disconnected: players get the normal grace hold,
    spectators one grace window, so a lobby nobody returns to disbands as it does today; `attemptReconnect` hands a
    returning user their seat because `userToLobby` is restored. Sequence numbers continue `RESTORED_SEQ_GAP` above the
    stored value. Corrupt or wrong-version entries are logged and deleted. Tests:
    `rmhbox/__tests__/durable-lobbies.test.ts`.
- **`rmhtube/`** — watch-together hub, port 7003, path `/rmhtube-ws/`. Hard auth. Leader-authoritative sync (2s
  heartbeat), media queue, chat. **Restores rooms from DB on boot** (rmhbox restores lobbies only with durable lobbies
  on; see above).
- **`ladder-worker/`** — RMHLadder job-discovery pipeline consumer. No port. The schedule is a **pg-boss cron** (queue
  `ladder.pipeline`, `exclusive`, UTC, `LADDER_CRON_SCHEDULE`, default every 12h): the worker registers the queue +
  schedule through `lib/jobs/scheduled-consumer.server.ts` and consumes it, the `jobs` worker's timekeeper fires it (D4:
  there is no `node-cron` anywhere). The DB worker-lease stays as a second guard against a redelivered run.
  Self-bootstraps an empty DB on startup (seed → probe sources → queue a run if empty/stale). Manual triggers:
  `pnpm ladder:seed | ladder:probe | ladder:run`. The daily data-lifecycle cleanup that used to live here is the
  `ops.data-cleanup` cron in `jobs` (`lib/cleanup-job.server.ts`).
- **`homes-worker/`** — RMHHomes listings-scraper consumer. No port. pg-boss cron (queue `homes.scrape`, `exclusive`,
  UTC, `HOMES_CRON_SCHEDULE`, default every 6h), same `scheduled-consumer` pattern as the ladder worker. Aggregates
  configured public RSS housing feeds into `EXTERNAL` `HomeListing` rows and notifies watchers. Bootstraps a first run
  on startup when RSS sources exist and no external listings have been fetched yet. Built by `pnpm build` and run as its
  own compose service.
- **`medschools-worker/`** — RMH Med Schools CycleTrack ingest consumer. No port. **Live signal:** after committing
  new Admit or SDN events the jobs publish a bare `{ at }` on the realtime bus (`rt:medschools:live`, coalesced to one
  per 5 s, never throwing; `features/medschools/live-signal.server.ts`), which web's `/api/medschools/live/stream`
  relays to open `/med` pages; the service gets web's `REDIS_URL` in `docker-compose.yml` for it. Two pg-boss crons (queues
  `medschools.cycletrack`, hourly at :20, `MEDSCHOOLS_CYCLETRACK_CRON`; and `medschools.backfill`, a yearly no-op safety
  net because a cron is mandatory), both `exclusive`, UTC, same `scheduled-consumer` pattern as the homes worker. Both
  jobs share one `createPoliteHost(SOURCES.CYCLETRACK)`, so they never overlap on CycleTrack. Bootstraps by seeding the
  registry and cycles from `data/medschools/*.json` (inlined by esbuild), then queues the cycletrack run only; the end
  of every hourly tick queues the resumable backfill while one is owed (`needsBackfill`), so a halted backfill resumes
  without a restart and the two never race. `MEDSCHOOLS_CYCLETRACK_ENABLED=false` disables the hourly run, the bootstrap
  and the cron backfill (only a manual `runNow({ manual: true })` bypasses it); Shutdown pauses all four consumers,
  waits up to `MEDSCHOOLS_SHUTDOWN_DEADLINE_MS` (8 s) for runs in flight, then stops the shared pg-boss. Two Admit.org
  queues join them (both `exclusive`, `retryLimit: 0`): `medschools.admit-live` (every 5 min,
  `MEDSCHOOLS_ADMIT_LIVE_CRON`, expires after 20 min) and `medschools.interviews` (daily `35 4 * * *`,
  `MEDSCHOOLS_INTERVIEWS_CRON`, expires after 3 h). Both Admit jobs share ONE `createPoliteHost(SOURCES.ADMIT)`,
  separate from the CycleTrack host. The host is FIFO, so while the ~600-request interviews walk runs (about 15 min)
  live requests interleave one-for-one: a live tick may run long and the in-flight guard drops the next tick; the live
  feed's 6 h window absorbs that. A third Admit queue, `medschools.admit-history` (daily `10 3 * * *`,
  `MEDSCHOOLS_ADMIT_HISTORY_CRON`, `exclusive`, `retryLimit: 0`, expires after 3 h, same host and gate), backfills the
  whole cycle from each member's profile history (`features/medschools/scrape/run-admit-history.ts`), and is queued once
  at start while `admitHistoryOwed` (no run has completed). Both Admit event jobs first run the one-time guarded ADMIT
  re-key (`admit-rekey`, see `features/medschools/CLAUDE.md`). Hardening: `guard.ts` (the overlap guard) now treats a
  run in flight longer than its queue's expiry as hung (every expiring tick passes it: the Admit, SDN and rmh-publish
  ticks use their queue's `*_EXPIRY_S` constant, pinned by `wiring.test.ts`; cycletrack and its backfill pass none), logs loudly and lets the next tick start; the interviews and
  history runs end themselves at a 150 min deadline; the interviews tick and run log when they start, what they will
  work on, and when stats fetching halts (with the failure). Every polite host has a persisted daily request budget
  shared by its jobs (`MEDSCHOOLS_ADMIT_DAILY_REQUESTS` 3000, `MEDSCHOOLS_SDN_FORUMS_DAILY_REQUESTS` 2000,
  `MEDSCHOOLS_SDN_WWW_DAILY_REQUESTS` 1500, `MEDSCHOOLS_CYCLETRACK_DAILY_REQUESTS` 20000) and the history job a daily
  quota (`MEDSCHOOLS_ADMIT_HISTORY_DAILY_PROFILES` 600, `MEDSCHOOLS_ADMIT_HISTORY_MAX_PROFILES` per run); history
  requests are 3 s apart plus 0-1 s jitter and the SDN forums host is 3 s plus jitter. **User agent (owner
  2026-11-23):** every host is sent one static, honest agent, `MarlonJack/1.0 (contact: admin@rmhstudios.com)`
  (`MEDSCHOOLS_USER_AGENT` in `scrape/sources.ts`): the name and address the sources' admins know, no site URL so nobody
  can follow it back, and not a browser string; robots.txt matching uses it (a `MarlonJack` group, else `*`).
  `MEDSCHOOLS_ADMIT_ENABLED=false` disables both Admit crons (only a manual `runNow({ manual: true })` bypasses it;
  bootstrap queues no Admit run). Both Admit jobs refuse to run and log an error when `MEDSCHOOLS_DEDUPE_SECRET` is
  unset or under 16 characters; startup logs the same error without exiting, and CycleTrack never reads the secret.
  Bootstrap also seeds the reviewed Admit aliases (`seedAdmitAliases`) and logs a warning naming any conflicting pairs
  it skipped. Admit rules the readers depend on. (1) Program: a profile lookup yields an opaque per-run token redeemable
  only for `md_phd`; `true` is MD-PhD, anything else on an existing profile is MD, and no profile means program not
  reported (`null`). The `user_id` is held in memory for the run, never stored or logged; it is hashed only inside the
  adapter's member-key closures (the event key and the progress hash). Admit stats, interview profiles and questions
  carry `program = null`; later readers filter or label them (never per-program curves). (2) Cycle year is event-type
  aware (`cycleYearOf`, UTC): decisions roll over on 1 September, interviews on 1 July, secondaries on 1 June, so summer
  acceptances stay in that August's class. (3) Admit school stats (`getSchoolStats`) are a cumulative snapshot over all
  reported cycles, refreshed daily and stored under the current cycle at fetch time; readers must label them "Admit.org,
  all reported cycles". (4) Alias misses: the admin page is `/admin/medschools`
  (`components/admin/medschools/AliasMissesPanel`; endpoints `/api/admin/medschools/alias-misses` with `/map` and `/ignore`,
  registered modules in `features/medschools/api/`). Mapping keeps the one-key-per-source rule (a school has one alias
  key per source; an existing alias is never moved). Alias seeding is not gated by `MEDSCHOOLS_ADMIT_ENABLED`. (5) A
  GraphQL `errors` reply to a profile lookup defers that user and does not count toward the three-strike halt. (6)
  `pnpm i18n:extract` scans `features/medschools/**` (scoped in `i18next.config.ts`); other feature folders are
  not yet scanned. Built by `pnpm build` and run as its own compose service. **SDN (Student Doctor Network) connector,
  phase 2b.** Three more queues (all `exclusive`, `retryLimit: 0`, UTC): `medschools.sdn-live` (daily at 12:20 UTC,
  off-peak, `MEDSCHOOLS_SDN_LIVE_CRON`, expires after 25 min: RSS feeds, then the changed threads),
  `medschools.sdn-backfill` (monthly `15 0 1 * *`, `MEDSCHOOLS_SDN_BACKFILL_CRON`, expires after 3 h: a safety net that
  also covers the budget reset) and `medschools.rmh-publish` (daily at 00:05 UTC, expires after 10 min, no flag and no
  secret: the public snapshot of the RMH tracker counts, `features/medschools/scrape/run-rmh-publish.ts`; skips when an
  OK run started under 20 h ago, from `MedSourceRun`) and `medschools.sdn-interviews` (weekly, `50 5 * * 1`,
  `MEDSCHOOLS_SDN_INTERVIEWS_CRON`, expires after 1 h: summary-page interview reports, no model). The backfill has its
  own queue (spec section 8 names one shared backfill queue; this is a recorded deviation: its own cadence, budget share
  and host session) and no bootstrap trigger: the live tick queues it, after its own run, while
  `sdnBackfillOwed(prisma, now, aiConfigured)` says it is owed, and a manual `runNow({ manual: true })` can too. Two
  polite hosts, each separate from the CycleTrack and Admit hosts: `SOURCES.SDN_FORUMS` (forums.studentdoctor.net,
  shared by live and backfill, the backfill taking the slower `backfillSpacingMs` session on it) and `SOURCES.SDN_WWW`
  (www.studentdoctor.net, interviews only). `MEDSCHOOLS_SDN_ENABLED=false` disables the three crons, the live tick's
  backfill queueing and nothing else (only a manual `runNow({ manual: true })` bypasses it; bootstrap queues no SDN run;
  alias seeding is not gated). All three SDN jobs refuse to run without `MEDSCHOOLS_DEDUPE_SECRET` (16+ characters;
  manual never bypasses it); CycleTrack and Admit are unaffected. Shutdown pauses all seven consumers and waits for the
  in-flight SDN runs with the others. Bootstrap also calls `seedSdnAliases` and `seedSdnIgnoredMisses` from
  `data/medschools/sdn-aliases.json`, each in its own try/catch so neither can block CycleTrack's or Admit's bootstrap,
  and logs the skipped (conflicting) and unmatched keys. Update `data/medschools/sdn-forums.json` each cycle (D10); the
  live tick reports `staleForumConfig` when it is out of date. SDN rules the readers depend on. (1) **Program (D1):** an
  SDN event is MD unless the thread or post states MD-PhD, DO-PhD or MSTP; an unlabelled post counts as MD (the owner's
  SDN exception to spec section 4a, which otherwise never defaults to MD). (2) **Cursor (D2):** `MedSdnThread` stores a
  cursor that holds an HMAC keyed by the dedupe secret, never a post id; dedupe hashes are `HMAC('SDN:post:' + id)` and
  nothing person-shaped is stored (no username, author, avatar, raw post body or permalink). (3) **Cycle year (D7):**
  `cycleYearOf(eventDate, type) === thread.cycleYear`, so SDN buckets match phase 2a's event-type rule. (4) **Scrubbing
  (D4):** before a post reaches the model, quoted replies are stripped and email addresses, URLs, `@handles` and US
  phone numbers are redacted (`[phone]`); names cannot be redacted reliably, so a name in post text MAY reach the model,
  but it is never stored: every interview question is rewritten and scrubbed (`scrubQuestion`) before it is written. (5)
  **AI budget (D5):** `MEDSCHOOLS_AI_MONTHLY_USD` (default 20) is the UTC-month ceiling on `medschools-extract` spend,
  read from `AiUsage.costMicros` before every call (a ledger read error fails closed). **Phase 6 split:** the member-facing
  Q&A (`medschools-qa`) reserves `MEDSCHOOLS_QA_AI_SHARE` of that cap (default 0.25, `features/medschools/ai-budget.ts`) and
  the worker hands both scrape gates the remainder (`scrapeCapUsd`) as THEIR cap, so the percentages below (the backfill's
  80%, the forums' 40%) apply inside the smaller cap: with the defaults the scrape has $15 and Q&A $5 of the $20. The web tier's per-member daily question cap is by tier (R19): `MEDSCHOOLS_QA_DAILY_CAP` (free, 25), `MEDSCHOOLS_QA_DAILY_CAP_APPROVED` (40, an admin approved the member's limit request) and `MEDSCHOOLS_QA_DAILY_CAP_MEMBER` (100, a paying member); an admin has none. An invalid value closes that tier (cap 0). `MEDSCHOOLS_QA_THINKING` (`on` by default, `off` hides the Ask page's "Think it through" switch and makes the server ignore `think`; an invalid value is off) lets a member run the answer call with DeepSeek thinking on (R20): same `medschools-qa` task, so its spend is metered into the Q&A share, one against the daily cap. Live may use all of it; the
  backfill stops at 80% (`BACKFILL_SHARE`), pauses during DeepSeek peak hours (`isDeepseekPeak`, Mon-Fri UTC 01-04 and
  06-10) and backs off after failed runs: 1 h, doubling per consecutive failed run, capped at 24 h (Q23; budget, peak,
  cap and AI-off pauses are benign and never back off). Per-run caps: `MEDSCHOOLS_SDN_MAX_LLM_CALLS` (40) and
  `MEDSCHOOLS_SDN_BACKFILL_MAX_LLM_CALLS` (150). With no `DEEPSEEK_API_KEY` AI is not configured: extraction stores
  nothing and keeps its cursors, the live tick queues no backfill, startup warns, and the interviews job still runs. The
  real provider's `AiUsage` insert opens at most one extra connection through `lib/prisma.server`, inside the
  `DATABASE_POOL_SIZE=3` slack, so the compose value is unchanged. **AI cost.** (a) Extraction runs on `DEEPSEEK_FLASH`
  with thinking off, temperature 0. (b) The system message is byte-identical on every call
  (`systemFor(MEDSCHOOLS_EXTRACT)`: no date, school, cycle or count; all of that is in the user turn), so DeepSeek's
  prompt cache hits on the prefix; `extract.test.ts` holds it. (c) AI runs off-peak only: a non-manual `sdn-live` at
  peak makes no request (`outcome: 'paused-peak'`), the backfill refuses at peak, and a manual run's model calls are
  refused at peak too. `sdn-live` and `sdn-backfill` also skip a non-manual run when a real (non-manual, OK or PARTIAL,
  not a zero-work skip) run started within 20 h (`lastRealRunWithin`, read from `MedSourceRun`;
  `outcome: 'skipped-min-interval'`), so duplicate triggers, restarts and a mistyped cron cannot run them more than
  about daily. Schedules are pg-boss rows, so a deploy does not fire a run early. (d) The monthly cap
  (`MEDSCHOOLS_AI_MONTHLY_USD`) is summed from `AiUsage` in the database, so it survives restarts; the backfill stops at
  80% of it. (6) **Alias keys (D6):** SDN is a multi-key source: a school holds one alias per thread stem plus a
  `summary:<CODE>/<slug>` key; a key owned by another school is skipped, never moved. Unmapped keys land on
  `/admin/medschools` like Admit's. (7) **Permission and Content-Signal:** the SDN owners gave written permission on
  2026-11-20 for all data provided it is anonymized. `studentdoctor.net` sends
  `Content-Signal: search=yes, ai-input=yes, ai-train=no`: RMH trains no model, and sending text to a hosted model for
  extraction is input, not training. Robots allow `/forums/` and `/threads/` and disallow `/members/`, `/goto/`,
  `/search/` and `/find-threads/`; the connector never logs in and never touches a disallowed path. Endpoint facts:
  `docs/superpowers/specs/2026-11-20-rmh-medschool-source-endpoints.md`. **Admit school forums (owner 2026-11-23).** An
  eighth cron queue, `medschools.admit-forums` (`exclusive`, `retryLimit: 0`, expires after 40 min, run ends itself at
  30), every 3 hours UTC (`0 */3 * * *`, `MEDSCHOOLS_ADMIT_FORUMS_CRON`; fired by the `jobs` timekeeper like the
  others), behind `MEDSCHOOLS_ADMIT_ENABLED`, the dedupe secret and its own `MEDSCHOOLS_ADMIT_FORUMS_ENABLED`. It reads
  Admit's native school threads through GraphQL (`getAllSchoolThreads`, then `getSchoolThread` from a per-thread
  persisted cursor in `MedAdmitForumThread`: a post count and an HMAC of the last post, never text or an id), so a run
  reads only new posts. **Fetch anytime, model off-peak:** the 03, 06 and 09 weekday runs (`isDeepseekPeak`) only list
  the threads and persist their counts (`outcome: 'held-peak'`; the count past the cursor is the held state, no text
  kept); the next off-peak run reads the held range. A persisted 2.5 h minimum interval (`lastRealRunWithin`,
  `outcome: 'skipped-min-interval'`) stops extra runs after a deploy. **No duplicates:** posts mirrored from SDN are
  skipped (`isSdnMirror`: Admit has no source field, so a fail-closed content-and-shape check), native events key on the
  Admit member key (`adapters/admit/member-key.ts`, shared with the tracker feed and history) or a per-post key when the
  author id is absent. **Budgets:** calls are labelled `medschools-extract:admit-forums` and gated by
  `createForumsBudgetGate` (the month's total under `MEDSCHOOLS_AI_MONTHLY_USD`, the forums' own spend under
  `MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE` of it, default 0.4, so SDN keeps at least 60%); per run
  `MEDSCHOOLS_ADMIT_FORUMS_MAX_REQUESTS` (80) and `MEDSCHOOLS_ADMIT_FORUMS_MAX_LLM_CALLS` (60); the job's own daily
  quota `ADMIT:forums` (`MEDSCHOOLS_ADMIT_FORUMS_DAILY_REQUESTS`, 600) sits inside the ADMIT host budget, whose default
  went from 3000 to 3500 for it. Requests use the shared Admit host's backfill session (3 s plus 0-1 s jitter,
  Retry-After, three-strike halt). No `DEEPSEEK_API_KEY`: counts are tracked, no post is fetched, cursors kept, PARTIAL.
  Detail: `features/medschools/CLAUDE.md`.
  **Admit curriculum (roadmap item 11, phase C).** `medschools.admit-curriculum` (`exclusive`, `retryLimit: 0`, expires
  after 15 min, tick guarded with `maxRuntimeMs` equal to that expiry and the run ending itself at 5 min), Saturday 02:25
  UTC (`25 2 * * 6`, `MEDSCHOOLS_ADMIT_CURRICULUM_CRON`; fired by the `jobs` timekeeper), behind
  `MEDSCHOOLS_ADMIT_ENABLED` and its own `MEDSCHOOLS_ADMIT_CURRICULUM_ENABLED`; a manual run bypasses both. It makes
  **one** GraphQL request (`getAllSchoolCurriculum`, about 190 schools) on the shared Admit host, so the request and
  its robots.txt check spend the persisted `ADMIT` daily budget and the host's spacing and three-strike halt apply. No
  model call and no dedupe secret (the reply holds no person). A persisted 6 day minimum interval
  (`lastRealRunWithin`, `outcome: 'skipped-min-interval'`) stops extra runs after a deploy; the worker queues the first
  run at start while none has finished OK or PARTIAL (`admitCurriculumOwed`). Result: `MedSchoolFact` rows with source
  `ADMIT` and a `MedSourceRun` (job `admit-curriculum`); detail in `features/medschools/CLAUDE.md`.
  **Admit school results (owner 2026-11-27).** `medschools.admit-school-results` (daily `50 5 * * *`,
  `MEDSCHOOLS_ADMIT_SCHOOL_RESULTS_CRON`, `exclusive`, `retryLimit: 0`, expires after 3 h, same Admit host, gate and
  dedupe secret as the other Admit event jobs): one `getCycleResultsBySchool` request per active school and cycle, the
  daily pass for the cycle in progress and then, while owed, a one-time pass for the two before it (each ends itself at
  80 min). Queued at start while the past pass is owed (`schoolResultsPastOwed`). Detail:
  `features/medschools/CLAUDE.md`.
  **Forecast job (phase 5).** `medschools.forecast` (daily at 06:40 UTC, `MEDSCHOOLS_FORECAST_CRON`, `exclusive`,
  `retryLimit: 0`, expires after 20 min, tick guarded with `maxRuntimeMs` equal to that expiry and a `shouldStop` one
  minute before it; cron owned by the `jobs` timekeeper through `startScheduledConsumer`; no flag, no secret and **no
  model call**). `features/medschools/scrape/run-forecast.ts` fits `MedForecast` (REG and PHD, five charted event types,
  one row per source with data) from each floored public series (`engine/floor.ts` `floorWhere` plus `seriesBySource`, so an unpublished or
  sub-k RMH figure never moves a band), then `run-wait-curves.ts` rebuilds the aggregate `MedWaitCurve` rows (only where
  20 distinct sharing members and 10 invites contribute; weekly steps; a stored row is replaced only on a change of 3 or more, R13). Ledger `MedSourceRun` source `RMH`, job `forecast`; a non-manual run is
  skipped inside 20 h of an OK one; an ended cycle is not rewritten. Log lines carry counts only.
  **Secondaries job (secondaries tab).** `medschools.secondaries` (Sunday and Wednesday 05:35 UTC,
  `MEDSCHOOLS_SECONDARIES_CRON`, `exclusive`, `retryLimit: 0`, expires after 75 min, tick guarded with `maxRuntimeMs` equal to
  that expiry and a `shouldStop` one minute before it; cron owned by the `jobs` timekeeper through `startScheduledConsumer`;
  **no model call and no dedupe secret**). `features/medschools/scrape/run-secondaries.ts` makes two passes in one run, each
  with its own `MedSourceRun` row (job `secondaries`, source `ADMIT` then `SDN`): one page per active school and source,
  stalest check first, a school read inside 60 h skipped. Hosts: `SOURCES.ADMIT_WEB` (`med.admit.org`, Admit's public
  website, a different origin from the API host; 3 s plus 0-1 s jitter; its own daily budget `MEDSCHOOLS_ADMIT_WEB_DAILY_REQUESTS`,
  default 700, about three full runs) and the existing `SOURCES.SDN_WWW` host, whose session for this job is held to the
  same 3 s plus 0-1 s (the host's own 1.5 s is for interviews). Robots.txt, `Retry-After`, the three-strike halt and the
  static user agent are the polite host's; every response goes through `assertPage`, so a Cloudflare or error page is a
  failure on the session. A persisted minimum interval (`lastRealRunWithin`, 60 h, `outcome: 'skipped-min-interval'`, a
  ledger read error fails closed, a manual run bypasses it) stops extra runs after a deploy. **Missing data is not zero:** a
  page that gives nothing recognisable (markup changed, more than 40 prompts under a cycle, an empty page for a school
  that has stored prompts) leaves the stored rows untouched and marks `MedSecondaryCheck` UNAVAILABLE; five unreadable pages
  in a row end the pass. Observations are never deleted. Flags: `MEDSCHOOLS_SECONDARIES_ENABLED=false` turns the cron off
  (a manual run still works); each pass is also behind `MEDSCHOOLS_ADMIT_ENABLED` / `MEDSCHOOLS_SDN_ENABLED`. The tick re-tags
  prompts first (a no-op unless the keyword table's `THEMES_VERSION` moved). The page markup is UNVERIFIED against a live
  fetch (plan Facts 1). **Forum prompts (the only model call here).** The SDN live and backfill reads hand each chunk the
  event extraction has already committed to a second call (`scrape/sdn/secondaries.ts`, registry prompt
  `MEDSCHOOLS_SECONDARIES`, label `medschools-extract:secondaries`): posts that mention prompts or limits, asked for the
  school's essay questions quoted as text. A candidate is stored only if its post quotes it and it passes the
  reject-not-redact scrub (`engine/secondaries/scrub.ts`); only the thread URL is kept, never a post. **Off-peak only**
  (`isDeepseekPeak` is checked before every call, the retry included), inside its own share of the scrape cap
  (`MEDSCHOOLS_SECONDARIES_AI_SHARE`, default 0.1, invalid closes it; `scrape/secondaries-budget.ts`), counted in the run's
  `MEDSCHOOLS_SDN_MAX_LLM_CALLS` / `..._BACKFILL_MAX_LLM_CALLS`, fails closed on a ledger error, and can never lose an
  event or move a cursor (it runs after the chunk's commit and its failure is swallowed).
  `MEDSCHOOLS_SECONDARIES_FORUM_ENABLED=false` turns it off. Detail: `features/medschools/CLAUDE.md`.
- **`jobs/`** — the durable async backbone (rewrite R2). No port. A **pg-boss** consumer that drains queues and runs
  background work that used to block request handlers: `engagement.progression` (achievements/XP/quests/webhooks),
  `event.reminder` (T-24h/T-15m RSVP reminders), and the `email.weekly-digest` cron. D3 ports from the Go supervisor:
  `streak.reminder-sweep` (hourly), `lights-out.recap` (Lights Out → Discord recap, every 5 min; REST only, no gateway
  presence), `bot-worker.*` (the RMHark synthetic users, `lib/rmhark-ai/bot-worker.server.ts`: `maintain` every minute
  gated by the admin interval, `post` / `reply` every `BOT_POST_TICK_MS` / `BOT_REPLY_TICK_MS` (default 5 min), `dm`
  every `BOT_DM_TICK_MS` (default 1 min); registers nothing without `DEEPSEEK_API_KEY`), `vibe-worker.thumbnails`
  (RMHVibe gallery thumbnails, `lib/rmhvibe/thumbnail-worker.server.ts`: every minute, up to 5 `thumbnailStale` pages
  per batch (drains while batches are full and progressing), Playwright against the OS Chromium
  (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, in the slim image's `runtime-chromium` layer; the `jobs` service has
  `mem_limit` 1792m and `HOME=/tmp` for it), WebP to object storage, optimistic `updatedAt` clear; `exclusive`, no
  retries; always registered), and `doctrine.*` (`daily-puzzles` 00:00 UTC + at boot, `sahur-activation` every minute,
  `reputation-decay` hourly on Mondays; `features/doctrine/engine/jobs.server.ts`). The status service watches the recap
  and sahur queues in pg-boss (B06) and `doctrine_puzzle` itself (A19). Hourly `ops.deepseek-balance` (`:05` UTC,
  `lib/jobs/maintenance.server.ts`) samples the DeepSeek account balance into `deepseek_balance_snapshot` for
  `/admin/deepseek` and prunes rows older than 400 days; it skips silently when `DEEPSEEK_API_KEY` is unset.
  `ops.data-cleanup` (daily 04:00 UTC session/verification/notification/comment-view purge, `exclusive`, no retries).
  `ops.db-census` (third-pass audit DT1, `lib/admin/census.server.ts`: ticks daily at 03:40 UTC and stores the month's
  table and product census in `db_census_snapshot` only when that month has no row, so a worker that was down on the 1st
  catches up the next night; `exclusive`, no retries; read at `/admin/census`). **The Discord bot** (D3,
  `server/discord-bot/`: Alex `/chat` + the tamagotchi + the `/sohumtracker` tracker; the Go original, `cmd/supervisor`
  and `cmd/discord-bot` are deleted, this is the only copy) runs here whenever `DISCORD_BOT_TOKEN` or
  `DISCORD_ACTIVITY_BOT_TOKEN` is set (outside `NODE_ENV=production` it also needs `DISCORD_BOT_GUILD_ALLOWLIST`, so a
  dev `.env` with the shared token stays off the production bot); otherwise it logs `discord_bot.disabled` and
  unschedules its crons. The gateway (`@discordjs/ws`, REST via `@discordjs/rest`, imported only then) lives in this
  process, and its Go tickers are the crons `discord-bot.care-tick` (`6-59/10`), `discord-bot.watch-flush` (every
  minute), `discord-bot.watch-identity` (`:23`) and `discord-bot.watch-summary` (`11-59/30`), each a no-op until READY.
  `discord-bot.gateway-heartbeat` (every minute) is the B07 signal: its job completes only while the gateway is READY,
  and the status service raises B07 when the last completed one is over 5 minutes old. The `jobs` limits (1792m, 1.5
  CPU) carry it. On SIGTERM it closes the gateway, lets in-flight replies finish (`DISCORD_BOT_DRAIN_GRACE`, 60 s,
  beside pg-boss's 30 s; `stop_grace_period` is 90 s) and closes the tracker's open sessions. `guard.ts` holds the
  live-test limits (`DISCORD_BOT_GUILD_ALLOWLIST`, `DISCORD_BOT_CHANNEL_ALLOWLIST`): never set them in production. Owns
  pg-boss queue maintenance/scheduling (the web tier is send-only). **It is the only scheduler (D4):** background work
  is a pg-boss cron here, or a queue its own worker consumes (ladder, homes); `lib/__tests__/scheduler-ratchet.test.ts`
  allowlists the per-process `setInterval`s that remain (SSE keepalives, cache GC, hub game ticks) and fails on a new
  one. Degrades safely: with no `DATABASE_URL` it exits and the web tier runs the work inline. Logic lives in
  `lib/jobs/` + `lib/social/engagement-effects.server.ts`. `jobs/index.ts` is a boot sequence plus one `REGISTRATIONS`
  table (a new queue family is one row; `registry.ts` isolates failures and logs `jobs.started` /
  `jobs.register_failed`). `jobs/queue-policy.ts` wraps the pg-boss instance the `register*` functions get: scheduled
  queues are polled every 5-30 s instead of pg-boss's 2 s default (unscheduled, user-fed queues keep 2 s), and its
  `SCHEDULE_OVERRIDES` table spreads the `*/N` sweeps off minute 0 — a new sweep should pick an offset there. Heavy SDKs
  (`openai`, `sharp`, `undici`) are imported on first use in their leaf modules, not at load, so the idle worker does
  not carry them.
- **`nitro/`** — not a service: Nitro startup plugins for the web tier, registered in `vite.config.ts`.
  `reflect-metadata.ts` (required by the Better Auth passkey plugin — do not remove), `security-headers.ts`
  (defense-in-depth response headers), `anon-html-cache.ts` (marks anonymous default-locale HTML on an audited path
  allowlist edge-cacheable, and authenticated HTML `private, no-cache` — never `no-store`, which would cost every
  signed-in page its back/forward-cache eligibility), and `warmup.ts` (per-worker cold-start warmup: opens the Prisma
  pool + primes the anon homepage feed/sidebar caches so the first request after a deploy/restart isn't cold).
- **Metrics** — every Node process runs the `lib/perf/` collector (`process-metrics.ts`); each hub serves
  `GET /internal/metrics` (compose-network only, optional `INTERNAL_METRICS_TOKEN`), web workers and `jobs` publish to
  Redis. Read at `/admin/performance`; see `docs/runbooks/performance-metrics.md`.
- **`web-cluster.mjs`** — the web container's PID 1 (Dockerfile `CMD`). A cluster primary that runs Nitro's
  `.output/server/worker.mjs` × `WEB_WORKERS`, REPLACES a worker that exits (logging its exit code or signal; `SIGKILL`
  is the OOM killer) and forwards SIGTERM so the workers drain. It exists because Nitro's own node-cluster primary forks
  once and never replaces a worker: two deaths took the whole container down (2026-10-21). Tested by
  `server/__tests__/web-cluster.test.ts`.
- **`shared/`** — `createLogger(service)` (structured JSON lines), `createServerPrismaClient(logger)`
  (`@prisma/adapter-pg`, pool `SERVER_DB_POOL_SIZE` default 5), `createRateLimiter(rules)` (per `socketId:event` sliding
  window), `session-auth.ts` (the ONE Better Auth session check — see Auth below), `redis-adapter.ts` (opt-in Socket.IO
  Redis adapter) and `redis-state.ts` (`connectStateRedis`: the one bounded boot-time connect to the `redis-state`
  plane, used by rmhbox's lobby store and the casino table store). **Room/lobby abstractions are NOT shared** — each hub
  owns its own.

### Deleted (replaced by Go)

The dead Node fallbacks — `vibe-worker/` (Playwright thumbnail renderer), `bot-worker/` (synthetic AI feed users),
`status/` (status page) — were removed in the rewrite reap (R0-T5). `status` lives in `go-services/internal/status/`
(the Go `status` binary) — see `go-services/CLAUDE.md`; the bot-worker and the vibe-worker now run in `jobs`. Recover
the old Node source from git history if a rollback ever needs it.

## Dev, build, prod

- **Dev:** `pnpm dev`
  =
  concurrently Vite (7005) + socket-server + rmhbox + rmhtube + ladder-worker + homes-worker +
  medschools-worker + jobs, each under `tsx watch`. The Go `status` does not run in dev; the Discord bot starts in
  `jobs` only with a token AND `DISCORD_BOT_GUILD_ALLOWLIST` (dev is not `NODE_ENV=production`). The recap, doctrine and
  bot-worker crons run in `jobs` (D3), so they do (the bot-worker idles without `DEEPSEEK_API_KEY`).
- **Build order is load-bearing:** `pnpm build`
  =
  build-vibe-packages → `vite build` → esbuild bundles exactly **7 entrypoints** (socket-server, rmhbox, rmhtube,
  ladder-worker, homes-worker, medschools-worker, jobs) into `dist-server/**/*.cjs` with
  `--packages=external` (deps, including the generated Prisma client, resolve at runtime — `prisma generate` must have
  run).
- **Adding a new Node service** requires editing the `build` and `start` scripts in `package.json` AND
  `docker-compose.yml`. First ask whether it should be a pg-boss cron in `jobs` instead (D4: one scheduler); there are
  no Go workers any more (D3).
- **Prod:** Docker Compose via `deploy.sh` — **not PM2** (old README claim). Web deploys blue/green via
  `deploy/hotswap-web.sh` (spare port 7015, health-gated Apache flip).

## Client connection conventions

- Env: `VITE_SOCKET_URL`, `VITE_RMHBOX_SOCKET_URL`, `VITE_RMHTUBE_SOCKET_URL` (baked at build time as compose build
  args).
- Each app has a client singleton `lib/<app>/socket.ts` (`connect<App>()`, `getSocket()`, `disconnect<App>()`) that must
  pass the matching `path` (`/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/`).
- Auth handshake: socket.io `auth` callback sends `{ token }` (Better Auth session; rmhbox also accepts
  `{ discordToken, channelId, guildId }`).
- Event names: `<app>:<domain>:<action>` client→server; server→client names are centralized in `lib/<app>/events.ts` and
  imported by **both** sides — never inline event strings.
- Apache maps the external paths to loopback ports. Each hub serves `{"status":"ok","uptime":N}` at the **root `/health`
  of its own listener**; the public `<origin>/socket/health` · `/rmhbox-ws/health` · `/rmhtube-ws/health` paths are an
  Apache rewrite ONTO that endpoint, not a second one — and they only exist once `deploy/apache/rmhstudios.conf` has
  been hand-installed on the VPS (the deploy never touches `/etc/apache2`). The status service probes the internal
  `/health` for exactly that reason (`go-services/cmd/status`).

## Gotchas

1. **Single-instance assumption.** All hub state is process-local. The `@socket.io/redis-adapter` is wired in each hub
   but OFF unless `REALTIME_REDIS_ADAPTER=1` (and `REDIS_URL` reachable at boot; `shared/redis-adapter.ts`; otherwise
   logged, in-memory adapter, hub still starts) but that only lays the backplane: **room/lobby/ stake state still lives
   in process memory**. rmhbox's opt-in durable lobbies and the opt-in durable casino tables (`CASINO_DURABLE_TABLES=1`)
   (above) survive a restart of ONE instance; they are not a shared live store (each process still owns its Maps), so
   running two replicas is NOT yet safe. Do not raise replica counts.
2. **Auth.** Every hub validates a Better Auth session through `shared/session-auth.ts` (`createSessionAuth().resolveSocketSession`):
   the credential is the raw token in socket.io `handshake.auth.token` (no hub reads cookie/bearer/`?token=`; widening
   that is a deliberate security change in `extractSessionToken`), a `session JOIN user` lookup, expiry check, and a
   bounded 60 s positive cache (`createAuthCache`). Hubs only adapt the result: socket-server soft (non-ok
   =
   anonymous), rmhbox/rmhtube hard (`AUTH_REQUIRED` / `AUTH_FAILED` / `SESSION_EXPIRED`). Discord Activity OAuth (rmhbox
   `discordToken`, socket-server `discordToken`) is a different credential and stays in the hubs.
3. rmhtube persists rooms; rmhbox persists lobbies only with `RMHBOX_DURABLE_LOBBIES=1` + `REDIS_STATE_URL` (off by
   default), and never a round in progress. socket-server persists blackjack, roulette and baccarat tables, round in
   progress included, only with `CASINO_DURABLE_TABLES=1` + `REDIS_STATE_URL` (off by default); Hold'em and every other
   game room there are memory only.
4. Leaderboard/match writes are fire-and-forget — never block gameplay on DB success.
5. Per-socket rate limits reset on reconnect; the rule maps in each `config.ts` are the de-facto event allowlists.
6. `tsconfig.server.json` includes more than gets bundled — esbuild's 7 entrypoints (socket-server, rmhbox, rmhtube,
   ladder-worker, homes-worker, medschools-worker, jobs) are the truth.
7. **Server code imports `lib/` RELATIVELY, never through `@/`.** esbuild does apply the `paths` map in
   `tsconfig.server.json`, so `@/lib/x` resolves — right up until the file isn't in the image's build context (gotcha
   8). Then the map misses, the specifier falls back to looking like a package name, and `--packages=external` emits a
   literal `require("@/lib/x")` with no error at all. It throws `MODULE_NOT_FOUND` on load, which for a top-level import
   means the service dies on start. That is how the whole socket hub shipped dead once — every casino table and
   multiplayer game unreachable — off one `@/lib/economy/ledger-core`. A relative specifier fails loudly at build time
   instead, which is the entire reason for this rule.
8. **Don't import outside `server/`, `lib/` and `features/`.** The `server-builder` stage copies exactly those three
   trees (`features/` since A1: moved handlers live there), so `pnpm build` (whole working tree) can pass while the
   image build fails with "Could not resolve" — or, via gotcha 7, doesn't fail at all and ships a bundle that crashes on
   boot. A new `lib/` import is now free (the stage copies `lib/` wholesale; it used to be a curated per-module `COPY`
   list, and adding one import to a handler was a deploy-time build break). Reaching into `components/`, `stores/` or
   `hooks/` is still the old failure, so shared code belongs in `lib/`. `lib/__tests__/server-bundle-copies.test.ts`
   walks the real import graph (following `@/…` as well as relative specifiers) and catches this in `web-ci`, before it
   reaches main.

## Before you commit to `server/`

`pnpm check:consistency` (repo `CLAUDE.md` → "The commit gate") runs before every commit; it includes
`lib/__tests__/server-bundle-copies.test.ts`, which is the only thing standing between a new `lib/` import and a service
that dies on boot. Also confirm:

- [ ] **Relative imports into `lib/`, never `@/`** (gotcha 7) — a relative specifier fails loudly at build time; `@/`
      can ship a bundle that throws `MODULE_NOT_FOUND` on start.
- [ ] **Nothing is imported from outside `server/` and `lib/`** (gotcha 8) — those are the only trees the image's build
      context carries, and `pnpm build` passing says nothing about the image build.
- [ ] **The event name lives in `lib/<app>/events.ts`** and both sides use it; per-socket rate-limit rule maps in each
      `config.ts` are the de-facto event allowlist, so a new event needs an entry or it is silently dropped.
- [ ] **Auth strictness matches the hub** (socket-server soft; rmhbox / rmhtube hard), and gameplay never blocks on a
      leaderboard/match write.
- [ ] **No new cron or `setInterval` sweep** — periodic background work is a pg-boss cron registered in `jobs/index.ts`
      (`exclusive` where reentrancy matters, a deliberate `retryLimit`, ticks that catch their own errors).
      `scheduler-ratchet.test.ts` fails on a new server-side `setInterval`.
- [ ] The service still starts: `pnpm dev` boots all seven workers/hubs, and a broken import surfaces immediately there.
