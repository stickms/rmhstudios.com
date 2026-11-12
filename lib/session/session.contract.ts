/**
 * Contract for Better Auth's own session endpoint. Client-safe.
 *
 * The route is served by Better Auth's router (`app/routes/api/auth/$.ts`), not by
 * `implement()`, so the response is declared structurally: the session row and the
 * user the `customSession` plugin returns (`lib/auth.ts`), or `null` when the cookie
 * names nobody. This is the raw JSON: dates (`createdAt`, `expiresAt`) are ISO
 * strings here, where the auth client's own parser revives them to `Date`.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface SessionPayload {
  user: { id: string } & Record<string, unknown>;
  session: { token?: string } & Record<string, unknown>;
}

export const getSessionApi = endpoint<{ res: SessionPayload | null }>()({
  method: 'GET',
  path: '/api/auth/get-session',
});
