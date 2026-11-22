/**
 * The host side of `store.*` for a vibe frame: each op becomes one call to the
 * per-page KV endpoint (`vibe-kv.contract.ts`), and an HTTP failure becomes one of the
 * allowlisted bridge codes. `room.*` is refused here; the Activity host overrides it.
 */

import { api } from '@/lib/contract/client';
import { HttpError, errorField } from '@/lib/http';
import { BridgeError, type BridgeArgs, type BridgeErrorCode, type BridgeOp } from '@/lib/rmhvibe/bridge';
import { vibeKvReadApi, vibeKvWriteApi } from '@/lib/rmhvibe/vibe-kv.contract';
import type { VibeBridgeHost } from '@/components/rmhvibe/useVibeBridge';

function toBridgeError(err: unknown): BridgeError {
  if (err instanceof BridgeError) return err;
  if (!(err instanceof HttpError)) return new BridgeError('failed');
  const reason = (
    errorField<{
      reason?: unknown;
    }>(err, 'detail') ?? {}
  ).reason;
  const byStatus: Record<number, BridgeErrorCode> = {
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not-found',
    409: 'conflict',
    413: 'too-large',
    429: 'rate',
  };
  if (err.status === 400) return new BridgeError(reason === 'too-large' ? 'too-large' : 'invalid');
  return new BridgeError(byStatus[err.status] ?? 'failed');
}

/**
 * `authToken`: the Discord Activity's access token, for hosts with no site session. It is
 * read on every call (a token can be refreshed) and sent as a bearer; the server verifies it.
 */
export function createVibeHostHandlers(
  slug: string,
  authToken?: () => string | null,
  /**
   * True while the frame shows a half-written build (a customize or remix preview): reads
   * answer, writes are refused with `read-only` so the draft cannot touch the real store.
   */
  readOnly?: () => boolean,
): Pick<VibeBridgeHost, 'handle'> {
  const params = {
    slug,
  };
  const auth = () => {
    const token = authToken?.();
    return token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {};
  };
  async function run(op: BridgeOp, args: unknown): Promise<unknown> {
    if ((op === 'store.set' || op === 'store.incr') && readOnly?.()) throw new BridgeError('read-only');
    switch (op) {
      case 'store.get': {
        const a = args as BridgeArgs['store.get'];
        const res = await api(vibeKvReadApi, {
          params,
          ...auth(),
          query: {
            key: a.key,
            scope: a.scope,
          },
        });
        return 'value' in res ? res.value : null;
      }
      case 'store.set': {
        const a = args as BridgeArgs['store.set'];
        await api(vibeKvWriteApi, {
          params,
          ...auth(),
          body: {
            op: 'set',
            key: a.key,
            scope: a.scope,
            value: a.value,
          },
        });
        return undefined;
      }
      case 'store.incr': {
        const a = args as BridgeArgs['store.incr'];
        const res = await api(vibeKvWriteApi, {
          params,
          ...auth(),
          body: {
            op: 'incr',
            key: a.key,
            scope: a.scope,
            by: a.by,
            ...(a.oncePerUser === undefined
              ? {}
              : {
                  oncePerUser: a.oncePerUser,
                }),
          },
        });
        if (!('value' in res)) throw new BridgeError('failed');
        return {
          value: res.value,
          counted: res.counted,
        };
      }
      case 'store.list': {
        const a = args as BridgeArgs['store.list'];
        const res = await api(vibeKvReadApi, {
          params,
          ...auth(),
          query: {
            prefix: a.prefix,
            scope: a.scope,
            order: a.order,
            limit: a.limit,
          },
        });
        return 'items' in res ? res.items : [];
      }
      default:
        throw new BridgeError('unavailable');
    }
  }
  return {
    handle: (op, args) => run(op, args).catch((err: unknown) => Promise.reject(toBridgeError(err))),
  };
}
