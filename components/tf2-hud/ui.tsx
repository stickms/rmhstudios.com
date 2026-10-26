/**
 * Small controls for the TF2 HUD Editor, drawn from the `--app-*` palette.
 *
 * The site's `components/ui/*` primitives are `--site-*` and re-theme with the
 * site; this app has its own palette (the TF2 menu look), so its controls take
 * the app tokens instead. They are deliberately few — every one is used across
 * several panels — and tab strips are NOT here: those are `LiquidTabs`.
 */
'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ─────────────────────────────── buttons ─────────────────────────────── */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'xs' | 'sm' | 'md';

const BTN_BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-(--app-radius-sm) border font-semibold transition-[color,background-color,border-color,opacity] duration-(--app-duration-fast) disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0';

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    'border-transparent bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)',
  secondary:
    'border-(--app-border-bright) bg-(--app-surface) text-(--app-text) hover:bg-(--app-surface-hover)',
  ghost:
    'border-transparent text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)',
  danger:
    'border-transparent bg-(--app-danger-dim) text-(--app-danger) hover:bg-(--app-danger) hover:text-(--app-bg)',
};

const BTN_SIZE: Record<BtnSize, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: LucideIcon;
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'secondary', size = 'sm', icon: Icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...rest}
    >
      {Icon ? <Icon aria-hidden /> : null}
      {children}
    </button>
  );
});

export interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name; also the tooltip. */
  label: string;
  active?: boolean;
  size?: 'xs' | 'sm';
}

export const IconBtn = forwardRef<HTMLButtonElement, IconBtnProps>(function IconBtn(
  { icon: Icon, label, active, size = 'sm', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-(--app-radius-sm) border border-transparent text-(--app-text-muted) transition-[color,background-color] duration-(--app-duration-fast) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        size === 'xs' ? 'size-7' : 'size-8',
        active && 'bg-(--app-accent-dim) text-(--app-accent)',
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden />
    </button>
  );
});

/* ─────────────────────────────── fields ─────────────────────────────── */

const FIELD =
  'h-8 w-full min-w-0 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) px-2 text-xs text-(--app-text) placeholder:text-(--app-text-dim) focus-visible:border-(--app-accent) disabled:opacity-50';

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(FIELD, className)} {...rest} />;
  },
);

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(FIELD, 'pr-6', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)"
      >
        {label}
      </label>
      <div id={id}>{children}</div>
      {hint ? <p className="text-[11px] text-(--app-text-dim)">{hint}</p> : null}
    </div>
  );
}

/** A number box that also scrubs: drag horizontally on the label to change it. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  return (
    <input
      type="number"
      aria-label={label}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number.parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(clamp(v));
      }}
      className={cn(FIELD, 'tabular-nums', className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />
  );
}

export function RangeField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-5 w-full min-w-0 cursor-pointer accent-(--app-accent)"
    />
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="min-w-0 truncate text-xs text-(--app-text-muted)">{label}</span>
      <div className="flex min-w-0 shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/* ─────────────────────────────── panels ─────────────────────────────── */

export function PanelHead({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center justify-between gap-2 border-b border-(--app-border) px-3',
        className,
      )}
    >
      <h2 className="tf2hud-panel-head truncate">{title}</h2>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-(--app-surface-hover) text-(--app-text-muted)',
    accent: 'bg-(--app-accent-dim) text-(--app-accent)',
    success: 'bg-(--app-success-dim) text-(--app-success)',
    warning: 'bg-(--app-warning-dim) text-(--app-warning)',
    danger: 'bg-(--app-danger-dim) text-(--app-danger)',
    info: 'bg-(--app-info-dim) text-(--app-info)',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-(--app-radius-sm) px-1.5 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-(--app-text-dim)">{children}</p>;
}

/* ─────────────────────────────── modal ─────────────────────────────── */

/**
 * A dialog on Radix, portaled INTO the app root so it inherits the `--app-*`
 * palette (a body-level portal would lose them).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setContainer(document.querySelector<HTMLElement>('.tf2hud-theme'));
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay className="app-overlay fixed inset-0 z-50 bg-(--app-scrim)" />
        <DialogPrimitive.Content
          className={cn(
            'app-modal fixed top-1/2 left-1/2 z-50 flex max-h-[min(88dvh,46rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-(--app-radius) border border-(--app-border-bright) bg-(--app-bg-subtle) text-(--app-text) shadow-(--app-shadow)',
            wide ? 'max-w-3xl' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-(--app-border) px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="tf2hud-title truncate text-xl">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-(--app-text-muted)">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconBtn icon={X} label={t('close', { defaultValue: 'Close' })} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--app-border) px-4 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ─────────────────────────── context menu ─────────────────────────── */

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(at.x, window.innerWidth - r.width - 8),
      y: Math.min(at.y, window.innerHeight - r.height - 8),
    });
    el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [at]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [
          ...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []),
        ];
        const i = btns.indexOf(document.activeElement as HTMLElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-60 min-w-44 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg-subtle) p-1 shadow-(--app-shadow)"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-(--app-radius-sm) px-2 py-1.5 text-left text-xs hover:bg-(--app-surface-hover) disabled:opacity-40',
            item.danger ? 'text-(--app-danger)' : 'text-(--app-text)',
          )}
        >
          {item.icon ? (
            <item.icon className="size-3.5" aria-hidden />
          ) : (
            <span className="size-3.5" />
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── popover ─────────────────────────────── */

/**
 * A panel anchored to an element (a swatch, a field), flipped above when there is
 * no room below and clamped into the viewport. Portaled into the app root so it
 * keeps the `--app-*` palette. Closes on Escape and on a press outside.
 */
export function Popover({
  anchor,
  open,
  onClose,
  label,
  width = 288,
  children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  label: string;
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setRoot(document.querySelector<HTMLElement>('.tf2hud-theme'));
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const w = Math.min(width, window.innerWidth - 16);
    const below = a.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 6) : below;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
    setPos({ left, top });
  }, [open, anchor, width, children, root]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, anchor, onClose]);

  if (!open || !root) return null;
  return createPortal(
    <div
      ref={ref}
      // A non-modal panel: a labelled group, not a dialog (no focus trap, page stays live).
      role="group"
      aria-label={label}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: Math.min(width, window.innerWidth - 16),
      }}
      className="fixed z-60 rounded-(--app-radius) border border-(--app-border-bright) bg-(--app-bg-subtle) p-3 text-(--app-text) shadow-(--app-shadow)"
    >
      {children}
    </div>,
    root,
  );
}
