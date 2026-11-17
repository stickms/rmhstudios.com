/**
 * RMH Research — /authors: the r-index ranking, laid out like a scholar
 * profile list. Field filter and sort live in the URL (`validateSearch` on the
 * route), as buttons with `aria-pressed`. On phones a row is name + h and r.
 */
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AUTHOR_SORTS, sortAuthors, type AuthorSort } from '@/lib/rmh-research/catalog';
import { FIELDS } from '@/lib/rmh-research/fields';
import { FieldChip, PageHead, useFieldLabels, useNumber } from './shared';

const route = getRouteApi('/rmh-research/authors/');

export default function AuthorsPage() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/rmh-research/authors/' });
  const sort: AuthorSort = search.sort ?? 'r';
  const field = search.field;
  const rows = sortAuthors(sort, field);

  const SORT_LABELS: Record<AuthorSort, string> = {
    r: t('aut-sort-r', { defaultValue: 'r-index' }),
    h: t('aut-sort-h', { defaultValue: 'h-index' }),
    citations: t('aut-sort-citations', { defaultValue: 'Citations' }),
    papers: t('aut-sort-papers', { defaultValue: 'Papers' }),
    name: t('aut-sort-name', { defaultValue: 'Name' }),
  };

  const go = (next: { field?: typeof field; sort?: AuthorSort }) =>
    void navigate({ search: { field: next.field, sort: next.sort === 'r' ? undefined : next.sort }, replace: true, resetScroll: false });

  return (
    <>
      <PageHead
        crumbs={[{ label: t('nav-authors', { defaultValue: 'Authors' }) }]}
        title={t('aut-title', { defaultValue: 'Authors' })}
        lede={t('aut-lede', { defaultValue: 'Everyone who publishes with RMH Research, ranked by the r-index of their body of work.' })}
      >
        <p className="aut-note">
          <Link className="link" to="/rmh-research/r-index">
            {t('aut-note-link', { defaultValue: 'How the r-index is counted, and how it differs from h' })}
          </Link>
        </p>
      </PageHead>

      <section className="sec sec--tight" aria-label={t('aut-list-label', { defaultValue: 'Author ranking' })}>
        <div className="wrap">
          <div className="aut-controls">
            <div className="aut-group" role="group" aria-label={t('aut-filter-label', { defaultValue: 'Filter by field' })}>
              <span className="label">{t('aut-filter-heading', { defaultValue: 'Field' })}</span>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!field} onClick={() => go({ sort })}>
                  {t('aut-all-fields', { defaultValue: 'All' })}
                </button>
                {FIELDS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="chip"
                    aria-pressed={field === f.id}
                    aria-label={labels.name(f.id)}
                    title={labels.name(f.id)}
                    onClick={() => go({ field: field === f.id ? undefined : f.id, sort })}
                  >
                    {f.code}
                  </button>
                ))}
              </div>
            </div>
            <div className="aut-group" role="group" aria-label={t('aut-sort-label', { defaultValue: 'Sort by' })}>
              <span className="label">{t('aut-sort-heading', { defaultValue: 'Sort' })}</span>
              <div className="chips">
                {AUTHOR_SORTS.map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={sort === s} onClick={() => go({ field, sort: s })}>
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="meta aut-count" role="status">
            {t('aut-count', { defaultValue: 'Authors shown: {{value}}', value: n(rows.length) })}
            {field ? ` · ${labels.name(field)}` : ''}
          </p>

          {rows.length > 0 ? (
            <>
              <div className="aut-head meta" aria-hidden="true">
                <span>#</span>
                <span>{t('aut-col-name', { defaultValue: 'Name' })}</span>
                <span>{t('aut-col-field', { defaultValue: 'Field' })}</span>
                <span>{t('aut-col-papers', { defaultValue: 'Papers' })}</span>
                <span>{t('aut-col-citations', { defaultValue: 'Citations' })}</span>
                <span>h</span>
                <span>r</span>
              </div>
              <ol className="rows aut-list">
                {rows.map((m) => (
                  <li key={m.author.id} className="row aut-row">
                    <span className="aut-rank num">{n(m.rank)}</span>
                    <span className="aut-who">
                      <Link className="h3 aut-name" to="/rmh-research/authors/$authorId" params={{ authorId: m.author.id }}>
                        {m.author.name}
                      </Link>
                      <span className="meta">
                        {m.author.role} · {m.author.lab}
                      </span>
                    </span>
                    <span className="aut-field">
                      <FieldChip field={m.author.field} />
                    </span>
                    <span className="aut-cell aut-opt">
                      <span className="aut-k meta">{t('aut-col-papers', { defaultValue: 'Papers' })}</span>
                      <span className="num">{n(m.papers)}</span>
                    </span>
                    <span className="aut-cell aut-opt">
                      <span className="aut-k meta">{t('aut-col-citations', { defaultValue: 'Citations' })}</span>
                      <span className="num">{n(m.citations)}</span>
                    </span>
                    <span className="aut-cell">
                      <span className="aut-k meta">h</span>
                      <span className="num">{n(m.h)}</span>
                    </span>
                    <span className="aut-cell aut-r">
                      <span className="aut-k meta">r</span>
                      <b className="num">{n(m.r)}</b>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="body mute aut-empty">{t('aut-empty', { defaultValue: 'No authors have this field as a home field yet.' })}</p>
          )}
        </div>
      </section>
    </>
  );
}
