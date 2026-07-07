'use client';

import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { ProviderStatus } from '@/lib/homes/types';
import { sourceLabel } from '@/lib/homes/format';

/**
 * Transparency strip showing which listing sources responded, how many results
 * each returned, and why any are unavailable. Turns the multi-provider layer
 * from a black box into something users (and operators) can reason about.
 */
export function ProviderStatusBar({ providers }: { providers: ProviderStatus[] }) {
  if (!providers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-site-text-muted">
      <span className="font-medium text-site-text-dim">Sources:</span>
      {providers.map((p) => {
        const Icon = p.ok ? (p.count > 0 ? CheckCircle2 : MinusCircle) : XCircle;
        const color = p.ok
          ? p.count > 0
            ? 'text-emerald-400'
            : 'text-site-text-muted'
          : 'text-amber-400';
        return (
          <span key={p.source} className="inline-flex items-center gap-1" title={p.note ?? ''}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <span className="text-site-text-dim">{sourceLabel(p.source)}</span>
            {p.ok && p.count > 0 && <span>({p.count})</span>}
            {!p.ok && p.note && <span className="text-site-text-muted">— {p.note}</span>}
          </span>
        );
      })}
    </div>
  );
}
