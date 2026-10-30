/**
 * How the Balatro e2e suite launches Chromium (PLAN §6.1).
 *
 * love.wasm draws through WebGL 1; headless Chromium on a CI runner has no GPU,
 * so WebGL goes through ANGLE on SwiftShader (software). `--enable-unsafe-swiftshader`
 * is required since Chromium stopped falling back to SwiftShader on its own.
 * The executable follows scripts/epic/browser.ts: Playwright's own build unless
 * `CHROME_PATH` names another (container images whose Chromium build number does
 * not match the pinned Playwright).
 */
import type { LaunchOptions } from 'playwright';

export const SWIFTSHADER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
] as const;

export function chromiumLaunchOptions(extraArgs: string[] = []): LaunchOptions {
  return {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...SWIFTSHADER_ARGS,
      '--autoplay-policy=no-user-gesture-required',
      // Several software-rendered pages share one machine: keep background pages running.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      // Bot-peer pages (lib/bot.ts) are served through Playwright routing, which Chromium's
      // Local Network Access checks treat as a public origin: their hub requests to
      // localhost would be refused. The real pages are unaffected either way.
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights',
      ...extraArgs,
    ],
  };
}
