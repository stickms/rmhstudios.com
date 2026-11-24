import * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Divider primitives (Steel S7-S11). Each one is a thin wrapper over a class in app/styles/steel-rules.css: a group of
 * content is set off by a 1px rule, never a bordered box. Markup is plain HTML, so each renders complete on the server.
 */

export type ColumnsRatio = '1-1' | '3-2' | '1-1-1';

interface SectionProps {
  title?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** A block set off from the one before it by a rule above (S7). The first in its parent draws no rule. */
export function Section({ title, id, className, children }: SectionProps) {
  const headingId = React.useId();
  return (
    <section
      id={id}
      className={cn('rule-section', className)}
      aria-labelledby={title ? headingId : undefined}
    >
      {title ? (
        <h2 id={headingId} className="t-heading text-site-text">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

interface ColumnsProps {
  ratio?: ColumnsRatio;
  className?: string;
  children: React.ReactNode;
}

/** Side-by-side columns on a wide container, stacked with a rule between them on a narrow one (S8). */
export function Columns({ ratio = '1-1', className, children }: ColumnsProps) {
  return (
    <div className={cn('rule-cols', className)} data-ratio={ratio}>
      {children}
    </div>
  );
}

interface CellsProps {
  columns?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}

/**
 * A grid of cells with rules only between them (S9). Each child must be an `<li>` (the CSS targets `li`). Each item is
 * marked `data-last-row` when it sits in the last row of a full grid, so a ragged last row never draws a bottom rule on
 * the outer edge. Below a 30rem container the cells collapse to one column.
 */
export function Cells({ columns = 2, className, children }: CellsProps) {
  const items = React.Children.toArray(children);
  const lastRowStart = Math.floor((items.length - 1) / columns) * columns;
  return (
    <ul className={cn('rule-cells', className)} data-columns={columns}>
      {items.map((child, index) =>
        React.isValidElement<React.HTMLAttributes<HTMLLIElement> & { 'data-last-row'?: string }>(child)
          ? React.cloneElement(child, { 'data-last-row': index >= lastRowStart ? '' : undefined })
          : child,
      )}
    </ul>
  );
}

interface NoticeProps {
  tone: 'danger' | 'success';
  children: React.ReactNode;
  className?: string;
}

/** A status line: a rule below and a 2px start edge in the tone colour (S10). Danger is an alert, success a status. */
export function Notice({ tone, children, className }: NoticeProps) {
  return (
    <div
      className={cn('rule-notice', className)}
      data-tone={tone}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

interface DefinitionsProps {
  className?: string;
  children: React.ReactNode;
}

/** Label and value rows on rules (S11). */
export function Definitions({ className, children }: DefinitionsProps) {
  return <dl className={cn('rule-defs', className)}>{children}</dl>;
}

interface DefinitionProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

/** One row of Definitions: the label first, then the value. */
export function Definition({ label, children }: DefinitionProps) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-body text-site-text">{children}</dd>
    </div>
  );
}
