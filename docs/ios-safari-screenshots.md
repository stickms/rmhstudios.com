# iOS Safari screenshots

Safari's status-bar strip and floating tab-bar strip are drawn by iOS from the page. Chromium (Playwright, the only
browser in most agent sandboxes) has no such bars, so an emulated iPhone cannot show them. This is how to see the real
thing, from the cloud, with no device.

**Use it for:** anything that touches what iOS tints its bars from. That is the root, `body` and page ground colour or
background-image, `theme-color`, a `position: fixed` or sticky layer at a screen edge, the globe and its veil, a theme's
gradient wash. The static contract is `lib/__tests__/ios-edge-contract.test.ts` (CLAUDE.md "iOS Safari bars"); the
contract says what must hold, the screenshots show whether it looks right.

## Run it

GitHub Actions, workflow **iOS Safari screenshots** (`.github/workflows/ios-safari-screenshots.yml`), manual. From an
agent session with no `gh` CLI, ask the user to run it, or trigger it with the GitHub MCP `actions_run_trigger` tool for
the workflow file on your branch. Inputs: `routes` (default `/,/terms`), `open_globe`, `runner`, `device`. It takes
roughly 20 to 40 minutes (a full build on a macOS runner, billed at the macOS rate), so batch the questions you have
into one run.

It builds the site, runs it on the runner against a throwaway Postgres, boots an iPhone simulator, opens Safari at each
route in Day and Night, and uploads PNGs as the artifact `ios-safari-screenshots` (`<route>-light.png`,
`<route>-dark.png`, and `<route>-<mode>-globe-open.png` when `open_globe` worked). Download the artifact (`actions_get`
with the run id, or the Actions UI) and look at the pictures.

To run it by hand on a Mac: build, start the server on 7005, then
`scripts/ios-sim/capture.sh http://localhost:7005 ./shots` (`ROUTES`, `APPEARANCES`, `DEVICE`, `OPEN_GLOBE`, `SETTLE`
are documented in the script).

## Reading the pictures

- Look at the **top 140px and the bottom 200px**: the status-bar strip, and the strip behind the tab bar.
- A flat band whose colour differs from the page next to it is the failure this exists to catch. Pure white means Safari
  found no colour to take: `body`'s `background-color` must stay opaque (it was made transparent once and both strips
  went white).
- Day is the simulator's light appearance and Night its dark one. With nothing stored the pre-paint script follows the
  device, so these are the default Day and Night. A bought theme needs its stored `rmh-user-theme`, which this does not
  set.

## Limits

- It is a simulator: the same Safari engine and bar logic as a phone, not a guarantee of a pixel match on hardware.
  Report what a real phone shows over what the simulator shows, if they ever disagree.
- Each run is a screenshot at the top of the page. The simulator has no scripted scroll; only the globe tap (through
  `idb`, best effort, may be skipped with a warning) interacts. A page's bottom strip is still visible at scroll top,
  because the tab bar is always there.
- Nothing here gates a PR. It is on demand.
- The workflow was written without being run from the agent sandbox that added it. If the first run fails, the failing
  step names the cause (Postgres install, build memory on the runner, simulator runtime, `idb`); fix that step rather
  than working around the check.
