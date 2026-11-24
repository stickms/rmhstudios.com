<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: R

Routes whose URL starts with `r`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/reading` | redirects to `/library?view=reading` | public | `app/routes/_site/reading/index.tsx` |
| `/rideshare` | RMH Rideshare | public | `app/routes/_site/rideshare/index.tsx` |
| `/rideshare/drive` | Drive with RMH Rideshare | public | `app/routes/_site/rideshare/drive.tsx` |
| `/rideshare/ride` | Request a ride — RMH Rideshare | public | `app/routes/_site/rideshare/ride.tsx` |
| `/rings` | Webrings | public | `app/routes/_site/rings/index.tsx` |
| `/rings/:slug` | Webring | public | `app/routes/_site/rings/$slug.tsx` |
| `/rmh-datacenter` | — | public | `app/routes/_site/rmh-datacenter/index.tsx` |
| `/rmh-datacenter/contact` | — | public | `app/routes/_site/rmh-datacenter/contact.tsx` |
| `/rmh-datacenter/facilities` | — | public | `app/routes/_site/rmh-datacenter/facilities.tsx` |
| `/rmh-datacenter/network` | — | public | `app/routes/_site/rmh-datacenter/network.tsx` |
| `/rmh-datacenter/platform` | — | public | `app/routes/_site/rmh-datacenter/platform.tsx` |
| `/rmh-datacenter/power` | — | public | `app/routes/_site/rmh-datacenter/power.tsx` |
| `/rmh-medschool` | RMH Med Schools | public | `app/routes/_site/rmh-medschool/index.tsx` |
| `/rmh-medschool/:slug` | — | public | `app/routes/_site/rmh-medschool/$slug.tsx` |
| `/rmh-medschool/ask` | Ask the data | public | `app/routes/_site/rmh-medschool/ask.tsx` |
| `/rmh-medschool/lists` | My lists | public | `app/routes/_site/rmh-medschool/lists.tsx` |
| `/rmh-medschool/live` | Live reported events \| RMH Med Schools | public | `app/routes/_site/rmh-medschool/live.tsx` |
| `/rmh-medschool/practice` | Interview practice | public | `app/routes/_site/rmh-medschool/practice.tsx` |
| `/rmh-medschool/tracker` | My tracker | public | `app/routes/_site/rmh-medschool/tracker.tsx` |
| `/rmhbox-packs` | RMHBox Prompt Packs | public | `app/routes/_site/rmhbox-packs.tsx` |
| `/rmhladder` | RMH Ladder \| Verified Early-Career Jobs | public | `app/routes/_site/rmhladder/index.tsx` |
| `/rmhladder/alerts` | — | sign-in | `app/routes/_site/rmhladder/alerts.tsx` |
| `/rmhladder/companies` | — | admin | `app/routes/_site/rmhladder/companies.tsx` |
| `/rmhladder/health` | — | admin | `app/routes/_site/rmhladder/health.tsx` |
| `/rmhladder/insights` | — | sign-in | `app/routes/_site/rmhladder/insights.tsx` |
| `/rmhladder/jobs/:jobId` | Job unavailable \| RMH Ladder | sign-in | `app/routes/_site/rmhladder/jobs/$jobId.tsx` |
| `/rmhladder/offers` | — | sign-in | `app/routes/_site/rmhladder/offers.tsx` |
| `/rmhladder/pipeline` | — | sign-in | `app/routes/_site/rmhladder/pipeline.tsx` |
| `/rmhladder/referrals` | Referral Board \| RMH Ladder | sign-in | `app/routes/_site/rmhladder/referrals.tsx` |
| `/rmhladder/resume` | — | sign-in | `app/routes/_site/rmhladder/resume.tsx` |
| `/rmhladder/review` | — | admin | `app/routes/_site/rmhladder/review.tsx` |
| `/rmhladder/settings` | — | sign-in | `app/routes/_site/rmhladder/settings.tsx` |
| `/roadmap` | Roadmap & requests | public | `app/routes/_site/roadmap.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/ref/:code` | Join RMH Studios | public | `app/routes/ref.$code.tsx` |
| `/replays/:id` | — | public | `app/routes/replays.$id.tsx` |
| `/reset-password` | Reset password | public | `app/routes/reset-password.tsx` |
| `/rmh-capital` | — | public | `app/routes/rmh-capital/index.tsx` |
| `/rmh-capital/businesses` | — | public | `app/routes/rmh-capital/businesses.tsx` |
| `/rmh-capital/careers` | — | public | `app/routes/rmh-capital/careers.tsx` |
| `/rmh-capital/contact` | — | public | `app/routes/rmh-capital/contact.tsx` |
| `/rmh-capital/deals` | — | public | `app/routes/rmh-capital/deals.tsx` |
| `/rmh-capital/firm` | — | public | `app/routes/rmh-capital/firm.tsx` |
| `/rmh-capital/insights` | — | public | `app/routes/rmh-capital/insights.tsx` |
| `/rmh-internal-affairs` | — | public | `app/routes/rmh-internal-affairs.ts` |
| `/rmh-internal-affairs/:page` | — | public | `app/routes/rmh-internal-affairs.$page.ts` |
| `/rmh-pmc` | — | public | `app/routes/rmh-pmc/index.tsx` |
| `/rmh-pmc/capabilities` | — | public | `app/routes/rmh-pmc/capabilities.tsx` |
| `/rmh-pmc/command` | — | public | `app/routes/rmh-pmc/command.tsx` |
| `/rmh-pmc/contact` | — | public | `app/routes/rmh-pmc/contact.tsx` |
| `/rmh-pmc/intelligence` | — | public | `app/routes/rmh-pmc/intelligence.tsx` |
| `/rmh-pmc/operators` | — | public | `app/routes/rmh-pmc/operators.tsx` |
| `/rmh-research` | — | public | `app/routes/rmh-research/index.tsx` |
| `/rmh-research/archive` | — | public | `app/routes/rmh-research/archive.tsx` |
| `/rmh-research/authors` | — | public | `app/routes/rmh-research/authors/index.tsx` |
| `/rmh-research/authors/:authorId` | Authors — RMH Research | public | `app/routes/rmh-research/authors/$authorId.tsx` |
| `/rmh-research/fields` | — | public | `app/routes/rmh-research/fields/index.tsx` |
| `/rmh-research/fields/:fieldId` | Fields — RMH Research | public | `app/routes/rmh-research/fields/$fieldId.tsx` |
| `/rmh-research/paper/:paperId` | Archive — RMH Research | public | `app/routes/rmh-research/paper/$paperId.tsx` |
| `/rmh-research/psychology` | Psychology — RMH Research | public | `app/routes/rmh-research/psychology.tsx` |
| `/rmh-research/r-index` | — | public | `app/routes/rmh-research/r-index.tsx` |
| `/rmh-research/reports/feature-leak` | — | public | `app/routes/rmh-research_.reports.feature-leak.tsx` |
| `/rmh-research/reports/optimization` | Speed & Optimization — RMH Research | public | `app/routes/rmh-research_.reports.optimization.tsx` |
| `/rmhbox` | — | sign-in | `app/routes/rmhbox/index.tsx` |
| `/rmhbox/:lobbyId` | — | sign-in | `app/routes/rmhbox/$lobbyId.tsx` |
| `/rmhbox/minigames` | RMHbox minigames | sign-in | `app/routes/rmhbox/minigames/index.tsx` |
| `/rmhbox/minigames/:minigameId/history` | — | sign-in | `app/routes/rmhbox/minigames/$minigameId/history.tsx` |
| `/rmhbox/players/:userId` | — | sign-in | `app/routes/rmhbox/players.$userId.tsx` |
| `/rmhcalculator` | RMHCalculator | sign-in | `app/routes/rmhcalculator.tsx` |
| `/rmhcharacters` | — | public | `app/routes/rmhcharacters.tsx` |
| `/rmhcode` | — | public | `app/routes/rmhcode/index.tsx` |
| `/rmhcode/auth` | — | public | `app/routes/rmhcode/auth.tsx` |
| `/rmhmusic` | — | sign-in | `app/routes/rmhmusic/index.tsx` |
| `/rmhmusic/credits` | — | sign-in | `app/routes/rmhmusic/credits.tsx` |
| `/rmhmusic/daily` | — | sign-in | `app/routes/rmhmusic/daily.tsx` |
| `/rmhmusic/friends` | — | sign-in | `app/routes/rmhmusic/friends.tsx` |
| `/rmhmusic/history` | — | sign-in | `app/routes/rmhmusic/history.tsx` |
| `/rmhmusic/insights` | — | sign-in | `app/routes/rmhmusic/insights.tsx` |
| `/rmhmusic/lesson/:lessonId` | — | sign-in | `app/routes/rmhmusic/lesson.$lessonId.tsx` |
| `/rmhmusic/practice` | — | sign-in | `app/routes/rmhmusic/practice.tsx` |
| `/rmhmusic/r/:token` | A shared result \| RMH Music | public | `app/routes/rmhmusic_.r.$token.tsx` |
| `/rmhmusic/songs` | — | sign-in | `app/routes/rmhmusic/songs.index.tsx` |
| `/rmhmusic/songs/:songId` | — | sign-in | `app/routes/rmhmusic/songs.$songId.tsx` |
| `/rmhmusic/sprint` | — | sign-in | `app/routes/rmhmusic/sprint.tsx` |
| `/rmhmusic/today` | — | sign-in | `app/routes/rmhmusic/today.tsx` |
| `/rmhmusic/tuner` | — | sign-in | `app/routes/rmhmusic/tuner.tsx` |
| `/rmhstudy` | — | sign-in | `app/routes/rmhstudy/index.tsx` |
| `/rmhstudy/:roomId` | — | sign-in | `app/routes/rmhstudy/$roomId.tsx` |
| `/rmhstudy/history` | — | sign-in | `app/routes/rmhstudy/history.tsx` |
| `/rmhstudy/planner` | — | sign-in | `app/routes/rmhstudy/planner.tsx` |
| `/rmhtube` | — | sign-in | `app/routes/rmhtube/index.tsx` |
| `/rmhtube/:roomId` | — | sign-in | `app/routes/rmhtube/$roomId.tsx` |
| `/rmhtube/party/:roomId` | RMHTube watch party | sign-in | `app/routes/rmhtube/party.$roomId.tsx` |
| `/rmhtype` | — | sign-in | `app/routes/rmhtype/index.tsx` |
| `/rmhtype/:roomId` | — | sign-in | `app/routes/rmhtype/$roomId.tsx` |
| `/rmhtype/daily` | — | sign-in | `app/routes/rmhtype/daily.tsx` |
| `/rmhtype/lessons` | — | sign-in | `app/routes/rmhtype/lessons.index.tsx` |
| `/rmhtype/lessons/:lessonId` | — | sign-in | `app/routes/rmhtype/lessons.$lessonId.tsx` |
| `/rmhtype/multiplayer` | — | sign-in | `app/routes/rmhtype/multiplayer.tsx` |
| `/rmhtype/progress` | — | sign-in | `app/routes/rmhtype/progress.tsx` |
| `/rmhtype/solo` | — | sign-in | `app/routes/rmhtype/solo.tsx` |
| `/rmhtype/texts` | — | sign-in | `app/routes/rmhtype/texts.tsx` |
