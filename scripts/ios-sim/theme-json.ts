// Prints the `rmh-user-theme` cache blob (AppliedUserTheme) for an official bought theme, so the iOS simulator run can
// look at a theme with a gradient wash. Usage: pnpm exec tsx scripts/ios-sim/theme-json.ts paper
import { OFFICIAL_SITE_THEMES } from '../../lib/themes/official';
import {
  THEME_DERIVATION_VERSION,
  deriveAppliedTheme,
} from '../../lib/themes/tokens';

const id =
  process
    .argv[2] ??
  'paper';
const theme =
  OFFICIAL_SITE_THEMES[
    id
  ];
if (
  !theme
) {
  console.error(
    `unknown official theme "${id}"; one of: ${Object.keys(OFFICIAL_SITE_THEMES).join(', ')}`,
  );
  process.exit(
    1,
  );
}
process.stdout.write(
  JSON.stringify(
    {
      ...deriveAppliedTheme(
        id,
        theme.tokens,
      ),
      dv: THEME_DERIVATION_VERSION,
    },
  ),
);
