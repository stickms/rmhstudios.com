/**
 * The site's sign-in, as the engine sees it: one function that resolves the current session token, or
 * `undefined` for a signed-out visitor.
 *
 * The engine is its own TypeScript project (tsconfig.engine.json, third-pass audit AR4) and may import
 * only itself and the core project. The site's auth client (`lib/auth-client`) is neither: its types are
 * inferred from the server's auth configuration, so importing it would put the whole server tier in the
 * engine's program. The site registers the source instead (components/tf2-game/register-session.ts), the
 * way a game registers its client profile (client/game-profile.ts).
 *
 * `sessionToken()` throws when nothing is registered. A page that can reach the hub client without the
 * registration is a bug, and lib/__tests__/tf2-engine-boundaries.test.ts fails on it.
 */

export type SessionTokenSource = () => Promise<string | undefined>;

let source: SessionTokenSource | null = null;

export function registerSessionTokenSource(next: SessionTokenSource): void {
  source = next;
}

export function sessionToken(): Promise<string | undefined> {
  if (!source) {
    throw new Error('tf2-game: no session token source registered (import components/tf2-game/register-session)');
  }
  return source();
}
