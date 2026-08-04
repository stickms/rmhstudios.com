/**
 * Massive March — the game's own small UI vocabulary.
 *
 * A full-screen game with a bespoke visual identity, so it is off the `--site-*`
 * token contract by design (`docs/design-language.md` §12, and the exemption
 * list in `lib/__tests__/design-consistency.test.ts`). Everything here is
 * painted from `lib/massive-march/palette.ts`, which is also what paints the
 * island — so the buttons and the towers are the same yellow, which is the
 * entire point of having a palette module.
 *
 * The look is the island's signage: off-white board, a hard black hairline, one
 * flat primary for anything that matters, and no gradients or glass anywhere.
 * It reads over a bright coastline at noon and over a black hillside at
 * midnight, which a translucent panel does not.
 */

'use client';

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LAND, TOY } from '@/lib/massive-march/palette';

export const INK = TOY.black;
export const BOARD = '#f7f3e8';

export function Panel({
  className,
  children,
  tone = 'board',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'board' | 'dark' }) {
  return (
    <div
      {...props}
      className={cn('border-[3px] p-4', className)}
      style={{
        background: tone === 'board' ? BOARD : 'rgba(20,18,16,0.86)',
        borderColor: tone === 'board' ? INK : 'rgba(247,243,232,0.28)',
        color: tone === 'board' ? INK : BOARD,
        borderRadius: 4,
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}

type ButtonTone = 'primary' | 'plain' | 'danger' | 'ghost';

const TONE_FILL: Record<ButtonTone, string> = {
  primary: TOY.yellow,
  plain: BOARD,
  danger: TOY.red,
  ghost: 'transparent',
};

const TONE_TEXT: Record<ButtonTone, string> = {
  primary: INK,
  plain: INK,
  danger: BOARD,
  ghost: BOARD,
};

export function MarchButton({
  tone = 'plain',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'border-[3px] px-4 py-2 text-sm font-bold tracking-wide uppercase',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        !props.disabled && 'cursor-pointer hover:brightness-105 active:translate-y-px',
        className,
      )}
      style={{
        background: TONE_FILL[tone],
        color: TONE_TEXT[tone],
        borderColor: tone === 'ghost' ? 'rgba(247,243,232,0.4)' : INK,
        borderRadius: 3,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold tracking-[0.14em] uppercase opacity-70">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs opacity-60">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full border-[3px] px-3 py-2 text-sm outline-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        props.className,
      )}
      style={{
        background: '#fffdf6',
        borderColor: INK,
        color: INK,
        borderRadius: 3,
        outlineColor: TOY.blue,
        ...props.style,
      }}
    />
  );
}

/**
 * A segmented chooser.
 *
 * Not `LiquidTabs`: that renderer is the site tier's tab grammar and carries the
 * site's glass capsule with it. This is a control inside a game with its own
 * painted identity, and it never navigates — it picks a value.
 */
export function Choose<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="flex-1 cursor-pointer border-[3px] px-3 py-2 text-left transition-colors duration-150"
            style={{
              background: active ? TOY.blue : '#fffdf6',
              color: active ? BOARD : INK,
              borderColor: INK,
              borderRadius: 3,
              minWidth: 120,
            }}
          >
            <span className="block text-sm font-bold">{option.label}</span>
            {option.hint ? (
              <span className="block text-xs leading-snug opacity-75">{option.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-start gap-3 border-[3px] px-3 py-2 text-left transition-colors duration-150"
      style={{ background: '#fffdf6', borderColor: INK, color: INK, borderRadius: 3 }}
    >
      <span
        aria-hidden
        className="mt-0.5 grid size-5 shrink-0 place-items-center border-[3px]"
        style={{ borderColor: INK, background: checked ? TOY.green : 'transparent', borderRadius: 2 }}
      >
        {checked ? <span className="block size-1.5" style={{ background: BOARD }} /> : null}
      </span>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {hint ? <span className="block text-xs leading-snug opacity-70">{hint}</span> : null}
      </span>
    </button>
  );
}

/** A progress bar drawn as a painted strip, because everything here is painted. */
export function Meter({ value, total, color = TOY.red }: { value: number; total: number; color?: string }) {
  const pct = total <= 0 ? 0 : Math.min(1, Math.max(0, value / total));
  return (
    <div
      className="h-2.5 w-full border-2 overflow-hidden"
      style={{ borderColor: INK, background: LAND.sandWet, borderRadius: 2 }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className="h-full transition-[width] duration-300"
        style={{ width: `${pct * 100}%`, background: color }}
      />
    </div>
  );
}

export function Chip({
  children,
  color = TOY.white,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 border-2 px-2 py-1 text-xs font-bold', className)}
      style={{ background: color, borderColor: INK, color: INK, borderRadius: 3 }}
    >
      {children}
    </span>
  );
}
