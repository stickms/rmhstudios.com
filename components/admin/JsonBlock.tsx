import { cn } from '@/lib/utils';
import type { JsonField } from '@/lib/admin/jobs';

/**
 * A labelled region holding formatted JSON in a `surface-field` `pre`, with a note when the server
 * cut it. The server does the cutting (`truncateJson` in `lib/admin/jobs.ts`); this only shows it.
 * Strings come in translated, so the outbox view can reuse it with its own words.
 */
export function JsonBlock({
  label,
  field,
  truncatedNote,
  className,
}: {
  /** Already translated: names the region and heads the block. */
  label: string;
  field: JsonField;
  /** Already translated: shown when `field.truncated`. */
  truncatedNote: string;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn('min-w-0', className)}>
      <h3 className="t-label mb-1">{label}</h3>
      <pre className="surface-field t-meta max-h-80 overflow-auto rounded-site-sm p-3 whitespace-pre-wrap break-words text-site-text">
        {field.text}
      </pre>
      {field.truncated ? <p className="t-meta mt-1">{truncatedNote}</p> : null}
    </section>
  );
}
