/**
 * The temple's own primitives.
 *
 * These are deliberately not the site's `components/ui/` set: the temple lives
 * outside the site shell with its own palette and its own idea of what a
 * surface looks like. What they share is the discipline — tokens for every
 * colour, real semantics, and no state signalled by colour alone.
 */
'use client';

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { Emoji } from '@/components/ui/emoji';

/* ─── Button ────────────────────────────────────────────────────────────── */

export interface TempleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'stone' | 'gold' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  /** Pulses the button to mark a purchase the player can now afford. */
  ready?: boolean;
}

export function TempleButton({
  variant = 'stone',
  size = 'md',
  ready,
  className,
  type = 'button',
  ...rest
}: TempleButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      data-size={size}
      data-ready={ready ? 'true' : undefined}
      className={`toj-btn${className ? ` ${className}` : ''}`}
    />
  );
}

/* ─── Live value ────────────────────────────────────────────────────────── */

export interface LiveValueProps {
  /** Read the display string from the current game state. */
  read: (state: ReturnType<typeof useTempleStore.getState>) => string;
  className?: string;
  style?: CSSProperties;
  /** Announce changes to assistive tech. Off by default — a counter that ticks
   *  several times a second is noise, not information. */
  live?: boolean;
  as?: 'span' | 'div' | 'p';
}

/**
 * A number that updates every frame without re-rendering React.
 *
 * The happiness counter changes ~60 times a second. Routing that through
 * `useState` would re-render its whole subtree at 60Hz for one text node; this
 * writes `textContent` directly and lets React own everything around it.
 */
export function LiveValue({ read, className, style, live, as: Tag = 'span' }: LiveValueProps) {
  const ref = useRef<HTMLElement>(null);
  const latest = useRef(read);
  latest.current = read;

  useEffect(() => {
    let frame = 0;
    let previous = '';

    const paint = () => {
      const node = ref.current;
      if (node) {
        const next = latest.current(useTempleStore.getState());
        // Skip the DOM write when the formatted string hasn't changed —
        // identical text still invalidates layout on some engines.
        if (next !== previous) {
          previous = next;
          node.textContent = next;
        }
      }
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={style}
      aria-live={live ? 'polite' : undefined}
    >
      {read(useTempleStore.getState())}
    </Tag>
  );
}

/* ─── Codex row ─────────────────────────────────────────────────────────── */

export interface TempleRowProps {
  icon?: ReactNode;
  name: ReactNode;
  note?: ReactNode;
  /** Right-hand figure — a price, a count, a reward. */
  price?: ReactNode;
  /** Second right-hand line — how many are owned, a requirement. */
  meta?: ReactNode;
  affordable?: boolean;
  owned?: boolean;
  locked?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Extra description for assistive tech, when the visual meta isn't enough. */
  ariaLabel?: string;
}

export function TempleRow({
  icon,
  name,
  note,
  price,
  meta,
  affordable,
  owned,
  locked,
  onClick,
  disabled,
  ariaLabel,
}: TempleRowProps) {
  const content = (
    <>
      {icon != null && <span className="toj-row-icon">{icon}</span>}
      <span>
        <span className="toj-row-name">{name}</span>
        {note != null && <span className="toj-row-note">{note}</span>}
      </span>
      <span className="toj-row-meta">
        {price != null && <span className="toj-row-price">{price}</span>}
        {meta != null && <span className="toj-row-count">{meta}</span>}
      </span>
    </>
  );

  // A row that does nothing shouldn't be a button — it would be focusable,
  // clickable and silent, which reads as broken rather than informational.
  if (!onClick) {
    return (
      <div
        className="toj-row"
        data-affordable={affordable ? 'true' : undefined}
        data-owned={owned ? 'true' : undefined}
        data-locked={locked ? 'true' : undefined}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="toj-row"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-affordable={affordable ? 'true' : undefined}
      data-owned={owned ? 'true' : undefined}
      data-locked={locked ? 'true' : undefined}
    >
      {content}
    </button>
  );
}

/* ─── Segmented filter ──────────────────────────────────────────────────── */

/** `string | number` because the source panel's quantities are `1 | 10 | 100 | 'max'`. */
export interface TempleSegmentsProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function TempleSegments<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: TempleSegmentsProps<T>) {
  return (
    <div className="toj-segments toj-scroll" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="toj-segment"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────────────────────────── */

export function TempleEmpty({ children }: { children: ReactNode }) {
  return <p className="toj-empty">{children}</p>;
}

/* ─── Glyph ─────────────────────────────────────────────────────────────── */

/**
 * The temple is full of emoji — source icons, currency marks, tab glyphs. They
 * all go through Twemoji so a candle looks the same on Windows, Android and a
 * Linux box with no colour emoji font at all.
 */
export function Glyph({ children, label }: { children: string; label?: string }) {
  return <Emoji label={label}>{children}</Emoji>;
}
