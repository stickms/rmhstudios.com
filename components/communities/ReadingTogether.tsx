/**
 * s11-09 — the "Reading together" line on a community's page: one row on a rule per running or paused read-along, with
 * the book, how many parts have opened and when the next one does, linking to the read-along page. Nothing shows while
 * it loads, if it fails, or when the community has none (a community that reads nothing together has no line).
 * Book titles are member-written, so they carry `dir="auto"`.
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { listReadAlongsApi } from '@/lib/communities/read-along.contract';

export function ReadingTogether({ slug, className }: { slug: string; className?: string | undefined }) {
  const { t } = useTranslation('read-alongs');
  const fmt = useLocaleFormat();
  const list = useQuery({ ...apiQuery(listReadAlongsApi, { params: { slug } }), retry: false });
  const rows = (list.data?.readAlongs ?? []).filter((r) => r.status !== 'done');
  const arrival = useArrival(list.data !== undefined);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={t('line-label', { defaultValue: 'Reading together' })}
      className={cn('flex flex-col gap-1 border-b border-site-border px-4 py-3', arrival, className)}
    >
      <h2 className="t-label">{t('line-heading', { defaultValue: 'Reading together' })}</h2>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.id} className="t-body">
            <Link to="/c/$slug/read/$id" params={{ slug, id: r.id }} className="underline" dir="auto">
              {r.bookTitle}
            </Link>
            <span className="t-meta">
              {' · '}
              {t('line-progress', {
                opened: r.openedCount,
                total: r.partCount,
                defaultValue: '{{opened}} of {{total}} parts',
              })}
              {r.status === 'paused'
                ? ` · ${t('line-paused', { defaultValue: 'paused' })}`
                : r.nextOpensAt
                  ? ` · ${t('line-next', { date: fmt.dateTime(r.nextOpensAt), defaultValue: 'next part {{date}}' })}`
                  : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
