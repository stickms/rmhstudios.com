/**
 * The pieces both in-game quick AI bars share (HudQuickAi, LoadoutQuickAi): the one-line prompt with
 * its Ask / Cancel button, the suggestion chips, the progress line and a polite live region that reads
 * results out. Controls are the TF2 Hub's own (`Btn`, `TextField`: 44 px targets and 16 px text on a
 * touch-first device) and carry `data-menu-item`, so the pause menu's arrow keys and the gamepad's
 * d-pad reach them (components/tf2-game/menu-nav.ts).
 */
'use client';

import { LoaderCircle, Lock, Send, Sparkles, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, TextField } from '@/components/tf2-hud/ui';
import { cn } from '@/lib/utils';

/** A double tap or a chip pressed right after Enter is one request, not two. */
export const ASK_DEBOUNCE_MS = 400;

export function QuickPrompt({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  maxLength,
  placeholder,
  label,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  maxLength: number;
  placeholder: string;
  /** The field's accessible name. */
  label: string;
  /** Signed out: the field works, Ask explains that the AI needs an account. */
  locked?: boolean;
}) {
  const { t } = useTranslation('c-tf2-game');
  const id = useId();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="relative min-w-0 flex-1">
        <Sparkles
          className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-(--app-accent-text)"
          aria-hidden
        />
        <TextField
          id={id}
          data-menu-item
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Esc cancels a request in flight; otherwise it belongs to the menu (back).
            if (e.key === 'Escape' && busy) {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          maxLength={maxLength}
          placeholder={placeholder}
          enterKeyHint="send"
          autoComplete="off"
          className="ps-8"
        />
      </span>
      {busy ? (
        <Btn size="sm" variant="secondary" icon={X} data-menu-item onClick={onCancel}>
          {t('ai_cancel', { defaultValue: 'Cancel' })}
        </Btn>
      ) : (
        <Btn
          size="sm"
          type="submit"
          variant="primary"
          icon={locked ? Lock : Send}
          data-menu-item
          disabled={!value.trim()}
        >
          {t('ai_ask', { defaultValue: 'Ask AI' })}
        </Btn>
      )}
    </form>
  );
}

export interface ChipItem {
  key: string;
  label: string;
  /** Read after the label by screen readers ("quick preset, no AI"). */
  hint?: string;
  onPick: () => void;
}

export function ChipRow({ chips, disabled, label }: { chips: ChipItem[]; disabled: boolean; label: string }) {
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {chips.map((c) => (
        <li key={c.key}>
          <Btn
            size="xs"
            variant="secondary"
            data-menu-item
            disabled={disabled}
            onClick={c.onPick}
            aria-label={c.hint ? `${c.label} (${c.hint})` : undefined}
            className="font-medium"
          >
            {c.label}
          </Btn>
        </li>
      ))}
    </ul>
  );
}

/** "Working out the changes…" with a spinner, as a status message. */
export function Progress({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-(--app-text-muted)">
      <LoaderCircle className="size-4 shrink-0 animate-spin text-(--app-accent-text)" aria-hidden />
      {children}
    </p>
  );
}

export function Note({
  tone = 'muted',
  children,
  className,
}: {
  tone?: 'muted' | 'warning' | 'danger' | 'success';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-xs',
        tone === 'muted' && 'text-(--app-text-muted)',
        tone === 'warning' && 'text-(--app-warning)',
        tone === 'danger' && 'text-(--app-danger)',
        tone === 'success' && 'text-(--app-success)',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Screen-reader announcements of results (visually hidden; the same words are on screen). */
export function LiveRegion({ text }: { text: string }) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}

/** The bar's frame: a titled section, compact. */
export function QuickBarFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg-subtle) p-2.5',
        className,
      )}
    >
      <h3 id={id} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-(--app-text-dim)">
        <Sparkles className="size-3.5 shrink-0 text-(--app-accent-text)" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}
