/**
 * The two shapes this section repeats, so it repeats them the same way.
 *
 * Both are thin arrangements of site tokens rather than new surfaces: `Stat` is
 * an L1 `Card` (repeated content, the cheapest tier) and `SectionHeading` is
 * type. They exist because six pages otherwise re-type the same three class
 * strings and drift — which is exactly how this section came to have its own
 * design system the first time.
 */

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/**
 * A figure with its label and a line of context.
 *
 * `tone="load"` paints the figure in `--site-warning`. That is the section's
 * one semantic use of colour and it is consistent everywhere: anything
 * reporting POWER or HEAT is warning-toned, anything reporting HEALTH is the
 * accent, so a reader can tell "148 MW" from "1.12 PUE" as kinds of number
 * before reading either label. It uses the site's own warning token rather than
 * a private orange, so it re-themes and stays legible in high contrast.
 */
export function Stat({
  label,
  value,
  note,
  tone = 'health',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'health' | 'load';
}) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <span className="text-xs font-medium tracking-wide text-site-accent uppercase">{label}</span>
      <span
        className={
          tone === 'load'
            ? 'font-display text-3xl font-semibold tracking-[-0.02em] text-site-warning'
            : 'font-display text-3xl font-semibold tracking-[-0.02em] text-site-text'
        }
      >
        {value}
      </span>
      <span className="text-sm text-site-text-dim">{note}</span>
    </Card>
  );
}

/** A kicker over a heading — the section marker every page here opens with. */
export function SectionHeading({
  kicker,
  heading,
  id,
}: {
  kicker: string;
  heading: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-site-accent uppercase">{kicker}</span>
      <h2 id={id} className="font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
        {heading}
      </h2>
    </div>
  );
}

/** A labelled row of a spec table. */
export function SpecRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-site-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-6">
      <dt className="text-xs font-medium tracking-wide text-site-accent uppercase">{term}</dt>
      <dd className="text-sm text-site-text-muted">{children}</dd>
    </div>
  );
}
