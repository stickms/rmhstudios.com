import { useTranslation } from 'react-i18next';
import { ResultRow } from '@/components/admin/LookupResults';
import type { LookupBatchGroup } from '@/lib/admin/lookup';

/**
 * The plain-text table "Copy results" puts on the clipboard: one line per match (or one line for an
 * item that matched nothing), tab-separated: input, kind or outcome, states, public link.
 */
export function resultsToText(groups: readonly LookupBatchGroup[], origin: string): string {
  const lines: string[] = [];
  for (const g of groups) {
    if (g.results.length === 0) {
      lines.push([g.input, g.outcome, '', ''].join('\t'));
      continue;
    }
    for (const r of g.results)
      lines.push(
        [g.input, r.kind, r.states.map((s) => s.state).join(' '), r.publicPath ? `${origin}${r.publicPath}` : ''].join(
          '\t',
        ),
      );
  }
  return lines.join('\n');
}

/** One group per pasted item, in order, on rules; an ambiguous item lists each match indented under it. */
export function LookupResultsTable({ groups }: { groups: readonly LookupBatchGroup[] }) {
  const { t } = useTranslation('admin-batch-lookup');
  return (
    <ul className="border-t border-site-border">
      {groups.map((g, i) => (
        <li key={`${i}:${g.input}`} className="border-b border-site-border py-3">
          <p className="t-meta break-all" dir="ltr">
            {g.input}
          </p>
          {g.results.length === 0 ? (
            <p className="t-body mt-1">
              {g.outcome === 'error'
                ? t('item-failed', {
                    defaultValue: 'This item could not be looked up',
                  })
                : g.outcome === 'foreign-link'
                  ? t('foreign-link', {
                      ns: 'admin-lookup',
                      defaultValue: 'Not a link to this site',
                    })
                  : g.outcome === 'unknown-path'
                    ? t('unknown-path', {
                        ns: 'admin-lookup',
                        defaultValue: 'No page with that address',
                      })
                    : g.outcome === 'unrecognised'
                      ? t('unrecognised-title', {
                          ns: 'admin-lookup',
                          defaultValue: 'Not something to look up',
                        })
                      : t('nothing-found', {
                          ns: 'admin-lookup',
                          defaultValue: 'Nothing found',
                        })}
            </p>
          ) : (
            <>
              {g.results.length > 1 ? (
                <p className="t-meta mt-1">
                  {t('ambiguous', {
                    count: g.results.length,
                    defaultValue: 'Matches {{count}} things',
                  })}
                </p>
              ) : null}
              <ul className={g.results.length > 1 ? 'ms-4' : undefined}>
                {g.results.map((r) => (
                  <ResultRow key={`${r.kind}:${r.id}`} r={r} />
                ))}
              </ul>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
