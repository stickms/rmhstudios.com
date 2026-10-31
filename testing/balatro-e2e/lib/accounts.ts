/**
 * Signed-in test accounts for match e2e (the TF2 smoke approach): each player is a
 * fresh browser context that signs up through Better Auth's email endpoint, so its
 * cookie jar holds a real session — the hub and /api/balatro/pack see a real user.
 *
 * Sign-up is rate limited per client IP (lib/auth.ts: 10/min on /sign-up/email).
 * Against a local dev server each account is given its own loopback address in
 * `x-forwarded-for` so a 16-player lobby does not trip it; a 429 is retried anyway.
 */
import type { Browser, BrowserContext } from 'playwright';

export interface TestAccount {
  label: string;
  email: string;
  name: string;
  password: string;
}

const PASSWORD = 'balatro-e2e-password-1';

/** Deterministic per run + label; names fit the hub's sanitiser (letters, digits, spaces). */
export function makeAccount(label: string, runId: string): TestAccount {
  const safe =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'p';
  return {
    label,
    email: `balatro-e2e-${runId}-${safe}@example.test`,
    name: `E2E ${safe.toUpperCase()}`.slice(0, 32),
    password: PASSWORD,
  };
}

/** A distinct loopback address per account index (127.10.x.y). */
export function forwardedFor(index: number): string {
  return `127.10.${Math.floor(index / 250) % 250}.${(index % 250) + 1}`;
}

export interface Player {
  account: TestAccount;
  context: BrowserContext;
}

export async function signUp(
  context: BrowserContext,
  baseUrl: string,
  account: TestAccount,
  index: number,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await context.request.post(`${baseUrl}/api/auth/sign-up/email`, {
      data: { email: account.email, password: account.password, name: account.name },
      headers: { origin: baseUrl, 'x-forwarded-for': forwardedFor(index) },
    });
    if (res.ok()) return;
    if (res.status() !== 429)
      throw new Error(`sign-up ${account.label}: HTTP ${res.status()} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error(`sign-up ${account.label}: still rate limited`);
}

/** N fresh contexts, each signed in as its own new account. */
export async function signedInPlayers(
  browser: Browser,
  baseUrl: string,
  labels: string[],
  runId = Date.now().toString(36),
  opts: { viewport?: { width: number; height: number }; offset?: number } = {},
): Promise<Player[]> {
  const players: Player[] = [];
  for (const [i, label] of labels.entries()) {
    // Software WebGL costs per pixel: matches on one machine use a small canvas.
    const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 720 } });
    const account = makeAccount(label, runId);
    await signUp(context, baseUrl, account, i + (opts.offset ?? 0));
    players.push({ account, context });
  }
  return players;
}
