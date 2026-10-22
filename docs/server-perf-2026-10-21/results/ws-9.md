# WS9 — Go bot/vibe worker index follow-ups

Database: `rmh_ws9` (from `rmh_perf_template`; 150k `rmheet_comment`, 5k `conversation`,
`vibe_page` seeded to 20k rows with 20 stale). Queries are the exact strings from
`go-services/internal/{vibeworker/repo.go,botworker/repo_social.go}`, run with
`EXPLAIN (ANALYZE, BUFFERS)`; comment window 12 h and DM window 24 h as in `types.go`.

| Index | Query | Before | After | Verdict |
| --- | --- | --- | --- | --- |
| `vibe_page_stale_updated_idx` (partial, `thumbnailStale = true`) | vibe-worker `SelectStale`, every 10 s | Seq Scan + Sort, 348 buffers, 2.59 ms | Index Scan, 11 buffers, 0.14 ms | Ship |
| `rmheet_comment_created_live_idx` (partial, `deletedAt IS NULL`, `createdAt DESC`) | bot-worker `recentCommentsQuery` | Parallel Seq Scan + Sort, ~3.9k buffers (2.8k reads), 40 ms | Index Scan, ~1.4k buffers (243 reads), 4.2 ms cold | Ship |
| `conversation(lastMessageAt DESC)` | bot-worker `recentBotConversationsQuery` | Seq Scan on 5k rows, 1.07 ms warm | planner picks Bitmap Heap Scan, 1.07 ms warm, same 1055 buffers | Rejected |

## Notes

- The vibe index holds only rows awaiting a screenshot, so it is nearly empty in
  steady state. Write cost is one entry when a row flips stale and one when it flips back.
- Comment index write cost, worst case (rewriting 20k rows in one transaction):
  554 ms with the index, 305 ms without, about 12 us per row. Real traffic is single
  inserts, so this is negligible against a 10x read win.
- The conversation index was rejected: the table is small and the cost is dominated by the
  per-row `user` and `direct_message` lookups, not by finding the rows. Warm timing and buffer
  counts are identical with and without the index, so it would only add write cost to every
  message send. Revisit if `conversation` grows by orders of magnitude.
- Neither partial index is mirrored in `schema.prisma` (Prisma cannot express partial
  indexes); the migration comments warn against accepting a `migrate dev` drop. Both are a
  single `CREATE INDEX CONCURRENTLY` statement, and `scripts/check-migration-safety.ts`
  reports no finding for the new migrations.
