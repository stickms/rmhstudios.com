# iOS Safari screenshots

Safari's status-bar strip and floating tab-bar strip are drawn by iOS from the page. Chromium (Playwright, the only
browser in most agent sandboxes) has no such bars, so an emulated iPhone cannot show them. This is how to see the real
thing, from the cloud, with no device.

**Use it for:** anything that touches what iOS tints its bars from. That is the root, `body` and page ground colour or
background-image, `theme-color`, a `position: fixed` layer at a screen edge, the globe and its veil, a theme's gradient
wash. The static contract is `lib/__tests__/ios-edge-contract.test.ts` (CLAUDE.md "iOS Safari bars"); the contract says
what must hold, the screenshots show whether it looks right. **Do not call an iOS-bars change done on the contract test
alone**: it passed while the strips were white.

## Run it

GitHub Actions, workflow **iOS Safari screenshots** (`.github/workflows/ios-safari-screenshots.yml`), manual
(`workflow_dispatch`). An agent with the GitHub MCP can start it with `actions_run_trigger` (workflow file
`ios-safari-screenshots.yml`, `ref` set to its own branch: GitHub runs the file from the ref you pick, once the workflow
exists on `main`), then find the run with `actions_list` (`list_workflow_runs`), wait for it to complete, list its
artifacts, and read the PNGs with `actions_get` `download_workflow_run_artifact` (the returned URL is short-lived;
`curl` it into a scratch directory and unzip there).

Inputs:

- `routes` (default `/,/terms`)
- `open_globe` (default on): tap the docked globe and shoot it open, needs `idb`, best effort
- `theme` (default `paper`; `none` skips): also shoot with that official bought theme applied, so its gradient wash is
  on the page. Any key of `OFFICIAL_SITE_THEMES` in `lib/themes/official.ts`
- `runner`, `device`

A run takes roughly 20 to 40 minutes (a full build on a macOS runner, billed at the macOS rate), so batch the questions
you have into one run.

It builds the site, runs it on the runner against a throwaway Postgres, boots an iPhone simulator, opens Safari at each
route and uploads the PNGs as the artifact `ios-safari-screenshots`:

- `<route>-light.png`, `<route>-dark.png`: the site's own Day and Night
- `<route>-<mode>-bottom.png`: scrolled to the bottom of the page (needs `idb`): the strip behind the tab bar is outside
  the document, so this is where a wash that ends at the document's last pixel shows as a seam
- `<route>-<mode>-globe-open.png`: the same with the globe tapped open
- `theme-<id>-<route>-light.png` (and `-globe-open`): the bought theme

To run it by hand on a Mac: build, start the server on 7005, then
`scripts/ios-sim/capture.sh http://localhost:7005 ./shots` (`ROUTES`, `APPEARANCES`, `DEVICE`, `OPEN_GLOBE`, `SETTLE`,
`NAME_PREFIX` are documented in the script). For the themed run also start
`node scripts/ios-sim/theme-proxy.mjs 7005 7006 <theme.json>` (the JSON comes from
`pnpm exec tsx scripts/ios-sim/theme-json.ts <id>`) and shoot `http://localhost:7006`: a simulator cannot set another
origin's localStorage, so the proxy writes `rmh-user-theme` into every HTML page before the pre-paint script runs.

## Probes: what colours the strips?

The strips are Safari's, so the way to learn what drives them is to paint candidates a loud colour and look. Run the
workflow with `probes` set (and `only_probes` on to skip the rest): each name in `scripts/ios-sim/probes/` is a
stylesheet injected into the page through the proxy, shot at the top and at the bottom of `/terms` as
`probe-<name>-terms-light.png` and `-bottom.png`. `html-red`, `body-blue` and `root-red-body-clear` show whether Safari
reads the root's or body's background colour; `fixed-edge-gradient` shows whether a thin fixed layer at an edge makes
Safari extend its pixels (so a gradient could continue into the strip) or reduce it to one flat colour. Add a probe by
adding a stylesheet.

## Reading the pictures

- Look at the **top 140px and the bottom 200px** (the picture is 3x): the status-bar strip, and the strip behind the tab
  bar.
- A flat band whose colour differs from the page next to it is the failure this exists to catch. Pure white means Safari
  found no colour to take: `body`'s `background-color` must stay opaque (it was made transparent once and both strips
  went white).
- With a gradient theme, compare the strip with the page just under it. Safari paints the strips itself from one flat
  colour, so the gradient may stop at the strip edge; the goal is a seam that is not noticeable.
- Day is the simulator's light appearance and Night its dark one. With nothing stored the pre-paint script follows the
  device, so these are the default Day and Night.
- Check the home page is the real page. A shot of "Something went wrong" proves nothing about the strips: the workflow's
  "Probe the routes" step and the server log say why a route errored.

## Limits

- It is a simulator: the same Safari engine and bar logic as a phone, not a guarantee of a pixel match on hardware.
  Report what a real phone shows over what the simulator shows, if they ever disagree.
- Each run is a screenshot at the top of the page. The simulator has no scripted scroll; only the taps (through `idb`:
  Safari's first-run popup and the globe) interact. The log says `idb: NOT FOUND` when they are skipped.
- The themed run loads the theme from localStorage as a signed-out visitor; a page that re-derives or clears it after
  hydration can change the picture after the first paint.
- Nothing here gates a PR. It is on demand.
