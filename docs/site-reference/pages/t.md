<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: T

Routes whose URL starts with `t`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/tag/:tag` | — | public | `app/routes/_site/tag.$tag.tsx` |
| `/terms` | Terms of Use | public | `app/routes/_site/terms.tsx` |
| `/thread/:rootId` | — | public | `app/routes/_site/thread/$rootId.tsx` |
| `/tools` | Toolbox | public | `app/routes/_site/tools/index.tsx` |
| `/tools/base` | Number Base Converter | public | `app/routes/_site/tools/base.tsx` |
| `/tools/case` | Case Converter | public | `app/routes/_site/tools/case.tsx` |
| `/tools/contrast` | Colour Contrast Checker (WCAG 2.2) | public | `app/routes/_site/tools/contrast.tsx` |
| `/tools/cron` | Cron Expression Helper | public | `app/routes/_site/tools/cron.tsx` |
| `/tools/csv` | CSV to JSON Converter | public | `app/routes/_site/tools/csv.tsx` |
| `/tools/date-calc` | Date Calculator: Days Between Dates | public | `app/routes/_site/tools/date-calc.tsx` |
| `/tools/dice` | Dice Roller | public | `app/routes/_site/tools/dice.tsx` |
| `/tools/diff` | Text Diff Checker | public | `app/routes/_site/tools/diff.tsx` |
| `/tools/encode` | Base64, URL and HTML Encoder and Decoder | public | `app/routes/_site/tools/encode.tsx` |
| `/tools/hash` | Hash Generator and Checksum Verifier | public | `app/routes/_site/tools/hash.tsx` |
| `/tools/ids` | UUID, ULID and Nano ID Generator | public | `app/routes/_site/tools/ids.tsx` |
| `/tools/json` | JSON Formatter and Validator | public | `app/routes/_site/tools/json.tsx` |
| `/tools/loan` | Loan and Mortgage Calculator | public | `app/routes/_site/tools/loan.tsx` |
| `/tools/password` | Password and Passphrase Generator | public | `app/routes/_site/tools/password.tsx` |
| `/tools/picker` | Random Name Picker and Team Generator | public | `app/routes/_site/tools/picker.tsx` |
| `/tools/regex` | Regex Tester (JavaScript) | public | `app/routes/_site/tools/regex.tsx` |
| `/tools/split-bill` | Tip Calculator and Bill Splitter | public | `app/routes/_site/tools/split-bill.tsx` |
| `/tools/text-stats` | Word and Character Counter | public | `app/routes/_site/tools/text-stats.tsx` |
| `/tools/timestamp` | Unix Timestamp Converter | public | `app/routes/_site/tools/timestamp.tsx` |
| `/tools/timezones` | Time Zone Converter | public | `app/routes/_site/tools/timezones.tsx` |
| `/tournaments/:id` | — | public | `app/routes/_site/tournaments.$id.tsx` |
| `/translate` | — | public | `app/routes/_site/translate.tsx` |
| `/trash` | Trash | public | `app/routes/_site/trash.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/tag/:tag/rss.xml` | — | public | `app/routes/tag.$tag.rss[.]xml.ts` |
| `/temple-of-joy` | — | public | `app/routes/temple-of-joy/index.tsx` |
| `/tf2` | — | public | `app/routes/tf2/index.tsx` |
| `/tf2/hud-editor` | TF2 HUD Editor | public | `app/routes/tf2/hud-editor/index.tsx` |
| `/tf2/hud-editor/editor` | — | public | `app/routes/tf2/hud-editor/editor.tsx` |
| `/tf2/hud-editor/h/:slug` | — | public | `app/routes/tf2/hud-editor/h.$slug.tsx` |
| `/tf2/hud-editor/mine` | — | public | `app/routes/tf2/hud-editor/mine.tsx` |
| `/tf2/hud-editor/s/:token` | — | public | `app/routes/tf2/hud-editor/s.$token.tsx` |
| `/tf2/loadout` | TF2 Loadout Builder | public | `app/routes/tf2/loadout/index.tsx` |
| `/tf2/loadout/l/:slug` | — | public | `app/routes/tf2/loadout/l.$slug.tsx` |
| `/tf2/loadout/mine` | — | public | `app/routes/tf2/loadout/mine.tsx` |
| `/tf2/play` | Play TF2 | public | `app/routes/tf2/play.tsx` |
| `/tf2/workshop` | TF2 Workshop | public | `app/routes/tf2/workshop.tsx` |
