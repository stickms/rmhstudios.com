'use client';

/**
 * Per-key usage history.
 *
 * The API has always told a client its remaining quota through `X-RateLimit-*`
 * headers, which answers "can I make this call?" and nothing else. It could not
 * answer "did my deploy last night triple my traffic?", "is my integration
 * throwing 4xx?", or "am I about to outgrow my tier?" — because the counters
 * behind those headers expire daily and were never stored. This reads the
 * durable rollup instead.
 *
 * Loaded on demand rather than with the key list: most visits to the developer
 * page are to copy a key, and 90 days of history per key is a query nobody
 * asked for.
 */

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface UsageDay {
  date: string;
  requests: number;
  units: number;
  clientErrors: number;
  serverErrors: number;
}

interface UsageResponse {
  days: number;
  usage: UsageDay[];
  totals: { requests: number; units: number; clientErrors: number; serverErrors: number };
}

const nf = new Intl.NumberFormat('en-US');

export function KeyUsage({ keyId }: { keyId: string }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/developer/keys/${keyId}/usage?days=30`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setData(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [keyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (failed || !data) {
    return <p className="py-3 text-xs text-site-text-dim">Could not load usage for this key.</p>;
  }

  if (data.totals.requests === 0) {
    return (
      <p className="py-3 text-xs text-site-text-dim">
        No requests in the last {data.days} days.
      </p>
    );
  }

  // Scale bars against the busiest day so a quiet key still shows shape.
  const peak = Math.max(...data.usage.map((d) => d.requests), 1);
  const errorRate =
    data.totals.requests > 0
      ? (data.totals.clientErrors + data.totals.serverErrors) / data.totals.requests
      : 0;

  return (
    <div className="mt-3 rounded-site border border-site-border bg-site-bg/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-site-accent" aria-hidden />
        <span className="text-xs font-semibold text-site-text">
          Last {data.days} days
        </span>
        {errorRate > 0.05 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-site-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {Math.round(errorRate * 100)}% errors
          </span>
        )}
      </div>

      {/* Daily request volume. Decorative — the figures below carry the same
          information as text, so a screen reader gets numbers, not a wall of
          meaningless bars. */}
      <div className="flex h-12 items-end gap-px" aria-hidden>
        {data.usage.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-[2px] bg-site-accent/70"
            style={{ height: `${Math.max(2, (d.requests / peak) * 100)}%` }}
            title={`${d.date}: ${nf.format(d.requests)} requests`}
          />
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-site-text-dim">Requests</dt>
          <dd className="font-semibold tabular-nums text-site-text">
            {nf.format(data.totals.requests)}
          </dd>
        </div>
        <div>
          <dt className="text-site-text-dim">Units</dt>
          <dd className="font-semibold tabular-nums text-site-text">
            {nf.format(data.totals.units)}
          </dd>
        </div>
        <div>
          <dt className="text-site-text-dim">4xx</dt>
          <dd className="font-semibold tabular-nums text-site-text">
            {nf.format(data.totals.clientErrors)}
          </dd>
        </div>
        <div>
          <dt className="text-site-text-dim">5xx</dt>
          <dd className="font-semibold tabular-nums text-site-text">
            {nf.format(data.totals.serverErrors)}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-[11px] leading-relaxed text-site-text-dim">
        Units are cost-weighted: heavier endpoints draw down your daily quota faster than a
        simple read. Counts settle within a few seconds of a request.
      </p>
    </div>
  );
}
