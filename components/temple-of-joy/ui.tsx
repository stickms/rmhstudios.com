/**
 * The temple's own primitives.
 *
 * Deliberately not the site's `components/ui/` set: the temple lives outside
 * the site shell with its own palette and its own idea of what a surface is.
 * What they share is the discipline — a token for every colour, real
 * semantics, and no state signalled by colour alone.
 */
'use client';

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio, type ToneName } from '@/lib/temple-of-joy/audio';
import { Emoji } from '@/components/ui/emoji';

/* ─── Button ────────────────────────────────────────────────────────────── */

export interface TempleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plain' | 'gold' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  /** Pulses to mark something the player can now do. */
  ready?: boolean;
  /** Which cue to play on press. Defaults to the neutral tick. */
  tone?: ToneName | null;
}

export function TempleButton({
  variant = 'plain',
  size = 'md',
  ready,
  tone = 'tick',
  className,
  type = 'button',
  onClick,
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
      onClick={(event) => {
        if (tone) templeAudio.play(tone);
        onClick?.(event);
      }}
    />
  );
}

/* ─── Live value ────────────────────────────────────────────────────────── */

export interface LiveValueProps {
  read: (state: ReturnType<typeof useTempleStore.getState>) => string;
  className?: string;
  style?: CSSProperties;
  as?: 'span' | 'div' | 'p';
}

/**
 * A number that updates every frame without re-rendering React.
 *
 * The joy counter changes ~60 times a second. Routing that through `useState`
 * would re-render its whole subtree at 60Hz for one text node; this writes
 * `textContent` directly and lets React own everything around it.
 */
export function LiveValue({ read, className, style, as: Tag = 'span' }: LiveValueProps) {
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
        // Skip the DOM write when the formatted string is unchanged — writing
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
    <Tag ref={ref as never} className={className} style={style}>
      {read(useTempleStore.getState())}
    </Tag>
  );
}

/* ─── Row ───────────────────────────────────────────────────────────────── */

export interface TempleRowProps {
  icon?: ReactNode;
  name: ReactNode;
  note?: ReactNode;
  /** Right-hand figure — a price, a count, a reward. */
  price?: ReactNode;
  /** Second right-hand line. */
  meta?: ReactNode;
  affordable?: boolean;
  /** Marked as the shortest payback available right now. */
  recommended?: boolean;
  /** Flashes once, to acknowledge a purchase. */
  flash?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function TempleRow({
  icon,
  name,
  note,
  price,
  meta,
  affordable,
  recommended,
  flash,
  onClick,
  disabled,
  ariaLabel,
  className,
}: TempleRowProps) {
  const content = (
    <>
      {icon != null && <span className="toj-row-icon">{icon}</span>}
      <span className="toj-row-body">
        <span className="toj-row-name">{name}</span>
        {note != null && <span className="toj-row-note">{note}</span>}
      </span>
      <span className="toj-row-meta">
        {price != null && <span className="toj-row-price">{price}</span>}
        {meta != null && <span className="toj-row-count">{meta}</span>}
      </span>
    </>
  );

  const props = {
    className: `toj-row${className ? ` ${className}` : ''}`,
    'data-affordable': affordable ? 'true' : undefined,
    'data-recommended': recommended ? 'true' : undefined,
    'data-flash': flash ? 'true' : undefined,
  };

  // A row that does nothing should not be a button — it would be focusable,
  // clickable and silent, which reads as broken rather than as informational.
  if (!onClick) return <div {...props}>{content}</div>;

  return (
    <button type="button" {...props} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {content}
    </button>
  );
}

/* ─── Segmented switch ──────────────────────────────────────────────────── */

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
          onClick={() => {
            templeAudio.play('tab');
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Switch & slider ───────────────────────────────────────────────────── */

export function TempleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toj-switch"
      onClick={() => {
        templeAudio.play('tick');
        onChange(!checked);
      }}
    />
  );
}

export function TempleSlider({
  value,
  onChange,
  label,
  /** Play a tone as the value settles, so the slider is audible while dragging. */
  audible = false,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  audible?: boolean;
}) {
  return (
    <>
      <input
        type="range"
        className="toj-slider"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onPointerUp={() => {
          if (audible) templeAudio.play('tick');
        }}
        onKeyUp={() => {
          if (audible) templeAudio.play('tick');
        }}
      />
      <span className="toj-slider-value">{Math.round(value * 100)}%</span>
    </>
  );
}

/* ─── Odds and ends ─────────────────────────────────────────────────────── */

export function TempleEmpty({ children }: { children: ReactNode }) {
  return <p className="toj-empty">{children}</p>;
}

export function TempleSection({ children }: { children: ReactNode }) {
  return <p className="toj-section">{children}</p>;
}

/**
 * Every emoji in the temple goes through Twemoji, so a candle looks the same
 * on Windows, Android, and a Linux box with no colour emoji font at all.
 */
export function Glyph({ children, label }: { children: string; label?: string }) {
  return <Emoji label={label}>{children}</Emoji>;
}
