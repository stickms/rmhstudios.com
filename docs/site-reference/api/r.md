<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: R

See the [API inventory](../api.md) for how to read the tables.

## `/api/ranked`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ranked` | `GET` `POST` | `lib/ranked/api/ranked.server.ts` |
| `/api/ranked/:game/leaderboard` | `GET` | `lib/ranked/api/ranked.$game.leaderboard.server.ts` |
| `/api/ranked/challenge/:id` | `POST` | `lib/ranked/api/ranked.challenge.$id.server.ts` |

## `/api/reading`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reading/doc` | `GET` | `lib/reading/api/reading.doc.server.ts` |
| `/api/reading/goal` | `DELETE` `GET` `PUT` | `lib/reading/api/reading.goal.server.ts` |
| `/api/reading/highlights` | `GET` `POST` | `lib/reading/api/reading.highlights.server.ts` |
| `/api/reading/highlights/:id` | `DELETE` `PATCH` | `lib/reading/api/reading.highlights.$id.server.ts` |
| `/api/reading/highlights/export` | `POST` | `lib/reading/api/reading.highlights.export.server.ts` |
| `/api/reading/highlights/search` | `GET` | `lib/reading/api/reading.highlights.search.server.ts` |
| `/api/reading/shelves` | `DELETE` `GET` `PUT` | `lib/reading/api/reading.shelves.server.ts` |
| `/api/reading/shelves/prefs` | `PUT` | `lib/reading/api/reading.shelves.prefs.server.ts` |
| `/api/reading/subscriptions` | `GET` `POST` | `lib/reading/api/reading.subscriptions.server.ts` |
| `/api/reading/subscriptions/:id` | `DELETE` `PATCH` | `lib/reading/api/reading.subscriptions.$id.server.ts` |
| `/api/reading/time` | `DELETE` `GET` `POST` | `lib/reading/api/reading.time.server.ts` |
| `/api/reading/time/prefs` | `GET` `PUT` | `lib/reading/api/reading.time.prefs.server.ts` |

## `/api/ready`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ready` | `GET` | `app/routes/api/ready.ts` |

## `/api/recap`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recap` | `GET` | `lib/api/routes/recap.server.ts` |

## `/api/recipes`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recipes` | `GET` `POST` | `lib/developer/api/recipes.server.ts` |
| `/api/recipes/:id` | `DELETE` `PATCH` | `lib/developer/api/recipes.$id.server.ts` |

## `/api/referrals`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/referrals/claim` | `POST` | `lib/api/routes/referrals.claim.server.ts` |
| `/api/referrals/me` | `GET` | `lib/api/routes/referrals.me.server.ts` |

## `/api/release-notes`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/release-notes` | `GET` | `lib/developer/api/release-notes.server.ts` |

## `/api/reminders`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reminders` | `GET` `POST` | `lib/reminders/api/reminders.server.ts` |
| `/api/reminders/:id` | `DELETE` | `lib/reminders/api/reminders.$id.server.ts` |

## `/api/replays`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/replays` | `POST` | `lib/game/api/replays.server.ts` |
| `/api/replays/:id` | `DELETE` `GET` `PATCH` | `lib/game/api/replays.$id.server.ts` |
| `/api/replays/board` | `GET` | `lib/game/api/replays.board.server.ts` |
| `/api/replays/ghost` | `GET` `POST` | `app/routes/api/replays/ghost.ts` |
| `/api/replays/mine` | `GET` | `lib/game/api/replays.mine.server.ts` |

## `/api/requests`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/requests` | `GET` `POST` | `lib/requests/api/requests.server.ts` |
| `/api/requests/:id` | `GET` `PATCH` | `lib/requests/api/requests.$id.server.ts` |
| `/api/requests/:id/vote` | `POST` | `lib/requests/api/requests.$id.vote.server.ts` |

## `/api/reviews`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reviews/:id/vote` | `DELETE` `POST` | `lib/games/api/reviews.$id.vote.server.ts` |

## `/api/rideshare`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rideshare/directions` | `GET` | `lib/rideshare/api/rideshare.directions.server.ts` |
| `/api/rideshare/driver` | `GET` `PATCH` `POST` | `lib/rideshare/api/rideshare.driver.server.ts` |
| `/api/rideshare/earnings` | `GET` | `lib/rideshare/api/rideshare.earnings.server.ts` |
| `/api/rideshare/geocode` | `GET` | `lib/rideshare/api/rideshare.geocode.server.ts` |
| `/api/rideshare/location` | `POST` | `lib/rideshare/api/rideshare.location.server.ts` |
| `/api/rideshare/places` | `GET` `POST` | `lib/rideshare/api/rideshare.places.server.ts` |
| `/api/rideshare/places/:id` | `DELETE` | `lib/rideshare/api/rideshare.places.$id.server.ts` |
| `/api/rideshare/reverse` | `GET` | `lib/rideshare/api/rideshare.reverse.server.ts` |
| `/api/rideshare/rides` | `GET` `POST` | `lib/rideshare/api/rideshare.rides.server.ts` |
| `/api/rideshare/rides/:id` | `POST` | `lib/rideshare/api/rideshare.rides.$id.server.ts` |
| `/api/rideshare/rides/:id/messages` | `POST` | `lib/rideshare/api/rideshare.rides.$id.messages.server.ts` |
| `/api/rideshare/rides/:id/rate` | `POST` | `lib/rideshare/api/rideshare.rides.$id.rate.server.ts` |
| `/api/rideshare/rides/:id/sync` | `GET` | `lib/rideshare/api/rideshare.rides.$id.sync.server.ts` |

## `/api/rmharks`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmharks` | `GET` `POST` | `lib/feed/api/rmharks.server.ts` |
| `/api/rmharks/:id` | `DELETE` `GET` `PATCH` | `lib/feed/api/rmharks.$id.server.ts` |
| `/api/rmharks/:id/alt-text` | `PUT` | `lib/feed/api/rmharks.$id.alt-text.server.ts` |
| `/api/rmharks/:id/bookmark` | `POST` | `lib/feed/api/rmharks.$id.bookmark.server.ts` |
| `/api/rmharks/:id/comment` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.server.ts` |
| `/api/rmharks/:id/comment/:commentId` | `DELETE` | `lib/feed/api/rmharks.$id.comment.$commentId.server.ts` |
| `/api/rmharks/:id/comment/:commentId/hide` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.hide.server.ts` |
| `/api/rmharks/:id/comment/:commentId/like` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.like.server.ts` |
| `/api/rmharks/:id/comment/:commentId/repost` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.repost.server.ts` |
| `/api/rmharks/:id/comment/:commentId/view` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.view.server.ts` |
| `/api/rmharks/:id/embed` | `GET` | `lib/feed/api/rmharks.$id.embed.server.ts` |
| `/api/rmharks/:id/history` | `GET` | `lib/feed/api/rmharks.$id.history.server.ts` |
| `/api/rmharks/:id/insights` | `GET` | `lib/feed/api/rmharks.$id.insights.server.ts` |
| `/api/rmharks/:id/like` | `GET` `POST` | `lib/feed/api/rmharks.$id.like.server.ts` |
| `/api/rmharks/:id/mute` | `DELETE` `GET` `PUT` | `lib/feed/api/rmharks.$id.mute.server.ts` |
| `/api/rmharks/:id/pin` | `GET` `POST` | `lib/feed/api/rmharks.$id.pin.server.ts` |
| `/api/rmharks/:id/pin-reply` | `DELETE` `PUT` | `lib/feed/api/rmharks.$id.pin-reply.server.ts` |
| `/api/rmharks/:id/pin/move` | `POST` | `lib/feed/api/rmharks.$id.pin.move.server.ts` |
| `/api/rmharks/:id/poll/end` | `POST` | `lib/feed/api/rmharks.$id.poll.end.server.ts` |
| `/api/rmharks/:id/poll/extend` | `POST` | `lib/feed/api/rmharks.$id.poll.extend.server.ts` |
| `/api/rmharks/:id/quotes` | `GET` | `lib/feed/api/rmharks.$id.quotes.server.ts` |
| `/api/rmharks/:id/react` | `POST` | `lib/feed/api/rmharks.$id.react.server.ts` |
| `/api/rmharks/:id/repost` | `GET` `POST` | `lib/feed/api/rmharks.$id.repost.server.ts` |
| `/api/rmharks/:id/similar` | `GET` | `app/routes/api/rmharks/$id/similar.ts` |
| `/api/rmharks/:id/summary` | `GET` | `lib/feed/api/rmharks.$id.summary.server.ts` |
| `/api/rmharks/:id/take` | `GET` `POST` | `lib/feed/api/rmharks.$id.take.server.ts` |
| `/api/rmharks/:id/translate` | `GET` | `lib/ai/api/rmharks.$id.translate.server.ts` |
| `/api/rmharks/:id/unlock` | `POST` | `app/routes/api/rmharks/$id/unlock.ts` |
| `/api/rmharks/:id/vibe` | `GET` | `lib/feed/api/rmharks.$id.vibe.server.ts` |
| `/api/rmharks/:id/view` | `POST` | `app/routes/api/rmharks/$id/view.ts` |
| `/api/rmharks/:id/vote` | `POST` | `lib/feed/api/rmharks.$id.vote.server.ts` |
| `/api/rmharks/ai-generate` | `POST` | `lib/feed/api/rmharks.ai-generate.server.ts` |
| `/api/rmharks/ai-image` | `POST` | `lib/rmhark-ai/api/rmharks.ai-image.server.ts` |
| `/api/rmharks/image` | `POST` | `lib/media/api/rmharks.image.server.ts` |
| `/api/rmharks/thread` | `POST` | `lib/feed/api/rmharks.thread.server.ts` |

## `/api/rmhbox`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhbox/history` | `GET` | `lib/rmhbox/api/rmhbox.history.server.ts` |
| `/api/rmhbox/leaderboard` | `GET` | `app/routes/api/rmhbox/leaderboard.ts` |
| `/api/rmhbox/packs` | `GET` `POST` | `lib/rmhbox/api/rmhbox.packs.server.ts` |
| `/api/rmhbox/packs/:id` | `DELETE` `PATCH` | `lib/rmhbox/api/rmhbox.packs.$id.server.ts` |
| `/api/rmhbox/packs/:id/report` | `POST` | `lib/rmhbox/api/rmhbox.packs.$id.report.server.ts` |
| `/api/rmhbox/presets` | `GET` `POST` | `lib/rmhbox/api/rmhbox.presets.server.ts` |
| `/api/rmhbox/presets/:id` | `DELETE` `PATCH` | `lib/rmhbox/api/rmhbox.presets.$id.server.ts` |
| `/api/rmhbox/stats` | `GET` | `lib/rmhbox/api/rmhbox.stats.server.ts` |

## `/api/rmhcalculator`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcalculator/compute` | `POST` | `app/routes/api/rmhcalculator/compute.ts` |
| `/api/rmhcalculator/graph` | `POST` | `app/routes/api/rmhcalculator/graph.ts` |

## `/api/rmhcharacters`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcharacters/advisor` | `POST` | `features/rmhcharacters/api/rmhcharacters.advisor.server.ts` |
| `/api/rmhcharacters/characters` | `GET` | `features/rmhcharacters/api/rmhcharacters.characters.server.ts` |
| `/api/rmhcharacters/characters/:id` | `DELETE` `PUT` | `features/rmhcharacters/api/rmhcharacters.characters.$id.server.ts` |

## `/api/rmhcode`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcode/auth/generate` | `POST` | `lib/rmhcode/api/rmhcode.auth.generate.server.ts` |
| `/api/rmhcode/auth/initiate` | `POST` | `lib/rmhcode/api/rmhcode.auth.initiate.server.ts` |
| `/api/rmhcode/auth/list` | `GET` | `lib/rmhcode/api/rmhcode.auth.list.server.ts` |
| `/api/rmhcode/auth/revoke` | `POST` | `lib/rmhcode/api/rmhcode.auth.revoke.server.ts` |
| `/api/rmhcode/auth/validate` | `POST` | `lib/rmhcode/api/rmhcode.auth.validate.server.ts` |

## `/api/rmhladder`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhladder/answers` | `DELETE` `GET` `PUT` | `lib/rmhladder/api/rmhladder.answers.server.ts` |
| `/api/rmhladder/calendar` | `GET` | `lib/rmhladder/api/rmhladder.calendar.server.ts` |
| `/api/rmhladder/events` | `POST` | `app/routes/api/rmhladder/events.ts` |
| `/api/rmhladder/export` | `GET` | `lib/rmhladder/api/rmhladder.export.server.ts` |
| `/api/rmhladder/import` | `POST` | `lib/rmhladder/api/rmhladder.import.server.ts` |
| `/api/rmhladder/insights` | `GET` | `lib/rmhladder/api/rmhladder.insights.server.ts` |
| `/api/rmhladder/interview-reports` | `GET` `POST` | `lib/rmhladder/api/rmhladder.interview-reports.server.ts` |
| `/api/rmhladder/offers` | `GET` `POST` | `lib/rmhladder/api/rmhladder.offers.server.ts` |
| `/api/rmhladder/offers/:id` | `DELETE` `PATCH` | `lib/rmhladder/api/rmhladder.offers.$id.server.ts` |
| `/api/rmhladder/offers/:id/decide` | `POST` | `lib/rmhladder/api/rmhladder.offers.$id.decide.server.ts` |
| `/api/rmhladder/prep` | `POST` | `lib/rmhladder/api/rmhladder.prep.server.ts` |
| `/api/rmhladder/referral-requests/:id` | `PATCH` | `lib/rmhladder/api/rmhladder.referral-requests.$id.server.ts` |
| `/api/rmhladder/referrals` | `GET` `POST` | `lib/rmhladder/api/rmhladder.referrals.server.ts` |
| `/api/rmhladder/referrals/:id` | `DELETE` | `lib/rmhladder/api/rmhladder.referrals.$id.server.ts` |
| `/api/rmhladder/referrals/:id/request` | `POST` | `lib/rmhladder/api/rmhladder.referrals.$id.request.server.ts` |
| `/api/rmhladder/resume` | `GET` `POST` | `app/routes/api/rmhladder/resume/index.ts` |
| `/api/rmhladder/resume/:id` | `DELETE` `GET` | `app/routes/api/rmhladder/resume/$id.ts` |
| `/api/rmhladder/resume/:id/analyze` | `POST` | `app/routes/api/rmhladder/resume/$id/analyze.ts` |
| `/api/rmhladder/resume/:id/confirm` | `POST` | `app/routes/api/rmhladder/resume/$id/confirm.ts` |
| `/api/rmhladder/searches` | `DELETE` `GET` `POST` | `lib/rmhladder/api/rmhladder.searches.server.ts` |

## `/api/rmhmusic`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhmusic/friends` | `GET` | `lib/rmhmusic/api/rmhmusic.friends.server.ts` |
| `/api/rmhmusic/history` | `DELETE` `GET` | `lib/rmhmusic/api/rmhmusic.history.server.ts` |
| `/api/rmhmusic/history/entries` | `GET` | `lib/rmhmusic/api/rmhmusic.history.entries.server.ts` |
| `/api/rmhmusic/history/songs/:songId` | `GET` | `lib/rmhmusic/api/rmhmusic.history.songs.$songId.server.ts` |
| `/api/rmhmusic/learn/cards` | `GET` `POST` | `lib/rmhmusic/api/rmhmusic.learn.cards.server.ts` |
| `/api/rmhmusic/learn/lesson-complete` | `POST` | `lib/rmhmusic/api/rmhmusic.learn.lesson-complete.server.ts` |
| `/api/rmhmusic/learn/profile` | `GET` `PUT` | `lib/rmhmusic/api/rmhmusic.learn.profile.server.ts` |
| `/api/rmhmusic/r/:token` | `GET` | `lib/rmhmusic/api/rmhmusic.r.$token.server.ts` |
| `/api/rmhmusic/share` | `DELETE` `GET` `POST` | `lib/rmhmusic/api/rmhmusic.share.server.ts` |
| `/api/rmhmusic/share/:id` | `DELETE` | `lib/rmhmusic/api/rmhmusic.share.$id.server.ts` |
| `/api/rmhmusic/social` | `GET` `PUT` | `lib/rmhmusic/api/rmhmusic.social.server.ts` |
| `/api/rmhmusic/songs` | `GET` | `lib/rmhmusic/api/rmhmusic.songs.server.ts` |
| `/api/rmhmusic/songs/best` | `POST` | `lib/rmhmusic/api/rmhmusic.songs.best.server.ts` |
| `/api/rmhmusic/sprint` | `GET` | `lib/rmhmusic/api/rmhmusic.sprint.server.ts` |
| `/api/rmhmusic/sprint/board` | `GET` | `lib/rmhmusic/api/rmhmusic.sprint.board.server.ts` |
| `/api/rmhmusic/sprint/daily` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.daily.server.ts` |
| `/api/rmhmusic/sprint/daily-start` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.daily-start.server.ts` |
| `/api/rmhmusic/sprint/freeplay` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.freeplay.server.ts` |

## `/api/rmhstudy`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhstudy/goal` | `PUT` | `lib/rmhstudy/api/rmhstudy.goal.server.ts` |
| `/api/rmhstudy/history` | `GET` | `lib/rmhstudy/api/rmhstudy.history.server.ts` |
| `/api/rmhstudy/history/sessions` | `GET` | `lib/rmhstudy/api/rmhstudy.history.sessions.server.ts` |

## `/api/rmhtube`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtube/commentary` | `GET` `POST` | `lib/rmhtube/api/rmhtube.commentary.server.ts` |
| `/api/rmhtube/heat` | `GET` | `lib/rmhtube/api/rmhtube.heat.server.ts` |
| `/api/rmhtube/oembed` | `GET` | `app/routes/api/rmhtube/oembed.ts` |
| `/api/rmhtube/parties` | `GET` `POST` | `lib/rmhtube/api/rmhtube.parties.server.ts` |
| `/api/rmhtube/parties/:roomId` | `DELETE` `GET` `PATCH` | `lib/rmhtube/api/rmhtube.parties.$roomId.server.ts` |
| `/api/rmhtube/parties/:roomId/ics` | `GET` | `app/routes/api/rmhtube/parties/$roomId/ics.ts` |
| `/api/rmhtube/parties/:roomId/rsvp` | `DELETE` `PUT` | `lib/rmhtube/api/rmhtube.parties.$roomId.rsvp.server.ts` |
| `/api/rmhtube/stats` | `DELETE` `GET` | `lib/rmhtube/api/rmhtube.stats.server.ts` |
| `/api/rmhtube/stats/pause` | `PUT` | `lib/rmhtube/api/rmhtube.stats.pause.server.ts` |
| `/api/rmhtube/subscribe/:channelId` | `POST` | `lib/rmhtube/api/rmhtube.subscribe.$channelId.server.ts` |
| `/api/rmhtube/timed-comments` | `DELETE` `GET` `POST` | `lib/rmhtube/api/rmhtube.timed-comments.server.ts` |
| `/api/rmhtube/watch-later` | `DELETE` `GET` `POST` | `lib/rmhtube/api/rmhtube.watch-later.server.ts` |

## `/api/rmhtype`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtype/daily` | `GET` | `lib/rmhtype/api/rmhtype.daily.server.ts` |
| `/api/rmhtype/daily/finish` | `POST` | `lib/rmhtype/api/rmhtype.daily.finish.server.ts` |
| `/api/rmhtype/daily/leaderboard` | `GET` | `lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts` |
| `/api/rmhtype/daily/start` | `POST` | `lib/rmhtype/api/rmhtype.daily.start.server.ts` |
| `/api/rmhtype/ghosts` | `DELETE` | `lib/rmhtype/api/rmhtype.ghosts.server.ts` |
| `/api/rmhtype/ghosts/:passageId` | `GET` | `lib/rmhtype/api/rmhtype.ghosts.$passageId.server.ts` |
| `/api/rmhtype/keystats` | `DELETE` `GET` `POST` | `lib/rmhtype/api/rmhtype.keystats.server.ts` |
| `/api/rmhtype/lessons/progress` | `GET` `POST` | `lib/rmhtype/api/rmhtype.lessons.progress.server.ts` |
| `/api/rmhtype/practice-test` | `POST` | `lib/rmhtype/api/rmhtype.practice-test.server.ts` |
| `/api/rmhtype/progress` | `GET` | `lib/rmhtype/api/rmhtype.progress.server.ts` |
| `/api/rmhtype/progress/runs` | `GET` | `lib/rmhtype/api/rmhtype.progress.runs.server.ts` |
| `/api/rmhtype/texts` | `GET` `POST` | `lib/rmhtype/api/rmhtype.texts.server.ts` |
| `/api/rmhtype/texts/:textId` | `DELETE` `GET` `PATCH` | `lib/rmhtype/api/rmhtype.texts.$textId.server.ts` |
| `/api/rmhtype/texts/:textId/runs` | `POST` | `lib/rmhtype/api/rmhtype.texts.$textId.runs.server.ts` |

## `/api/rum`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rum` | `POST` | `lib/api/routes/rum.server.ts` |
