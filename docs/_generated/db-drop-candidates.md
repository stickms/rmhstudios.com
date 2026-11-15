# DB drop candidates (audit C3)

Generated 2026-11-10 from `prisma/schema/**` (511 models examined). Method: every identifier
in app/ components/ lib/ server/ scripts/ testing/ hooks/ stores/ cli/ packages/ deploy/ go-services/ (and other non-doc,
non-migration, non-generated text files) was indexed. "Accessor" = `.<lowerFirst(Model)>` appearing anywhere (any client
variable name: prisma, tx, db, ...; no dynamic `prisma[...]` access exists). "Table" = the `@@map` name (or model name)
appearing as a word in TS/Go/SQL/sh (raw SQL, Go repos, scripts). Models with zero accessor uses were then checked by
hand for relation-field use from live models (include/select/nested create/_count) and raw SQL.

Migrations and docs do not count as usage. Type-only references: none of the dropped models had any.

## Summary

- Models examined: 511. Zero accessor uses: 32. Dropped: 18. Kept after manual review: 14.
- No column is dropped from any surviving table (only virtual back-relation fields removed from User, Song, RMHark, CreatorTier, DoctrineSahurSession).

## Dropped (migration 20261110120000_drop_unused_tables)

| Model | Table | Accessor | Table refs (TS/Go/SQL/sh) | Relation use | Reason |
|---|---|---|---|---|---|
| ReferralMilestone | referral_milestone | 0 | 0 | none | never got code (F6) |
| ReadingRoom | reading_room | 0 | 0 | none | never got code (F9) |
| DoctrineSahurParticipation | doctrine_sahur_participation | 0 | 0 | none | marked DEAD; Go uses only doctrine_sahur_session |
| QuestChainProgress | quest_chain_progress | 0 | 0 | none | never got code (F19) |
| SongRating | SongRating | 0 | comment only | none | marked DEAD |
| AppSeasonStat | app_season_stat | 0 | 0 | none | never got code (F17) |
| MarchSignal | march_signal | 0 | 0 | none | idea R18, never got code |
| MarchSignalVote | march_signal_vote | 0 | 0 | none | child of MarchSignal |
| ProfileBlock | profile_block | 0 | 0 | none | never got code (F8) |
| RmhTubePlaylist | rmhtube_playlist | 0 | 0 | none | marked DEAD |
| RmhTubePlaylistItem | rmhtube_playlist_item | 0 | 0 | none | marked DEAD (child) |
| LedgerArtifact | ledger_artifact | 0 | Go internal/ledger only (deleted) | none | only go-services/internal/ledger (wired into no binary) |
| LedgerPlanRun | ledger_plan_run | 0 | Go internal/ledger only (deleted) | none | same |
| LedgerPlanStep | ledger_plan_step | 0 | Go internal/ledger only (deleted) | none | same |
| LedgerStepInput | ledger_step_input | 0 | Go internal/ledger only (deleted) | none | same |
| RMHarkView | rmheet_view | 0 | comment only | none | marked DEAD; views live in Redis hot-counters |
| CreatorPost | creator_post | 0 | 0 | none | never got code (F4) |
| PostAnalyticsDaily | post_analytics_daily | 0 | 0 | none | never got code (F5) |

## Zero-accessor models kept (still live)

| Model | Table | Why kept |
|---|---|---|
| PostCodeEmbed | post_code_embed | relation `RMHark.codeEmbed` selected in lib/code-embed/embed.server.ts, nested `codeEmbed: { create }` in api/rmharks.ts |
| FeedAnnouncementPoll | feed_announcement_poll | `option.poll` include in api/announcements/$id/vote.ts (DEAD comment was wrong) |
| BuildVersion | build_version | `UserBuild.versions` in api/account/export.ts and api/v1/builds/$slug.ts (DEAD comment was wrong) |
| CardTradeItem | card_trade_item | `CardTrade.items` include / nested create in lib/cards/trades.server.ts, account export |
| PredictionSeasonMarket | prediction_season_market | `PredictionSeason.markets` nested create / _count / include in lib/forecasting |
| DiscordChatSession | discord_chat_session | Go raw SQL (internal/discordbot) |
| DiscordAlexChannelMemory | discord_alex_channel_memory | Go raw SQL |
| DiscordAlexPet | discord_alex_pet | Go raw SQL |
| DiscordAlexGuild | discord_alex_guild | Go raw SQL |
| DiscordWatchPresenceSession | discord_watch_presence_session | Go raw SQL |
| DiscordWatchTypingSession | discord_watch_typing_session | Go raw SQL |
| DoctrineSahurSession | doctrine_sahur_session | Go raw SQL (internal/doctrine, pkg/db/models.go) |
| AchievementRarity | achievement_rarity | raw INSERT in lib/jobs/maintenance.server.ts |
| LadderWorkerLease | ladder_worker_lease | raw SQL in lib/rmhladder/worker-lease.ts |

Other "DEAD"/"DEPRECATED" schema markers that proved wrong or not droppable now: RmhTubeUserStats (read by lib/profile/app-profiles.server.ts), RMHarkBookmark (read by lib/bookmarks.server.ts, bulk, posts-plus lifecycle; marked DEPRECATED but still touched), so both stay. Stale DEAD comments on kept models were rewritten.

## Candidate columns (NOT dropped in this slice)

| Column | Marker | Why kept |
|---|---|---|
| AppearancePreference.reduceTransparency, glassLevel | "retired" | Live-table DROP COLUMN. The deployed image's Prisma client names them in every SELECT; dropping in the same deploy 500s reads during the blue/green swap (scripts/check-migration-safety.ts). Needs expand/contract: first remove from schema.prisma (no migration), deploy, then drop. Only tests reference them. |
| SongComment.aiSeverity, aiCategories, aiRationale, aiTriagedAt (+ index [aiSeverity, createdAt]) | "ORPHANED - kept on purpose, pending a contract migration" | Same expand/contract constraint; schema still declares them, so the running client names them. Follow-up after one deploy without them in schema. |

## Full per-model table

Models with accessor uses are live. Counts are token occurrences across the scanned corpus (accessor / table-name word / type-name word).

| Model | Table | Accessor | Table word | Type word | Verdict |
|---|---|---:|---:|---:|---|
| User | user | 2052 | 7127 | 325 | live |
| Referral | referral | 6 | 64 | 10 | live |
| Session | session | 197 | 4978 | 99 | live |
| Account | account | 43 | 1614 | 60 | live |
| Verification | verification | 11 | 164 | 12 | live |
| PushSubscription | push_subscription | 5 | 1 | 0 | live |
| Passkey | passkey | 4 | 80 | 7 | live |
| SecurityReport | security_report | 5 | 4 | 0 | live |
| UserStrike | user_strike | 14 | 0 | 0 | live |
| RecoveryCode | recovery_code | 5 | 0 | 0 | live |
| TrustedContact | trusted_contact | 12 | 0 | 0 | live |
| RecoveryRequest | recovery_request | 11 | 0 | 1 | live |
| HandleChange | handle_change | 4 | 0 | 4 | live |
| ReferralMilestone | referral_milestone | 0 | 0 | 0 | DROP |
| UserPlayLimits | user_play_limits | 5 | 0 | 0 | live |
| UserBirthday | user_birthday | 6 | 0 | 0 | live |
| RmhCodeToken | rmhcode_token | 9 | 0 | 0 | live |
| UserBuild | user_build | 52 | 4 | 7 | live |
| BuildUnlock | build_unlock | 3 | 0 | 1 | live |
| BuildVersion | build_version | 0 | 0 | 3 | keep (relation/raw) |
| BuildCategory | build_category | 1 | 0 | 6 | live |
| BuildTag | build_tag | 5 | 0 | 0 | live |
| BuildLike | build_like | 4 | 0 | 0 | live |
| BuildComment | build_comment | 3 | 0 | 5 | live |
| BuildView | build_view | 3 | 0 | 7 | live |
| DevRecipe | dev_recipe | 11 | 0 | 0 | live |
| PostCodeEmbed | post_code_embed | 0 | 0 | 0 | keep (relation/raw) |
| Community | community | 140 | 1510 | 124 | live |
| CommunityInvite | community_invite | 9 | 1 | 0 | live |
| CommunityJoinRequest | community_join_request | 11 | 0 | 0 | live |
| CommunityAnnouncement | community_announcement | 5 | 0 | 3 | live |
| CommunityMember | community_member | 47 | 9 | 0 | live |
| CommunityEvent | community_event | 15 | 1 | 2 | live |
| EventRsvp | event_rsvp | 20 | 1 | 0 | live |
| UserList | user_list | 9 | 0 | 0 | live |
| UserListMember | user_list_member | 6 | 0 | 0 | live |
| ReadingRoom | reading_room | 0 | 0 | 0 | DROP |
| CommunityPage | community_page | 11 | 0 | 2 | live |
| CommunityPageRevision | community_page_revision | 4 | 0 | 1 | live |
| CommunityFlair | community_flair | 18 | 0 | 0 | live |
| CommunityPostFlair | community_post_flair | 3 | 0 | 0 | live |
| CommunityStarPost | community_star_post | 1 | 4 | 0 | live |
| CommunityOnboardingQuestion | community_onboarding_question | 3 | 0 | 0 | live |
| CommunityOnboardingAnswer | community_onboarding_answer | 2 | 0 | 0 | live |
| CommunityAutomodRule | community_automod_rule | 5 | 0 | 0 | live |
| CommunityModItem | community_mod_item | 8 | 1 | 0 | live |
| CommunityChallenge | community_challenge | 11 | 1 | 0 | live |
| CommunityChallengeEntry | community_challenge_entry | 6 | 1 | 0 | live |
| CommunityChallengeVote | community_challenge_vote | 2 | 0 | 0 | live |
| CommunityCensus | community_census | 6 | 0 | 0 | live |
| CommunityCensusParticipant | community_census_participant | 2 | 0 | 0 | live |
| CommunityCensusTally | community_census_tally | 2 | 0 | 0 | live |
| CommunityContributorScore | community_contributor_score | 3 | 1 | 0 | live |
| CommunitySister | community_sister | 4 | 0 | 0 | live |
| EventOccurrenceRsvp | event_occurrence_rsvp | 10 | 1 | 0 | live |
| QotdPrompt | qotd_prompt | 13 | 1 | 0 | live |
| QotdAnswer | qotd_answer | 6 | 1 | 0 | live |
| EloRating | elo_rating | 10 | 0 | 7 | live |
| RankedChallenge | ranked_challenge | 7 | 0 | 1 | live |
| WagerMatch | wager_match | 22 | 0 | 7 | live |
| Tournament | tournament | 37 | 201 | 46 | live |
| TournamentEntrant | tournament_entrant | 23 | 0 | 0 | live |
| TournamentMatch | tournament_match | 16 | 0 | 3 | live |
| TournamentPayout | tournament_payout | 1 | 0 | 0 | live |
| SpeedrunCategory | speedrun_category | 4 | 0 | 5 | live |
| SpeedrunEntry | speedrun_entry | 11 | 0 | 3 | live |
| RankedSeasonRating | ranked_season_rating | 4 | 0 | 1 | live |
| BracketPick | bracket_pick | 3 | 0 | 0 | live |
| GameJam | game_jam | 4 | 0 | 0 | live |
| GameJamEntry | game_jam_entry | 3 | 0 | 0 | live |
| GameJamRating | game_jam_rating | 3 | 0 | 0 | live |
| GameNight | game_night | 5 | 0 | 0 | live |
| FriendlyChallenge | friendly_challenge | 6 | 0 | 0 | live |
| ArcadeRival | arcade_rival | 7 | 0 | 0 | live |
| DeveloperApiKey | developer_api_key | 11 | 0 | 4 | live |
| ApiUsageDaily | api_usage_daily | 4 | 0 | 0 | live |
| ApiIdempotencyKey | api_idempotency_key | 3 | 0 | 1 | live |
| WebhookEndpoint | webhook_endpoint | 11 | 0 | 0 | live |
| WebhookDelivery | webhook_delivery | 6 | 0 | 1 | live |
| AdminAuditLog | admin_audit_log | 6 | 0 | 5 | live |
| BulkOperation | bulk_operation | 12 | 0 | 2 | live |
| SiteIdempotencyKey | site_idempotency_key | 7 | 0 | 0 | live |
| OutboxEvent | outbox_event | 8 | 0 | 3 | live |
| BackfillCheckpoint | backfill_checkpoint | 8 | 0 | 2 | live |
| Embedding | embedding | 6 | 32 | 1 | live |
| LinkCheck | link_check | 13 | 1 | 0 | live |
| ModMacro | mod_macro | 4 | 0 | 0 | live |
| LinkDomainRule | link_domain_rule | 4 | 0 | 0 | live |
| SeenLinkDomain | seen_link_domain | 2 | 0 | 0 | live |
| PileOnGuard | pile_on_guard | 6 | 0 | 0 | live |
| CohortRetention | cohort_retention | 3 | 0 | 0 | live |
| TargetedNotice | targeted_notice | 5 | 0 | 2 | live |
| TargetedNoticeDismissal | targeted_notice_dismissal | 2 | 0 | 0 | live |
| RouteViewDay | route_view_day | 2 | 2 | 0 | live |
| ClientErrorGroup | client_error_group | 3 | 5 | 0 | live |
| Experiment | experiment | 6 | 29 | 6 | live |
| ExperimentExposure | experiment_exposure | 3 | 0 | 0 | live |
| ReleaseNote | release_note | 6 | 0 | 0 | live |
| DeepseekBalanceSnapshot | deepseek_balance_snapshot | 4 | 1 | 0 | live |
| OpsMetricMinute | ops_metric_minute | 6 | 4 | 0 | live |
| OpsAlarmOverride | ops_alarm_override | 3 | 1 | 0 | live |
| OpsDeployEvent | ops_deploy_event | 2 | 1 | 0 | live |
| FeatureFlag | feature_flag | 4 | 3 | 0 | live |
| DiscordActivityChannel | discord_activity_channel | 3 | 6 | 2 | live |
| DiscordDailyParticipant | discord_daily_participant | 8 | 3 | 2 | live |
| DiscordDailyProgress | discord_daily_progress | 3 | 0 | 0 | live |
| DiscordChatSession | discord_chat_session | 0 | 7 | 0 | keep (relation/raw) |
| DiscordAlexChannelMemory | discord_alex_channel_memory | 0 | 3 | 0 | keep (relation/raw) |
| DiscordAlexPet | discord_alex_pet | 0 | 5 | 0 | keep (relation/raw) |
| DiscordAlexGuild | discord_alex_guild | 0 | 15 | 0 | keep (relation/raw) |
| DiscordAlexCaretaker | discord_alex_caretaker | 1 | 7 | 0 | live |
| DiscordWatchVoiceSession | discord_watch_voice_session | 3 | 8 | 0 | live |
| DiscordWatchMessage | discord_watch_message | 1 | 5 | 0 | live |
| DiscordWatchPresenceSession | discord_watch_presence_session | 0 | 8 | 0 | keep (relation/raw) |
| DiscordWatchDay | discord_watch_day | 3 | 9 | 0 | live |
| DiscordWatchSummary | discord_watch_summary | 3 | 8 | 0 | live |
| DiscordWatchTypingSession | discord_watch_typing_session | 0 | 6 | 0 | keep (relation/raw) |
| DiscordWatchAlert | discord_watch_alert | 5 | 0 | 0 | live |
| DiscordWatchStatusSession | discord_watch_status_session | 1 | 7 | 0 | live |
| DiscordWatchLive | discord_watch_live | 1 | 7 | 0 | live |
| DoctrineReputation | doctrine_reputation | 8 | 8 | 3 | live |
| DoctrineReputationLedger | doctrine_reputation_ledger | 1 | 5 | 0 | live |
| DoctrinePuzzle | doctrine_puzzle | 3 | 6 | 2 | live |
| DoctrinePuzzleSubmission | doctrine_puzzle_submission | 4 | 0 | 0 | live |
| DoctrinePuzzleReplay | doctrine_puzzle_replay | 3 | 0 | 0 | live |
| DoctrineSafehouseContent | doctrine_safehouse_content | 1 | 0 | 0 | live |
| DoctrineAccessLog | doctrine_access_log | 2 | 0 | 0 | live |
| DoctrineDisclosure | doctrine_disclosure | 4 | 0 | 2 | live |
| DoctrineRecruitmentCode | doctrine_recruitment_code | 3 | 0 | 0 | live |
| DoctrineIncident | doctrine_incident | 7 | 0 | 1 | live |
| DoctrineIncidentEvent | doctrine_incident_event | 1 | 0 | 0 | live |
| DoctrineIncidentReport | doctrine_incident_report | 1 | 0 | 0 | live |
| DoctrineReaction | doctrine_reaction | 3 | 0 | 0 | live |
| DoctrineSahurSession | doctrine_sahur_session | 0 | 5 | 2 | keep (relation/raw) |
| DoctrineSahurParticipation | doctrine_sahur_participation | 0 | 0 | 0 | DROP |
| Prediction | prediction | 61 | 218 | 35 | live |
| PredictionPosition | prediction_position | 7 | 0 | 2 | live |
| CreatorMembership | creator_membership | 13 | 2 | 2 | live |
| PromoClaim | promo_claim | 2 | 0 | 1 | live |
| GiftMembership | gift_membership | 13 | 0 | 0 | live |
| Subscription | Subscription | 10 | 9 | 9 | live |
| UserAchievement | user_achievement | 14 | 1 | 4 | live |
| CardDrop | card_drop | 7 | 1 | 0 | live |
| CardListing | card_listing | 14 | 0 | 0 | live |
| UserGems | user_gems | 5 | 0 | 0 | live |
| GemEntry | gem_entry | 4 | 1 | 0 | live |
| CardBuyOrder | card_buy_order | 10 | 0 | 0 | live |
| CardTrade | card_trade | 11 | 0 | 0 | live |
| CardTradeItem | card_trade_item | 0 | 0 | 0 | keep (relation/raw) |
| DailyStreak | daily_streak | 10 | 1 | 2 | live |
| UserInventory | user_inventory | 28 | 0 | 3 | live |
| CoinTransaction | coin_transaction | 37 | 5 | 7 | live |
| UserQuest | user_quest | 15 | 0 | 6 | live |
| UserSeasonProgress | user_season_progress | 8 | 0 | 0 | live |
| DailyWheelSpin | daily_wheel_spin | 4 | 0 | 2 | live |
| CoinStake | coin_stake | 8 | 0 | 1 | live |
| StorefrontProduct | storefront_product | 9 | 0 | 0 | live |
| StorefrontPurchase | storefront_purchase | 3 | 0 | 0 | live |
| ImageGenBudget | image_gen_budget | 3 | 12 | 3 | live |
| RedemptionRequest | redemption_request | 9 | 0 | 6 | live |
| CreatorTier | creator_tier | 7 | 0 | 4 | live |
| MarketListing | market_listing | 22 | 3 | 3 | live |
| ContentAward | content_award | 5 | 0 | 0 | live |
| WishlistEntry | wishlist_entry | 6 | 0 | 0 | live |
| AiUsage | ai_usage | 3 | 1 | 14 | live |
| AchievementRarity | achievement_rarity | 0 | 1 | 0 | keep (relation/raw) |
| QuestChainProgress | quest_chain_progress | 0 | 0 | 0 | DROP |
| Pool | pool | 105 | 1307 | 62 | live |
| PoolContribution | pool_contribution | 5 | 0 | 2 | live |
| KaikaiDebtEntry | kaikai_debt_entry | 10 | 12 | 1 | live |
| SavingsGoal | savings_goal | 5 | 0 | 0 | live |
| CommunityGoal | community_goal | 14 | 6 | 0 | live |
| CommunityGoalPledge | community_goal_pledge | 6 | 1 | 0 | live |
| ScheduledGift | scheduled_gift | 14 | 0 | 0 | live |
| GiftExchange | gift_exchange | 13 | 0 | 0 | live |
| GiftExchangeMember | gift_exchange_member | 10 | 0 | 0 | live |
| Kudos | kudos | 11 | 73 | 8 | live |
| AchievementTip | achievement_tip | 6 | 0 | 0 | live |
| AchievementTipVote | achievement_tip_vote | 3 | 0 | 0 | live |
| PredictionSeason | prediction_season | 3 | 0 | 0 | live |
| PredictionSeasonMarket | prediction_season_market | 0 | 0 | 0 | keep (relation/raw) |
| PredictionComment | prediction_comment | 2 | 0 | 0 | live |
| AltairPlayer | AltairPlayer | 10 | 4 | 4 | live |
| AltairMetaProgress | altair_meta_progress | 7 | 2 | 1 | live |
| AltairSoloRun | altair_solo_run | 15 | 1 | 1 | live |
| AltairCoopProfile | altair_coop_profile | 1 | 0 | 0 | live |
| AltairMatch | altair_match | 2 | 0 | 1 | live |
| AltairMatchPlayer | altair_match_player | 1 | 0 | 1 | live |
| RMHboxProfile | rmhbox_profile | 49 | 1 | 11 | live |
| RMHboxMatch | rmhbox_match | 28 | 0 | 4 | live |
| RMHboxMatchPlayer | rmhbox_match_player | 15 | 0 | 5 | live |
| RmhboxPack | rmhbox_pack | 11 | 0 | 0 | live |
| RmhboxPackReport | rmhbox_pack_report | 1 | 0 | 0 | live |
| Song | Song | 192 | 93 | 93 | live |
| ChartReview | chart_review | 4 | 0 | 0 | live |
| SongLike | SongLike | 4 | 5 | 5 | live |
| SongRating | SongRating | 0 | 1 | 1 | DROP |
| SongComment | SongComment | 4 | 0 | 0 | live |
| SongLeaderboard | SongLeaderboard | 21 | 23 | 23 | live |
| SliceRun | slice_run | 25 | 1 | 15 | live |
| SongPlay | SongPlay | 2 | 4 | 4 | live |
| Chart | Chart | 82 | 52 | 52 | live |
| SliceNoteStat | slice_note_stat | 3 | 0 | 0 | live |
| ChartPack | ChartPack | 9 | 5 | 5 | live |
| ChartPackItem | ChartPackItem | 9 | 2 | 2 | live |
| SliceDailyEntry | slice_daily_entry | 5 | 0 | 1 | live |
| SliceSetlist | slice_setlist | 7 | 0 | 2 | live |
| ChartRevision | ChartRevision | 2 | 2 | 2 | live |
| SynapseStormPlayer | synapse_storm_player | 9 | 0 | 2 | live |
| SSLobby | ss_lobby | 5 | 0 | 1 | live |
| SSLobbyMember | ss_lobby_member | 2 | 0 | 0 | live |
| SSMatch | ss_match | 2 | 0 | 1 | live |
| SSPlayerMatch | ss_player_match | 3 | 0 | 0 | live |
| Tf2Hud | tf2_hud | 15 | 0 | 4 | live |
| Tf2HudVersion | tf2_hud_version | 7 | 0 | 0 | live |
| Tf2HudLike | tf2_hud_like | 4 | 0 | 0 | live |
| Tf2HudShare | tf2_hud_share | 6 | 0 | 0 | live |
| Tf2HudBlob | tf2_hud_blob | 4 | 0 | 0 | live |
| Tf2HudUserBlob | tf2_hud_user_blob | 5 | 0 | 0 | live |
| Tf2Loadout | tf2_loadout | 11 | 0 | 0 | live |
| Tf2LoadoutLike | tf2_loadout_like | 4 | 0 | 0 | live |
| Tf2LoadoutCatalog | tf2_loadout_catalog | 5 | 0 | 0 | live |
| VersecraftSave | versecraft_save | 2 | 0 | 0 | live |
| VersecraftProgress | versecraft_progress | 3 | 0 | 0 | live |
| VersecraftWorld | versecraft_world | 9 | 0 | 1 | live |
| VersecraftGenChapter | versecraft_gen_chapter | 3 | 0 | 0 | live |
| VersecraftSeedListing | versecraft_seed_listing | 6 | 0 | 0 | live |
| VersecraftSeedRating | versecraft_seed_rating | 2 | 0 | 0 | live |
| LaundryPlayer | LaundryPlayer | 11 | 0 | 0 | live |
| DailyPuzzleScore | daily_puzzle_score | 24 | 0 | 0 | live |
| GlobeSetPlayer | globeset_player | 4 | 0 | 0 | live |
| DailyPuzzle | daily_puzzle | 8 | 2 | 7 | live |
| Player | Player | 827 | 1107 | 1107 | live |
| VegaPlayer | VegaPlayer | 5 | 0 | 0 | live |
| SignalForgePlayer | SignalForgePlayer | 15 | 1 | 1 | live |
| TempleOfJoySave | temple_of_joy_save | 4 | 0 | 0 | live |
| GameSave | game_save | 4 | 0 | 3 | live |
| NeonDriftwayPlayer | NeonDriftwayPlayer | 7 | 0 | 0 | live |
| NightrailPlayer | NightrailPlayer | 7 | 1 | 1 | live |
| VoidBreakerPlayer | VoidBreakerPlayer | 7 | 1 | 1 | live |
| DreamRiftPlayer | DreamRiftPlayer | 6 | 1 | 1 | live |
| DreamRiftCoopRun | DreamRiftCoopRun | 2 | 0 | 0 | live |
| GabrielsHornPlayer | GabrielsHornPlayer | 5 | 0 | 0 | live |
| GamePlaytime | game_playtime | 18 | 1 | 0 | live |
| GamePlaytimeDay | game_playtime_day | 8 | 0 | 0 | live |
| GameBadge | game_badge | 12 | 0 | 0 | live |
| GameCollectionItem | game_collection_item | 8 | 0 | 0 | live |
| GameProfileShowcase | game_profile_showcase | 6 | 0 | 0 | live |
| GameThread | game_thread | 14 | 0 | 0 | live |
| GameThreadPost | game_thread_post | 6 | 0 | 0 | live |
| ArcadeStreak | arcade_streak | 3 | 0 | 1 | live |
| GameReplay | game_replay | 14 | 0 | 13 | live |
| GameReview | game_review | 11 | 0 | 0 | live |
| GameReviewVote | game_review_vote | 2 | 0 | 0 | live |
| GameGuide | game_guide | 10 | 0 | 1 | live |
| GameGuideRevision | game_guide_revision | 4 | 0 | 2 | live |
| GameStat | game_stat | 7 | 3 | 16 | live |
| AppSeasonStat | app_season_stat | 0 | 0 | 0 | DROP |
| RebarReservation | rebar_reservation | 5 | 0 | 0 | live |
| DunesdayPlan | dunesday_plan | 9 | 0 | 0 | live |
| AdventClaim | advent_claim | 3 | 1 | 0 | live |
| ArcadeSeedRun | arcade_seed_run | 9 | 0 | 0 | live |
| GamePlayStatus | game_play_status | 4 | 1 | 0 | live |
| GamePatchNote | game_patch_note | 2 | 0 | 0 | live |
| CanvasEvent | canvas_event | 11 | 1 | 0 | live |
| CanvasPlacement | canvas_placement | 2 | 0 | 0 | live |
| CanvasCooldown | canvas_cooldown | 2 | 2 | 0 | live |
| ConnectionsGrid | connections_grid | 12 | 0 | 0 | live |
| ConnectionsPlay | connections_play | 7 | 0 | 3 | live |
| NdwLivery | ndw_livery | 2 | 0 | 0 | live |
| GabrielsHornTableRead | gabriels_horn_table_read | 2 | 0 | 0 | live |
| VelumContract | velum_contract | 7 | 0 | 0 | live |
| MarchSignal | march_signal | 0 | 0 | 0 | DROP |
| MarchSignalVote | march_signal_vote | 0 | 0 | 0 | DROP |
| NightrailTrick | nightrail_trick | 8 | 0 | 0 | live |
| NightrailTrickVote | nightrail_trick_vote | 4 | 0 | 0 | live |
| ElectionRoom | election_room | 7 | 0 | 2 | live |
| ElectionLeague | election_league | 8 | 0 | 0 | live |
| ElectionLeagueMember | election_league_member | 5 | 0 | 0 | live |
| HomeListing | home_listing | 19 | 2 | 6 | live |
| HomeFavorite | home_favorite | 3 | 0 | 0 | live |
| HomeWatch | home_watch | 9 | 0 | 0 | live |
| HomeSource | home_source | 8 | 0 | 1 | live |
| HomeScrapeRun | home_scrape_run | 2 | 0 | 1 | live |
| HomeRoommateProfile | home_roommate_profile | 2 | 0 | 0 | live |
| Hunt | hunt | 11 | 209 | 9 | live |
| HuntClue | hunt_clue | 3 | 0 | 0 | live |
| HuntProgress | hunt_progress | 5 | 0 | 0 | live |
| BlogPost | blog_post | 18 | 2 | 5 | live |
| NewsArticle | news_article | 34 | 2 | 18 | live |
| Media | Media | 35 | 61 | 61 | live |
| LibraryDocument | library_document | 39 | 2 | 21 | live |
| LibraryCollection | library_collection | 10 | 0 | 1 | live |
| LibraryCollectionItem | library_collection_item | 5 | 0 | 0 | live |
| LibraryQuotaRequest | library_quota_request | 6 | 0 | 0 | live |
| Album | album | 39 | 382 | 45 | live |
| AlbumSlide | album_slide | 6 | 0 | 10 | live |
| SaveFolder | save_folder | 7 | 0 | 0 | live |
| SavedItem | saved_item | 16 | 5 | 2 | live |
| HistoryEntry | history_entry | 10 | 0 | 7 | live |
| SavedSearch | saved_search | 19 | 4 | 2 | live |
| ReadPosition | read_position | 3 | 0 | 8 | live |
| ReadingHighlight | reading_highlight | 9 | 0 | 0 | live |
| ReadingPassageStat | reading_passage_stat | 4 | 0 | 1 | live |
| ReadingHighlightPassage | reading_highlight_passage | 5 | 0 | 1 | live |
| ReadingGoal | reading_goal | 3 | 0 | 0 | live |
| ReadingShelfEntry | reading_shelf_entry | 6 | 0 | 0 | live |
| ReadingPrefs | reading_prefs | 2 | 0 | 0 | live |
| NewsStory | news_story | 10 | 0 | 0 | live |
| NewsStoryArticle | news_story_article | 5 | 0 | 0 | live |
| GlossaryTerm | glossary_term | 7 | 0 | 0 | live |
| Conversation | conversation | 32 | 430 | 27 | live |
| DirectMessage | direct_message | 30 | 18 | 5 | live |
| DirectMessageReaction | direct_message_reaction | 5 | 0 | 0 | live |
| GroupChat | group_chat | 8 | 0 | 0 | live |
| GroupChatMember | group_chat_member | 20 | 0 | 0 | live |
| GroupMessage | group_message | 14 | 3 | 2 | live |
| GroupMessageReaction | group_message_reaction | 4 | 0 | 0 | live |
| GroupPollVote | group_poll_vote | 3 | 0 | 1 | live |
| Notification | notification | 22 | 294 | 74 | live |
| CallMute | call_mute | 12 | 1 | 0 | live |
| Space | space | 33 | 2302 | 175 | live |
| SpaceMessage | space_message | 4 | 0 | 0 | live |
| Reminder | reminder | 21 | 117 | 9 | live |
| Call | call | 109 | 2877 | 120 | live |
| DirectMessageHide | direct_message_hide | 6 | 0 | 4 | live |
| HeldNotification | held_notification | 15 | 0 | 1 | live |
| ConversationPref | conversation_pref | 7 | 0 | 2 | live |
| GroupCall | group_call | 18 | 0 | 6 | live |
| GroupCallParticipant | group_call_participant | 9 | 0 | 4 | live |
| ScheduledSlot | scheduled_slot | 7 | 0 | 2 | live |
| ChatFolder | chat_folder | 7 | 0 | 4 | live |
| ChatFolderItem | chat_folder_item | 3 | 0 | 0 | live |
| ChatPin | chat_pin | 6 | 0 | 1 | live |
| DirectPollVote | direct_poll_vote | 3 | 0 | 1 | live |
| AvailabilityPoll | availability_poll | 10 | 0 | 0 | live |
| AvailabilityPollResponse | availability_poll_response | 8 | 0 | 0 | live |
| AvailabilityPollInvitee | availability_poll_invitee | 2 | 0 | 0 | live |
| OfficeHoursConfig | office_hours_config | 5 | 0 | 0 | live |
| OfficeHoursWindow | office_hours_window | 2 | 0 | 0 | live |
| OfficeHoursBooking | office_hours_booking | 11 | 1 | 0 | live |
| CalendarFeed | calendar_feed | 6 | 0 | 0 | live |
| CalendarFeedSlot | calendar_feed_slot | 4 | 0 | 0 | live |
| Feedback | feedback | 6 | 295 | 15 | live |
| ContentReport | content_report | 13 | 1 | 15 | live |
| UserBlock | user_block | 39 | 0 | 0 | live |
| UserMute | user_mute | 8 | 0 | 0 | live |
| AiPersona | ai_persona | 13 | 0 | 0 | live |
| AiPersonaMessage | ai_persona_message | 4 | 0 | 0 | live |
| EmojiPack | emoji_pack | 18 | 0 | 0 | live |
| EmojiPackItem | emoji_pack_item | 4 | 0 | 0 | live |
| EmojiPackSubscription | emoji_pack_subscription | 10 | 0 | 0 | live |
| FeatureRequest | feature_request | 15 | 0 | 1 | live |
| FeatureRequestVote | feature_request_vote | 10 | 0 | 0 | live |
| FortuneCookie | fortune_cookie | 8 | 1 | 0 | live |
| PhotoNomination | photo_nomination | 7 | 0 | 0 | live |
| PhotoVote | photo_vote | 2 | 0 | 0 | live |
| TranslationSuggestion | translation_suggestion | 12 | 0 | 0 | live |
| TranslationVote | translation_vote | 4 | 0 | 0 | live |
| ContextNote | context_note | 14 | 0 | 0 | live |
| ContextNoteRating | context_note_rating | 4 | 0 | 0 | live |
| StudioChallenge | studio_challenge | 6 | 0 | 0 | live |
| StudioChallengeEntry | studio_challenge_entry | 5 | 0 | 0 | live |
| StudioChallengeVote | studio_challenge_vote | 2 | 0 | 0 | live |
| Pf2eSession | pf2e_session | 23 | 0 | 2 | live |
| Pf2eRecap | pf2e_recap | 3 | 0 | 0 | live |
| Pf2eSessionResponse | pf2e_session_response | 2 | 0 | 0 | live |
| Pf2eAnnouncement | pf2e_announcement | 8 | 0 | 0 | live |
| Pf2eSettings | pf2e_settings | 2 | 0 | 1 | live |
| NotificationPreference | notification_preference | 24 | 1 | 3 | live |
| AppearancePreference | appearance_preference | 3 | 0 | 4 | live |
| LayoutPreference | layout_preference | 2 | 0 | 1 | live |
| UserProfile | user_profile | 96 | 18 | 23 | live |
| UserCard | user_card | 24 | 1 | 0 | live |
| GuestbookEntry | guestbook_entry | 5 | 0 | 0 | live |
| CloseFriend | close_friend | 12 | 2 | 0 | live |
| UserTheme | user_theme | 28 | 1 | 2 | live |
| ProfileLayout | profile_layout | 10 | 0 | 0 | live |
| ProfileLink | profile_link | 14 | 0 | 14 | live |
| ProfileBlock | profile_block | 0 | 0 | 0 | DROP |
| GameAssistPreference | game_assist_preference | 3 | 0 | 0 | live |
| MemberMemory | member_memory | 6 | 0 | 0 | live |
| LoadoutPreset | loadout_preset | 8 | 0 | 0 | live |
| ProfilePlus | profile_plus | 14 | 3 | 2 | live |
| ProfileVisitDay | profile_visit_day | 1 | 2 | 0 | live |
| Stamp | stamp | 21 | 288 | 13 | live |
| ProfileStamp | profile_stamp | 6 | 0 | 0 | live |
| Webring | webring | 15 | 34 | 2 | live |
| WebringMember | webring_member | 11 | 0 | 0 | live |
| SkillEndorsement | skill_endorsement | 4 | 0 | 1 | live |
| DelightSetting | delight_setting | 2 | 0 | 0 | live |
| SiteEra | site_era | 4 | 0 | 0 | live |
| RideshareDriver | rideshare_driver | 14 | 1 | 0 | live |
| Ride | ride | 27 | 401 | 33 | live |
| RideMessage | ride_message | 1 | 3 | 0 | live |
| RideSavedPlace | ride_saved_place | 4 | 0 | 0 | live |
| LadderCompany | ladder_company | 32 | 0 | 0 | live |
| LadderSource | ladder_source | 25 | 0 | 1 | live |
| LadderJob | ladder_job | 34 | 3 | 1 | live |
| LadderVerification | ladder_verification | 4 | 0 | 0 | live |
| LadderScrapeRun | ladder_scrape_run | 9 | 0 | 1 | live |
| LadderSourceError | ladder_source_error | 6 | 0 | 1 | live |
| LadderReviewTask | ladder_review_task | 19 | 0 | 1 | live |
| LadderRelevanceRule | ladder_relevance_rule | 1 | 0 | 0 | live |
| LadderUserPrefs | ladder_user_prefs | 14 | 0 | 0 | live |
| LadderKeyword | ladder_keyword | 7 | 0 | 0 | live |
| LadderWatchlistEntry | ladder_watchlist_entry | 7 | 0 | 0 | live |
| LadderJobAction | ladder_job_action | 7 | 0 | 0 | live |
| LadderApplication | ladder_application | 13 | 0 | 2 | live |
| LadderAlert | ladder_alert | 1 | 0 | 0 | live |
| LadderResume | ladder_resume | 9 | 0 | 0 | live |
| LadderResumeVersion | ladder_resume_version | 9 | 0 | 0 | live |
| LadderResumeReview | ladder_resume_review | 5 | 0 | 0 | live |
| LadderJobProfile | ladder_job_profile | 3 | 0 | 0 | live |
| LadderJobMatch | ladder_job_match | 4 | 0 | 0 | live |
| LadderAiTask | ladder_ai_task | 14 | 0 | 0 | live |
| LadderApplicationEvent | ladder_application_event | 4 | 0 | 0 | live |
| LadderSavedSearch | ladder_saved_search | 9 | 0 | 0 | live |
| LadderAlertEvent | ladder_alert_event | 5 | 0 | 0 | live |
| LadderAlertDelivery | ladder_alert_delivery | 3 | 0 | 0 | live |
| LadderProductEvent | ladder_product_event | 3 | 0 | 0 | live |
| LadderWorkerLease | ladder_worker_lease | 0 | 5 | 0 | keep (relation/raw) |
| LadderAnswerBank | ladder_answer_bank | 6 | 0 | 2 | live |
| LadderReferralOffer | ladder_referral_offer | 7 | 0 | 0 | live |
| LadderReferralRequest | ladder_referral_request | 7 | 0 | 0 | live |
| LadderInterviewReport | ladder_interview_report | 6 | 0 | 0 | live |
| MusicLearnProfile | music_learn_profile | 2 | 0 | 0 | live |
| MusicLearnLessonProgress | music_learn_lesson_progress | 4 | 2 | 0 | live |
| MusicLearnCard | music_learn_card | 4 | 4 | 0 | live |
| RmhStudyProfile | rmhstudy_profile | 6 | 0 | 1 | live |
| RmhStudySession | rmhstudy_session | 1 | 0 | 0 | live |
| FlashcardDeck | flashcard_deck | 20 | 0 | 0 | live |
| Flashcard | flashcard | 3 | 34 | 1 | live |
| FlashcardReview | flashcard_review | 4 | 0 | 1 | live |
| StudyBuddyRequest | study_buddy_request | 14 | 0 | 0 | live |
| StudyBuddyMatch | study_buddy_match | 5 | 0 | 0 | live |
| StudyPlan | study_plan | 5 | 0 | 0 | live |
| CalcNotebook | calc_notebook | 5 | 0 | 0 | live |
| RmhTubeRoom | rmhtube_room | 6 | 1 | 49 | live |
| RmhTubeRoomMember | rmhtube_room_member | 3 | 0 | 0 | live |
| RmhTubeChatMessage | rmhtube_chat_message | 2 | 0 | 0 | live |
| RmhTubeQueueItem | rmhtube_queue_item | 4 | 1 | 0 | live |
| RmhTubePlaylist | rmhtube_playlist | 0 | 0 | 0 | DROP |
| RmhTubePlaylistItem | rmhtube_playlist_item | 0 | 0 | 0 | DROP |
| RmhTubeSubscription | rmhtube_subscription | 3 | 0 | 0 | live |
| RmhTubeUserStats | rmhtube_user_stats | 4 | 0 | 1 | live |
| Playlist | playlist | 26 | 120 | 9 | live |
| PlaylistCollaborator | playlist_collaborator | 10 | 0 | 0 | live |
| PlaylistItem | playlist_item | 5 | 0 | 2 | live |
| RmhTubeTimedComment | rmhtube_timed_comment | 4 | 0 | 0 | live |
| RmhTubeWatchLater | rmhtube_watch_later | 5 | 0 | 0 | live |
| RmhTubeHeatBucket | rmhtube_heat_bucket | 1 | 2 | 0 | live |
| RmhTubeCommentaryTrack | rmhtube_commentary_track | 4 | 0 | 0 | live |
| RmhTypeProfile | rmhtype_profile | 8 | 0 | 1 | live |
| RmhTypeMatch | rmhtype_match | 2 | 0 | 0 | live |
| RmhTypeMatchPlayer | rmhtype_match_player | 2 | 0 | 0 | live |
| RmhTypeKeyStat | rmhtype_key_stat | 4 | 0 | 2 | live |
| VibePage | vibe_page | 20 | 6 | 5 | live |
| VibePageVersion | vibe_page_version | 5 | 0 | 0 | live |
| LedgerArtifact | ledger_artifact | 0 | 2 | 0 | DROP |
| LedgerPlanRun | ledger_plan_run | 0 | 4 | 0 | DROP |
| LedgerPlanStep | ledger_plan_step | 0 | 3 | 0 | DROP |
| LedgerStepInput | ledger_step_input | 0 | 2 | 0 | DROP |
| ComputeGrant | compute_grant | 6 | 0 | 0 | live |
| BuildManifestRecord | build_manifest | 2 | 0 | 0 | live |
| BuildGrant | build_grant | 5 | 0 | 0 | live |
| BotWorkerSettings | bot_worker_settings | 2 | 6 | 1 | live |
| RMHark | rmheet | 183 | 79 | 75 | live |
| RMHarkReaction | rmheet_reaction | 10 | 2 | 0 | live |
| RMHarkLike | rmheet_like | 9 | 4 | 1 | live |
| RMHarkComment | rmheet_comment | 44 | 28 | 6 | live |
| RMHarkCommentReaction | rmheet_comment_reaction | 5 | 0 | 0 | live |
| RMHarkCommentLike | rmheet_comment_like | 4 | 1 | 0 | live |
| RMHarkCommentRepost | rmheet_comment_repost | 4 | 0 | 0 | live |
| RMHarkCommentView | rmheet_comment_view | 1 | 5 | 0 | live |
| RMHarkRepost | rmheet_repost | 9 | 1 | 0 | live |
| RMHarkView | rmheet_view | 0 | 1 | 0 | DROP |
| RMHarkPoll | rmheet_poll | 3 | 0 | 1 | live |
| RMHarkPollOption | rmheet_poll_option | 8 | 3 | 0 | live |
| RMHarkPollVote | rmheet_poll_vote | 7 | 1 | 1 | live |
| Follow | follow | 96 | 943 | 58 | live |
| Hashtag | hashtag | 11 | 89 | 5 | live |
| PostHashtag | post_hashtag | 7 | 16 | 0 | live |
| RMHarkBookmark | rmheet_bookmark | 4 | 3 | 2 | live |
| FeedAnnouncement | feed_announcement | 5 | 0 | 2 | live |
| FeedAnnouncementPoll | feed_announcement_poll | 0 | 0 | 0 | keep (relation/raw) |
| FeedAnnouncementPollOption | feed_announcement_poll_option | 4 | 0 | 0 | live |
| FeedAnnouncementPollVote | feed_announcement_poll_vote | 6 | 0 | 0 | live |
| RMHarkEdit | rmheet_edit | 2 | 0 | 9 | live |
| PostUnlock | post_unlock | 3 | 0 | 0 | live |
| ScheduledPost | scheduled_post | 15 | 4 | 5 | live |
| SharedMoment | shared_moment | 3 | 0 | 3 | live |
| FeedSignal | feed_signal | 6 | 0 | 4 | live |
| Activity | activity | 47 | 631 | 165 | live |
| CreatorPost | creator_post | 0 | 0 | 0 | DROP |
| PostAnalyticsDaily | post_analytics_daily | 0 | 0 | 0 | DROP |
| RemixEdge | remix_edge | 5 | 0 | 3 | live |
| RMHarkTakeVote | rmheet_take_vote | 5 | 0 | 0 | live |
| PostSeries | post_series | 17 | 0 | 0 | live |
| PostSeriesItem | post_series_item | 11 | 1 | 0 | live |
| PostSeriesFollow | post_series_follow | 6 | 0 | 0 | live |
| PostLifecycle | post_lifecycle | 4 | 3 | 0 | live |
| PostAutoDelete | post_auto_delete | 5 | 0 | 0 | live |
| DailyDigestSnapshot | daily_digest_snapshot | 2 | 1 | 0 | live |
| CustomFeed | custom_feed | 10 | 0 | 0 | live |
| CustomFeedSubscription | custom_feed_subscription | 4 | 0 | 0 | live |
| MemoriesOptIn | memories_opt_in | 5 | 0 | 0 | live |
| KeywordAlert | keyword_alert | 5 | 0 | 0 | live |
| KeywordAlertHit | keyword_alert_hit | 2 | 0 | 0 | live |
| Watch | watch | 21 | 573 | 105 | live |
| MarathonList | marathon_list | 6 | 0 | 0 | live |
