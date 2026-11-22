import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Switch } from '@/components/ui/switch';
import { toolCopy } from '@/components/toolbox/tool-copy';

/**
 * The page every tool sits in: the shared title block (the tool's name and line of
 * description), a back link to the hub, and the standard content column.
 *
 * A tool is a working surface, so its body is controls and results; results are
 * rows on rules (Steel R3), not cards.
 */
export function ToolFrame({ slug, children }: { slug: string; children: ReactNode }) {
  const { t } = useTranslation('toolbox');
  const copy = toolCopy(t, slug);
  return (
    <PageLayout
      title={copy.name}
      description={copy.description}
      backTo="/tools"
      backLabel={t('back-to-toolbox', { defaultValue: 'Toolbox' })}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4 pb-12">{children}</div>
    </PageLayout>
  );
}

/** A labelled group of controls or results inside a tool, separated from the next by a rule. */
export function ToolSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-site-border pt-4">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 className="t-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One result row: a label and its value, on a hairline rule. */
export function ResultRow({
  label,
  value,
  mono = true,
  action,
  as: Tag = 'div',
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  action?: ReactNode;
  /** `li` when the rows are an ordered or unordered list. */
  as?: 'div' | 'li';
}) {
  return (
    <Tag className="flex min-h-11 items-center justify-between gap-4 border-b border-site-border py-2 last:border-b-0">
      <span className="t-body text-site-text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={mono ? 'min-w-0 break-all text-right font-mono text-sm' : 't-body min-w-0 text-right'}>
          {value}
        </span>
        {action}
      </span>
    </Tag>
  );
}

/** An error or warning line under a field, announced to assistive technology. */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="t-body text-site-danger">
      {children}
    </p>
  );
}

/** An on/off option: the switch and its label on one row; the label names the switch through `aria-labelledby`. */
export function ToolSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={id} />
      <span id={id} className="t-body">
        {label}
      </span>
    </div>
  );
}
