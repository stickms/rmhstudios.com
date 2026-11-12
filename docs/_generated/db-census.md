# Database and product census (audit DT1)

> LOCAL DEVELOPMENT SNAPSHOT. This is a census of a development database, not of production. It shows the shape of the report and nothing about real use: do not decide a tier or a drop (DT2) from it. Run `DATABASE_URL=<production url> pnpm db:census --origin production` and commit the result to replace this file.

Taken 2026-11-12T11:05:48.054Z (UTC) from PostgreSQL 16.15 by `pnpm db:census`.
Statistics counters start: never reset (start unknown).
No stored snapshot is 90 days old yet, so no table is judged by a counter difference.

## What the columns mean

Postgres does not record when a table was last written. The table columns are what it does record:

- **Rows**: `n_live_tup`, the planner's estimate of live rows. Not a count.
- **Writes**: rows inserted, updated and deleted since the statistics counters started (above).
- **Index reads**: index scans since the counters started. Sequential scans are left out: a backup makes one per table.
- **Newest row**: the largest `updatedAt` or `createdAt`, read only where it is cheap (an index on the column, or a heap of at most 1024 kB). It dates the last insert (or, for `updatedAt`, the last change Prisma made); a delete never shows.
- **Autoanalyze**: when autovacuum last analysed the table, which it does only after enough rows changed.
- **90 days**: `active`, `quiet` or `unknown`, with the sign it rests on (rule: `tableQuiet` in lib/admin/census.ts).

Product actives are distinct signed-in users in the last 30 days, from playtime heartbeats (`game_playtime_day`) and history visits (`history_entry`), grouped by catalogue id. Signed-out visitors are not counted anywhere.

## Summary

- Tables: 494. Empty by estimate: 486. Quiet for 90 days: 1. Unknown: 478.
- Catalogue products: 34. With 30-day actives: 1. Quiet for 90 days: 31.

## Products

| Product | Kind | 30-day actives | Playtime | History | Players, all time | Last active | Measured |
|---|---|---:|---:|---:|---:|---|---|
| studio | app | 1 | 1 | 0 | 1 | 2026-11-10 | yes |
| altair | game | 0 | 0 | 0 | 0 |  | yes |
| csgo | game | 0 | 0 | 0 | 0 |  | yes |
| daily-puzzles | game | 0 | 0 | 0 | 0 |  | yes |
| dream-rift | game | 0 | 0 | 0 | 0 |  | yes |
| dunesday | app | 0 | 0 | 0 | 0 |  | yes |
| gabriels-horn | game | 0 | 0 | 0 | 0 |  | yes |
| half-life-2 | game | 0 | 0 | 0 | 0 |  | yes |
| hearthworks | game | 0 | 0 | 0 | 0 |  | yes |
| house-always-wins | game | 0 | 0 | 0 | 0 |  | yes |
| kowloon-knockout | game | 0 | 0 | 0 | 0 |  | yes |
| laundry-sort | game | 0 | 0 | 0 | 0 |  | yes |
| neon-driftway | game | 0 | 0 | 0 | 0 |  | yes |
| nightrail | game | 0 | 0 | 0 | 0 |  | yes |
| portal | game | 0 | 0 | 0 | 0 |  | yes |
| rmh-connections | app | 0 | 0 | 0 | 0 |  | no |
| rmh-strategies | app | 0 | 0 | 0 | 0 |  | yes |
| rmh-tf2-hud | app | 0 | 0 | 0 | 0 |  | yes |
| rmhbox | game | 0 | 0 | 0 | 0 |  | yes |
| rmhcalculator | app | 0 | 0 | 0 | 0 |  | yes |
| rmhcode | app | 0 | 0 | 0 | 0 |  | yes |
| rmhdle | app | 0 | 0 | 0 | 0 |  | no |
| rmhhomes | app | 0 | 0 | 0 | 0 |  | yes |
| rmhladder | app | 0 | 0 | 0 | 0 |  | yes |
| rmhmusic | app | 0 | 0 | 0 | 0 |  | yes |
| rmhstudy | app | 0 | 0 | 0 | 0 |  | yes |
| rmhtube | app | 0 | 0 | 0 | 0 |  | yes |
| rmhtype | app | 0 | 0 | 0 | 0 |  | yes |
| slice-it | game | 0 | 0 | 0 | 0 |  | yes |
| synapse-storm | game | 0 | 0 | 0 | 0 |  | yes |
| temple-of-joy | game | 0 | 0 | 0 | 0 |  | yes |
| velum2099 | game | 0 | 0 | 0 | 0 |  | yes |
| versecraft | game | 0 | 0 | 0 | 0 |  | yes |
| void-breaker | game | 0 | 0 | 0 | 0 |  | yes |

## Tables

| Table | Rows | Writes | Index reads | Bytes | Newest row | Autoanalyze | 90 days |
|---|---:|---:|---:|---:|---|---|---|
| AltairPlayer | 0 | 0 | 22 | 73728 |  |  | unknown |
| Chart | 0 | 0 | 22 | 65536 |  |  | unknown |
| ChartPack | 0 | 0 | 22 | 40960 |  |  | unknown |
| ChartPackItem | 0 | 0 | 0 | 32768 |  |  | unknown |
| ChartRevision | 0 | 0 | 0 | 24576 |  |  | unknown |
| DreamRiftCoopRun | 0 | 0 | 0 | 32768 |  |  | unknown |
| DreamRiftPlayer | 0 | 0 | 22 | 49152 |  |  | unknown |
| GabrielsHornPlayer | 0 | 0 | 26 | 40960 |  |  | unknown |
| LaundryPlayer | 0 | 0 | 22 | 49152 |  |  | unknown |
| Media | 0 | 0 | 22 | 40960 |  |  | unknown |
| NeonDriftwayPlayer | 0 | 0 | 22 | 40960 |  |  | unknown |
| NightrailPlayer | 0 | 0 | 22 | 40960 |  |  | unknown |
| Player | 0 | 0 | 22 | 40960 |  |  | unknown |
| SignalForgePlayer | 0 | 0 | 22 | 147456 | 2026-11-10 (updatedAt, scan) |  | active (newest-row) |
| Song | 0 | 0 | 22 | 147456 |  |  | unknown |
| SongComment | 0 | 0 | 0 | 32768 |  |  | unknown |
| SongLeaderboard | 0 | 0 | 22 | 57344 |  |  | unknown |
| SongLike | 0 | 0 | 22 | 24576 |  |  | unknown |
| SongPlay | 0 | 0 | 22 | 24576 |  |  | unknown |
| Subscription | 0 | 0 | 24 | 32768 |  |  | unknown |
| VegaPlayer | 0 | 0 | 22 | 49152 |  |  | unknown |
| VoidBreakerPlayer | 0 | 0 | 22 | 40960 |  |  | unknown |
| _prisma_migrations | 1 | 3 | 2 | 131072 |  |  | unknown |
| account | 1 | 44 | 33 | 98304 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| achievement_rarity | 0 | 0 | 0 | 16384 |  |  | unknown |
| achievement_tip | 0 | 0 | 22 | 32768 |  |  | unknown |
| achievement_tip_vote | 0 | 0 | 22 | 24576 |  |  | unknown |
| activity | 0 | 0 | 22 | 40960 |  |  | unknown |
| admin_audit_log | 1 | 14 | 25 | 65536 |  |  | unknown |
| advent_claim | 0 | 0 | 22 | 24576 |  |  | unknown |
| ai_persona | 0 | 0 | 22 | 32768 |  |  | unknown |
| ai_persona_message | 0 | 0 | 22 | 24576 |  |  | unknown |
| ai_usage | 0 | 0 | 41 | 32768 |  |  | unknown |
| album | 0 | 0 | 0 | 32768 |  |  | unknown |
| album_slide | 0 | 0 | 0 | 32768 |  |  | unknown |
| altair_coop_profile | 0 | 0 | 22 | 40960 |  |  | unknown |
| altair_match | 0 | 0 | 0 | 40960 |  |  | unknown |
| altair_match_player | 0 | 0 | 41 | 40960 |  |  | unknown |
| altair_meta_progress | 0 | 0 | 22 | 24576 |  |  | unknown |
| altair_solo_run | 0 | 0 | 22 | 49152 |  |  | unknown |
| api_idempotency_key | 0 | 0 | 19 | 32768 |  |  | unknown |
| api_usage_daily | 0 | 0 | 0 | 32768 |  |  | unknown |
| appearance_preference | 1 | 42 | 184 | 32768 |  |  | unknown |
| arcade_rival | 0 | 0 | 63 | 40960 |  |  | unknown |
| arcade_seed_run | 0 | 0 | 31 | 40960 |  |  | unknown |
| arcade_streak | 0 | 0 | 22 | 16384 |  |  | unknown |
| availability_poll | 0 | 0 | 22 | 40960 |  |  | unknown |
| availability_poll_invitee | 0 | 0 | 22 | 32768 |  |  | unknown |
| availability_poll_response | 0 | 0 | 22 | 32768 |  |  | unknown |
| backfill_checkpoint | 0 | 0 | 0 | 16384 |  |  | unknown |
| blog_post | 0 | 0 | 12 | 114688 |  |  | unknown |
| bot_worker_settings | 0 | 0 | 0 | 16384 |  |  | unknown |
| bracket_pick | 0 | 0 | 22 | 32768 |  |  | unknown |
| build_category | 0 | 0 | 0 | 32768 |  |  | unknown |
| build_comment | 0 | 0 | 0 | 24576 |  |  | unknown |
| build_grant | 0 | 0 | 22 | 32768 |  |  | unknown |
| build_like | 0 | 0 | 22 | 24576 |  |  | unknown |
| build_manifest | 0 | 0 | 0 | 32768 |  |  | unknown |
| build_tag | 0 | 0 | 0 | 32768 |  |  | unknown |
| build_unlock | 0 | 0 | 22 | 32768 |  |  | unknown |
| build_version | 0 | 0 | 0 | 24576 |  |  | unknown |
| build_view | 0 | 0 | 22 | 32768 |  |  | unknown |
| bulk_operation | 0 | 0 | 22 | 32768 |  |  | unknown |
| calc_notebook | 0 | 0 | 22 | 24576 |  |  | unknown |
| calendar_feed | 0 | 0 | 22 | 32768 |  |  | unknown |
| calendar_feed_slot | 0 | 0 | 22 | 24576 |  |  | unknown |
| call | 0 | 0 | 44 | 40960 |  |  | unknown |
| call_mute | 0 | 0 | 52 | 32768 |  |  | unknown |
| canvas_cooldown | 0 | 0 | 22 | 24576 |  |  | unknown |
| canvas_event | 0 | 0 | 0 | 24576 |  |  | unknown |
| canvas_placement | 0 | 0 | 22 | 32768 |  |  | unknown |
| card_buy_order | 0 | 0 | 22 | 40960 |  |  | unknown |
| card_drop | 0 | 0 | 22 | 16384 |  |  | unknown |
| card_listing | 0 | 0 | 22 | 32768 |  |  | unknown |
| card_trade | 0 | 0 | 140 | 32768 |  |  | unknown |
| card_trade_item | 0 | 0 | 0 | 16384 |  |  | unknown |
| chart_review | 0 | 0 | 22 | 24576 |  |  | unknown |
| chat_folder | 0 | 0 | 22 | 24576 |  |  | unknown |
| chat_folder_item | 0 | 0 | 0 | 16384 |  |  | unknown |
| chat_pin | 0 | 0 | 0 | 40960 |  |  | unknown |
| client_error_group | 0 | 30 | 30 | 98304 |  |  | unknown |
| close_friend | 0 | 0 | 86 | 24576 |  |  | unknown |
| cohort_retention | 0 | 0 | 0 | 8192 |  |  | unknown |
| coin_stake | 0 | 0 | 24 | 24576 |  |  | unknown |
| coin_transaction | 0 | 0 | 109 | 98304 | 2026-11-12 (createdAt, index) |  | active (newest-row) |
| community | 0 | 0 | 7 | 40960 |  |  | unknown |
| community_announcement | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_automod_rule | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_census | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_census_participant | 0 | 0 | 22 | 24576 |  |  | unknown |
| community_census_tally | 0 | 0 | 0 | 16384 |  |  | unknown |
| community_challenge | 0 | 0 | 0 | 32768 |  |  | unknown |
| community_challenge_entry | 0 | 0 | 22 | 40960 |  |  | unknown |
| community_challenge_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| community_contributor_score | 0 | 0 | 22 | 24576 |  |  | unknown |
| community_event | 0 | 0 | 4 | 32768 |  |  | unknown |
| community_flair | 0 | 0 | 0 | 32768 |  |  | unknown |
| community_goal | 0 | 0 | 19 | 32768 |  |  | unknown |
| community_goal_pledge | 0 | 0 | 22 | 32768 |  |  | unknown |
| community_invite | 0 | 0 | 22 | 40960 |  |  | unknown |
| community_join_request | 0 | 0 | 22 | 40960 |  |  | unknown |
| community_member | 0 | 0 | 22 | 32768 |  |  | unknown |
| community_mod_item | 0 | 0 | 22 | 32768 |  |  | unknown |
| community_onboarding_answer | 0 | 0 | 22 | 32768 |  |  | unknown |
| community_onboarding_question | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_page | 0 | 0 | 0 | 32768 |  |  | unknown |
| community_page_revision | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_post_flair | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_sister | 0 | 0 | 0 | 24576 |  |  | unknown |
| community_star_post | 0 | 0 | 0 | 24576 |  |  | unknown |
| compute_grant | 0 | 0 | 22 | 24576 |  |  | unknown |
| connections_grid | 0 | 0 | 22 | 40960 |  |  | unknown |
| connections_play | 0 | 0 | 22 | 32768 |  |  | unknown |
| content_award | 0 | 0 | 22 | 32768 |  |  | unknown |
| content_report | 0 | 0 | 29 | 40960 |  |  | unknown |
| context_note | 0 | 0 | 41 | 49152 |  |  | unknown |
| context_note_rating | 0 | 0 | 22 | 32768 |  |  | unknown |
| conversation | 0 | 0 | 44 | 81920 |  |  | unknown |
| conversation_pref | 0 | 0 | 22 | 24576 |  |  | unknown |
| creator_membership | 0 | 0 | 64 | 57344 |  |  | unknown |
| creator_tier | 0 | 0 | 28 | 24576 |  |  | unknown |
| custom_feed | 0 | 0 | 34 | 65536 |  |  | unknown |
| custom_feed_subscription | 0 | 0 | 28 | 24576 |  |  | unknown |
| daily_digest_snapshot | 0 | 0 | 0 | 32768 | 2026-11-12 (createdAt, scan) |  | active (newest-row) |
| daily_puzzle | 0 | 0 | 0 | 24576 |  |  | unknown |
| daily_puzzle_score | 0 | 0 | 22 | 49152 |  |  | unknown |
| daily_streak | 0 | 0 | 22 | 49152 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| daily_wheel_spin | 0 | 0 | 24 | 32768 |  |  | unknown |
| db_census_snapshot | 1 | 16 | 24 | 204800 |  |  | unknown |
| deepseek_balance_snapshot | 0 | 0 | 19 | 40960 |  |  | unknown |
| delight_setting | 0 | 0 | 10 | 8192 |  |  | unknown |
| dev_recipe | 0 | 0 | 30 | 32768 |  |  | unknown |
| developer_api_key | 0 | 0 | 30 | 32768 |  |  | unknown |
| direct_message | 0 | 0 | 22 | 131072 |  |  | unknown |
| direct_message_hide | 0 | 0 | 22 | 24576 |  |  | unknown |
| direct_message_reaction | 0 | 0 | 22 | 32768 |  |  | unknown |
| direct_poll_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| discord_activity_channel | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_alex_caretaker | 0 | 0 | 0 | 24576 |  |  | unknown |
| discord_alex_channel_memory | 0 | 0 | 0 | 16384 |  |  | unknown |
| discord_alex_guild | 0 | 0 | 0 | 16384 |  |  | unknown |
| discord_alex_pet | 0 | 0 | 0 | 32768 | 2026-11-10 (updatedAt, scan) |  | active (newest-row) |
| discord_chat_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_daily_participant | 0 | 0 | 0 | 40960 |  |  | unknown |
| discord_daily_progress | 0 | 0 | 0 | 24576 |  |  | unknown |
| discord_watch_alert | 0 | 0 | 22 | 32768 |  |  | unknown |
| discord_watch_day | 0 | 0 | 0 | 24576 |  |  | unknown |
| discord_watch_live | 0 | 0 | 0 | 16384 |  |  | unknown |
| discord_watch_message | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_watch_presence_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_watch_status_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_watch_summary | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_watch_typing_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| discord_watch_voice_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| doctrine_access_log | 0 | 0 | 22 | 32768 |  |  | unknown |
| doctrine_disclosure | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_incident | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_incident_event | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_incident_report | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_puzzle | 0 | 0 | 0 | 40960 |  |  | unknown |
| doctrine_puzzle_replay | 0 | 0 | 22 | 24576 |  |  | unknown |
| doctrine_puzzle_submission | 0 | 0 | 22 | 40960 |  |  | unknown |
| doctrine_reaction | 0 | 0 | 22 | 40960 |  |  | unknown |
| doctrine_recruitment_code | 0 | 0 | 22 | 40960 |  |  | unknown |
| doctrine_reputation | 0 | 0 | 22 | 32768 |  |  | unknown |
| doctrine_reputation_ledger | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_safehouse_content | 0 | 0 | 0 | 24576 |  |  | unknown |
| doctrine_sahur_session | 0 | 0 | 0 | 32768 |  |  | unknown |
| dunesday_plan | 0 | 0 | 0 | 32768 |  |  | unknown |
| election_league | 0 | 0 | 22 | 32768 |  |  | unknown |
| election_league_member | 0 | 0 | 22 | 32768 |  |  | unknown |
| election_room | 0 | 0 | 22 | 40960 |  |  | unknown |
| elo_rating | 0 | 0 | 22 | 32768 |  |  | unknown |
| emoji_pack | 0 | 0 | 29 | 40960 |  |  | unknown |
| emoji_pack_item | 0 | 0 | 0 | 32768 |  |  | unknown |
| emoji_pack_subscription | 0 | 0 | 22 | 24576 |  |  | unknown |
| event_occurrence_rsvp | 0 | 0 | 22 | 40960 |  |  | unknown |
| event_rsvp | 0 | 0 | 22 | 32768 |  |  | unknown |
| experiment | 0 | 0 | 0 | 24576 |  |  | unknown |
| experiment_exposure | 0 | 0 | 22 | 32768 |  |  | unknown |
| feature_flag | 0 | 0 | 0 | 32768 |  |  | unknown |
| feature_request | 0 | 0 | 22 | 32768 |  |  | unknown |
| feature_request_vote | 0 | 0 | 22 | 16384 |  |  | unknown |
| feed_announcement | 0 | 0 | 0 | 24576 |  |  | unknown |
| feed_announcement_poll | 0 | 0 | 0 | 24576 |  |  | unknown |
| feed_announcement_poll_option | 0 | 0 | 0 | 24576 |  |  | unknown |
| feed_announcement_poll_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| feed_signal | 0 | 0 | 45 | 24576 |  |  | unknown |
| feedback | 0 | 0 | 41 | 32768 |  |  | unknown |
| flashcard | 0 | 0 | 0 | 24576 |  |  | unknown |
| flashcard_deck | 0 | 0 | 22 | 40960 |  |  | unknown |
| flashcard_review | 0 | 0 | 22 | 32768 |  |  | unknown |
| follow | 0 | 0 | 215 | 57344 |  |  | unknown |
| fortune_cookie | 0 | 0 | 30 | 40960 |  |  | unknown |
| friendly_challenge | 0 | 0 | 44 | 32768 |  |  | unknown |
| gabriels_horn_table_read | 0 | 4 | 26 | 49152 |  |  | unknown |
| game_assist_preference | 0 | 0 | 28 | 16384 |  |  | unknown |
| game_badge | 0 | 0 | 22 | 16384 |  |  | unknown |
| game_collection_item | 0 | 0 | 118 | 16384 |  |  | unknown |
| game_guide | 0 | 0 | 0 | 24576 |  |  | unknown |
| game_guide_revision | 0 | 0 | 0 | 24576 |  |  | unknown |
| game_jam | 0 | 0 | 0 | 65536 |  |  | unknown |
| game_jam_entry | 0 | 0 | 22 | 40960 |  |  | unknown |
| game_jam_rating | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_night | 0 | 0 | 4 | 24576 |  |  | unknown |
| game_patch_note | 0 | 0 | 0 | 32768 |  |  | unknown |
| game_play_status | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_playtime | 0 | 0 | 118 | 49152 |  |  | unknown |
| game_playtime_day | 0 | 0 | 22 | 49152 |  |  | unknown |
| game_profile_showcase | 0 | 0 | 22 | 16384 |  |  | unknown |
| game_replay | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_review | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_review_vote | 0 | 0 | 22 | 16384 |  |  | unknown |
| game_save | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_stat | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_thread | 0 | 0 | 22 | 32768 |  |  | unknown |
| game_thread_post | 0 | 0 | 22 | 32768 |  |  | unknown |
| gem_entry | 0 | 0 | 22 | 24576 |  |  | unknown |
| gift_exchange | 0 | 0 | 22 | 32768 |  |  | unknown |
| gift_exchange_member | 0 | 0 | 44 | 40960 |  |  | unknown |
| gift_membership | 0 | 0 | 46 | 24576 |  |  | unknown |
| globeset_player | 0 | 0 | 22 | 32768 |  |  | unknown |
| glossary_term | 0 | 0 | 0 | 24576 |  |  | unknown |
| group_call | 0 | 0 | 22 | 57344 |  |  | unknown |
| group_call_participant | 0 | 0 | 22 | 32768 |  |  | unknown |
| group_chat | 0 | 0 | 0 | 16384 |  |  | unknown |
| group_chat_member | 0 | 0 | 22 | 32768 |  |  | unknown |
| group_message | 0 | 0 | 0 | 49152 |  |  | unknown |
| group_message_reaction | 0 | 0 | 22 | 32768 |  |  | unknown |
| group_poll_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| guestbook_entry | 0 | 0 | 44 | 32768 |  |  | unknown |
| handle_change | 0 | 0 | 22 | 32768 |  |  | unknown |
| hashtag | 0 | 0 | 7 | 32768 |  |  | unknown |
| held_notification | 0 | 0 | 22 | 24576 |  |  | unknown |
| history_entry | 0 | 0 | 22 | 32768 |  |  | unknown |
| home_favorite | 0 | 0 | 22 | 32768 |  |  | unknown |
| home_listing | 0 | 0 | 22 | 57344 |  |  | unknown |
| home_roommate_profile | 0 | 0 | 22 | 16384 |  |  | unknown |
| home_scrape_run | 0 | 0 | 0 | 24576 |  |  | unknown |
| home_source | 0 | 0 | 0 | 32768 |  |  | unknown |
| home_watch | 0 | 0 | 22 | 32768 |  |  | unknown |
| hunt | 0 | 0 | 0 | 24576 |  |  | unknown |
| hunt_clue | 0 | 0 | 0 | 24576 |  |  | unknown |
| hunt_progress | 0 | 0 | 22 | 40960 |  |  | unknown |
| image_gen_budget | 0 | 0 | 0 | 16384 |  |  | unknown |
| kaikai_debt_entry | 0 | 0 | 63 | 237568 | 2025-12-31 (createdAt, index) |  | quiet (newest-row) |
| keyword_alert | 0 | 0 | 33 | 32768 |  |  | unknown |
| keyword_alert_hit | 0 | 0 | 41 | 24576 |  |  | unknown |
| kudos | 0 | 0 | 44 | 32768 |  |  | unknown |
| ladder_ai_task | 0 | 0 | 22 | 40960 |  |  | unknown |
| ladder_alert | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_alert_delivery | 0 | 0 | 0 | 32768 |  |  | unknown |
| ladder_alert_event | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_answer_bank | 0 | 0 | 22 | 16384 |  |  | unknown |
| ladder_application | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_application_event | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_company | 0 | 0 | 0 | 24576 |  |  | unknown |
| ladder_interview_report | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_job | 0 | 0 | 0 | 57344 |  |  | unknown |
| ladder_job_action | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_job_match | 0 | 0 | 22 | 40960 |  |  | unknown |
| ladder_job_profile | 0 | 0 | 0 | 32768 |  |  | unknown |
| ladder_keyword | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_product_event | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_referral_offer | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_referral_request | 0 | 0 | 22 | 40960 |  |  | unknown |
| ladder_relevance_rule | 0 | 0 | 0 | 24576 |  |  | unknown |
| ladder_resume | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_resume_review | 0 | 0 | 22 | 32768 |  |  | unknown |
| ladder_resume_version | 0 | 0 | 22 | 40960 |  |  | unknown |
| ladder_review_task | 0 | 0 | 0 | 16384 |  |  | unknown |
| ladder_saved_search | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_scrape_run | 0 | 0 | 0 | 16384 |  |  | unknown |
| ladder_source | 0 | 0 | 0 | 24576 |  |  | unknown |
| ladder_source_error | 0 | 0 | 0 | 16384 |  |  | unknown |
| ladder_user_prefs | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_verification | 0 | 0 | 0 | 24576 |  |  | unknown |
| ladder_watchlist_entry | 0 | 0 | 22 | 24576 |  |  | unknown |
| ladder_worker_lease | 0 | 0 | 0 | 16384 |  |  | unknown |
| layout_preference | 0 | 0 | 22 | 16384 |  |  | unknown |
| library_collection | 0 | 0 | 22 | 40960 |  |  | unknown |
| library_collection_item | 0 | 0 | 0 | 32768 |  |  | unknown |
| library_document | 0 | 0 | 41 | 90112 |  |  | unknown |
| library_quota_request | 0 | 0 | 22 | 32768 |  |  | unknown |
| link_check | 0 | 0 | 0 | 32768 |  |  | unknown |
| link_domain_rule | 0 | 0 | 0 | 16384 |  |  | unknown |
| loadout_preset | 0 | 0 | 22 | 24576 |  |  | unknown |
| marathon_list | 0 | 0 | 22 | 32768 |  |  | unknown |
| market_listing | 0 | 0 | 29 | 40960 |  |  | unknown |
| member_memory | 0 | 0 | 22 | 32768 |  |  | unknown |
| memories_opt_in | 0 | 0 | 33 | 16384 |  |  | unknown |
| mod_macro | 0 | 0 | 0 | 24576 |  |  | unknown |
| music_learn_card | 0 | 0 | 22 | 24576 |  |  | unknown |
| music_learn_lesson_progress | 0 | 0 | 22 | 24576 |  |  | unknown |
| music_learn_profile | 0 | 0 | 22 | 24576 |  |  | unknown |
| ndw_livery | 0 | 0 | 22 | 16384 |  |  | unknown |
| news_article | 0 | 0 | 0 | 147456 |  |  | unknown |
| news_story | 0 | 0 | 0 | 24576 |  |  | unknown |
| news_story_article | 0 | 0 | 0 | 32768 |  |  | unknown |
| nightrail_trick | 0 | 0 | 22 | 32768 |  |  | unknown |
| nightrail_trick_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| notification | 0 | 0 | 128 | 98304 | 2026-11-12 (createdAt, scan) |  | active (newest-row) |
| notification_preference | 0 | 0 | 53 | 16384 |  |  | unknown |
| office_hours_booking | 0 | 0 | 44 | 32768 |  |  | unknown |
| office_hours_config | 0 | 0 | 22 | 24576 |  |  | unknown |
| office_hours_window | 0 | 0 | 0 | 24576 |  |  | unknown |
| ops_alarm_override | 0 | 0 | 0 | 16384 |  |  | unknown |
| ops_deploy_event | 0 | 0 | 0 | 16384 |  |  | unknown |
| ops_metric_minute | 0 | 0 | 0 | 57344 |  |  | unknown |
| outbox_event | 0 | 0 | 0 | 32768 |  |  | unknown |
| passkey | 0 | 0 | 24 | 32768 |  |  | unknown |
| pf2e_announcement | 0 | 0 | 0 | 32768 |  |  | unknown |
| pf2e_recap | 0 | 0 | 0 | 24576 |  |  | unknown |
| pf2e_session | 0 | 0 | 0 | 65536 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| pf2e_session_response | 0 | 0 | 22 | 32768 |  |  | unknown |
| pf2e_settings | 0 | 0 | 0 | 16384 |  |  | unknown |
| photo_nomination | 0 | 0 | 22 | 32768 |  |  | unknown |
| photo_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| pile_on_guard | 0 | 0 | 22 | 32768 |  |  | unknown |
| playlist | 0 | 0 | 22 | 24576 |  |  | unknown |
| playlist_collaborator | 0 | 0 | 22 | 32768 |  |  | unknown |
| playlist_item | 0 | 0 | 0 | 24576 |  |  | unknown |
| pool | 0 | 0 | 22 | 32768 |  |  | unknown |
| pool_contribution | 0 | 0 | 22 | 32768 |  |  | unknown |
| post_auto_delete | 0 | 0 | 28 | 24576 |  |  | unknown |
| post_code_embed | 0 | 0 | 0 | 16384 |  |  | unknown |
| post_hashtag | 0 | 0 | 0 | 40960 |  |  | unknown |
| post_lifecycle | 0 | 0 | 0 | 24576 |  |  | unknown |
| post_series | 0 | 0 | 29 | 49152 |  |  | unknown |
| post_series_follow | 0 | 0 | 29 | 32768 |  |  | unknown |
| post_series_item | 0 | 0 | 0 | 49152 |  |  | unknown |
| post_unlock | 0 | 0 | 22 | 32768 |  |  | unknown |
| prediction | 0 | 0 | 22 | 40960 |  |  | unknown |
| prediction_comment | 0 | 0 | 22 | 32768 |  |  | unknown |
| prediction_position | 0 | 0 | 22 | 32768 |  |  | unknown |
| prediction_season | 0 | 0 | 0 | 24576 |  |  | unknown |
| prediction_season_market | 0 | 0 | 0 | 24576 |  |  | unknown |
| profile_layout | 0 | 0 | 29 | 16384 |  |  | unknown |
| profile_link | 0 | 0 | 28 | 32768 |  |  | unknown |
| profile_plus | 0 | 0 | 29 | 16384 |  |  | unknown |
| profile_stamp | 0 | 0 | 22 | 32768 |  |  | unknown |
| profile_visit_day | 0 | 0 | 0 | 24576 |  |  | unknown |
| promo_claim | 0 | 0 | 22 | 24576 |  |  | unknown |
| push_subscription | 0 | 0 | 22 | 32768 |  |  | unknown |
| qotd_answer | 0 | 0 | 35 | 32768 |  |  | unknown |
| qotd_prompt | 0 | 0 | 16 | 32768 |  |  | unknown |
| ranked_challenge | 0 | 0 | 44 | 32768 |  |  | unknown |
| ranked_season_rating | 0 | 0 | 22 | 32768 |  |  | unknown |
| read_position | 0 | 0 | 22 | 24576 |  |  | unknown |
| reading_goal | 0 | 0 | 22 | 24576 |  |  | unknown |
| reading_highlight | 0 | 0 | 22 | 40960 |  |  | unknown |
| reading_highlight_passage | 0 | 0 | 0 | 24576 |  |  | unknown |
| reading_passage_stat | 0 | 0 | 0 | 32768 |  |  | unknown |
| reading_prefs | 0 | 0 | 22 | 16384 |  |  | unknown |
| reading_shelf_entry | 0 | 0 | 22 | 40960 |  |  | unknown |
| rebar_reservation | 0 | 0 | 22 | 40960 |  |  | unknown |
| recovery_code | 0 | 0 | 28 | 24576 |  |  | unknown |
| recovery_request | 0 | 0 | 28 | 32768 |  |  | unknown |
| redemption_request | 0 | 0 | 47 | 32768 |  |  | unknown |
| referral | 0 | 0 | 44 | 32768 |  |  | unknown |
| release_note | 0 | 0 | 0 | 24576 |  |  | unknown |
| reminder | 0 | 0 | 22 | 40960 |  |  | unknown |
| remix_edge | 0 | 0 | 0 | 32768 |  |  | unknown |
| ride | 0 | 0 | 44 | 40960 |  |  | unknown |
| ride_message | 0 | 0 | 22 | 32768 |  |  | unknown |
| ride_saved_place | 0 | 0 | 22 | 24576 |  |  | unknown |
| rideshare_driver | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhbox_match | 0 | 0 | 0 | 40960 |  |  | unknown |
| rmhbox_match_player | 0 | 0 | 19 | 49152 |  |  | unknown |
| rmhbox_pack | 0 | 0 | 22 | 40960 |  |  | unknown |
| rmhbox_pack_report | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhbox_profile | 0 | 0 | 22 | 40960 |  |  | unknown |
| rmhcode_token | 0 | 0 | 22 | 40960 |  |  | unknown |
| rmheet | 0 | 0 | 0 | 360448 |  |  | unknown |
| rmheet_bookmark | 0 | 0 | 22 | 40960 |  |  | unknown |
| rmheet_comment | 0 | 0 | 22 | 98304 |  |  | unknown |
| rmheet_comment_like | 0 | 0 | 22 | 24576 |  |  | unknown |
| rmheet_comment_reaction | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmheet_comment_repost | 0 | 0 | 22 | 24576 |  |  | unknown |
| rmheet_comment_view | 0 | 0 | 0 | 81920 |  |  | unknown |
| rmheet_edit | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmheet_like | 0 | 0 | 43 | 40960 |  |  | unknown |
| rmheet_poll | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmheet_poll_option | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmheet_poll_vote | 0 | 0 | 22 | 40960 |  |  | unknown |
| rmheet_reaction | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmheet_repost | 0 | 0 | 84 | 49152 |  |  | unknown |
| rmheet_take_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhstudy_profile | 0 | 0 | 22 | 49152 |  |  | unknown |
| rmhstudy_session | 0 | 0 | 0 | 40960 |  |  | unknown |
| rmhtube_chat_message | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmhtube_commentary_track | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhtube_heat_bucket | 0 | 0 | 0 | 16384 |  |  | unknown |
| rmhtube_queue_item | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmhtube_room | 0 | 0 | 0 | 24576 |  |  | unknown |
| rmhtube_room_member | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhtube_subscription | 0 | 0 | 44 | 32768 |  |  | unknown |
| rmhtube_timed_comment | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhtube_user_stats | 0 | 0 | 22 | 16384 |  |  | unknown |
| rmhtube_watch_later | 0 | 0 | 22 | 32768 |  |  | unknown |
| rmhtype_key_stat | 0 | 0 | 22 | 16384 |  |  | unknown |
| rmhtype_match | 0 | 0 | 0 | 32768 |  |  | unknown |
| rmhtype_match_player | 0 | 0 | 0 | 49152 |  |  | unknown |
| rmhtype_profile | 0 | 0 | 22 | 40960 |  |  | unknown |
| route_view_day | 0 | 49 | 49 | 73728 |  |  | unknown |
| save_folder | 0 | 0 | 22 | 24576 |  |  | unknown |
| saved_item | 0 | 0 | 22 | 40960 |  |  | unknown |
| saved_search | 0 | 0 | 22 | 32768 |  |  | unknown |
| savings_goal | 0 | 0 | 25 | 24576 |  |  | unknown |
| scheduled_gift | 0 | 0 | 44 | 40960 |  |  | unknown |
| scheduled_post | 0 | 0 | 22 | 32768 |  |  | unknown |
| scheduled_slot | 0 | 0 | 0 | 24576 |  |  | unknown |
| security_report | 0 | 0 | 0 | 32768 |  |  | unknown |
| seen_link_domain | 0 | 0 | 0 | 8192 |  |  | unknown |
| session | 45 | 99 | 0 | 131072 | 2026-11-12 (updatedAt, scan) | 2026-11-12 | active (newest-row) |
| shared_moment | 0 | 0 | 22 | 24576 |  |  | unknown |
| site_era | 0 | 0 | 0 | 24576 |  |  | unknown |
| site_idempotency_key | 0 | 0 | 41 | 32768 |  |  | unknown |
| skill_endorsement | 0 | 0 | 44 | 24576 |  |  | unknown |
| slice_daily_entry | 0 | 0 | 22 | 32768 |  |  | unknown |
| slice_note_stat | 0 | 0 | 0 | 16384 |  |  | unknown |
| slice_run | 0 | 0 | 22 | 49152 |  |  | unknown |
| slice_setlist | 0 | 0 | 22 | 32768 |  |  | unknown |
| space | 0 | 0 | 0 | 32768 |  |  | unknown |
| space_message | 0 | 0 | 0 | 24576 |  |  | unknown |
| speedrun_category | 0 | 0 | 0 | 32768 |  |  | unknown |
| speedrun_entry | 0 | 0 | 22 | 40960 |  |  | unknown |
| ss_lobby | 0 | 0 | 0 | 24576 |  |  | unknown |
| ss_lobby_member | 0 | 0 | 0 | 32768 |  |  | unknown |
| ss_match | 0 | 0 | 0 | 24576 |  |  | unknown |
| ss_player_match | 0 | 0 | 0 | 40960 |  |  | unknown |
| stamp | 0 | 0 | 22 | 40960 |  |  | unknown |
| storefront_product | 0 | 0 | 22 | 24576 |  |  | unknown |
| storefront_purchase | 0 | 0 | 22 | 32768 |  |  | unknown |
| studio_challenge | 0 | 0 | 0 | 24576 |  |  | unknown |
| studio_challenge_entry | 0 | 0 | 22 | 40960 |  |  | unknown |
| studio_challenge_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| study_buddy_match | 0 | 0 | 44 | 40960 |  |  | unknown |
| study_buddy_request | 0 | 0 | 22 | 40960 |  |  | unknown |
| study_plan | 0 | 0 | 22 | 24576 |  |  | unknown |
| synapse_storm_player | 0 | 0 | 22 | 32768 |  |  | unknown |
| targeted_notice | 0 | 0 | 6 | 24576 |  |  | unknown |
| targeted_notice_dismissal | 0 | 0 | 22 | 24576 |  |  | unknown |
| temple_of_joy_save | 0 | 0 | 22 | 24576 |  |  | unknown |
| tf2_hud | 0 | 0 | 22 | 65536 |  |  | unknown |
| tf2_hud_blob | 0 | 0 | 0 | 16384 |  |  | unknown |
| tf2_hud_like | 0 | 0 | 22 | 24576 |  |  | unknown |
| tf2_hud_share | 0 | 0 | 0 | 32768 |  |  | unknown |
| tf2_hud_user_blob | 0 | 0 | 22 | 24576 |  |  | unknown |
| tf2_hud_version | 0 | 0 | 0 | 24576 |  |  | unknown |
| tf2_loadout | 0 | 0 | 22 | 81920 |  |  | unknown |
| tf2_loadout_catalog | 0 | 0 | 0 | 16384 |  |  | unknown |
| tf2_loadout_like | 0 | 0 | 22 | 24576 |  |  | unknown |
| tournament | 0 | 0 | 15 | 32768 |  |  | unknown |
| tournament_entrant | 0 | 0 | 22 | 32768 |  |  | unknown |
| tournament_match | 0 | 0 | 0 | 40960 |  |  | unknown |
| tournament_payout | 0 | 0 | 0 | 32768 |  |  | unknown |
| translation_suggestion | 0 | 0 | 22 | 40960 |  |  | unknown |
| translation_vote | 0 | 0 | 22 | 32768 |  |  | unknown |
| trusted_contact | 0 | 0 | 62 | 32768 |  |  | unknown |
| user | 32 | 183 | 21 | 573440 | 2026-11-12 (updatedAt, scan) | 2026-11-12 | active (newest-row) |
| user_achievement | 0 | 0 | 29 | 65536 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| user_birthday | 0 | 0 | 29 | 24576 |  |  | unknown |
| user_block | 0 | 0 | 144 | 40960 |  |  | unknown |
| user_build | 0 | 0 | 39 | 90112 |  |  | unknown |
| user_card | 0 | 0 | 22 | 16384 |  |  | unknown |
| user_gems | 0 | 0 | 22 | 16384 |  |  | unknown |
| user_inventory | 0 | 0 | 266 | 40960 |  |  | unknown |
| user_list | 0 | 0 | 22 | 24576 |  |  | unknown |
| user_list_member | 0 | 0 | 22 | 24576 |  |  | unknown |
| user_mute | 0 | 0 | 69 | 32768 |  |  | unknown |
| user_play_limits | 0 | 0 | 30 | 16384 |  |  | unknown |
| user_profile | 0 | 0 | 685 | 131072 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| user_quest | 0 | 0 | 29 | 65536 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| user_season_progress | 0 | 0 | 36 | 49152 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| user_strike | 0 | 0 | 292 | 32768 |  |  | unknown |
| user_theme | 0 | 0 | 22 | 32768 |  |  | unknown |
| velum_contract | 0 | 0 | 44 | 49152 |  |  | unknown |
| verification | 4 | 4 | 0 | 81920 | 2026-11-12 (updatedAt, scan) |  | active (newest-row) |
| versecraft_gen_chapter | 0 | 0 | 0 | 24576 |  |  | unknown |
| versecraft_progress | 0 | 0 | 22 | 24576 |  |  | unknown |
| versecraft_save | 0 | 0 | 22 | 24576 |  |  | unknown |
| versecraft_seed_listing | 0 | 0 | 41 | 40960 |  |  | unknown |
| versecraft_seed_rating | 0 | 0 | 22 | 24576 |  |  | unknown |
| versecraft_world | 0 | 0 | 0 | 32768 |  |  | unknown |
| vibe_page | 0 | 0 | 0 | 40960 |  |  | unknown |
| vibe_page_version | 0 | 0 | 0 | 24576 |  |  | unknown |
| wager_match | 0 | 0 | 64 | 114688 |  |  | unknown |
| watch | 0 | 0 | 22 | 32768 |  |  | unknown |
| webhook_delivery | 0 | 0 | 0 | 32768 |  |  | unknown |
| webhook_endpoint | 0 | 0 | 22 | 24576 |  |  | unknown |
| webring | 0 | 0 | 22 | 40960 |  |  | unknown |
| webring_member | 0 | 0 | 22 | 32768 |  |  | unknown |
| wishlist_entry | 0 | 0 | 22 | 32768 |  |  | unknown |
