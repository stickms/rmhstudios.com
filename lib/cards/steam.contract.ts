/**
 * Contracts for the Steam-style /api/games endpoints (redesign audit C1):
 * trades, badge crafting, gems, the Community Hub, the card market and the
 * profile look / showcase. Client-safe: types only. A typed refusal comes back
 * as `{ error: <code> }`; read it with `errorField(e, 'error')`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  craftBadgeBody,
  createHubThreadBody,
  customizeLookBody,
  listCardBody,
  proposeTradeBody,
  saveShowcaseBody,
  tradeActionBody,
  unpackGemsBody,
} from '@/lib/cards/steam-schema';

type Body<
  S extends
    z.ZodType,
> =
  z.infer<S>;
type Loose =
  Record<
    string,
    unknown
  >;

export const proposeTradeApi =
  endpoint<{
    body: Body<
      typeof proposeTradeBody
    >;
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/trades/propose',
    },
  );

export const acceptTradeApi =
  endpoint<{
    body: Body<
      typeof tradeActionBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/trades/accept',
    },
  );
export const declineTradeApi =
  endpoint<{
    body: Body<
      typeof tradeActionBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/trades/decline',
    },
  );
export const cancelTradeApi =
  endpoint<{
    body: Body<
      typeof tradeActionBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/trades/cancel',
    },
  );

export const craftBadgeApi =
  endpoint<{
    body: Body<
      typeof craftBadgeBody
    >;
    res: Loose;
  }>()(
    {
      method:
        'POST',
      path: '/api/games/cards/craft',
    },
  );

export const customizeLookApi =
  endpoint<{
    body: Body<
      typeof customizeLookBody
    >;
    res: Loose;
  }>()(
    {
      method:
        'POST',
      path: '/api/games/customize',
    },
  );

export const unpackGemsApi =
  endpoint<{
    body: Body<
      typeof unpackGemsBody
    >;
    res: Loose;
  }>()(
    {
      method:
        'POST',
      path: '/api/games/gems/unpack',
    },
  );

export const createHubThreadApi =
  endpoint<{
    body: Body<
      typeof createHubThreadBody
    >;
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/hub/thread',
    },
  );

export const listCardApi =
  endpoint<{
    body: Body<
      typeof listCardBody
    >;
    res: {
      id: string;
      priceCoins: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/games/market/list',
    },
  );

export const saveShowcaseApi =
  endpoint<{
    body: Body<
      typeof saveShowcaseBody
    >;
    res: Loose;
  }>()(
    {
      method:
        'POST',
      path: '/api/games/showcase',
    },
  );
