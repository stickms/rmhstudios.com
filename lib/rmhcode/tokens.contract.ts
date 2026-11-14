/**
 * Contracts for the signed-in RMHCode CLI-token endpoints under
 * /api/rmhcode/auth/** (redesign audit C1, batch 8). `validate` is called by the
 * CLI itself and is not bound. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface RmhCodeTokenRow {
  id: string;
  name:
    | string
    | null;
  lastUsedAt:
    | string
    | null;
  createdAt: string;
  expiresAt: string;
}

/** The caller's active (unrevoked) tokens, newest first. */
export const listRmhCodeTokensApi =
  endpoint<{
    res: {
      tokens: RmhCodeTokenRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhcode/auth/list',
    },
  );

/** Mint a 30-day token. The plaintext `token` is returned once. */
export const generateRmhCodeTokenApi =
  endpoint<{
    body: {
      name?:
        | string
        | undefined;
    };
    res: {
      id: string;
      token: string;
      name:
        | string
        | null;
      expiresAt: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhcode/auth/generate',
    },
  );

/** 404 for an unknown token, 403 for someone else's. */
export const revokeRmhCodeTokenApi =
  endpoint<{
    body: {
      tokenId: string;
    };
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhcode/auth/revoke',
    },
  );

/** The "Authorize" button of the CLI login flow: mints a token for the CLI session. */
export const initiateRmhCodeAuthApi =
  endpoint<{
    body: {
      sessionId: string;
    };
    res: {
      token: string;
      user: {
        id: string;
        name: string;
        username:
          | string
          | undefined;
      };
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhcode/auth/initiate',
    },
  );
