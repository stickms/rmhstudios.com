import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one section grammar every `/settings/*` page shares.
 *
 * Before this existed the twelve settings pages hand-rolled their panels: three
 * surfaces (`glass-pane`, `glass-fill`, and a bare `bg-site-surface/40` box),
 * four title sizes, three icon sizes, `p-4` vs `p-5`, and `mb-6` / `space-y-8` /
 * `space-y-4` between siblings — so moving from Privacy to Content felt like
 * changing sites. Now:
 *
 * - {@link SettingsPageBody} is the page column: `px-4 pt-4 pb-12`, `space-y-4`
 *   between sections (PageLayout owns the header gap above it).
 * - {@link SettingsSection} is one panel: L2 `glass-pane` (a singular panel),
 *   `p-4`, an optional accent icon, a `.site-section-label` h2, a muted
 *   `text-sm` description, an optional right-aligned `action` (a Switch), and a
 *   body that sits `mt-4` below the header with `space-y-3` between its parts.
 *
 * Panels never add their own outer margin; the page body's `space-y-4` owns it.
 */
export function SettingsPageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-4 px-4 pt-4 pb-12', className)}>{children}</div>;
}

export function SettingsSection({
  id,
  icon: Icon,
  title,
  titleId,
  description,
  descriptionId,
  action,
  iconClassName,
  tone = 'default',
  surface = 'pane',
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  icon?: LucideIcon;
  /** Omit when the page title already names the section; keep `description`. */
  title?: React.ReactNode;
  /** Set when a control inside (or in `action`) is labelled by the title. */
  titleId?: string;
  description?: React.ReactNode;
  /** Set when a control inside (or in `action`) is described by the text. */
  descriptionId?: string;
  /** Right-aligned header control, typically a `Switch`. */
  action?: React.ReactNode;
  /** Override the icon tint (e.g. a status colour). */
  iconClassName?: string;
  /** `danger` is for irreversible actions (delete account). */
  tone?: 'default' | 'danger';
  /** `fill` (L1) for compact repeated rows such as a lone toggle; `pane` otherwise. */
  surface?: 'pane' | 'fill';
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        'rounded-site p-4',
        surface === 'pane' && tone === 'default' ? 'glass-pane' : 'glass-fill',
        tone === 'danger' && 'border border-site-danger/40',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <Icon
            className={cn(
              'mt-0.5 size-5 shrink-0',
              iconClassName ?? (tone === 'danger' ? 'text-site-danger' : 'text-site-accent'),
            )}
            aria-hidden
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <h2 id={titleId} className="site-section-label">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p id={descriptionId} className={cn('text-sm text-site-text-muted', title && 'mt-0.5')}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className={cn('mt-4 space-y-3', bodyClassName)}>{children}</div> : null}
    </section>
  );
}
