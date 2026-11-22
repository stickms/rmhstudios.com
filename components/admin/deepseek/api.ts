import { useCallback, useEffect, useState } from 'react';
import type { BurnSummary, HourlyPoint } from '@/lib/ai/deepseek-balance';
import { fetchJson, HttpError, type FetchJsonOptions } from '@/lib/http';

export interface LiveBalance {
  isAvailable: boolean;
  balances: {
    currency: string;
    totalBalance: number;
    grantedBalance: number;
    toppedUpBalance: number;
  }[];
  fetchedAt: string;
}

export interface Snapshot {
  createdAt: string;
  currency: string;
  isAvailable: boolean;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  source: string;
}

export interface BalanceState {
  live: LiveBalance | null;
  latest: Snapshot[];
  /** Error code from the API (`not_configured`, `http_401`, `timeout`, …). */
  error: string | null;
}

export interface HistorySeries {
  currency: string;
  points: HourlyPoint[];
  summary: BurnSummary;
}

type JsonRecord = Record<string, unknown>;

/**
 * `fetchJson` that hands back a failed call's JSON body instead of throwing it:
 * the balance endpoint still sends its persisted snapshots (`latest`) and an
 * `{ error }` code alongside a 503. Transport failures and timeouts still throw.
 */
async function getJson(
  url: string,
  init?: FetchJsonOptions,
): Promise<{
  ok: boolean;
  /** The HTTP status of a failed call; 200 for any success. */
  status: number;
  json: JsonRecord | null;
}> {
  try {
    const json = await fetchJson<JsonRecord | null>(url, {
      cache: 'no-store',
      ...init,
    });
    return {
      ok: true,
      status: 200,
      json,
    };
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    const body = err.body;
    return {
      ok: false,
      status: err.status,
      json: typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as JsonRecord) : null,
    };
  }
}

function errorCode(json: Record<string, unknown> | null, status: number): string {
  return typeof json?.error === 'string' ? json.error : `http_${status}`;
}

/** Live balance + newest persisted snapshots, with a manual refresh action. */
export function useDeepseekBalance() {
  const [state, setState] = useState<BalanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await getJson('/api/admin/deepseek/balance');
      const latest = (r.json?.latest as Snapshot[] | undefined) ?? [];
      if (r.ok) {
        setState({
          live: r.json?.live as LiveBalance,
          latest,
          error: null,
        });
        setUpdatedAt(Date.now());
      } else {
        setState((prev) => ({
          live: r.status === 503 ? null : (prev?.live ?? null),
          latest,
          error: errorCode(r.json, r.status),
        }));
      }
    } catch {
      setState((prev) => ({
        live: prev?.live ?? null,
        latest: prev?.latest ?? [],
        error: 'network',
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Fetch + persist a manual snapshot. Resolves to an error code or null. */
  const refresh = useCallback(async (): Promise<string | null> => {
    setRefreshing(true);
    try {
      const r = await getJson('/api/admin/deepseek/refresh', {
        method: 'POST',
      });
      if (!r.ok) return errorCode(r.json, r.status);
      await reload();
      return null;
    } catch {
      return 'network';
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  return {
    state,
    loading,
    refreshing,
    updatedAt,
    reload,
    refresh,
  };
}

/** Hourly series for the window; refetches when `hours` or `nonce` changes. */
export function useDeepseekHistory(hours: number, nonce: number) {
  const [series, setSeries] = useState<HistorySeries[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson(`/api/admin/deepseek/history?hours=${hours}`)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setSeries((r.json?.series as HistorySeries[]) ?? []);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hours, nonce]);

  return {
    series,
    loading,
    failed,
  };
}
