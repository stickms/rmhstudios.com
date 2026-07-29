<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/games.ts, lib/apps.ts.
  Regenerate with `pnpm docs:site`.
-->

# Apps

The full applications that sit alongside the games — synced media, learning and productivity tools, and the creator surfaces.

Generated from `lib/apps.ts`, the single source of truth every card on the site reads from.

| | Route | Status | Auth | Tags |
| --- | ----- | ------ | ---- | ---- |
| **RMHTube** | [`/rmhtube`](https://rmhstudios.com/rmhtube) | — | required | `Watch Party` `Real-time` `Beta` |
| **RMH Type** | [`/rmhtype`](https://rmhstudios.com/rmhtype) | — | required | `Typing` `Multiplayer` `Competitive` `Beta` |
| **RMHMusic** | [`/rmhmusic`](https://rmhstudios.com/rmhmusic) | Beta | required | `Music` `Spotify` `Real-time` `Beta` |
| **RMH Study** | [`/rmhstudy`](https://rmhstudios.com/rmhstudy) | — | required | `Pomodoro` `Study` `Productivity` `Beta` |
| **RMH Studio** | [`/studio`](https://rmhstudios.com/studio) | — | required | `DAW` `Music Production` `Beta` |
| **rmhcode** | [`/rmhcode`](https://rmhstudios.com/rmhcode) | Beta | required | `AI` `CLI` `Developer Tools` `Beta` |
| **RMH Strategies** | [`/strategies`](https://rmhstudios.com/strategies) | Beta | required | `Puzzles` `Community` `Reputation` `Beta` |
| **RMH Ladder** | [`/rmhladder`](https://rmhstudios.com/rmhladder) | Beta | — | `Careers` `Jobs` `Early Career` `AI` `Beta` |
| **RMHCalculator** | [`/rmhcalculator`](https://rmhstudios.com/rmhcalculator) | Beta | required | `Calculator` `Graphing` `AI` `DeepSeek` `Beta` |
| **RMHHomes** | [`/homes`](https://rmhstudios.com/homes) | Beta | required | `Housing` `Search` `Maps` `Beta` |

## Unlisted

Reachable by URL but deliberately absent from the browse pages — hidden games and internal or staged experiences. They are documented here because "undocumented" and "unlisted" are not the same thing.

| | Route | Status |
| --- | ----- | ------ |
| **RMHdle** | `https://discord.gg/ZdfhdAKVSf` | Discord Game |
| **RMHConnections** | `https://discord.gg/ZdfhdAKVSf` | Discord Game |

## Detail

### RMHTube

RMHTube is a real-time watch party platform. Create a room, share the code, and watch YouTube, Twitch, or direct videos in perfect sync with friends. Queue up media, vote to skip, react live, and chat — all powered by WebSocket magic.

**Route:** `/rmhtube` · **Catalog id:** `rmhtube` · **Sign-in:** required

### RMH Type

RMH Type is a competitive typing platform. Practice solo to improve your WPM, or create a room to race friends on the same passage simultaneously. Track your progress on the global leaderboard and climb the ranks.

**Route:** `/rmhtype` · **Catalog id:** `rmhtype` · **Sign-in:** required

### RMHMusic

RMHMusic is a social music player powered by Spotify. Connect your Premium account, create a listening room, and enjoy synced playback with friends. Features a mesmerizing WebGL particle visualizer, shared queues, real-time chat, and Guess the Song — create and solve music puzzles for coins.

**Route:** `/rmhmusic` · **Catalog id:** `rmhmusic` · **Status:** Beta · **Sign-in:** required

### RMH Study

RMH Study brings the Pomodoro technique to a social setting. Create a study room, invite friends, and stay focused together with synced timers. Track your focus time, set session goals, climb the study leaderboard, and drill solo with flashcard decks and an AI tutor.

**Route:** `/rmhstudy` · **Catalog id:** `rmhstudy` · **Sign-in:** required

### RMH Studio

RMH Studio is a fully-featured digital audio workstation that runs entirely in your browser. Create multi-track arrangements with built-in synths, drum machines, effects, and samples. Record audio, edit MIDI, mix, and export — no downloads required.

**Route:** `/studio` · **Catalog id:** `studio` · **Sign-in:** required

### rmhcode

rmhcode is a CLI wrapper around Claude Code with RMH integrations. Sign in with your rmhstudios.com account, build projects with AI assistance, and publish your creations to the User Builds showcase.

**Route:** `/rmhcode` · **Catalog id:** `rmhcode` · **Status:** Beta · **Sign-in:** required

### RMH Strategies

RMH Strategies is the unified platform layer for the RMH ecosystem. Earn XP across all RMH products with a single reputation system, compete on daily puzzle leaderboards across five modes (Alibi, Spectrum, Outcast, Chainlink, Impostor), access tiered Safehouse intelligence, track public incidents as entertainment, and unlock Sahur Mode — a chaotic 3 AM experience with triple XP and a bat cursor.

**Route:** `/strategies` · **Catalog id:** `rmh-strategies` · **Status:** Beta · **Sign-in:** required

### RMH Ladder

RMH Ladder automatically checks official company job boards every four hours, filters for verified early-career opportunities, and helps you save roles, track applications, and compare your resume with the jobs that fit.

**Route:** `/rmhladder` · **Catalog id:** `rmhladder` · **Status:** Beta · **Sign-in:** not required

### RMHCalculator

RMHCalculator is a graphing and scientific calculator powered entirely by the DeepSeek API — it performs no arithmetic of its own. Every scientific evaluation and every plotted graph point is computed by the model, which also decides how to frame and plot each curve for good accuracy. Watch its reasoning stream live, and switch between DeepSeek Reasoner for maximum accuracy and DeepSeek Chat for faster answers.

**Route:** `/rmhcalculator` · **Catalog id:** `rmhcalculator` · **Status:** Beta · **Sign-in:** required

### RMHHomes

RMHHomes is a housing marketplace that blends member-posted rentals and houses with real apartment/home postings aggregated from public feeds across the web. Browse everything on an interactive map, filter by price, beds, baths, property type and source, save favorites, and set up alerts for new matches. Post your own listing and message the owner directly, or jump straight to the original posting for aggregated listings.

**Route:** `/homes` · **Catalog id:** `rmhhomes` · **Status:** Beta · **Sign-in:** required

### RMHdle

A daily 5-letter word game tailored for the RMH ecosystem. Join the community on Discord to share your streaks, compete with others, and guess secret terms from RMH history.

**Route:** `https://discord.gg/ZdfhdAKVSf` · **Catalog id:** `rmhdle` · **Status:** Discord Game · **Sign-in:** not required · **Unlisted**

### RMHConnections

Group sixteen community-themed items into four categories. A daily test of your RMH knowledge, featuring characters, memes, and historical events from across the community.

**Route:** `https://discord.gg/ZdfhdAKVSf` · **Catalog id:** `rmh-connections` · **Status:** Discord Game · **Sign-in:** not required · **Unlisted**
