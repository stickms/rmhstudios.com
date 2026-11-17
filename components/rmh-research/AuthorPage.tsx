/**
 * RMH Research — one author: the numbers, the pinned "r-core" scene (the
 * author's papers as bars sorted by resonance, the r×r square, the core
 * marked, beside the same for raw citations and h), then papers and co-authors.
 */
import { Link, getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authorMetrics, coauthorsOf, getAuthor, papersByAuthor, resonanceOf } from '@/lib/rmh-research/catalog';
import { Arrow, cssVars, FieldChip, PageHead, PaperRow, Scene, SceneDots, SecHead, Stat, Step, useFieldLabels, useNumber } from './shared';

const route = getRouteApi('/rmh-research/authors/$authorId');
const MAX_BARS = 32;

function CoreChart({ title, values, cut, symbol, unit }: { title: string; values: number[]; cut: number; symbol: string; unit: string }) {
  const { t } = useTranslation('c-rmh-research');
  const bars = values.slice(0, MAX_BARS);
  const N = Math.max(bars.length, 1);
  const k = Math.min(cut, bars.length);
  const max = Math.max(bars[0] ?? 0, k, 1);
  return (
    <figure className="aut-fig">
      <figcaption className="aut-figcap">
        <span className="label">{title}</span>
        <span className="meta num">
          {symbol} = {cut}
        </span>
      </figcaption>
      <div
        className="aut-plot"
        role="img"
        aria-label={t('aut-chart-label', {
          defaultValue: '{{title}}: {{papers}} papers ranked, with {{symbol}} equal to {{cut}}.',
          title,
          papers: bars.length,
          symbol,
          cut,
        })}
      >
        <div className="aut-bars" aria-hidden="true">
          {bars.map((v, i) => {
            const a = Math.round((i * 30) / N);
            return (
              <div key={i} className="aut-bar sc-t" style={cssVars({ '--a': a + 4, '--b': a + 34, '--v': v / max })}>
                <i className="aut-bf">{i < k ? <i className="aut-cf sc-t" style={cssVars({ '--a': 74, '--b': 92 })} /> : null}</i>
              </div>
            );
          })}
        </div>
        {k > 0 ? (
          <>
            <i className="aut-sq sc-t" style={cssVars({ '--a': 48, '--b': 68, '--sw': k / N, '--sh': k / max })} aria-hidden="true" />
            <i className="aut-line sc-t" style={cssVars({ '--a': 48, '--b': 68, '--sh': k / max })} aria-hidden="true" />
          </>
        ) : null}
      </div>
      <p className="meta aut-axis">
        <span>{unit}</span>
        <span className="num">{values[0] ?? 0}</span>
      </p>
    </figure>
  );
}

export default function AuthorPage() {
  const { authorId } = route.useParams();
  const author = getAuthor(authorId);
  const m = authorMetrics(authorId);
  if (!author || !m) return null;
  return <AuthorBody authorId={authorId} />;
}

function AuthorBody({ authorId }: { authorId: string }) {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const author = getAuthor(authorId)!;
  const m = authorMetrics(authorId)!;
  const papers = papersByAuthor(authorId);
  const co = coauthorsOf(authorId);
  const byRes = papers.map((p) => resonanceOf(p.id).score).sort((a, b) => b - a);
  const byRaw = papers.map((p) => resonanceOf(p.id).raw).sort((a, b) => b - a);

  const why =
    m.r === m.h
      ? t('aut-why-same', { defaultValue: 'Here r and h match: the papers cited most are the papers that resonate most, so discounting self-citation, dead ends and reach changes nothing.' })
      : m.r < m.h
        ? t('aut-why-lower', { defaultValue: 'Here r is below h: part of the citations behind h come from co-authors or from papers nobody built on, and the r-index does not count them.' })
        : t('aut-why-higher', { defaultValue: 'Here r is above h: citations from other fields count double in resonance, and this work travelled outside its own field.' });

  return (
    <>
      <PageHead
        crumbs={[{ label: t('nav-authors', { defaultValue: 'Authors' }), to: '/rmh-research/authors' }, { label: author.name }]}
        title={author.name}
        lede={
          <>
            {author.role} · {author.lab} · {labels.name(author.field)}
          </>
        }
      >
        <p className="meta aut-since">{t('aut-since', { defaultValue: 'With RMH Research since {{year}}', year: author.since })}</p>
        <div className="stats aut-stats" style={cssVars({ '--stats': 6 })}>
          <Stat value={n(m.r)} label={t('aut-stat-r', { defaultValue: 'r-index' })} />
          <Stat value={n(m.h)} label={t('aut-stat-h', { defaultValue: 'h-index' })} />
          <Stat value={n(m.papers)} label={t('aut-stat-papers', { defaultValue: 'Papers' })} />
          <Stat value={n(m.citations)} label={t('aut-stat-citations', { defaultValue: 'Citations' })} />
          <Stat value={n(m.resonance)} label={t('aut-stat-resonance', { defaultValue: 'Resonance' })} />
          <Stat value={n(m.rank)} label={t('aut-stat-rank', { defaultValue: 'Rank by r-index' })} />
        </div>
      </PageHead>

      {papers.length > 0 ? (
        <Scene len={3.4} steps={3} className="aut-scene" pinClassName="aut-pin">
          <div className="wrap aut-in">
            <div className="aut-intro">
              <span className="label">{t('aut-core-label', { defaultValue: 'The r-core' })}</span>
              <h2 className="h2">{t('aut-core-title', { defaultValue: 'Which papers carry the index' })}</h2>
              <div className="sc-stack aut-caps">
                <Step index={0} count={3} className="aut-cap">
                  <p className="body">{t('aut-cap-1', { defaultValue: 'Every paper is a bar, longest first. On the left a bar is a paper’s resonance; on the right, its raw citations.' })}</p>
                </Step>
                <Step index={1} count={3} className="aut-cap">
                  <p className="body">{t('aut-cap-2', { defaultValue: 'The index is the largest number r for which r papers each reach r. The square marks that cut.' })}</p>
                </Step>
                <Step index={2} count={3} className="aut-cap">
                  <p className="body">
                    {t('aut-cap-3', { defaultValue: 'The papers inside the square are the core.' })} {why}
                  </p>
                </Step>
              </div>
            </div>
            <div className="aut-figs">
              <CoreChart title={t('aut-fig-r', { defaultValue: 'Resonance' })} values={byRes} cut={m.r} symbol="r" unit={t('aut-axis-r', { defaultValue: 'Papers by resonance, highest' })} />
              <CoreChart title={t('aut-fig-h', { defaultValue: 'Raw citations' })} values={byRaw} cut={m.h} symbol="h" unit={t('aut-axis-h', { defaultValue: 'Papers by citations, highest' })} />
            </div>
          </div>
          <div className="wrap aut-prog">
            <SceneDots count={3} />
            <i className="scene-rail" aria-hidden="true" />
          </div>
        </Scene>
      ) : (
        <section className="sec sec--tight">
          <div className="wrap">
            <p className="body mute">{t('aut-no-papers', { defaultValue: 'No papers in the archive yet.' })}</p>
          </div>
        </section>
      )}

      <section className="sec sec--rule" aria-labelledby="aut-papers">
        <div className="wrap split">
          <div className="split-aside aut-aside">
            <SecHead label={t('aut-papers-label', { defaultValue: 'Papers' })} title={<span id="aut-papers">{t('aut-papers-title', { defaultValue: 'Newest first' })}</span>} />
          </div>
          <div className="split-main">
            <ul className="rows">
              {papers.map((p) => (
                <PaperRow key={p.id} paper={p} />
              ))}
            </ul>
            <p className="aut-more">
              <Link className="btn-text" to="/rmh-research/archive" search={{ author: author.id }}>
                {t('aut-open-archive', { defaultValue: 'Search {{name}} in the archive', name: author.name })}
                <Arrow />
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="sec sec--rule" aria-labelledby="aut-co">
        <div className="wrap split">
          <div className="split-aside aut-aside">
            <SecHead label={t('aut-co-label', { defaultValue: 'Co-authors' })} title={<span id="aut-co">{t('aut-co-title', { defaultValue: 'Who they publish with' })}</span>} />
          </div>
          <div className="split-main">
            {co.length > 0 ? (
              <ul className="rows">
                {co.map(({ author: a, papers: shared }) => (
                  <li key={a.id}>
                    <Link className="row aut-co-row" to="/rmh-research/authors/$authorId" params={{ authorId: a.id }}>
                      <span className="aut-co-who">
                        <span className="h3">{a.name}</span>
                        <span className="meta">
                          {a.role} · {a.lab}
                        </span>
                      </span>
                      <FieldChip field={a.field} plain />
                      <span className="meta">
                        {t('aut-co-shared', { defaultValue: 'Shared papers' })} <b className="num ink">{n(shared)}</b>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="body mute">{t('aut-co-none', { defaultValue: 'No co-authors in the archive.' })}</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
