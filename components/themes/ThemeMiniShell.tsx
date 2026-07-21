'use client';

/**
 * ThemeMiniShell (§14.3) — a reusable, non-interactive miniature of the site
 * shell rendered UNDER a theme's scoped `--site-*` vars over that theme's own
 * aurora. Because the scoped custom properties cascade to the children, the
 * real `.glass-*` classes render this theme's actual material (tint, rim,
 * single-sheet glint), so the preview reads for real — not a swatch.
 *
 * Two variants:
 *  - `size="sm"` (marketplace cards): L1 `.glass-fill` material ONLY — NO
 *    backdrop-filter tiers, so a grid of many cards stays inside the §9 budget.
 *  - `size="lg"` (the editor's single live preview): full material (`.glass-pane`)
 *    on the feature surfaces so blur + micro-noise read.
 *
 * Decorative: `aria-hidden`, pointer-events off. It never mutates document-level
 * state — the vars live on this container only.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { themeCssVars, type ThemeTokens } from '@/lib/themes/tokens';

export function ThemeMiniShell({
  tokens,
  size = 'sm',
  className,
}: {
  tokens: ThemeTokens;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const vars = useMemo(() => themeCssVars(tokens), [tokens]);
  const heavy = size === 'lg';
  // Feature surfaces get real material in the large variant; the small variant
  // stays L1 (no backdrop-filter) so a card grid is cheap.
  const feature = heavy ? 'glass-pane' : 'glass-fill';

  const t = size === 'lg' ? 'text-[11px]' : 'text-[8px]';
  const tSm = size === 'lg' ? 'text-[9px]' : 'text-[7px]';

  return (
    <div
      aria-hidden
      style={{ ...vars, background: 'var(--site-canvas)' } as React.CSSProperties}
      className={cn(
        'pointer-events-none relative isolate overflow-hidden rounded-site select-none',
        size === 'lg' ? 'min-h-[320px] p-4' : 'h-[132px] p-2',
        className,
      )}
    >
      <div className="flex h-full gap-2">
        {/* Sidebar rail sliver */}
        <div
          className={cn(
            'glass-fill flex shrink-0 flex-col items-center gap-1.5 rounded-site',
            size === 'lg' ? 'w-10 py-2' : 'w-5 py-1.5',
          )}
        >
          <span
            className={cn(
              'rounded-full bg-site-accent',
              size === 'lg' ? 'h-4 w-4' : 'h-2 w-2',
            )}
          />
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'rounded-full bg-site-text-muted/50',
                size === 'lg' ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5',
              )}
            />
          ))}
        </div>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Floating header capsule */}
          <div
            className={cn(
              feature,
              'flex items-center justify-between rounded-full',
              size === 'lg' ? 'px-3 py-2' : 'px-2 py-1',
            )}
          >
            <span className={cn('font-semibold text-site-text', t)}>Aa</span>
            <span
              className={cn(
                'rounded-full bg-site-accent px-2 font-medium text-site-accent-fg',
                tSm,
                size === 'lg' ? 'py-1' : 'py-0.5',
              )}
            >
              ●
            </span>
          </div>

          {/* One feed card */}
          <div className={cn(feature, 'rounded-site', size === 'lg' ? 'p-3' : 'p-2')}>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full bg-site-accent-dim',
                  size === 'lg' ? 'h-5 w-5' : 'h-3 w-3',
                )}
              />
              <span className={cn('font-semibold text-site-text', tSm)}>Card title</span>
            </div>
            <p className={cn('mt-1 leading-snug text-site-text-muted', tSm)}>
              A line of body copy sitting on the glass.
            </p>
          </div>

          {/* Static LiquidTabs-like pill strip */}
          <div className="glass-fill flex w-fit items-center gap-0.5 rounded-full p-0.5">
            {['One', 'Two', 'Three'].map((label, i) => (
              <span
                key={label}
                className={cn(
                  'rounded-full px-2 font-medium',
                  tSm,
                  size === 'lg' ? 'py-1' : 'py-0.5',
                  i === 0
                    ? 'bg-site-accent-dim text-site-accent'
                    : 'text-site-text-muted',
                )}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Button pair + input well */}
          <div className="mt-auto flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-site bg-site-accent px-2 font-medium text-site-accent-fg',
                tSm,
                size === 'lg' ? 'py-1' : 'py-0.5',
              )}
            >
              Action
            </span>
            <span
              className={cn(
                'rounded-site border border-site-border px-2 font-medium text-site-text',
                tSm,
                size === 'lg' ? 'py-1' : 'py-0.5',
              )}
            >
              Alt
            </span>
            <span
              className={cn(
                'glass-inset ms-auto flex flex-1 items-center rounded-site-sm',
                tSm,
                size === 'lg' ? 'px-2 py-1.5' : 'px-1.5 py-1',
              )}
            >
              <span className="text-site-text-dim">Search…</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
