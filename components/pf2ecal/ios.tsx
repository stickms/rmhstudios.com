'use client';

/**
 * The iOS control set for `/pf2ecal`, hand-rolled.
 *
 * No component library: the page needs five controls, and the smallest iOS-kit
 * on npm is larger than this whole feature. Each one below is a native element
 * with the right ARIA and ~30 lines of CSS in `pf2ecal.css`, which is both less
 * code than a dependency's adapter layer would be and the only way to get the
 * exact system values (51×31 switch, 44px row, 13px grouped-list caption).
 *
 * Two rules these share, because getting either wrong is what makes hand-rolled
 * controls worse than a library's:
 *
 * - **Semantics before looks.** The switch is a `<button role="switch">` with
 *   `aria-checked`, the segmented control is a group of `aria-pressed` buttons,
 *   and every row that does something is a real `<button>`. Nothing here is a
 *   styled `<div>` with an onClick.
 * - **44px minimum** on anything a thumb has to hit. `.pf2e-row` and
 *   `.pf2e-btn` enforce it in CSS so a caller cannot accidentally ship a 28px
 *   tap target.
 *
 * The segmented control's selection pill is a translated sibling driven by a
 * CSS custom property, NOT a framer-motion `layoutId` — that belongs to
 * `LiquidTabs` and re-rolling it is CI-enforced (design-language.md §13 rule 3).
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Grouped list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The iOS Settings shape: an uppercase caption, a filled card of rows, and an
 * optional explanatory footer underneath. The footer is where iOS puts the
 * sentence explaining what the setting does, and it is the right place for it
 * here too — a tooltip cannot be read on a phone.
 */
export function Group({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {title && <h3 className="pf2e-group-title">{title}</h3>}
      <div className="pf2e-group">{children}</div>
      {footer && <div className="pf2e-group-footer">{footer}</div>}
    </section>
  );
}

/**
 * One row. `as="button"` makes it pressable; the default is a static row that
 * merely holds a control (a switch, a field), which must NOT be a button —
 * nesting the switch inside one would make the switch unreachable.
 */
export function Row({
  label,
  value,
  children,
  onClick,
  disabled,
}: {
  label?: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      {label && <span className="pf2e-row-label">{label}</span>}
      {value && <span className="pf2e-row-value">{value}</span>}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="pf2e-row" onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className="pf2e-row">{content}</div>;
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The iOS toggle.
 *
 * `role="switch"` + `aria-checked` rather than a styled checkbox: a screen
 * reader announces "on/off" instead of "checked", which is what the control
 * actually means, and it removes the appearance-none fight with the native
 * checkbox entirely.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Required — an unlabelled switch is unusable non-visually. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="pf2e-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/**
 * UISegmentedControl.
 *
 * It is a `radiogroup`, which is what a one-of-N selector is: it picks a value,
 * it does not switch panels. The tab role would be wrong here on the merits,
 * and tab strips on this site belong to `<LiquidTabs>` anyway
 * (design-language.md §13 rule 1).
 *
 * (The rule's scan reads source text rather than JSX, so spelling that role out
 * even to say it is NOT used trips it. Hence the circumlocution — the gate is
 * doing its job; this comment is just staying out of its way.)
 */
export function Segmented<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );
  return (
    <div
      className="pf2e-segmented"
      role="radiogroup"
      aria-label={label}
      style={
        {
          '--pf2e-seg-count': segments.length,
          '--pf2e-seg-index': index,
        } as React.CSSProperties
      }
    >
      {/* The pill sits behind the labels and is driven by `--pf2e-seg-index`.
          One transform, one element, no layout projection. */}
      <span className="pf2e-segmented-thumb" aria-hidden />
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          // `aria-checked` only. `aria-pressed` belongs to a toggle button and
          // is invalid on a radio — it was here to hang CSS off, which the CSS
          // now takes from `aria-checked` instead.
          aria-checked={segment.value === value}
          className="pf2e-segment"
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
