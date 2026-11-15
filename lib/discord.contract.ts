/** Contract for the Discord Activity token exchange (redesign audit C1, batch 10). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Swap the SDK's authorization code for an access token. `linkedUserId` is the rmhstudios
 * account linked to that Discord user, or null. 400 `Missing code`, 502 `Token exchange failed`.
 */
export const discordTokenApi =
  endpoint<{
    body: {
      code: string;
    };
    res: {
      access_token: string;
      linkedUserId:
        | string
        | null;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/discord/token',
    },
  );
