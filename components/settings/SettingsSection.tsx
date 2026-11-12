import './settings.css';
import { NoMargin } from '@/components/shell/NoMargin';
import { Spine } from '@/components/ui/spine';
import { cn } from '@/lib/utils';

/**
 * The one section grammar every `/settings/*` page shares (Steel section 10, Settings).
 *
 * The spine means the page's groups: {@link SettingsPageBody} is the `Spine`, and each {@link SettingsSection} is a
 * station (a real `<h2>` with the hollow dot) followed by its rows. Nothing is boxed (R3, S1): a group is a heading, an
 * optional one-line explanation, and rows on rules. Each setting inside is a row of its own (name, optional one-line
 * explanation, control at the end); the panels that fill a section own those rows.
 *
 * - `title` is the station. Omit it when the page title already names the section; keep `description`.
 * - `action` is the section's one control, set at the end of the heading row (a Switch, a "New" button).
 * - `tone="danger"` is for irreversible actions: the heading is read in the danger colour (never colour alone: the
 *   words say what the section does).
 */
export function SettingsPageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Settings is the two-column frame at every width (L3): it has no margin column.
  return (
    <>
      <NoMargin />
      <Spine className={cn('settings-page', className)}>{children}</Spine>
    </>
  );
}

export function SettingsSection({
  id,
  title,
  titleId,
  description,
  descriptionId,
  action,
  tone = 'default',
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  /** Omit when the page title already names the section; keep `description`. */
  title?: React.ReactNode;
  /** Set when a control inside (or in `action`) is labelled by the title. */
  titleId?: string;
  description?: React.ReactNode;
  /** Set when a control inside (or in `action`) is described by the text. */
  descriptionId?: string;
  /** End-aligned header control, typically a `Switch`. */
  action?: React.ReactNode;
  /** `danger` is for irreversible actions (delete account). */
  tone?: 'default' | 'danger';
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-tone={tone === 'danger' ? 'danger' : undefined}
      className={cn('settings-group', className)}
    >
      <div className="settings-group__head">
        <div className="min-w-0 flex-1">
          {title ? (
            <h2 id={titleId} className="spine-station t-label settings-group__title">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p id={descriptionId} className="settings-group__lede t-body">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className={cn('settings-group__body', bodyClassName)}>{children}</div>
      ) : null}
    </section>
  );
}
