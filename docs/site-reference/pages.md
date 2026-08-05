<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/games.ts, lib/apps.ts.
  Regenerate with `pnpm docs:site`.
-->

# Page routes

Every page the site serves — 246 routes. 129 render inside the standard site shell (sidebar, nav, context rail); 117 are full-screen, which is how games, the login page and the legal pages are meant to render. Placement decides chrome: a file under `app/routes/_site/` gets the shell, a top-level file does not.

Params appear as `:name`; `*` is a catch-all splat.

**Access** is derived from the route file and every layout above it: `admin` (bounced unless `isAdmin`), `sign-in` (redirected to `/login`), or `public`. `public` describes the *route*, not necessarily everything on it — several public pages render a sign-in prompt in place of their content rather than redirecting, `/developer` being one.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/` | RMH Studios | public | `app/routes/_site/index.tsx` |
| `/achievements` | Achievements | public | `app/routes/_site/achievements.tsx` |
| `/admin` | Admin Dashboard | admin | `app/routes/_site/admin/index.tsx` |
| `/admin/albums` | Library Albums \| Admin | admin | `app/routes/_site/admin/albums/index.tsx` |
| `/admin/albums/:id` | Manage Album \| Admin | admin | `app/routes/_site/admin/albums/$id.tsx` |
| `/admin/analytics` | Analytics | admin | `app/routes/_site/admin/analytics.tsx` |
| `/admin/announcements` | Announcements | admin | `app/routes/_site/admin/announcements.tsx` |
| `/admin/appeals` | Strike Appeals | admin | `app/routes/_site/admin/appeals.tsx` |
| `/admin/audit` | Audit Log | admin | `app/routes/_site/admin/audit.tsx` |
| `/admin/blog` | Manage Blog Posts \| Admin | admin | `app/routes/_site/admin/blog/index.tsx` |
| `/admin/blog/:slug/edit` | Edit Blog Post \| Admin | admin | `app/routes/_site/admin/blog/$slug/edit.tsx` |
| `/admin/blog/new` | Create Blog Post \| Admin | admin | `app/routes/_site/admin/blog/new.tsx` |
| `/admin/economy` | Coin Economy | admin | `app/routes/_site/admin/economy.tsx` |
| `/admin/library-quota` | Library Upload Appeals | admin | `app/routes/_site/admin/library-quota.tsx` |
| `/admin/library-storage` | Library Storage Health | admin | `app/routes/_site/admin/library-storage.tsx` |
| `/admin/predictions` | Prediction Markets \| Admin | admin | `app/routes/_site/admin/predictions.tsx` |
| `/admin/redemptions` | Redemption Queue | admin | `app/routes/_site/admin/redemptions.tsx` |
| `/admin/reports` | Moderation Queue | admin | `app/routes/_site/admin/reports.tsx` |
| `/admin/rideshare` | Rideshare Applications | admin | `app/routes/_site/admin/rideshare.tsx` |
| `/admin/security-reports` | Security Reports | admin | `app/routes/_site/admin/security-reports.tsx` |
| `/admin/user-builds` | — | admin | `app/routes/_site/admin/user-builds.tsx` |
| `/admin/users` | — | admin | `app/routes/_site/admin/users.tsx` |
| `/analytics` | Creator Analytics | public | `app/routes/_site/analytics.tsx` |
| `/apps` | Apps | public | `app/routes/_site/apps/index.tsx` |
| `/arcade` | redirects to `/create?tab=games` | public | `app/routes/_site/arcade.tsx` |
| `/blog` | redirects to `/library` | public | `app/routes/_site/blog/index.tsx` |
| `/blog/:slug` | — | public | `app/routes/_site/blog/$slug.tsx` |
| `/bookmarks` | redirects to `/saves?tab=saved` | public | `app/routes/_site/bookmarks.tsx` |
| `/builds` | redirects to `/create?tab=games` | public | `app/routes/_site/builds/index.tsx` |
| `/builds/:slug` | Build Not Found | public | `app/routes/_site/builds/$slug.tsx` |
| `/c/:slug` | — | public | `app/routes/_site/c.$slug.tsx` |
| `/communities` | Communities | public | `app/routes/_site/communities.tsx` |
| `/create` | redirects to `/apps` | public | `app/routes/_site/create/index.tsx` |
| `/creator-studio` | redirects to `/create?tab=earnings` | public | `app/routes/_site/creator-studio.tsx` |
| `/developer` | Developer API | public | `app/routes/_site/developer/index.tsx` |
| `/drafts` | Drafts | public | `app/routes/_site/drafts.tsx` |
| `/emoji-packs` | Emoji & sticker packs | public | `app/routes/_site/emoji-packs.tsx` |
| `/events` | redirects to `/communities?tab=events` | public | `app/routes/_site/events.tsx` |
| `/explore` | Explore | public | `app/routes/_site/explore.tsx` |
| `/games` | Games | public | `app/routes/_site/games/index.tsx` |
| `/games/:gameId` | — | public | `app/routes/_site/games/$gameId.tsx` |
| `/games/:gameId/guides/:guideId` | — | public | `app/routes/_site/games/$gameId_.guides.$guideId.tsx` |
| `/groups` | Group Chats | public | `app/routes/_site/groups/index.tsx` |
| `/groups/:id` | Group Chat | public | `app/routes/_site/groups/$id.tsx` |
| `/help` | Help & Concierge | public | `app/routes/_site/help.tsx` |
| `/history` | History | public | `app/routes/_site/history.tsx` |
| `/homes` | RMHHomes — Rentals & houses posted by the community | public | `app/routes/_site/homes/index.tsx` |
| `/homes/listing/:id` | Listing \| RMHHomes | public | `app/routes/_site/homes/listing.$id.tsx` |
| `/homes/manage` | RMHHomes — My listings | public | `app/routes/_site/homes/manage.tsx` |
| `/homes/saved` | RMHHomes — Saved | public | `app/routes/_site/homes/saved.tsx` |
| `/homes/submit` | RMHHomes — Post a listing | public | `app/routes/_site/homes/submit.tsx` |
| `/homes/watches` | RMHHomes — My alerts | public | `app/routes/_site/homes/watches.tsx` |
| `/leaderboard` | redirects to `/create?tab=games&sub=leaderboard` | public | `app/routes/_site/leaderboard.tsx` |
| `/library` | Library | public | `app/routes/_site/library/index.tsx` |
| `/lists` | redirects to `/saves?tab=lists` | public | `app/routes/_site/lists/index.tsx` |
| `/lists/:id` | List | public | `app/routes/_site/lists/$id.tsx` |
| `/market` | redirects to `/store?tab=market` | public | `app/routes/_site/market.tsx` |
| `/messages` | Inbox | public | `app/routes/_site/messages/index.tsx` |
| `/messages/:conversationId` | — | public | `app/routes/_site/messages/$conversationId.tsx` |
| `/moments/:id` | — | public | `app/routes/_site/moments.$id.tsx` |
| `/music-trivia` | Guess the Song | public | `app/routes/_site/music-trivia.tsx` |
| `/news` | News | public | `app/routes/_site/news/index.tsx` |
| `/notifications` | redirects to `/messages?tab=notifications` | public | `app/routes/_site/notifications.tsx` |
| `/personas` | redirects to `/create?tab=personas` | public | `app/routes/_site/personas/index.tsx` |
| `/personas/:id` | Persona | public | `app/routes/_site/personas/$id.tsx` |
| `/playlists` | redirects to `/library?view=music` | public | `app/routes/_site/playlists.tsx` |
| `/predictions` | Predictions | public | `app/routes/_site/predictions.tsx` |
| `/pricing` | redirects to `/store?tab=membership` | public | `app/routes/_site/pricing.tsx` |
| `/profile/:id` | redirects to `/u/$userid` | public | `app/routes/_site/profile/$id.tsx` |
| `/progress` | Progress | public | `app/routes/_site/progress.tsx` |
| `/quotes` | Steve Jobs Quotes | public | `app/routes/_site/quotes.tsx` |
| `/ranked` | Ranked | public | `app/routes/_site/ranked.tsx` |
| `/recap` | Your Week | public | `app/routes/_site/recap.tsx` |
| `/rideshare` | RMH Rideshare — Rides across the community | public | `app/routes/_site/rideshare/index.tsx` |
| `/rideshare/drive` | Drive with RMH Rideshare | public | `app/routes/_site/rideshare/drive.tsx` |
| `/rideshare/ride` | Request a ride — RMH Rideshare | public | `app/routes/_site/rideshare/ride.tsx` |
| `/rmhladder` | RMH Ladder \| Verified Early-Career Jobs | public | `app/routes/_site/rmhladder/index.tsx` |
| `/rmhladder/alerts` | — | sign-in | `app/routes/_site/rmhladder/alerts.tsx` |
| `/rmhladder/companies` | — | admin | `app/routes/_site/rmhladder/companies.tsx` |
| `/rmhladder/health` | — | admin | `app/routes/_site/rmhladder/health.tsx` |
| `/rmhladder/jobs/:jobId` | Job unavailable \| RMH Ladder | sign-in | `app/routes/_site/rmhladder/jobs/$jobId.tsx` |
| `/rmhladder/pipeline` | — | sign-in | `app/routes/_site/rmhladder/pipeline.tsx` |
| `/rmhladder/resume` | — | sign-in | `app/routes/_site/rmhladder/resume.tsx` |
| `/rmhladder/review` | — | admin | `app/routes/_site/rmhladder/review.tsx` |
| `/rmhladder/settings` | — | sign-in | `app/routes/_site/rmhladder/settings.tsx` |
| `/roadmap` | Roadmap & requests | public | `app/routes/_site/roadmap.tsx` |
| `/saves` | Saved | public | `app/routes/_site/saves/index.tsx` |
| `/search` | redirects to `/explore` | public | `app/routes/_site/search.tsx` |
| `/services` | Services | public | `app/routes/_site/services.tsx` |
| `/settings` | Settings | public | `app/routes/_site/settings/index.tsx` |
| `/settings/account-status` | Account status | public | `app/routes/_site/settings/account-status.tsx` |
| `/settings/appearance` | Appearance | public | `app/routes/_site/settings/appearance.tsx` |
| `/settings/circle` | Close Friends | public | `app/routes/_site/settings/circle.tsx` |
| `/settings/content` | Content preferences | public | `app/routes/_site/settings/content.tsx` |
| `/settings/layout` | Layout | public | `app/routes/_site/settings/layout.tsx` |
| `/settings/notifications` | Notifications | public | `app/routes/_site/settings/notifications.tsx` |
| `/settings/privacy` | Privacy & data | public | `app/routes/_site/settings/privacy.tsx` |
| `/settings/profile` | Profile customization | public | `app/routes/_site/settings/profile.tsx` |
| `/settings/security` | Security | public | `app/routes/_site/settings/security.tsx` |
| `/settings/themes` | Theme Studio | public | `app/routes/_site/settings/themes.tsx` |
| `/share` | Share to RMH Studios | public | `app/routes/_site/share.tsx` |
| `/shop` | redirects to `/store?tab=shop` | public | `app/routes/_site/shop.tsx` |
| `/spaces` | redirects to `/communities?tab=spaces` | public | `app/routes/_site/spaces.index.tsx` |
| `/spaces/:id` | — | public | `app/routes/_site/spaces.$id.tsx` |
| `/speedruns` | Speedruns | public | `app/routes/_site/speedruns.tsx` |
| `/store` | Store — RMH Studios | public | `app/routes/_site/store/index.tsx` |
| `/store/:userid` | Store | public | `app/routes/_site/store/$userid.tsx` |
| `/studio/themes` | redirects to `/settings/themes` | public | `app/routes/_site/studio/themes.tsx` |
| `/study` | Flashcards | public | `app/routes/_site/study/index.tsx` |
| `/study/:deckId` | Deck \| RMHStudy | public | `app/routes/_site/study/$deckId.tsx` |
| `/study/browse` | Browse decks | public | `app/routes/_site/study/browse.tsx` |
| `/tag/:tag` | — | public | `app/routes/_site/tag.$tag.tsx` |
| `/thread/:rootId` | — | public | `app/routes/_site/thread/$rootId.tsx` |
| `/tournaments` | Tournaments | public | `app/routes/_site/tournaments.index.tsx` |
| `/tournaments/:id` | — | public | `app/routes/_site/tournaments.$id.tsx` |
| `/trash` | Trash | public | `app/routes/_site/trash.tsx` |
| `/u/:userid` | User Not Found \| RMH | public | `app/routes/_site/u/$userid/index.tsx` |
| `/u/:userid/post/:postid` | Post Not Found \| RMH | public | `app/routes/_site/u/$userid/post/$postid.tsx` |
| `/user-builds` | redirects to `/builds` | public | `app/routes/_site/user-builds/index.tsx` |
| `/user-builds/:slug` | — | public | `app/routes/_site/user-builds/$slug.tsx` |
| `/user-builds/manage` | — | public | `app/routes/_site/user-builds/manage.tsx` |
| `/user-builds/submit` | — | public | `app/routes/_site/user-builds/submit.tsx` |
| `/v` | redirects to `/create?tab=pages` | public | `app/routes/_site/v/index.tsx` |
| `/ventures` | RMH Ventures | public | `app/routes/_site/ventures.tsx` |
| `/wager` | Wager Matches | public | `app/routes/_site/wager.index.tsx` |
| `/wager/:id` | Wager Match | public | `app/routes/_site/wager.$id.tsx` |
| `/wallet` | redirects to `/predictions` | public | `app/routes/_site/wallet.tsx` |
| `/wishlist` | redirects to `/saves?tab=wishlist` | public | `app/routes/_site/wishlist.tsx` |
| `/wrapped` | Wrapped | public | `app/routes/_site/wrapped.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/.well-known/apple-app-site-association` | — | public | `app/routes/[.]well-known.apple-app-site-association.ts` |
| `/.well-known/assetlinks.json` | — | public | `app/routes/[.]well-known.assetlinks[.]json.ts` |
| `/adaptive-intelligence` | — | public | `app/routes/adaptive-intelligence.tsx` |
| `/ads.txt` | — | public | `app/routes/ads[.]txt.ts` |
| `/altair` | — | public | `app/routes/altair/index.tsx` |
| `/altair/multiplayer` | — | sign-in | `app/routes/altair/multiplayer/index.tsx` |
| `/altair/multiplayer/:lobbyId` | — | sign-in | `app/routes/altair/multiplayer/$lobbyId.tsx` |
| `/black-lives-matter` | Black Lives Matter | public | `app/routes/black-lives-matter.tsx` |
| `/blog/rss.xml` | RMH Studios — Blog | public | `app/routes/blog.rss[.]xml.ts` |
| `/cookgame` | — | public | `app/routes/cookgame.tsx` |
| `/cookies` | Cookie Policy | public | `app/routes/cookies.tsx` |
| `/copyright` | Copyright | public | `app/routes/copyright.tsx` |
| `/covid` | — | public | `app/routes/covid.tsx` |
| `/daily` | Daily Puzzles — a new set every day | public | `app/routes/daily/index.tsx` |
| `/daily/alibi` | — | public | `app/routes/daily/alibi.tsx` |
| `/daily/chainlink` | — | public | `app/routes/daily/chainlink.tsx` |
| `/daily/impostor` | — | public | `app/routes/daily/impostor.tsx` |
| `/daily/lights-out` | — | public | `app/routes/daily/lights-out.tsx` |
| `/daily/outcast` | — | public | `app/routes/daily/outcast.tsx` |
| `/daily/spectrum` | — | public | `app/routes/daily/spectrum.tsx` |
| `/deeplink` | — | public | `app/routes/deeplink.ts` |
| `/deeplink/:page` | — | public | `app/routes/deeplink.$page.ts` |
| `/design` | Spatial Minimalism | public | `app/routes/design.tsx` |
| `/discord/lights-out` | — | public | `app/routes/discord/lights-out.tsx` |
| `/discord/rmhbox` | — | public | `app/routes/discord/rmhbox.tsx` |
| `/dream-rift` | — | public | `app/routes/dream-rift.tsx` |
| `/embed/post/:id` | — | public | `app/routes/embed.post.$id.tsx` |
| `/embed/replay/:id` | — | public | `app/routes/embed.replay.$id.tsx` |
| `/forest-explorer` | — | public | `app/routes/forest-explorer/index.tsx` |
| `/forest-explorer/explore` | — | public | `app/routes/forest-explorer/explore.tsx` |
| `/forest-explorer/story` | — | public | `app/routes/forest-explorer/story.tsx` |
| `/gabriels-horn` | Gabriel | public | `app/routes/gabriels-horn.tsx` |
| `/house-always-wins` | — | public | `app/routes/house-always-wins.tsx` |
| `/isleworks` | Isleworks — isometric island city builder | public | `app/routes/isleworks.tsx` |
| `/kowloon-knockout` | — | public | `app/routes/kowloon-knockout/index.tsx` |
| `/laundry-sort` | Laundry Sort | public | `app/routes/laundry-sort.tsx` |
| `/library/:slug` | — | public | `app/routes/library.$slug.tsx` |
| `/library/albums/:albumId` | — | public | `app/routes/library.albums.$albumId.tsx` |
| `/lights-out` | redirects to `/daily/lights-out` | public | `app/routes/lights-out.tsx` |
| `/liquid-glass` | — | public | `app/routes/liquid-glass.tsx` |
| `/login` | Login \| RMH | public | `app/routes/login.tsx` |
| `/massive-march` | — | public | `app/routes/massive-march.tsx` |
| `/neon-driftway` | — | public | `app/routes/neon-driftway.tsx` |
| `/news/:slug` | — | public | `app/routes/news.$slug.tsx` |
| `/news/rss.xml` | RMH Studios — News | public | `app/routes/news.rss[.]xml.ts` |
| `/nightrail` | — | public | `app/routes/nightrail.tsx` |
| `/offline` | Offline | public | `app/routes/offline.tsx` |
| `/optimization` | Speed & Optimization | public | `app/routes/optimization.tsx` |
| `/privacy` | Privacy Policy | public | `app/routes/privacy.tsx` |
| `/ref/:code` | Join RMH Studios | public | `app/routes/ref.$code.tsx` |
| `/replays/:id` | — | public | `app/routes/replays.$id.tsx` |
| `/rmh-capital` | — | public | `app/routes/rmh-capital/index.tsx` |
| `/rmh-capital/businesses` | — | public | `app/routes/rmh-capital/businesses.tsx` |
| `/rmh-capital/careers` | — | public | `app/routes/rmh-capital/careers.tsx` |
| `/rmh-capital/contact` | — | public | `app/routes/rmh-capital/contact.tsx` |
| `/rmh-capital/firm` | — | public | `app/routes/rmh-capital/firm.tsx` |
| `/rmh-capital/insights` | — | public | `app/routes/rmh-capital/insights.tsx` |
| `/rmh-farming-sim` | — | public | `app/routes/rmh-farming-sim/index.tsx` |
| `/rmh-internal-affairs` | — | public | `app/routes/rmh-internal-affairs.ts` |
| `/rmh-internal-affairs/:page` | — | public | `app/routes/rmh-internal-affairs.$page.ts` |
| `/rmh-pmc` | — | public | `app/routes/rmh-pmc/index.tsx` |
| `/rmh-pmc/capabilities` | — | public | `app/routes/rmh-pmc/capabilities.tsx` |
| `/rmh-pmc/command` | — | public | `app/routes/rmh-pmc/command.tsx` |
| `/rmh-pmc/contact` | — | public | `app/routes/rmh-pmc/contact.tsx` |
| `/rmh-pmc/intelligence` | — | public | `app/routes/rmh-pmc/intelligence.tsx` |
| `/rmh-pmc/operators` | — | public | `app/routes/rmh-pmc/operators.tsx` |
| `/rmhbox` | — | sign-in | `app/routes/rmhbox/index.tsx` |
| `/rmhbox/:lobbyId` | — | sign-in | `app/routes/rmhbox/$lobbyId.tsx` |
| `/rmhbox/minigames` | RMHbox minigames — the full list | sign-in | `app/routes/rmhbox/minigames/index.tsx` |
| `/rmhbox/minigames/:minigameId/history` | — | sign-in | `app/routes/rmhbox/minigames/$minigameId/history.tsx` |
| `/rmhcalculator` | RMHCalculator — AI Graphing & Scientific Calculator | sign-in | `app/routes/rmhcalculator.tsx` |
| `/rmhcode` | — | public | `app/routes/rmhcode/index.tsx` |
| `/rmhcode/auth` | — | public | `app/routes/rmhcode/auth.tsx` |
| `/rmhmusic` | — | sign-in | `app/routes/rmhmusic/index.tsx` |
| `/rmhmusic/:roomId` | — | sign-in | `app/routes/rmhmusic/$roomId.tsx` |
| `/rmhmusic/player` | — | sign-in | `app/routes/rmhmusic/player.tsx` |
| `/rmhstudy` | — | sign-in | `app/routes/rmhstudy/index.tsx` |
| `/rmhstudy/:roomId` | — | sign-in | `app/routes/rmhstudy/$roomId.tsx` |
| `/rmhtube` | — | sign-in | `app/routes/rmhtube/index.tsx` |
| `/rmhtube/:roomId` | — | sign-in | `app/routes/rmhtube/$roomId.tsx` |
| `/rmhtype` | — | sign-in | `app/routes/rmhtype/index.tsx` |
| `/rmhtype/:roomId` | — | sign-in | `app/routes/rmhtype/$roomId.tsx` |
| `/rmhtype/multiplayer` | — | sign-in | `app/routes/rmhtype/multiplayer.tsx` |
| `/rmhtype/solo` | — | sign-in | `app/routes/rmhtype/solo.tsx` |
| `/rochester-offensive` | — | public | `app/routes/rochester-offensive.tsx` |
| `/secret` | — | public | `app/routes/secret/index.tsx` |
| `/secret/cursed-logic` | — | public | `app/routes/secret/cursed-logic/index.tsx` |
| `/secret/signal-forge` | — | public | `app/routes/secret/signal-forge.tsx` |
| `/secret/vega` | Project Vega | public | `app/routes/secret/vega.tsx` |
| `/security` | Security | public | `app/routes/security.tsx` |
| `/sitemap.xml` | — | public | `app/routes/sitemap[.]xml.ts` |
| `/sitemaps/:name` | — | public | `app/routes/sitemaps.$name.ts` |
| `/slice-it` | — | public | `app/routes/slice-it/index.tsx` |
| `/strategies` | — | public | `app/routes/strategies/index.tsx` |
| `/strategies/incidents` | — | public | `app/routes/strategies/incidents.tsx` |
| `/strategies/profile` | — | public | `app/routes/strategies/profile/index.tsx` |
| `/strategies/profile/reputation` | — | public | `app/routes/strategies/profile/reputation.tsx` |
| `/strategies/profile/settings` | — | public | `app/routes/strategies/profile/settings.tsx` |
| `/strategies/puzzles` | — | public | `app/routes/strategies/puzzles/index.tsx` |
| `/strategies/puzzles/:mode` | — | public | `app/routes/strategies/puzzles/$mode.tsx` |
| `/strategies/puzzles/archive` | — | public | `app/routes/strategies/puzzles/archive.tsx` |
| `/strategies/puzzles/leaderboard` | — | public | `app/routes/strategies/puzzles/leaderboard.tsx` |
| `/strategies/safehouse` | — | public | `app/routes/strategies/safehouse/index.tsx` |
| `/strategies/safehouse/drops` | — | public | `app/routes/strategies/safehouse/drops.tsx` |
| `/strategies/safehouse/recruit` | — | public | `app/routes/strategies/safehouse/recruit.tsx` |
| `/strategies/sahur` | — | public | `app/routes/strategies/sahur.tsx` |
| `/studio` | — | sign-in | `app/routes/studio/index.tsx` |
| `/synapse-storm` | — | public | `app/routes/synapse-storm.tsx` |
| `/tag/:tag/rss.xml` | — | public | `app/routes/tag.$tag.rss[.]xml.ts` |
| `/temple-of-joy` | — | public | `app/routes/temple-of-joy/index.tsx` |
| `/terms` | Terms of Use | public | `app/routes/terms.tsx` |
| `/u/:handle/rss.xml` | — | public | `app/routes/u.$handle.rss[.]xml.ts` |
| `/v/:slug` | — | public | `app/routes/v.$slug.tsx` |
| `/v/new` | redirects to `/v` | public | `app/routes/v.new.tsx` |
| `/velum2099` | — | public | `app/routes/velum2099.tsx` |
| `/versecraft` | — | public | `app/routes/versecraft/index.tsx` |
| `/void-breaker` | — | public | `app/routes/void-breaker.tsx` |
