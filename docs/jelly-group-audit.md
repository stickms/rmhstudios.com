# Jelly group audit (main site and shared UI)

Companion to `docs/superpowers/specs/2026-10-27-jelly-groups-design.md`. Scope: main site + shared UI; the full-screen games/apps keep their own design scheme and are not audited.

## Rule

A cluster of related controls is **one jelly body with flat members** (`JellyGroup`); the selected member is a feathered glow lying on it. Convert only when members sit on one row (or scroll in one row), are the same kind of control and are mutually related. Wrapping or user-built chips, lone primary actions, avatars, badges, dots and row checkboxes stay standalone.

## Already covered without per-site edits

- **Top bar** (`components/radial/RadialShell.tsx`): every control is a `JellyGroup.Item` on the `glass-chrome` bar.
- **`LiquidTabs`** (about 100 call sites incl. `PageTabs`/`CatalogTabs`): the selected tab is a flat glow on the main site; games and apps keep the raised thumb through `AppTierContext`.
- **Menus, selects, dropdown rows**: already one slab with plain rows and a hover glow (`anchored-menu`, `select`, `menu`); verified, no change.
- **Tabs, search and sort on phones** now share one width (`--page-controls-inset`).

## How the inventory was made

```
node scan: every .tsx under components/ (minus FULLSCREEN_TIER_DIRS and components/shared) and app/routes/_site,
looking for two or more button/link/Button elements within 30 lines that carry rounded-full, a control radius,
variant outline|secondary|ghost or data-evert.
```

The scan is a heuristic with many false positives (Cancel + Save pairs, primary + secondary actions). **Rows with a reason were read by eye; rows marked "unreviewed" were only flagged by the scan and default to standalone.** Re-run the scan after changes to see what is left.

## Converted in this change

| File                                       | Change                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `components/ui/pagination.tsx`             | first/prev/pages/next/last → one JellyGroup, current page glows (aria-current)                           |
| `components/events/RsvpButton.tsx`         | Going / Maybe → one JellyGroup, chosen answer glows                                                      |
| `components/news/NewsCategoryTabs.tsx`     | category chips → flat members on the scroller pill                                                       |
| `components/ui/selection-bar.tsx`          | neutral actions + clear → flat members of the glass-chrome bar; coloured actions stay Buttons            |
| `components/rmhcalculator/ModelToggle.tsx` | Reasoner / Chat → one JellyGroup radiogroup                                                              |
| `components/settings/AppearancePanel.tsx`  | colour-vision choices → one vertical JellyGroup radiogroup; selected is a glow, not a filled accent card |

## Scan results (128 files flagged)

| Cluster | File:line                                                        | Verdict                 | Reason                                                                                                      |
| ------- | ---------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| 4       | `components/party/PacksPage.tsx:143`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 4       | `components/radial/eversion/lab/EversionLab.tsx:548`             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 4       | `components/wager/WagerCard.tsx:158`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 4       | `app/routes/_site/admin/reports.tsx:207`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 4       | `app/routes/_site/admin/users.tsx:286`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/competitive/FriendlyChallenges.tsx:168`              | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/delight/admin/MuseumPanel.tsx:123`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/delight/admin/TranslationsPanel.tsx:54`              | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/feed/CommentItem.tsx:406`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/feed/PostImageGrid.tsx:311`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/feed/ProfileEditModal.tsx:673`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/feed/RankedColumn.tsx:439`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/games/GuideView.tsx:122`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/games/PhotoMode.tsx:117`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/marathon/MarathonPlanner.tsx:181`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/posts-plus/SeriesPage.tsx:263`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/profile/GuestbookPanel.tsx:267`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/profile/plus/settings/PronunciationRecorder.tsx:131` | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/reading/ChallengePanel.tsx:113`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/reading/ReaderTextView.tsx:133`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `components/settings/GlobeCursorPanel.tsx:107`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `app/routes/_site/admin/user-builds.tsx:153`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 3       | `app/routes/_site/user-builds/manage.tsx:190`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/access/OfflineGame.tsx:147`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/admin/MDXEditor.tsx:148`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/admin/oncall/AlarmsPanel.tsx:152`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/calendar/BookingRow.tsx:42`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/calendar/FindATimeLink.tsx:28`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/calendar/OfficeHoursManage.tsx:258`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/call/CallOverlay.tsx:126`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/canvas/CanvasBoard.tsx:230`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/code-embed/RunnableEmbed.tsx:41`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/communities/CensusPanel.tsx:125`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/communities/DocEditor.tsx:121`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/communities/ModOnboarding.tsx:121`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/delight/TranslatePage.tsx:157`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/delight/admin/FortunesPanel.tsx:42`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/delight/admin/HuntPanel.tsx:124`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/developer/RecipesManager.tsx:233`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/devplatform/AdminReleaseNotes.tsx:172`               | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/discovery/FeedPage.tsx:157`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/economy-plus/CommunityGoalsPanel.tsx:306`            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/economy-plus/SavingsGoalsPanel.tsx:251`              | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/economy-plus/WalletPage.tsx:103`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/BioAssist.tsx:89`                               | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/ComposeBox.tsx:751`                             | standalone (reviewed)   | standalone: removable tags / chips the user adds one by one                                                 |
| 2       | `components/feed/ComposeModal.tsx:252`                           | standalone (reviewed)   | standalone: removable tags / primary post action                                                            |
| 2       | `components/feed/ConversationView.tsx:1453`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/EditPostModal.tsx:97`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/GroupChatView.tsx:678`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/MessagesColumn.tsx:325`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/NotificationsColumn.tsx:624`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/QuotesDialog.tsx:154`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/RMHarkActions.tsx:133`                          | standalone (reviewed)   | standalone: four engagement controls spread across the card width, hover wash only (no parent worth a body) |
| 2       | `components/feed/StatusEditor.tsx:152`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/feed/StorefrontColumn.tsx:351`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/games/ResultMoment.tsx:84`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/gifting/ExchangeDetail.tsx:136`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/gifting/KudosPanel.tsx:151`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/gifting/MixtapeEditor.tsx:99`                        | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/groupcall/GroupCallOverlay.tsx:294`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/home/WidgetEditor.tsx:74`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/home/WidgetStack.tsx:91`                             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/homes/ImageUploader.tsx:144`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/homes/ListingDetailView.tsx:213`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/homes/RentSplitPanel.tsx:40`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/kaikai-debt/DebtLog.tsx:254`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/lists/ListDetailView.tsx:85`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/membership/MembershipPanel.tsx:221`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/moderation/AccountStandingPanel.tsx:360`             | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/party/ConnectionsPages.tsx:512`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/party/ControllerPad.tsx:108`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/party/PartyBar.tsx:102`                              | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/posts-plus/QotdPage.tsx:162`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/predictions/PredictionCard.tsx:182`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/profile/ProfileHero.tsx:281`                         | standalone (reviewed)   | standalone: one primary (accent) action plus differently-purposed icon links                                |
| 2       | `components/profile/plus/ProfileIdentityExtras.tsx:60`           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/profile/plus/rings/RingPage.tsx:102`                 | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/radial/RadialNavRail.tsx:87`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/radial/WheelCard.tsx:169`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/reading/HighlightsSection.tsx:82`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/reading/admin/AdminGlossary.tsx:152`                 | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/reading/admin/AdminStories.tsx:196`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/reading/useHighlightKit.tsx:333`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/replays/GameReplayPlayer.tsx:131`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/replays/SaveReplayButton.tsx:98`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rideshare/ActiveRidePanel.tsx:382`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rideshare/LocationSearch.tsx:195`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rideshare/SavedPlaces.tsx:67`                        | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcalculator/NotebookTab.tsx:119`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/BaccaratLobby.tsx:123`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/BlackjackLobby.tsx:123`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/HoldemControls.tsx:284`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/HoldemLobby.tsx:133`                        | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/PlinkoGame.tsx:456`                         | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/RouletteLobby.tsx:123`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhcoins/RouletteTable.tsx:463`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhfashion/FashionStudio.tsx:199`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/rmhladder/InterviewReports.tsx:105`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/safety/PileOnPage.tsx:89`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/saves/SavesHub.tsx:184`                              | standalone (reviewed)   | standalone: one Load more action per list                                                                   |
| 2       | `components/search/SavedSearches.tsx:75`                         | standalone (reviewed)   | standalone: two unrelated xs text actions                                                                   |
| 2       | `components/settings/AccentPicker.tsx:34`                        | standalone (reviewed)   | standalone: colour swatches are previews, not text controls                                                 |
| 2       | `components/settings/FeedControlsSettings.tsx:152`               | standalone (reviewed)   | standalone: user-built tag chips (add/remove independently, wrap)                                           |
| 2       | `components/settings/PlayLimitsPanel.tsx:215`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/settings/ProfileLinksPanel.tsx:221`                  | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/settings/TrustedContactsPanel.tsx:346`               | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/spaces/SpaceRoom.tsx:343`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/themes/ThemeEditor.tsx:300`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/themes/ThemeStudio.tsx:337`                          | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/tournaments/BracketView.tsx:101`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/trash/TrashPanel.tsx:179`                            | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/trash/TrashRow.tsx:105`                              | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/ui/horizontal-scroller.tsx:108`                      | standalone (reviewed)   | standalone: overlay scroll arrows are floating overlay controls                                             |
| 2       | `components/ui/sortable-list.tsx:128`                            | standalone (reviewed)   | standalone: drag handle + row actions, not a cluster                                                        |
| 2       | `components/user-builds/BuildComments.tsx:64`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/user-builds/BuildDetail.tsx:181`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/user-builds/BuildFilters.tsx:197`                    | standalone (reviewed)   | standalone: unrelated toggles (Curated, My builds) beside a sort menu                                       |
| 2       | `components/user-builds/BuildForm.tsx:235`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `components/worlds/ShareWorldDialog.tsx:133`                     | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/admin/rideshare.tsx:312`                       | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/developer/index.tsx:39`                        | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/homes/index.tsx:355`                           | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/rideshare/ride.tsx:484`                        | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/rmhladder/companies.tsx:258`                   | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/rmhladder/pipeline.tsx:155`                    | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/rmhladder/resume.tsx:173`                      | standalone (unreviewed) | scan only; default standalone                                                                               |
| 2       | `app/routes/_site/tournaments.$id.tsx:269`                       | standalone (unreviewed) | scan only; default standalone                                                                               |

## Known leftovers

- `/create` search shares a row with a button, `/homes` filter selects keep their own layout (not converted).
- The 117 scan-only rows have not been read by eye; most are action pairs in admin and settings pages.
- RMHTube/RMHMusic/etc. (full-screen apps) are out of scope by design.
