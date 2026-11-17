/**
 * /rmh-research/archive — the archive, searched the way a scholar index is.
 *
 * A working tool, so no pinned scenes. Every piece of state is in the URL
 * (`parseArchiveSearch` in lib/rmh-research/search.ts), so a search is a link,
 * renders on the server, and the forms work as plain GET forms before the page
 * hydrates. Filters are real links marked `aria-current`, not a tab strip.
 */
import { useMemo, type FormEvent, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ARCHIVE_STATS, getAuthor } from '@/lib/rmh-research/catalog';
import { FIELDS } from '@/lib/rmh-research/fields';
import {
  pageWindow,
  paginate,
  searchArchive,
  type ArchiveSearch,
  type ArchiveSort,
} from '@/lib/rmh-research/search';
import type { FieldId, PaperKind } from '@/lib/rmh-research/types';
import { Crumbs, PaperRow, useFieldLabels, useNumber } from './shared';

const route = getRouteApi('/rmh-research/archive');
const PATH = '/rmh-research/archive';
/**
 * The router marks a link active when its search is a SUBSET of the current one,
 * which would light "page 1" and the author chip on every filtered view. Every
 * link here compares the whole search instead.
 */
const EXACT = { exact: true } as const;

/** Drop unset keys, so a link carries only the params that mean something. */
function clean(s: ArchiveSearch): ArchiveSearch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== '') out[k] = v;
  return out as ArchiveSearch;
}

/** The current search with `patch` applied; any change of filter goes back to page 1. */
function withPatch(s: ArchiveSearch, patch: Partial<Record<keyof ArchiveSearch, unknown>>): ArchiveSearch {
  return clean({ ...s, page: undefined, ...patch } as ArchiveSearch);
}

/** The params a form does not set itself, carried as hidden inputs so a GET form keeps them. */
function Hidden({ search, omit }: { search: ArchiveSearch; omit: readonly (keyof ArchiveSearch)[] }) {
  return (
    <>
      {(Object.entries(search) as [keyof ArchiveSearch, unknown][])
        .filter(([k, v]) => !omit.includes(k) && k !== 'page' && v !== undefined)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}
    </>
  );
}

function Opt({ on, to, count, children }: { on: boolean; to: ArchiveSearch; count?: number; children: ReactNode }) {
  const n = useNumber();
  return (
    <li>
      <Link
        className={`arc-opt${on ? ' is-on' : ''}${count === 0 ? ' is-empty' : ''}`}
        to={PATH}
        activeOptions={EXACT}
        search={to}
        aria-current={on ? 'true' : undefined}
      >
        <span className="arc-opt-k">{children}</span>
        {count !== undefined ? <span className="arc-opt-n num">{n(count)}</span> : null}
      </Link>
    </li>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="arc-group" role="group" aria-labelledby={id}>
      <h3 className="label arc-group-h" id={id}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ArchivePage() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const search = route.useSearch();
  const navigate = useNavigate();

  const query = useMemo(
    () => ({
      q: search.q,
      field: search.field,
      author: search.author,
      from: search.from,
      to: search.to,
      kind: search.kind,
      sort: search.sort,
    }),
    [search.q, search.field, search.author, search.from, search.to, search.kind, search.sort],
  );
  const results = useMemo(() => searchArchive(query), [query]);
  // Counts for the current query with that one filter lifted, the way a scholar index shows them.
  const fieldCounts = useMemo(() => {
    const counts = new Map<FieldId, number>();
    for (const p of searchArchive({ ...query, field: undefined })) counts.set(p.field, (counts.get(p.field) ?? 0) + 1);
    return counts;
  }, [query]);
  const kindCounts = useMemo(() => {
    const all = searchArchive({ ...query, kind: undefined });
    const reports = all.filter((p) => p.kind === 'report').length;
    return { all: all.length, paper: all.length - reports, report: reports };
  }, [query]);
  const anyField = useMemo(() => [...fieldCounts.values()].reduce((a, b) => a + b, 0), [fieldCounts]);

  const { page, pages, start, end } = paginate(results.length, search.page ?? 1);
  const shown = results.slice(start, end);

  const sort: ArchiveSort = search.sort ?? (search.q ? 'relevance' : 'resonance');
  const defaultSort: ArchiveSort = search.q ? 'relevance' : 'resonance';
  const sortTo = (s: ArchiveSort) => withPatch(search, { sort: s === defaultSort ? undefined : s });

  const horizon = ARCHIVE_STATS.to;
  const presets = [...new Set([horizon, horizon - 1, horizon - 4])].filter((y) => y >= ARCHIVE_STATS.from);
  const presetOn = search.to === undefined && search.from !== undefined && presets.includes(search.from);
  const customOn = (search.from !== undefined || search.to !== undefined) && !presetOn;

  const author = search.author ? getAuthor(search.author) : undefined;
  const authorName = author?.name ?? search.author;
  const filtered = Boolean(search.field || search.author || search.from || search.to || search.kind);

  const submitQuery = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    void navigate({ to: PATH, search: withPatch(search, { q: q || undefined }) });
  };
  const submitRange = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const year = (v: FormDataEntryValue | null) => {
      const y = Number(v);
      return v && Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : undefined;
    };
    let from = year(data.get('from'));
    let to = year(data.get('to'));
    if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
    void navigate({ to: PATH, search: withPatch(search, { from, to }) });
  };

  const sorts: { id: ArchiveSort; label: string }[] = [
    ...(search.q ? [{ id: 'relevance' as const, label: t('arc-sort-relevance', { defaultValue: 'Relevance' }) }] : []),
    { id: 'resonance', label: t('arc-sort-resonance', { defaultValue: 'Resonance' }) },
    { id: 'cited', label: t('arc-sort-cited', { defaultValue: 'Cited by' }) },
    { id: 'newest', label: t('arc-sort-newest', { defaultValue: 'Newest' }) },
    { id: 'oldest', label: t('arc-sort-oldest', { defaultValue: 'Oldest' }) },
  ];
  const kinds: { id: PaperKind | undefined; label: string; count: number }[] = [
    { id: undefined, label: t('arc-type-all', { defaultValue: 'All types' }), count: kindCounts.all },
    { id: 'paper', label: t('arc-type-papers', { defaultValue: 'Papers' }), count: kindCounts.paper },
    { id: 'report', label: t('arc-type-reports', { defaultValue: 'Reports' }), count: kindCounts.report },
  ];

  return (
    <>
      <header className="pagehead arc-head">
        <div className="wrap">
          <Crumbs items={[{ label: t('nav-archive', { defaultValue: 'Archive' }) }]} />
          <h1 className="h1 arc-title">{t('arc-title', { defaultValue: 'Archive' })}</h1>
          <p className="lede">
            {t('arc-lede', {
              defaultValue: '{{papers}} papers in twelve fields, {{from}} to {{to}}. Search titles, authors, keywords and abstracts.',
              papers: n(ARCHIVE_STATS.papers),
              from: ARCHIVE_STATS.from,
              to: ARCHIVE_STATS.to,
            })}
          </p>
          <form className="arc-search" role="search" action={PATH} method="get" onSubmit={submitQuery}>
            <label className="label" htmlFor="arc-q">
              {t('arc-search-label', { defaultValue: 'Search the archive' })}
            </label>
            <div className="arc-search-row">
              <input
                key={search.q ?? ''}
                id="arc-q"
                className="field field--lg"
                type="search"
                name="q"
                defaultValue={search.q ?? ''}
                placeholder={t('arc-search-placeholder', { defaultValue: 'Title, author, keyword or venue' })}
                autoComplete="off"
                enterKeyHint="search"
                maxLength={200}
              />
              <Hidden search={search} omit={['q', 'sort']} />
              <button className="btn btn--lg" type="submit">
                {t('arc-search-submit', { defaultValue: 'Search' })}
              </button>
            </div>
          </form>
        </div>
      </header>

      <div className="wrap arc-layout">
        <aside className="arc-filters" aria-labelledby="arc-filters-h">
          <div className="arc-filters-head">
            <h2 className="arc-vh" id="arc-filters-h">
              {t('arc-filters-title', { defaultValue: 'Filters' })}
            </h2>
            {filtered ? (
              <Link className="btn-text arc-clear" to={PATH} activeOptions={EXACT} search={clean({ q: search.q, sort: search.sort })}>
                {t('arc-clear-filters', { defaultValue: 'Clear filters' })}
              </Link>
            ) : null}
          </div>

          <Group id="arc-g-field" title={t('arc-group-field', { defaultValue: 'Field' })}>
            <ul className="arc-opts">
              <Opt on={!search.field} to={withPatch(search, { field: undefined })} count={anyField}>
                {t('arc-field-any', { defaultValue: 'Any field' })}
              </Opt>
              {FIELDS.map((f) => (
                <Opt key={f.id} on={search.field === f.id} to={withPatch(search, { field: f.id })} count={fieldCounts.get(f.id) ?? 0}>
                  {labels.name(f.id)}
                </Opt>
              ))}
            </ul>
          </Group>

          <Group id="arc-g-time" title={t('arc-group-time', { defaultValue: 'Time' })}>
            <ul className="arc-opts">
              <Opt on={search.from === undefined && search.to === undefined} to={withPatch(search, { from: undefined, to: undefined })}>
                {t('arc-time-any', { defaultValue: 'Any time' })}
              </Opt>
              {presets.map((y) => (
                <Opt key={y} on={presetOn && search.from === y} to={withPatch(search, { from: y, to: undefined })}>
                  {t('arc-time-since', { defaultValue: 'Since {{year}}', year: y })}
                </Opt>
              ))}
            </ul>
            <details className="arc-custom" open={customOn}>
              <summary className={`arc-opt${customOn ? ' is-on' : ''}`}>
                <span className="arc-opt-k">
                  {customOn
                    ? t('arc-time-custom-on', {
                        defaultValue: '{{from}} to {{to}}',
                        from: search.from ?? ARCHIVE_STATS.from,
                        to: search.to ?? horizon,
                      })
                    : t('arc-time-custom', { defaultValue: 'Custom range' })}
                </span>
              </summary>
              <form className="arc-range" action={PATH} method="get" onSubmit={submitRange}>
                <Hidden search={search} omit={['from', 'to']} />
                <label className="arc-range-f">
                  <span className="meta">{t('arc-time-from', { defaultValue: 'From' })}</span>
                  <input
                    className="field num"
                    type="number"
                    name="from"
                    inputMode="numeric"
                    min={1900}
                    max={2100}
                    placeholder={String(ARCHIVE_STATS.from)}
                    defaultValue={search.from ?? ''}
                    key={`f${search.from ?? ''}`}
                  />
                </label>
                <label className="arc-range-f">
                  <span className="meta">{t('arc-time-to', { defaultValue: 'To' })}</span>
                  <input
                    className="field num"
                    type="number"
                    name="to"
                    inputMode="numeric"
                    min={1900}
                    max={2100}
                    placeholder={String(horizon)}
                    defaultValue={search.to ?? ''}
                    key={`t${search.to ?? ''}`}
                  />
                </label>
                <button className="btn-quiet" type="submit">
                  {t('arc-time-apply', { defaultValue: 'Apply' })}
                </button>
              </form>
            </details>
          </Group>

          <Group id="arc-g-sort" title={t('arc-group-sort', { defaultValue: 'Sort by' })}>
            <ul className="arc-opts">
              {sorts.map((s) => (
                <Opt key={s.id} on={sort === s.id} to={sortTo(s.id)}>
                  {s.label}
                </Opt>
              ))}
            </ul>
          </Group>

          <Group id="arc-g-type" title={t('arc-group-type', { defaultValue: 'Type' })}>
            <ul className="arc-opts">
              {kinds.map((k) => (
                <Opt key={k.id ?? 'all'} on={search.kind === k.id} to={withPatch(search, { kind: k.id })} count={k.count}>
                  {k.label}
                </Opt>
              ))}
            </ul>
          </Group>
        </aside>

        <section className="arc-results" aria-labelledby="arc-results-h">
          <h2 className="arc-vh" id="arc-results-h">
            {t('arc-results-title', { defaultValue: 'Results' })}
          </h2>
          <div className="arc-bar">
            <p className="meta arc-count" aria-live="polite">
              {t('arc-results-count', {
                count: results.length,
                formatted: n(results.length),
                defaultValue_one: '{{formatted}} result',
                defaultValue: '{{formatted}} results',
              })}
              {pages > 1
                ? ` · ${t('arc-results-range', { defaultValue: '{{from}}–{{to}} shown', from: n(start + 1), to: n(end) })}`
                : null}
            </p>
            {search.author ? (
              <Link
                className="chip arc-author"
                to={PATH}
                activeOptions={EXACT}
                search={withPatch(search, { author: undefined })}
                aria-label={t('arc-author-remove', { defaultValue: 'Remove the author filter, {{name}}', name: authorName })}
              >
                <span className="arc-author-k">{t('arc-author-chip', { defaultValue: 'Author' })}</span>
                <span className="arc-author-n">{authorName}</span>
                <X aria-hidden="true" size={14} strokeWidth={1.8} />
              </Link>
            ) : null}
          </div>

          {shown.length > 0 ? (
            <ol className="arc-list" start={start + 1}>
              {shown.map((p) => (
                <PaperRow key={p.id} paper={p} abstract />
              ))}
            </ol>
          ) : (
            <div className="arc-empty">
              <h3 className="h3">{t('arc-empty-title', { defaultValue: 'No papers match this search' })}</h3>
              <ul className="arc-empty-tips body">
                {search.q ? <li>{t('arc-empty-tip-spelling', { defaultValue: 'Check the spelling, or use fewer words.' })}</li> : null}
                <li>{t('arc-empty-tip-prefix', { defaultValue: 'A word matches the start of a word: “reson” finds “resonance”.' })}</li>
                {filtered ? <li>{t('arc-empty-tip-filters', { defaultValue: 'Filters narrow every search. Lift one, or clear them all.' })}</li> : null}
              </ul>
              <div className="actions">
                {filtered ? (
                  <Link className="btn-quiet" to={PATH} activeOptions={EXACT} search={clean({ q: search.q })}>
                    {t('arc-clear-filters', { defaultValue: 'Clear filters' })}
                  </Link>
                ) : null}
                {search.q || filtered ? (
                  <Link className="btn-text" to={PATH} activeOptions={EXACT} search={{}}>
                    {t('arc-empty-all', { defaultValue: 'Browse the whole archive' })}
                  </Link>
                ) : null}
              </div>
            </div>
          )}

          {pages > 1 ? (
            <nav className="arc-pager" aria-label={t('arc-pager-label', { defaultValue: 'Result pages' })}>
              {page > 1 ? (
                <Link className="btn-text arc-pg-step" to={PATH} activeOptions={EXACT} search={clean({ ...search, page: page - 1 > 1 ? page - 1 : undefined })} rel="prev">
                  <span aria-hidden="true" className="arc-pg-arw">
                    ←
                  </span>
                  {t('arc-pager-prev', { defaultValue: 'Previous' })}
                </Link>
              ) : (
                <span className="arc-pg-step is-off" aria-hidden="true">
                  <span className="arc-pg-arw">←</span>
                  {t('arc-pager-prev', { defaultValue: 'Previous' })}
                </span>
              )}
              <ol className="arc-pages">
                {pageWindow(page, pages).map((p, i) =>
                  p === null ? (
                    <li key={`gap${i}`} className="arc-pg-gap meta" aria-hidden="true">
                      …
                    </li>
                  ) : (
                    <li key={p}>
                      <Link
                        className="arc-pg num"
                        to={PATH}
                        activeOptions={EXACT}
                        search={clean({ ...search, page: p > 1 ? p : undefined })}
                        aria-current={p === page ? 'page' : undefined}
                        aria-label={t('arc-pager-page', { defaultValue: 'Page {{page}}', page: p })}
                      >
                        {n(p)}
                      </Link>
                    </li>
                  ),
                )}
              </ol>
              {page < pages ? (
                <Link className="btn-text arc-pg-step" to={PATH} activeOptions={EXACT} search={clean({ ...search, page: page + 1 })} rel="next">
                  {t('arc-pager-next', { defaultValue: 'Next' })}
                  <span aria-hidden="true" className="arc-pg-arw">
                    →
                  </span>
                </Link>
              ) : (
                <span className="arc-pg-step is-off" aria-hidden="true">
                  {t('arc-pager-next', { defaultValue: 'Next' })}
                  <span className="arc-pg-arw">→</span>
                </span>
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </>
  );
}
