/**
 * Contract for /api/rmhos/session. Client-safe: no zod, no server import.
 */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * `reason: 'not-eligible'` means networking is on for the site but this account does not qualify
 * (RMHOS_NET_ACCESS members/verified, or too new); absent, networking is simply off.
 */
export type RmhosNetOffReason =
  'not-eligible';

export type RmhosNet =
  | {
      enabled: true;
      url: string;
      ticket: string;
    }
  | {
      enabled: false;
      reason?: RmhosNetOffReason;
    };

/** What `?ticket=0` answers when networking is on: no URL and no ticket were minted. */
export type RmhosNetUnticketed =
  {
    enabled: true;
    url?: undefined;
    ticket?: undefined;
  };

export interface RmhosSession {
  linuxUser: string;
  net:
    | RmhosNet
    | RmhosNetUnticketed;
}

/**
 * The Linux username for the signed-in account and a short-lived relay ticket. `?ticket=0` skips
 * minting the ticket (the page-load question is only "is networking on for me?"); the machine
 * start asks without it.
 */
export const rmhosSessionApi =
  endpoint<{
    query: {
      ticket?:
        | '0'
        | undefined;
    };
    res: RmhosSession;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhos/session',
    },
  );
