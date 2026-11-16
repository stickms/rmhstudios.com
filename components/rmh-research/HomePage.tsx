/**
 * RMH Research — home (`/rmh-research`). Sheet: ./pages/home.css (`home-`).
 *
 * Paper and scene alternate, the way a product page does:
 *   1. hero          pinned: the name, two lines, the lede, then the archive's figures
 *   2. fields        pinned: one step per division, its fields listed and linked
 *   3. the archive   a search form and the most resonant papers
 *   4. the r-index   pinned: the archive's most resonant paper, its citations sifted
 *                    step by step (all → independent → live → carried counts twice)
 *   5. authors       the top of the r-index ranking
 *   6. sections and reports
 *
 * Every scene is written in flow mode first (rmh-research.css): with no scroll
 * timeline or with motion off it is an ordinary section with every step shown,
 * and the r-index figure, drawn from `--p`, shows its end state.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ANALYSIS,
  ARCHIVE_STATS,
  AUTHOR_RANKING,
  citedBy,
  fieldStats,
  resonanceOf,
  topPapers,
} from '@/lib/rmh-research/catalog';
import { DIVISIONS, fieldsInDivision } from '@/lib/rmh-research/fields';
import { GRACE_YEARS, isIndependent } from '@/lib/rmh-research/r-index';
import type { Paper } from '@/lib/rmh-research/types';
import {
  Arrow,
  AuthorNames,
  FieldChip,
  NS,
  PaperLink,
  PaperRow,
  Scene,
  SceneDots,
  SecHead,
  Step,
  cssVars,
  stepWindow,
  useFieldLabels,
  useNumber,
} from './shared';

export default function HomePage() {
  return (
    <div className="home">
      <Hero />
      <Fields />
      <Archive />
      <Resonance />
      <Leaders />
      <Sections />
    </div>
  );
}

/* ── 1. hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const s = ARCHIVE_STATS;
  const years = s.to - s.from + 1;
  const stats = [
    { k: 'papers', v: n(s.papers), l: t('home-stat-papers', { defaultValue: 'Papers and reports' }) },
    { k: 'authors', v: n(s.authors), l: t('home-stat-authors', { defaultValue: 'Authors' }) },
    { k: 'fields', v: n(s.fields), l: t('home-stat-fields', { defaultValue: 'Fields' }) },
    { k: 'citations', v: n(s.citations), l: t('home-stat-citations', { defaultValue: 'Citations inside the archive' }) },
    {
      k: 'years',
      v: n(years),
      l: t('home-stat-years', { defaultValue: 'Years, {{from}} to {{to}}', from: String(s.from), to: String(s.to) }),
    },
  ];

  return (
    <Scene len={3.2} className="home-hero" pinClassName="home-hero-pin">
      <div className="wrap home-hero-wrap">
        <div className="sc-stack home-hero-stack">
          <div className="home-hero-a sc-out" style={cssVars({ '--a': 56, '--b': 66 })}>
            <p className="label home-kicker">{t('home-hero-kicker', { defaultValue: 'The research institute of RMH Studios' })}</p>
            <h1 className="display home-title">RMH Research</h1>
            <p className="home-line sc-in" style={cssVars({ '--a': 8, '--b': 20 })}>
              {t('home-hero-line-1', { defaultValue: 'Every field. One archive.' })}
            </p>
            <p className="home-line home-line--mute sc-in" style={cssVars({ '--a': 20, '--b': 32 })}>
              {t('home-hero-line-2', { defaultValue: 'One number for how far a result travelled.' })}
            </p>
            <p className="lede home-lede sc-in" style={cssVars({ '--a': 32, '--b': 44 })}>
              {t('home-hero-lede', {
                defaultValue:
                  'RMH Research works across every major scientific field, publishes all of it in one open archive, and measures it with the r-index: a count of the citations that came from someone else, led somewhere, and crossed a field.',
              })}
            </p>
          </div>

          <div className="home-hero-b">
            <div className="home-figs-head sc-in" style={cssVars({ '--a': 62, '--b': 70 })}>
              <span className="label">{t('home-figs-label', { defaultValue: 'The archive today' })}</span>
              <h2 className="h2">{t('home-figs-title', { defaultValue: 'Twelve fields, one record.' })}</h2>
            </div>
            <div className="stats home-stats" style={cssVars({ '--stats': stats.length })}>
              {stats.map((x, i) => (
                <div key={x.k} className="stat sc-in" style={cssVars({ '--a': 66 + i * 5, '--b': 76 + i * 5 })}>
                  <span className="stat-v home-stat-v">{x.v}</span>
                  <span className="stat-k">{x.l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="scene-rail home-rail" />
      </div>
    </Scene>
  );
}

/* ── 2. the twelve fields ────────────────────────────────────────────────── */

function Fields() {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const labels = useFieldLabels();
  const count = DIVISIONS.length;

  return (
    <Scene len={count + 1} steps={count} className="home-fields" pinClassName="home-fields-pin">
      <div className="wrap home-fields-wrap">
        <header className="home-fields-head">
          <span className="label">{t('home-fields-label', { defaultValue: 'Twelve fields' })}</span>
          <div className="sechead-row">
            <h2 className="h2">{t('home-fields-title', { defaultValue: 'Every major field, in four divisions.' })}</h2>
            <Link className="btn-text" to="/rmh-research/fields">
              {t('home-fields-all', { defaultValue: 'All fields' })} <Arrow />
            </Link>
          </div>
        </header>

        <div className="home-fields-body">
          <ol className="home-div-index" aria-hidden="true">
            {DIVISIONS.map((d, i) => {
              const { a, b } = stepWindow(i, count);
              const pos = i === 0 ? ' is-first' : i === count - 1 ? ' is-last' : '';
              return (
                <li key={d} className={`sc-live${pos}`} style={cssVars({ '--a': a, '--b': b })}>
                  <span className="meta num">{n(i + 1)}</span>
                  <span>{labels.division(d)}</span>
                </li>
              );
            })}
          </ol>

          <div className="sc-stack home-div-stack">
            {DIVISIONS.map((d, i) => (
              <Step key={d} index={i} count={count} className="home-div">
                <div className="home-div-head">
                  <span className="meta num">
                    {n(i + 1)} / {n(count)}
                  </span>
                  <h3 className="home-div-name">{labels.division(d)}</h3>
                </div>
                <ul className="home-fld-list">
                  {fieldsInDivision(d).map((f) => {
                    const papers = fieldStats(f.id)?.papers ?? 0;
                    return (
                      <li key={f.id}>
                        <Link className="home-fld" to="/rmh-research/fields/$fieldId" params={{ fieldId: f.id }}>
                          <span className="chip home-fld-code">{f.code}</span>
                          <span className="home-fld-text">
                            <span className="home-fld-name">{labels.name(f.id)}</span>
                            <span className="home-fld-blurb">{labels.blurb(f.id)}</span>
                          </span>
                          <span className="meta num home-fld-count">
                            {t('home-field-papers', {
                              count: papers,
                              formatted: n(papers),
                              defaultValue_one: '{{formatted}} paper',
                              defaultValue: '{{formatted}} papers',
                            })}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Step>
            ))}
          </div>
        </div>

        <div className="home-scene-foot">
          <SceneDots count={count} />
          <div className="scene-rail" />
        </div>
      </div>
    </Scene>
  );
}

/* ── 3. the archive ──────────────────────────────────────────────────────── */

function Archive() {
  const { t } = useTranslation(NS);
  const top = topPapers(5);

  return (
    <section className="sec sec--rule home-arc">
      <div className="wrap">
        <SecHead
          label={t('home-arc-label', { defaultValue: 'The archive' })}
          title={t('home-arc-title', { defaultValue: 'Search every paper.' })}
          lede={t('home-arc-lede', {
            defaultValue: 'Titles, abstracts, authors, venues and keywords, across all twelve fields. Every result shows who cited it, and how far it travelled.',
          })}
        />
        <form className="home-search rv" action="/rmh-research/archive" method="get" role="search">
          <label className="label" htmlFor="home-q">
            {t('home-search-label', { defaultValue: 'Search the archive' })}
          </label>
          <div className="home-search-row">
            <input
              id="home-q"
              className="field field--lg"
              type="search"
              name="q"
              autoComplete="off"
              placeholder={t('home-search-placeholder', { defaultValue: 'A topic, a title or an author' })}
            />
            <button className="btn btn--lg" type="submit">
              {t('home-search-submit', { defaultValue: 'Search' })}
            </button>
          </div>
        </form>

        {top.length > 0 ? (
          <div className="home-top">
            <div className="home-top-head">
              <p className="label">{t('home-top-label', { defaultValue: 'Most resonant papers' })}</p>
              <Link className="btn-text" to="/rmh-research/archive">
                {t('home-top-all', { defaultValue: 'Open the archive' })} <Arrow />
              </Link>
            </div>
            <ol className="rows">
              {top.map((p) => (
                <PaperRow key={p.id} paper={p} />
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ── 4. the r-index, on one paper ────────────────────────────────────────── */

type CiteState = 'is-own' | 'is-dead' | 'is-live' | 'is-carried';

/** Where each citation of `paper` falls out of the r-index sift, in the order `citedBy` lists them. */
function siftCitations(paper: Paper): { id: string; state: CiteState }[] {
  return citedBy(paper.id).map((q) => {
    if (!isIndependent(q, paper)) return { id: q.id, state: 'is-own' };
    const live = citedBy(q.id).some((x) => isIndependent(x, q)) || q.year > ANALYSIS.horizon - GRACE_YEARS;
    if (!live) return { id: q.id, state: 'is-dead' };
    return { id: q.id, state: q.field !== paper.field ? 'is-carried' : 'is-live' };
  });
}

function Resonance() {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const lead = topPapers(1)[0];
  const res = lead ? resonanceOf(lead.id) : null;

  const head = (
    <>
      <span className="label">{t('home-rix-label', { defaultValue: 'The r-index' })}</span>
      <h2 className="h2">{t('home-rix-title', { defaultValue: 'Not every citation counts.' })}</h2>
    </>
  );
  const more = (
    <Link className="btn-text" to="/rmh-research/r-index">
      {t('home-rix-more', { defaultValue: 'How the r-index works' })} <Arrow />
    </Link>
  );

  if (!lead || !res || res.raw === 0) {
    return (
      <section className="sec sec--rule home-rix-empty">
        <div className="wrap stack-m">
          <header className="sechead">{head}</header>
          <p className="lede">
            {t('home-rix-empty', {
              defaultValue:
                'The r-index counts a citation only when it comes from someone else, from work that was itself built on, and twice when it crosses a field. No paper in the archive has been cited yet.',
            })}
          </p>
          {more}
        </div>
      </section>
    );
  }

  const cites = siftCitations(lead);
  const steps = [
    {
      k: 'raw',
      v: res.raw,
      name: t('home-rix-step-raw', { defaultValue: 'Every citation' }),
      body: t('home-rix-step-raw-body', {
        defaultValue: 'Every paper in the archive that cites it. This is all an h-index counts.',
      }),
    },
    {
      k: 'independent',
      v: res.independent,
      name: t('home-rix-step-independent', { defaultValue: 'Independent' }),
      body: t('home-rix-step-independent-body', {
        defaultValue: 'Drop the papers that share an author with it. Citing yourself says nothing about whether anyone else used the result.',
      }),
    },
    {
      k: 'live',
      v: res.live,
      name: t('home-rix-step-live', { defaultValue: 'Live' }),
      body: t('home-rix-step-live-body', {
        defaultValue: 'Drop the citations from papers nobody went on to build on. A citation that leads nowhere is where the idea stopped.',
      }),
    },
    {
      k: 'score',
      v: res.score,
      name: t('home-rix-step-score', { defaultValue: 'Resonance' }),
      body: t('home-rix-step-score-body', {
        count: res.carried,
        formatted: n(res.carried),
        defaultValue_one: 'A live citation from another field counts twice. {{formatted}} of these crossed a field.',
        defaultValue: 'A live citation from another field counts twice. {{formatted}} of these crossed a field.',
      }),
    },
  ];
  const count = steps.length;
  const dense = cites.length > 48 ? ' home-cites--dense' : '';

  return (
    <Scene len={count + 1} steps={count} className="home-rix" pinClassName="home-rix-pin">
      <div className="wrap home-rix-wrap">
        <header className="home-rix-head">
          {head}
          <p className="home-rix-paper">
            <span className="meta">{t('home-rix-paper-label', { defaultValue: 'The most resonant paper in the archive' })}</span>
            <PaperLink paper={lead} className="home-rix-title">
              {lead.title}
            </PaperLink>
            <span className="home-rix-by">
              <AuthorNames paper={lead} /> · <span className="num">{lead.year}</span>
            </span>
          </p>
        </header>

        <div className="home-rix-body">
          <div className="sc-stack home-rix-stack">
            {steps.map((s, i) => (
              <Step key={s.k} index={i} count={count} className="home-rix-step">
                <span className="meta num">
                  {n(i + 1)} / {n(count)}
                </span>
                <h3 className="home-rix-name">{s.name}</h3>
                <p className="home-rix-num num">{n(s.v)}</p>
                <p className="home-rix-text">{s.body}</p>
              </Step>
            ))}
          </div>

          <figure className="home-rix-fig">
            <div
              className={`home-cites${dense}`}
              role="img"
              aria-label={t('home-rix-fig-label', {
                defaultValue:
                  '{{raw}} citations: {{independent}} independent, {{live}} of those live, {{carried}} from another field. Resonance {{score}}.',
                raw: n(res.raw),
                independent: n(res.independent),
                live: n(res.live),
                carried: n(res.carried),
                score: n(res.score),
              })}
            >
              {cites.map((c) => (
                <span key={c.id} className={`home-cite ${c.state}`}>
                  <i className="home-cite-dot" />
                  {c.state === 'is-carried' ? <i className="home-cite-dot home-cite-twin" /> : null}
                </span>
              ))}
            </div>
            <figcaption className="home-rix-key meta">
              <span>
                <i className="home-key home-key--on" aria-hidden="true" />
                {t('home-rix-key-counts', { defaultValue: 'Counts' })}
              </span>
              <span>
                <i className="home-key" aria-hidden="true" />
                {t('home-rix-key-dropped', { defaultValue: 'Dropped' })}
              </span>
              <span>
                <i className="home-key home-key--on" aria-hidden="true" />
                <i className="home-key home-key--on" aria-hidden="true" />
                {t('home-rix-key-carried', { defaultValue: 'Carried: counts twice' })}
              </span>
            </figcaption>
          </figure>
        </div>

        <div className="home-scene-foot home-rix-foot">
          <SceneDots count={count} />
          <div className="scene-rail" />
          {more}
        </div>
      </div>
    </Scene>
  );
}

/* ── 5. leading authors ──────────────────────────────────────────────────── */

function Leaders() {
  const { t } = useTranslation(NS);
  const n = useNumber();
  const top = AUTHOR_RANKING.slice(0, 5);
  if (top.length === 0) return null;

  return (
    <section className="sec sec--rule home-auth">
      <div className="wrap split">
        <div className="split-aside">
          <SecHead
            label={t('home-auth-label', { defaultValue: 'Leading authors' })}
            title={t('home-auth-title', { defaultValue: 'Ranked by how far their work travelled.' })}
            lede={t('home-auth-lede', {
              defaultValue: 'The h-index beside each name counts every citation. The r-index counts only the ones that resonated.',
            })}
          />
          <Link className="btn-text" to="/rmh-research/authors">
            {t('home-auth-all', { defaultValue: 'All authors' })} <Arrow />
          </Link>
        </div>
        <div className="split-main">
          <table className="home-auth-table">
            <thead>
              <tr>
                <th scope="col" className="home-auth-rank">
                  {t('home-auth-col-rank', { defaultValue: 'Rank' })}
                </th>
                <th scope="col">{t('home-auth-col-author', { defaultValue: 'Author' })}</th>
                <th scope="col" className="home-auth-field">
                  {t('home-auth-col-field', { defaultValue: 'Field' })}
                </th>
                <th scope="col" className="home-auth-n">
                  h
                </th>
                <th scope="col" className="home-auth-n">
                  r
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((m) => (
                <tr key={m.author.id} className="rv">
                  <td className="home-auth-rank num">{n(m.rank)}</td>
                  <td>
                    <Link className="home-auth-name" to="/rmh-research/authors/$authorId" params={{ authorId: m.author.id }}>
                      {m.author.name}
                    </Link>
                    <span className="home-auth-lab">{m.author.lab}</span>
                  </td>
                  <td className="home-auth-field">
                    <FieldChip field={m.author.field} />
                  </td>
                  <td className="home-auth-n num mute">{n(m.h)}</td>
                  <td className="home-auth-n home-auth-r num">{n(m.r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── 6. sections and reports ─────────────────────────────────────────────── */

function Sections() {
  const { t } = useTranslation(NS);
  return (
    <section className="sec sec--rule home-more">
      <div className="wrap">
        <SecHead
          label={t('home-more-label', { defaultValue: 'Sections and reports' })}
          title={t('home-more-title', { defaultValue: 'Longer reads.' })}
        />
        <span className="rv-rule" aria-hidden="true" />
        <ul className="home-more-list">
          <li>
            <Link className="row home-more-row" to="/rmh-research/psychology">
              <span className="home-more-kind meta">{t('home-more-kind-section', { defaultValue: 'Section' })}</span>
              <span className="home-more-text">
                <span className="h3">{t('nav-psychology', { defaultValue: 'Psychology' })}</span>
                <span className="home-more-desc">
                  {t('home-more-psychology', {
                    defaultValue: 'The published behavioural research behind how people use products, credited to the people who did it.',
                  })}
                </span>
              </span>
              <Arrow />
            </Link>
          </li>
          <li>
            <a className="row home-more-row" href="/rmh-research/reports/optimization">
              <span className="home-more-kind meta">{t('home-more-kind-report', { defaultValue: 'Report' })}</span>
              <span className="home-more-text">
                <span className="h3">{t('footer-report-optimization', { defaultValue: 'Speed & Optimization' })}</span>
                <span className="home-more-desc">
                  {t('home-more-optimization', {
                    defaultValue: 'How the platform stays fast, from the first paint to the deploy, with every before and after number.',
                  })}
                </span>
              </span>
              <Arrow />
            </a>
          </li>
          <li>
            <a className="row home-more-row" href="/rmh-research/reports/feature-leak">
              <span className="home-more-kind meta">{t('home-more-kind-report', { defaultValue: 'Report' })}</span>
              <span className="home-more-text">
                <span className="h3">{t('footer-report-feature-leak', { defaultValue: 'Feature Leak' })}</span>
                <span className="home-more-desc">
                  {t('home-more-feature-leak', {
                    defaultValue: 'A finding from the Office of Platform Integrity on where a competing product came from.',
                  })}
                </span>
              </span>
              <Arrow />
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
