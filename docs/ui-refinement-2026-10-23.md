# Shared UI refinement — October 23, 2026

The production homepage confirmed three shared causes: globe mode replaced
conventional desktop links and widened the left column, every material role
carried conspicuous optical edges, and the signed-out feed devoted a full
segmented control to one choice. Compose and consent also competed for the
mobile floating lane.

The implementation keeps TanStack Start, the existing route tree, content,
authentication and API integrations. It changes the shared shell and material
contracts rather than introducing another theme or effect service.

- Desktop navigation combines a compact optional globe and persistent links
  in one stable track; catalog and workspace pages retain their wider layouts.
- Role-specific tints, optical intensity and haze opacity distinguish reading
  content from floating UI. Raster grain is retired; Daylight and Midnight
  use 18px cards and 10px controls. High contrast retains opaque surfaces.
- The feed has a visible heading with a shared signal-button Compose action,
  a compact signed-out composer, restrained singleton controls, and consistent
  16px card spacing. The lazy composer uses the same signed-out component.
  Signed-out Compose leads to login with a return path to the feed, instead
  of trying to open a modal that requires a session.
- The older feed column now uses LiquidTabs for both timeline and content
  filters, including its keyboard behavior. Loading cards use the feed measure.
- OS reduced motion takes precedence through the shared compatibility hook,
  MotionConfig and jelly policy. Unread/live-dot and armed-reticle loops are
  retired; their obsolete animation exceptions are removed from the gate.

## Verification

Browser review used installed Edge/Chromium at 390, 768 and 1440px. Feed
screenshots cover Midnight, Daylight and high contrast; checks covered
horizontal overflow, navigation state, game search, search-dialog Escape,
cookie dismissal, the login screen and the reduced-motion policy. The existing
browser stability suite passed 102 checks. The production build and TypeScript
check passed, as did the 67-file executable consistency gate and material
contrast checks.

Local route inspection covered games, exploration, creation, library,
communities, store, predictions, developer, services and login. Games,
predictions, developer, services and login rendered successfully at all three
widths. The other routes, including the real homepage, encounter pre-existing
database/schema mismatches. The feed review therefore mounts the actual
Providers, SiteShell and RadialFeed with read-only public feed data and media
in a temporary browser preview; it does not establish local database or
authenticated end-to-end coverage. No database schema was changed.

The full test suite remains red in unchanged tests involving Windows paths,
CRLF parsing, Bash/subprocess behavior and `/tmp` assumptions. The run completed
with 539 passing files, 12 failing files and one skipped file (10,679 passing
tests, 140 failures, nine skipped). Repository-wide lint also contains existing
debt; changed-file lint introduces no warnings.

Representative screenshots are checked in for review:
[production before](images/ui-refinement-2026-10-23/before-desktop.png),
[desktop after](images/ui-refinement-2026-10-23/after-desktop.png), and
[Daylight mobile after](images/ui-refinement-2026-10-23/after-mobile.png).
The after screenshots use the temporary preview described above, so feed
items differ from the production before capture. Detailed check logs remain
in `.cache/ui-redesign/`, excluded from the shipped application. Authentication,
payments, realtime multiplayer, and every individual full-screen app/game
remain unverified end to end.
