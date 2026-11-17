/**
 * /rmh-research/paper/$paperId — one archive entry in full.
 *
 * Head (crumbs, title, byline, venue · year · field · kind), the abstract and
 * its keywords, the citation (reference and BibTeX, each copyable), then the
 * page's one pinned scene: the paper's resonance built bar by bar, from every
 * citation down to the number the r-index counts. In flow mode (no scroll
 * timeline, or motion off) the scene is a plain section with every bar drawn.
 * Then who cites it, what it cites, and related work in its field.
 */
import { useMemo } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { authorsOf, citedBy, getPaper, referencesOf, resonanceOf } from '@/lib/rmh-research/catalog';
import { bibtex, formatReference } from '@/lib/rmh-research/cite';
import { relatedPapers } from '@/lib/rmh-research/search';
import type { Paper } from '@/lib/rmh-research/types';
import { Arrow, AuthorNames, Crumbs, cssVars, FieldChip, NS, PaperRow, Scene, SceneDots, stepWindow, useFieldLabels, useNumber } from './shared';

const route = getRouteApi('/rmh-research/paper/$paperId');
const SITE = 'https://rmhstudios.com';

function useCopy() {
  const { t } = useTranslation(NS);
  return (text: string, done: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error(t('pap-copy-failed', { defaultValue: 'Could not copy. Select the text and copy it instead.' }));
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast.success(done),
      () => toast.error(t('pap-copy-failed', { defaultValue: 'Could not copy. Select the text and copy it instead.' })),
    );
  };
}

/** The resonance breakdown, pinned: one bar per stage, then the score. */
function ResonanceScene({ paper }: { paper: Paper }) {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const r = resonanceOf(paper.id);
  const max = Math.max(r.raw, r.score, 1);
  const rows = [
    {
      key: 'raw',
      label: t('pap-res-raw', { defaultValue: 'Every citation' }),
      value: r.raw,
      why: t('pap-res-raw-why', { defaultValue: 'Each paper in the archive that cites this one. This is what an h-index counts.' }),
    },
    {
      key: 'independent',
      label: t('pap-res-independent', { defaultValue: 'Independent' }),
      value: r.independent,
      why: t('pap-res-independent-why', { defaultValue: 'Citing papers that share no author with this one. Self-citation says nothing.' }),
    },
    {
      key: 'live',
      label: t('pap-res-live', { defaultValue: 'Live' }),
      value: r.live,
      why: t('pap-res-live-why', { defaultValue: 'Independent citations from work that was itself built on, or is too recent to have been.' }),
    },
    {
      key: 'carried',
      label: t('pap-res-carried', { defaultValue: 'Carried' }),
      value: r.carried,
      why: t('pap-res-carried-why', { defaultValue: 'Live citations from another field. Each one counts twice.' }),
    },
    {
      key: 'score',
      label: t('pap-res-score', { defaultValue: 'Resonance' }),
      value: r.score,
      why: t('pap-res-score-why', {
        defaultValue: '{{live}} live, plus {{carried}} carried counted once more.',
        live: n(r.live),
        carried: n(r.carried),
      }),
    },
  ];
  const steps = rows.length + 1;
  const end = stepWindow(steps - 1, steps);

  return (
    <Scene len={4} steps={steps} className="pap-scene" pinClassName="pap-pin" aria-labelledby="pap-res-h">
      <div className="wrap pap-res">
        <header className="pap-res-head">
          <span className="label">{t('resonance-label', { defaultValue: 'Resonance' })}</span>
          <h2 className="h2" id="pap-res-h">
            {t('pap-res-title', { defaultValue: 'How far this paper travelled' })}
          </h2>
        </header>
        <ol className="pap-bars">
          {rows.map((row, i) => {
            const w = stepWindow(i, steps);
            const pos = i === 0 ? ' is-first' : row.key === 'score' ? ' is-last' : '';
            return (
              <li
                key={row.key}
                className={`pap-bar sc-live sc-t${pos}${row.key === 'score' ? ' is-score' : ''}`}
                style={cssVars({ '--a': w.a, '--b': w.b, '--v': row.value / max })}
              >
                <div className="pap-bar-top">
                  <span className="pap-bar-k">{row.label}</span>
                  <span className="pap-bar-n num">{n(row.value)}</span>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <div className="pap-fill" />
                </div>
                <p className="pap-bar-why">{row.why}</p>
              </li>
            );
          })}
        </ol>
        <div className="pap-res-end sc-in" data-step="" style={cssVars({ '--a': end.a, '--b': end.a + (end.b - end.a) / 2 })}>
          <p className="pap-res-score">
            {t('resonance-label', { defaultValue: 'Resonance' })} <span className="num">{n(r.score)}</span>
          </p>
          <Link className="btn-text" to="/rmh-research/r-index">
            {t('pap-res-link', { defaultValue: 'How the r-index counts' })}
            <Arrow />
          </Link>
        </div>
        <div className="pap-res-prog" aria-hidden="true">
          <SceneDots count={steps} />
          <div className="scene-rail" />
        </div>
      </div>
    </Scene>
  );
}

function ListSection({
  id,
  title,
  count,
  papers,
  empty,
}: {
  id: string;
  title: string;
  count: string;
  papers: readonly Paper[];
  empty: string;
}) {
  return (
    <section className="sec sec--tight sec--rule" id={id} aria-labelledby={`${id}-h`}>
      <div className="wrap">
        <header className="pap-list-head">
          <h2 className="h2" id={`${id}-h`}>
            {title}
          </h2>
          <span className="meta">{count}</span>
        </header>
        {papers.length ? (
          <ol className="pap-list">
            {papers.map((p) => (
              <PaperRow key={p.id} paper={p} />
            ))}
          </ol>
        ) : (
          <p className="body mute">{empty}</p>
        )}
      </div>
    </section>
  );
}

export default function PaperPage() {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const labels = useFieldLabels();
  const copy = useCopy();
  const { paperId } = route.useParams();
  const paper = getPaper(paperId);

  const data = useMemo(() => {
    if (!paper) return null;
    const authors = authorsOf(paper);
    const url = `${SITE}/rmh-research/paper/${paper.id}`;
    return {
      authors,
      reference: formatReference(paper, authors),
      bib: bibtex(paper, authors, url),
      citing: citedBy(paper.id),
      refs: referencesOf(paper),
      related: relatedPapers(paper, 5),
      res: resonanceOf(paper.id),
    };
  }, [paper]);

  // The loader throws notFound() first; this only satisfies the type.
  if (!paper || !data) return null;
  const { authors, reference, bib, citing, refs, related, res } = data;
  const papersCount = (count: number) =>
    t('pap-papers-count', { count, formatted: n(count), defaultValue_one: '{{formatted}} paper', defaultValue: '{{formatted}} papers' });

  return (
    <>
      <header className="pagehead pap-head">
        <div className="wrap">
          <Crumbs
            items={[
              { label: t('nav-archive', { defaultValue: 'Archive' }), to: '/rmh-research/archive' },
              { label: labels.name(paper.field), to: `/rmh-research/archive?field=${paper.field}` },
            ]}
          />
          <h1 className="pap-title">{paper.title}</h1>
          <p className="pap-by">
            <AuthorNames paper={paper} authors={authors} />
          </p>
          <p className="pap-meta meta">
            <span>{paper.venue}</span>
            <span className="num">{paper.year}</span>
            <FieldChip field={paper.field} />
            <span className="chip">
              {paper.kind === 'report' ? t('kind-report', { defaultValue: 'Report' }) : t('kind-paper', { defaultValue: 'Paper' })}
            </span>
          </p>
          <p className="pap-figs meta">
            <a href="#cited-by">{t('cited-by-count', { defaultValue: 'Cited by {{count}}', count: res.raw, formatted: n(res.raw) })}</a>
            <span>
              {t('resonance-label', { defaultValue: 'Resonance' })} <b className="num">{n(res.score)}</b>
            </span>
            <a href="#references">
              {t('pap-refs-count', {
                count: refs.length,
                formatted: n(refs.length),
                defaultValue_one: '{{formatted}} reference',
                defaultValue: '{{formatted}} references',
              })}
            </a>
          </p>
          {paper.kind === 'report' && paper.href ? (
            <div className="actions">
              <a className="btn btn--lg" href={paper.href}>
                {t('pap-read-report', { defaultValue: 'Read the full report' })}
                <Arrow />
              </a>
            </div>
          ) : null}
        </div>
      </header>

      <section className="sec sec--tight" aria-labelledby="pap-abs-h">
        <div className="wrap split">
          <div className="split-aside">
            <h2 className="label" id="pap-abs-h">
              {t('pap-abstract', { defaultValue: 'Abstract' })}
            </h2>
          </div>
          <div className="split-main stack-m">
            <div className="prose pap-abs">
              <p>{paper.abstract}</p>
            </div>
            <div className="stack-s">
              <h3 className="label">{t('pap-keywords', { defaultValue: 'Keywords' })}</h3>
              <ul className="chips">
                {paper.keywords.map((k) => (
                  <li key={k}>
                    <Link className="chip pap-kw" to="/rmh-research/archive" search={{ q: k }}>
                      {k}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--tight sec--rule" aria-labelledby="pap-cite-h">
        <div className="wrap split">
          <div className="split-aside">
            <h2 className="label" id="pap-cite-h">
              {t('pap-cite', { defaultValue: 'Cite' })}
            </h2>
          </div>
          <div className="split-main pap-cite">
            <div className="pap-cite-block">
              <div className="pap-cite-row">
                <h3 className="h3">{t('pap-cite-reference', { defaultValue: 'Reference' })}</h3>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => copy(reference, t('pap-copied-reference', { defaultValue: 'Reference copied' }))}
                >
                  {t('pap-copy-reference', { defaultValue: 'Copy reference' })}
                </button>
              </div>
              <p className="pap-ref">{reference}</p>
            </div>
            <div className="pap-cite-block">
              <div className="pap-cite-row">
                <h3 className="h3">BibTeX</h3>
                <button type="button" className="btn-quiet" onClick={() => copy(bib, t('pap-copied-bibtex', { defaultValue: 'BibTeX copied' }))}>
                  {t('pap-copy-bibtex', { defaultValue: 'Copy BibTeX' })}
                </button>
              </div>
              <pre className="pap-bib" tabIndex={0} aria-label={t('pap-bibtex-label', { defaultValue: 'BibTeX entry' })}>
                <code>{bib}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {res.raw > 0 ? (
        <ResonanceScene paper={paper} />
      ) : (
        <section className="sec sec--tight sec--rule" aria-labelledby="pap-res-none-h">
          <div className="wrap split">
            <div className="split-aside">
              <h2 className="label" id="pap-res-none-h">
                {t('resonance-label', { defaultValue: 'Resonance' })}
              </h2>
            </div>
            <p className="split-main body">
              {t('pap-res-none', { defaultValue: 'Nothing in the archive cites this paper yet, so it has no resonance to break down.' })}{' '}
              <Link className="link" to="/rmh-research/r-index">
                {t('pap-res-link', { defaultValue: 'How the r-index counts' })}
              </Link>
            </p>
          </div>
        </section>
      )}

      <ListSection
        id="cited-by"
        title={t('pap-cited-by-title', { defaultValue: 'Cited by' })}
        count={papersCount(citing.length)}
        papers={citing}
        empty={t('pap-cited-by-empty', { defaultValue: 'No paper in the archive cites this one yet.' })}
      />
      <ListSection
        id="references"
        title={t('pap-references-title', { defaultValue: 'References' })}
        count={papersCount(refs.length)}
        papers={refs}
        empty={t('pap-references-empty', { defaultValue: 'This paper cites nothing in the archive.' })}
      />
      {related.length ? (
        <ListSection
          id="related"
          title={t('pap-related-title', { defaultValue: 'Related' })}
          count={t('pap-related-note', { defaultValue: 'Same field, most shared keywords' })}
          papers={related}
          empty=""
        />
      ) : null}
    </>
  );
}
