/**
 * RMH Research — the r-index, explained by scrolling.
 *
 * The page head; the problem (what an h-index cannot tell apart); the sifting
 * scene (one paper's citing papers, removed rule by rule until its resonance is
 * left); the cut scene (one author's papers as bars, cut by citations and then
 * by resonance); the definition; h against r across the whole archive; and the
 * questions people ask.
 *
 * The example paper and the example author are chosen from the catalogue when
 * the module loads, never by id: the archive is curated and grows, and the page
 * must explain whatever it holds. Every number comes from `catalog.ts` and every
 * rule from `r-index.ts` (`classifyCitation`, `GRACE_YEARS`, `CARRIED_WEIGHT`).
 *
 * No script drives the motion: the scenes are CSS on scroll timelines
 * (`pages/r-index.css`), and in flow mode every figure renders in its end state.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ANALYSIS, AUTHOR_RANKING, citedBy, papersByAuthor, PAPERS, resonanceOf, type AuthorMetrics } from '@/lib/rmh-research/catalog';
import { getField } from '@/lib/rmh-research/fields';
import { CARRIED_WEIGHT, classifyCitation, GRACE_YEARS, indexCut, type CitationKind } from '@/lib/rmh-research/r-index';
import type { Paper } from '@/lib/rmh-research/types';
import { Arrow, AuthorNames, cssVars, PageHead, PaperLink, Scene, SceneDots, SecHead, Stat, Step, useFieldLabels, useNumber } from './shared';

/* ── the examples, chosen from the catalogue ─────────────────────────────── */

/** The most citing papers the sifting figure draws as tiles. */
const MAX_TILES = 40;
/** The most papers the cut figure draws as bars (the cut only reads the top). */
const MAX_BARS = 24;

interface SiftExample {
  paper: Paper;
  cites: { paper: Paper; kind: CitationKind }[];
}

/**
 * The paper that shows the most of the rules (self, dead, live, carried), and
 * among those the one whose citations the sifting removes the most of
 * (raw − resonance), then the more cited; picked among papers with at least six
 * citations that fit the figure, then among any with six, then any cited paper.
 */
const SIFT: SiftExample | null = (() => {
  const rows = PAPERS.map((p) => {
    const res = resonanceOf(p.id);
    const cites = citedBy(p.id)
      .map((q) => ({ paper: q, kind: classifyCitation(q, p, ANALYSIS) }))
      .sort((a, b) => a.paper.year - b.paper.year || a.paper.id.localeCompare(b.paper.id));
    return { paper: p, res, cites, kinds: new Set(cites.map((c) => c.kind)).size };
  }).filter((x) => x.res.raw > 0);
  const pool = [rows.filter((x) => x.res.raw >= 6 && x.res.raw <= MAX_TILES), rows.filter((x) => x.res.raw >= 6), rows].find((p) => p.length > 0);
  if (!pool) return null;
  const best = [...pool].sort(
    (a, b) =>
      b.kinds - a.kinds || b.res.raw - b.res.score - (a.res.raw - a.res.score) || b.res.raw - a.res.raw || a.paper.id.localeCompare(b.paper.id),
  )[0];
  return best ? { paper: best.paper, cites: best.cites } : null;
})();

interface CutExample {
  m: AuthorMetrics;
  raw: number[];
  res: number[];
  /** Citations from the author's own papers or co-authors (rule 1). */
  self: number;
  /** Independent citations from dead ends (rule 2). */
  dead: number;
  /** Live citations from another field (rule 3). */
  carried: number;
  citations: number;
}

/**
 * The author whose r differs most from their h, among authors with at least
 * four papers and both indices above zero (so both cuts have a square to draw);
 * then without that; then anyone with r ≠ h; then the author with most papers.
 */
const CUT: CutExample | null = (() => {
  const diff = (m: AuthorMetrics) => Math.abs(m.h - m.r);
  const pool = [
    AUTHOR_RANKING.filter((m) => m.papers >= 4 && m.h !== m.r && m.r > 0 && m.h > 0),
    AUTHOR_RANKING.filter((m) => m.papers >= 4 && m.h !== m.r),
    AUTHOR_RANKING.filter((m) => m.h !== m.r),
    AUTHOR_RANKING.filter((m) => m.papers > 0),
  ].find((p) => p.length > 0);
  if (!pool) return null;
  const m = [...pool].sort((a, b) => diff(b) - diff(a) || b.papers - a.papers || a.author.name.localeCompare(b.author.name))[0];
  if (!m) return null;
  const rs = papersByAuthor(m.author.id).map((p) => resonanceOf(p.id));
  const desc = (a: number, b: number) => b - a;
  return {
    m,
    raw: rs.map((r) => r.raw).sort(desc),
    res: rs.map((r) => r.score).sort(desc),
    self: rs.reduce((n, r) => n + r.raw - r.independent, 0),
    dead: rs.reduce((n, r) => n + r.independent - r.live, 0),
    carried: rs.reduce((n, r) => n + r.carried, 0),
    citations: m.citations,
  };
})();

/** Authors by r − h: the five r rates most above h, and the five most below. */
const MOVERS = (() => {
  const d = (m: AuthorMetrics) => m.r - m.h;
  const tie = (a: AuthorMetrics, b: AuthorMetrics) => b.r - a.r || a.author.name.localeCompare(b.author.name);
  return {
    above: AUTHOR_RANKING.filter((m) => d(m) > 0).sort((a, b) => d(b) - d(a) || tie(a, b)).slice(0, 5),
    below: AUTHOR_RANKING.filter((m) => d(m) < 0).sort((a, b) => d(a) - d(b) || tie(a, b)).slice(0, 5),
  };
})();

/** The worked example in the definition: the doc comment's own list. */
const WORKED = [9, 7, 3, 3, 1];

/* ── page ────────────────────────────────────────────────────────────────── */

export default function RIndexPage() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const above = AUTHOR_RANKING.filter((m) => m.r > m.h).length;
  const below = AUTHOR_RANKING.filter((m) => m.r < m.h).length;

  return (
    <div className="rix">
      <PageHead
        crumbs={[{ label: t('nav-r-index', { defaultValue: 'The r-index' }) }]}
        title={t('rix-title', { defaultValue: 'The r-index' })}
        lede={t('rix-lede', {
          defaultValue:
            'How much of an author’s work other people built on: the h-index cut, applied only to citations that are independent, live, and worth double when they cross into another field.',
        })}
      >
        <div className="stats rix-head-stats" style={cssVars({ '--stats': 3 })}>
          <Stat value={n(AUTHOR_RANKING.length)} label={t('rix-stat-authors', { defaultValue: 'Authors measured' })} />
          <Stat value={n(above)} label={t('rix-stat-above', { defaultValue: 'Rated higher by r than by h' })} />
          <Stat value={n(below)} label={t('rix-stat-below', { defaultValue: 'Rated lower by r than by h' })} />
        </div>
      </PageHead>

      <Problem />
      {SIFT ? <SiftScene ex={SIFT} /> : null}
      {CUT ? <CutScene ex={CUT} /> : null}
      <Definition />
      <Archive />
      <Questions />

      <section className="sec sec--tight sec--rule">
        <div className="wrap rix-out">
          <p className="lede">
            {t('rix-out-lede', { defaultValue: 'Every author in the archive is ranked by r, with h beside it.' })}
          </p>
          <div className="actions">
            <Link className="btn btn--lg" to="/rmh-research/authors">
              {t('rix-out-authors', { defaultValue: 'See the ranking' })}
              <Arrow />
            </Link>
            <Link className="btn-quiet btn--lg" to="/rmh-research/archive">
              {t('rix-out-archive', { defaultValue: 'Search the archive' })}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── 2. the problem ──────────────────────────────────────────────────────── */

function Problem() {
  const { t } = useTranslation('c-rmh-research');
  return (
    <section className="sec" aria-labelledby="rix-problem">
      <div className="wrap">
        <header className="sechead">
          <span className="label">{t('rix-problem-label', { defaultValue: 'The problem' })}</span>
          <h2 className="h2" id="rix-problem">
            {t('rix-problem-title', { defaultValue: 'A citation count cannot tell three things apart' })}
          </h2>
          <p className="lede">
            {t('rix-problem-lede', {
              defaultValue:
                'An author has h-index h when h of their papers have at least h citations each. Every citation counts the same, wherever it came from and whatever happened after it.',
            })}
          </p>
        </header>
        <div className="cols-3">
          <div className="stack-s">
            <span className="meta num">1</span>
            <h3 className="h3">{t('rix-problem-1-title', { defaultValue: 'Citing yourself' })}</h3>
            <p className="body mute">
              {t('rix-problem-1-body', {
                defaultValue:
                  'A group that cites its own papers, or two groups that cite each other, raise every count involved without anyone outside reading the work.',
              })}
            </p>
          </div>
          <div className="stack-s">
            <span className="meta num">2</span>
            <h3 className="h3">{t('rix-problem-2-title', { defaultValue: 'Citations nobody built on' })}</h3>
            <p className="body mute">
              {t('rix-problem-2-body', {
                defaultValue:
                  'A citation from a paper that was itself never cited is where the idea stopped. The count treats it the same as one that started a line of work.',
              })}
            </p>
          </div>
          <div className="stack-s">
            <span className="meta num">3</span>
            <h3 className="h3">{t('rix-problem-3-title', { defaultValue: 'Reach beyond the field' })}</h3>
            <p className="body mute">
              {t('rix-problem-3-body', {
                defaultValue:
                  'A result used only inside its own subfield and one taken up by three other fields can have exactly the same count.',
              })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 3. the sifting scene ────────────────────────────────────────────────── */

/** raw → independent → live → resonance, up to the current step. */
function Trail({ items, upto }: { items: { v: string; k: string }[]; upto: number }) {
  return (
    <ol className="rix-trail meta" aria-hidden="true">
      {items.map((x, i) => (
        <li key={x.k} className={i === upto ? 'is-now' : i > upto ? 'is-later' : undefined}>
          <span className="num">{x.v}</span> {x.k}
        </li>
      ))}
    </ol>
  );
}

function SiftScene({ ex }: { ex: SiftExample }) {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const res = resonanceOf(ex.paper.id);
  const count = (k: CitationKind) => ex.cites.filter((c) => c.kind === k).length;
  const tiles = ex.cites.slice(0, MAX_TILES);
  const graceFrom = ANALYSIS.horizon - GRACE_YEARS + 1;
  const STEPS = 5;

  const trail = [
    { v: n(res.raw), k: t('rix-trail-cited', { defaultValue: 'cited' }) },
    { v: n(res.independent), k: t('rix-trail-independent', { defaultValue: 'independent' }) },
    { v: n(res.live), k: t('rix-trail-live', { defaultValue: 'live' }) },
    { v: n(res.score), k: t('rix-trail-resonance', { defaultValue: 'resonance' }) },
  ];
  return (
    <Scene len={6} steps={STEPS} className="rix-sift sec--rule" pinClassName="rix-pin" aria-labelledby="rix-sift-title">
      <div className="wrap rix-sift-grid">
        <header className="rix-sift-head">
          <span className="label">{t('rix-sift-label', { defaultValue: 'One paper, sifted' })}</span>
          <h2 className="h2 rix-scene-h2" id="rix-sift-title">
            {t('rix-sift-title', { defaultValue: 'From citations to resonance' })}
          </h2>
          <p className="rix-paper">
            <PaperLink paper={ex.paper} className="rix-paper-title">
              {ex.paper.title}
            </PaperLink>
            <span className="meta rix-paper-meta">
              <AuthorNames paper={ex.paper} link={false} /> · {labels.name(ex.paper.field)} · <span className="num">{ex.paper.year}</span>
            </span>
          </p>
        </header>

        <figure
          className="rix-sift-fig"
          role="img"
          aria-label={t('rix-sift-fig-aria', {
            defaultValue:
              'The {{raw}} papers that cite it: {{self}} share an author with it, {{dead}} are dead ends, {{live}} count once and {{carried}} come from another field and count twice.',
            raw: n(res.raw),
            self: n(count('self')),
            dead: n(count('dead')),
            live: n(count('live')),
            carried: n(count('carried')),
          })}
        >
          <ul className="rix-cites" data-dense={tiles.length > 20 ? '' : undefined} aria-hidden="true">
            {tiles.map(({ paper: q, kind }) => {
              const code = getField(q.field).code;
              return (
                <li key={q.id} className="rix-cite" data-k={kind}>
                  <span className="rix-cite-code">{code}</span>
                  <span className="rix-cite-year num">{q.year}</span>
                  {kind === 'carried' ? (
                    <span className="rix-cite-ink">
                      <span className="rix-cite-code">{code}</span>
                      <span className="rix-cite-year num">×{CARRIED_WEIGHT}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <figcaption className="rix-legend meta">
            {ex.cites.length > tiles.length ? (
              <span>{t('rix-sift-showing', { defaultValue: 'Showing {{shown}} of {{all}}', shown: n(tiles.length), all: n(ex.cites.length) })}</span>
            ) : null}
            <span>
              <i className="rix-key" data-k="self" aria-hidden="true" />
              {t('rix-key-self', { defaultValue: 'Shares an author' })}
            </span>
            <span>
              <i className="rix-key" data-k="dead" aria-hidden="true" />
              {t('rix-key-dead', { defaultValue: 'Dead end' })}
            </span>
            <span>
              <i className="rix-key" data-k="live" aria-hidden="true" />
              {t('rix-key-live', { defaultValue: 'Counts once' })}
            </span>
            <span>
              <i className="rix-key" data-k="carried" aria-hidden="true" />
              {t('rix-key-carried', { defaultValue: 'Another field, counts {{w}}', w: n(CARRIED_WEIGHT) })}
            </span>
          </figcaption>
        </figure>

        <div className="sc-stack rix-sift-steps">
          <Step index={0} count={STEPS} className="rix-step">
            <span className="rix-count num">{n(res.raw)}</span>
            <Trail items={trail} upto={0} />
            <h3 className="h3">{t('rix-sift-0-title', { defaultValue: 'Every citation, counted once' })}</h3>
            <p className="body mute">
              {t('rix-sift-0-body', {
                defaultValue: 'This is what an h-index counts: every paper in the archive that cites this one, whoever wrote it and whatever became of it.',
              })}
            </p>
          </Step>
          <Step index={1} count={STEPS} className="rix-step">
            <span className="rix-count num">{n(res.independent)}</span>
            <Trail items={trail} upto={1} />
            <h3 className="h3">{t('rix-sift-1-title', { defaultValue: 'Remove the authors’ own' })}</h3>
            <p className="body mute">
              {t('rix-sift-1-body', {
                defaultValue:
                  'A citing paper that shares any author with this one is the authors or their co-authors citing themselves. It says nothing about whether anyone else used the result. Removed here: {{n}}.',
                n: n(count('self')),
              })}
            </p>
          </Step>
          <Step index={2} count={STEPS} className="rix-step">
            <span className="rix-count num">{n(res.live)}</span>
            <Trail items={trail} upto={2} />
            <h3 className="h3">{t('rix-sift-2-title', { defaultValue: 'Remove the dead ends' })}</h3>
            <p className="body mute">
              {t('rix-sift-2-body', {
                count: Number(n(GRACE_YEARS)), defaultValue_one: 'A citing paper that no one else has ever cited is where the idea stopped. Papers from the last {{years}} year of the archive ({{from}} on) have not had time to be built on, so they stay. Removed here: {{n}}.', defaultValue:
                  'A citing paper that no one else has ever cited is where the idea stopped. Papers from the last {{years}} years of the archive ({{from}} on) have not had time to be built on, so they stay. Removed here: {{n}}.',
                years: n(GRACE_YEARS),
                from: graceFrom,
                n: n(count('dead')),
              })}
            </p>
          </Step>
          <Step index={3} count={STEPS} className="rix-step">
            <span className="rix-count num">{n(res.score)}</span>
            <Trail items={trail} upto={3} />
            <h3 className="h3">{t('rix-sift-3-title', { defaultValue: 'Count the carried ones twice' })}</h3>
            <p className="body mute">
              {t('rix-sift-3-body', {
                defaultValue:
                  'A live citation from another field counts {{w}} times. People with no stake in the result checked it and found it useful. Carried here: {{n}}.',
                w: n(CARRIED_WEIGHT),
                n: n(count('carried')),
              })}
            </p>
          </Step>
          <Step index={4} count={STEPS} className="rix-step">
            <span className="rix-count num">{n(res.score)}</span>
            <Trail items={trail} upto={3} />
            <h3 className="h3">{t('rix-sift-4-title', { defaultValue: 'What is left is resonance' })}</h3>
            <p className="body mute">
              {t('rix-sift-4-body', {
                defaultValue:
                  'Cited by {{raw}}, resonance {{score}}. Every paper in the archive is sifted the same way, and the r-index is cut on these numbers.',
                raw: n(res.raw),
                score: n(res.score),
              })}
            </p>
          </Step>
        </div>
      </div>
      <div className="wrap rix-scene-foot">
        <SceneDots count={STEPS} />
        <div className="scene-rail" />
      </div>
    </Scene>
  );
}

/* ── 4. the cut scene ────────────────────────────────────────────────────── */

/** Papers as bars, sorted, with the k×k square of the cut marked. */
function CutChart({ values, k, max, kLabel, title, a }: { values: number[]; k: number; max: number; kLabel: string; title: string; a: number }) {
  const n = useNumber();
  const shown = values.slice(0, MAX_BARS);
  const N = Math.max(shown.length, 1);
  const span = 20;
  const step = shown.length > 1 ? (span - 8) / (shown.length - 1) : 0;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return (
    <div className="rix-chart" role="img" aria-label={title}>
      <div className="rix-chart-head" aria-hidden="true">
        <span className="rix-chart-k num">{kLabel}</span>
      </div>
      <div className="rix-plot" dir="ltr" style={cssVars({ '--n': N, '--k': k, '--max': max })} aria-hidden="true">
        {k > 0 ? <i className="rix-sq sc-t" style={cssVars({ '--a': r2(a + span - 6), '--b': r2(a + span + 2) })} /> : null}
        <ol className="rix-bars">
          {shown.map((v, i) => {
            const s = r2(a + i * step);
            return <li key={i} className="rix-bar sc-t" style={cssVars({ '--v': v / max, '--a': s, '--b': r2(s + 8) })} />;
          })}
        </ol>
      </div>
      {shown.length <= 16 ? (
        <ol className="rix-vals meta num" dir="ltr" aria-hidden="true">
          {shown.map((v, i) => (
            <li key={i}>{n(v)}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function CutScene({ ex }: { ex: CutExample }) {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const { m } = ex;
  const max = Math.max(1, ...ex.raw, ...ex.res);
  const STEPS = 3;

  let why: string;
  if (m.r < m.h) {
    why =
      ex.self >= ex.dead
        ? t('rix-cut-why-self', { defaultValue: 'Most of what h counts here is the group citing its own work.' })
        : t('rix-cut-why-dead', { defaultValue: 'Most of what h counts here comes from papers nobody went on to cite.' });
  } else if (m.r > m.h) {
    why = t('rix-cut-why-carried', { defaultValue: 'The work was taken up outside its field, and those citations count twice.' });
  } else {
    why = t('rix-cut-why-same', { defaultValue: 'What the rules remove and what they double cancel out at the cut.' });
  }

  return (
    <Scene len={4.5} steps={STEPS} className="rix-cut sec--rule" pinClassName="rix-pin" aria-labelledby="rix-cut-title">
      <div className="wrap rix-cut-grid">
        <header className="rix-sift-head">
          <span className="label">{t('rix-cut-label', { defaultValue: 'One author, cut two ways' })}</span>
          <h2 className="h2 rix-scene-h2" id="rix-cut-title">
            {t('rix-cut-title', { defaultValue: 'The same cut, on different numbers' })}
          </h2>
          <p className="rix-paper">
            <Link className="rix-paper-title" to="/rmh-research/authors/$authorId" params={{ authorId: m.author.id }}>
              {m.author.name}
            </Link>
            <span className="meta rix-paper-meta">
              {m.author.lab} · {labels.name(m.author.field)} ·{' '}
              {t('rix-cut-papers', { count: Number(n(m.papers)), defaultValue_one: '{{n}} paper', defaultValue: '{{n}} papers', n: n(m.papers) })}
            </span>
          </p>
        </header>

        <div className="sc-stack rix-cut-figs">
          <div className="sc-step is-first rix-cut-fig" style={cssVars({ '--a': 0, '--b': 33.33 })}>
            <span className="label">{t('rix-cut-fig-raw', { defaultValue: 'Citations per paper, most cited first' })}</span>
            <CutChart
              values={ex.raw}
              k={m.h}
              max={max}
              a={2}
              kLabel={`h = ${n(m.h)}`}
              title={t('rix-cut-fig-raw-aria', {
                defaultValue: 'Bar chart: {{name}}’s papers by citations, most cited first ({{list}}). h = {{h}}.',
                name: m.author.name,
                list: ex.raw.map(n).join(', '),
                h: n(m.h),
              })}
            />
          </div>
          <div className="sc-step is-last rix-cut-fig" style={cssVars({ '--a': 33.33, '--b': 66.67 })}>
            <span className="label">{t('rix-cut-fig-res', { defaultValue: 'Resonance per paper, most resonant first' })}</span>
            <CutChart
              values={ex.res}
              k={m.r}
              max={max}
              a={38}
              kLabel={`r = ${n(m.r)}`}
              title={t('rix-cut-fig-res-aria', {
                defaultValue: 'Bar chart: {{name}}’s papers by resonance, most resonant first ({{list}}). r = {{r}}.',
                name: m.author.name,
                list: ex.res.map(n).join(', '),
                r: n(m.r),
              })}
            />
          </div>
        </div>

        <div className="sc-stack rix-sift-steps">
          <Step index={0} count={STEPS} className="rix-step">
            <span className="rix-count num">
              <span className="rix-count-k">h</span>
              {n(m.h)}
            </span>
            <h3 className="h3">{t('rix-cut-0-title', { defaultValue: 'Cut on citations' })}</h3>
            <p className="body mute">
              {t('rix-cut-0-body', {
                defaultValue:
                  'Each bar is one paper, tallest first. Walk along until the next bar is shorter than its place in the line: {{h}} papers have at least {{h}} citations each. The square marks it.',
                h: n(m.h),
              })}
            </p>
          </Step>
          <Step index={1} count={STEPS} className="rix-step">
            <span className="rix-count num">
              <span className="rix-count-k">r</span>
              {n(m.r)}
            </span>
            <h3 className="h3">{t('rix-cut-1-title', { defaultValue: 'Cut on resonance' })}</h3>
            <p className="body mute">
              {t('rix-cut-1-body', {
                defaultValue: 'The same papers, sifted and sorted again. {{r}} of them have a resonance of at least {{r}} each.',
                r: n(m.r),
              })}
            </p>
          </Step>
          <Step index={2} count={STEPS} className="rix-step">
            <span className="rix-count num">
              <span className="rix-count-k">h</span>
              {n(m.h)}
              <span className="rix-count-k rix-count-k--gap">r</span>
              {n(m.r)}
            </span>
            <h3 className="h3">{t('rix-cut-2-title', { defaultValue: 'Why the two differ' })}</h3>
            <p className="body mute">
              {t('rix-cut-2-body', {
                defaultValue:
                  'Of {{citations}} citations, {{self}} come from the author’s own papers or co-authors, {{dead}} from papers nobody built on, and {{carried}} crossed into another field.',
                citations: n(ex.citations),
                self: n(ex.self),
                dead: n(ex.dead),
                carried: n(ex.carried),
              })}
            </p>
            <p className="body">{why}</p>
          </Step>
        </div>
      </div>
      <div className="wrap rix-scene-foot">
        <SceneDots count={STEPS} />
        <div className="scene-rail" />
      </div>
    </Scene>
  );
}

/* ── 5. the definition ───────────────────────────────────────────────────── */

function Definition() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const r = indexCut(WORKED);
  const sorted = [...WORKED].sort((a, b) => b - a);
  const at = sorted[r - 1] ?? 0;
  const next = sorted[r] ?? 0;
  return (
    <section className="sec sec--rule" aria-labelledby="rix-def">
      <div className="wrap split">
        <div className="split-aside">
          <SecHead
            label={t('rix-def-label', { defaultValue: 'Definition' })}
            title={<span id="rix-def">{t('rix-def-title', { defaultValue: 'The r-index, precisely' })}</span>}
          />
        </div>
        <div className="split-main stack-l">
          <div className="prose body">
            <p>
              {t('rix-def-p1', {
                count: Number(n(GRACE_YEARS)), defaultValue_one: 'Take every citation a paper receives from inside the archive. It is independent when the citing paper shares no author with the cited one. It is live when the citing paper has itself been independently cited at least once, or was published in the last {{years}} year of the archive. It is carried when it is live and the citing paper belongs to another field.', defaultValue:
                  'Take every citation a paper receives from inside the archive. It is independent when the citing paper shares no author with the cited one. It is live when the citing paper has itself been independently cited at least once, or was published in the last {{years}} years of the archive. It is carried when it is live and the citing paper belongs to another field.',
                years: n(GRACE_YEARS),
              })}
            </p>
            <p>
              {t('rix-def-p2', {
                defaultValue:
                  'A paper’s resonance is the number of its live citations, with each carried one counted {{w}} times. An author has r-index r when r of their papers each have a resonance of at least r.',
                w: n(CARRIED_WEIGHT),
              })}
            </p>
          </div>

          <dl className="kv">
            <div>
              <dt>GRACE_YEARS</dt>
              <dd>
                {t('rix-kv-grace', {
                  defaultValue: '{{n}}. Citing papers this recent count as live without being cited themselves.',
                  n: n(GRACE_YEARS),
                })}
              </dd>
            </div>
            <div>
              <dt>CARRIED_WEIGHT</dt>
              <dd>
                {t('rix-kv-weight', {
                  defaultValue: '{{n}}. What a live citation from another field is worth.',
                  n: n(CARRIED_WEIGHT),
                })}
              </dd>
            </div>
            <div>
              <dt>horizon</dt>
              <dd>
                {t('rix-kv-horizon', {
                  defaultValue: '{{year}}. The latest publication year in the archive; the grace window counts back from it.',
                  year: ANALYSIS.horizon,
                })}
              </dd>
            </div>
            <div>
              <dt>cut</dt>
              <dd>{t('rix-kv-cut', { defaultValue: 'The h-index cut: the largest k such that k values are at least k.' })}</dd>
            </div>
          </dl>

          <pre className="rix-formula" dir="ltr">
            <code>
              {t('rix-formula-1', { defaultValue: 'w(c) = 0      if c shares an author with p' })}
              {'\n'}
              {t('rix-formula-2', { defaultValue: 'w(c) = 0      if c is a dead end' })}
              {'\n'}
              {t('rix-formula-3', { defaultValue: 'w(c) = {{w}}      if field(c) ≠ field(p)', w: CARRIED_WEIGHT })}
              {'\n'}
              {t('rix-formula-4', { defaultValue: 'w(c) = 1      otherwise' })}
              {'\n\n'}
              {t('rix-formula-5', { defaultValue: 'resonance(p) = Σ w(c), over every c citing p' })}
              {'\n'}
              {t('rix-formula-6', { defaultValue: 'r = max k : k papers have resonance ≥ k' })}
            </code>
          </pre>

          <div className="stack-s">
            <h3 className="h3">{t('rix-worked-title', { defaultValue: 'A worked cut' })}</h3>
            <p className="body mute prose">
              {t('rix-worked-body', {
                defaultValue:
                  'Five papers with resonance {{list}}. Paper {{r}} in that order has {{at}}, at least {{r}}; paper {{next}} has {{nextV}}, less than {{next}}. So r = {{r}}.',
                list: sorted.map(n).join(', '),
                r: n(r),
                at: n(at),
                next: n(r + 1),
                nextV: n(next),
              })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 6. h against r across the archive ───────────────────────────────────── */

function Scatter() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const max = Math.max(1, ...AUTHOR_RANKING.map((m) => Math.max(m.h, m.r)));
  const cells = new Map<string, { h: number; r: number; count: number }>();
  for (const m of AUTHOR_RANKING) {
    const key = `${m.h}:${m.r}`;
    const c = cells.get(key);
    if (c) c.count++;
    else cells.set(key, { h: m.h, r: m.r, count: 1 });
  }
  const pos = (v: number) => 6 + (v / max) * 88;
  const tickStep = max <= 10 ? 1 : Math.ceil(max / 5);
  const ticks = Array.from({ length: Math.floor(max / tickStep) + 1 }, (_, i) => i * tickStep);
  const on = AUTHOR_RANKING.filter((m) => m.r === m.h).length;
  const above = AUTHOR_RANKING.filter((m) => m.r > m.h).length;
  const below = AUTHOR_RANKING.length - on - above;

  return (
    <figure className="rix-scatter">
      <div className="rix-scatter-frame" dir="ltr">
        <span className="rix-axis-y meta">{t('rix-scatter-y', { defaultValue: 'r-index' })}</span>
        <div className="rix-scatter-plot">
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={t('rix-scatter-aria', {
              count: Number(n(AUTHOR_RANKING.length)), defaultValue_one: 'Scatter plot of {{n}} author, h-index across and r-index up. {{above}} sit above the diagonal, where r is higher than h; {{on}} sit on it; {{below}} sit below it.', defaultValue:
                'Scatter plot of {{n}} authors, h-index across and r-index up. {{above}} sit above the diagonal, where r is higher than h; {{on}} sit on it; {{below}} sit below it.',
              n: n(AUTHOR_RANKING.length),
              above: n(above),
              on: n(on),
              below: n(below),
            })}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line className="rix-grid" x1={pos(v)} y1={6} x2={pos(v)} y2={94} />
                <line className="rix-grid" x1={6} y1={100 - pos(v)} x2={94} y2={100 - pos(v)} />
              </g>
            ))}
            <line className="rix-diag" x1={6} y1={94} x2={94} y2={6} />
            {[...cells.values()].map((c) => (
              <circle key={`${c.h}:${c.r}`} className="rix-dot" cx={pos(c.h)} cy={100 - pos(c.r)} r={1.1 + 0.55 * Math.sqrt(c.count)} />
            ))}
          </svg>
          <span className="rix-zone rix-zone--above meta">{t('rix-scatter-above', { defaultValue: 'r above h' })}</span>
          <span className="rix-zone rix-zone--below meta">{t('rix-scatter-below', { defaultValue: 'r below h' })}</span>
          <div className="rix-ticks-x meta num" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} style={cssVars({ '--x': pos(v) })}>
                {n(v)}
              </span>
            ))}
          </div>
          <div className="rix-ticks-y meta num" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} style={cssVars({ '--y': 100 - pos(v) })}>
                {n(v)}
              </span>
            ))}
          </div>
        </div>
        <span className="rix-axis-x meta">{t('rix-scatter-x', { defaultValue: 'h-index' })}</span>
      </div>
      <figcaption className="meta rix-scatter-cap">
        {t('rix-scatter-cap', {
          defaultValue: 'One dot per h and r pair; a larger dot holds more authors. On the line, the two agree.',
        })}
      </figcaption>
    </figure>
  );
}

function MoverRows({ rows, empty }: { rows: AuthorMetrics[]; empty: string }) {
  const n = useNumber();
  const labels = useFieldLabels();
  if (rows.length === 0) return <p className="body mute rix-empty">{empty}</p>;
  return (
    <ul className="rows">
      {rows.map((m) => {
        const d = m.r - m.h;
        return (
          <li key={m.author.id}>
            <Link className="row rix-mover" to="/rmh-research/authors/$authorId" params={{ authorId: m.author.id }}>
              <span className="rix-mover-name">
                <span className="ink">{m.author.name}</span>
                <span className="meta">{labels.name(m.author.field)}</span>
              </span>
              <span className="rix-mover-nums meta num">
                <span>h {n(m.h)}</span>
                <span>r {n(m.r)}</span>
                <b className="ink">{d > 0 ? `+${n(d)}` : `−${n(-d)}`}</b>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Archive() {
  const { t } = useTranslation('c-rmh-research');
  return (
    <section className="sec sec--rule" aria-labelledby="rix-arc">
      <div className="wrap">
        <SecHead
          label={t('rix-arc-label', { defaultValue: 'Across the archive' })}
          title={<span id="rix-arc">{t('rix-arc-title', { defaultValue: 'h against r, for every author' })}</span>}
          lede={t('rix-arc-lede', {
            defaultValue: 'Authors above the line did more for other people’s work than their citation count says. Authors below it did less.',
          })}
        />
        <div className="rix-arc-grid">
          <Scatter />
          <div className="stack-l">
            <div className="stack-s">
              <h3 className="h3">{t('rix-arc-above-title', { defaultValue: 'Rated most above h' })}</h3>
              <MoverRows rows={MOVERS.above} empty={t('rix-arc-above-empty', { defaultValue: 'No author has an r above their h yet.' })} />
            </div>
            <div className="stack-s">
              <h3 className="h3">{t('rix-arc-below-title', { defaultValue: 'Rated most below h' })}</h3>
              <MoverRows rows={MOVERS.below} empty={t('rix-arc-below-empty', { defaultValue: 'No author has an r below their h yet.' })} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 7. questions ────────────────────────────────────────────────────────── */

function Questions() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const qs = [
    {
      q: t('rix-q1', { defaultValue: 'Why not just exclude self-citations?' }),
      a: t('rix-a1', {
        defaultValue:
          'That is rule one, and on its own it is not enough. Two groups can cite each other, and a paper can be cited by many papers that nobody read. Excluding self-citations fixes the first problem and leaves the other two.',
      }),
    },
    {
      q: t('rix-q2', { defaultValue: 'Why does a citation from an unread paper not count?' }),
      a: t('rix-a2', {
        defaultValue:
          'A citation is evidence that an idea was used. If the citing paper was never itself cited by anyone independent, the line of work ended there, and the citation is not evidence that the idea went anywhere.',
      }),
    },
    {
      q: t('rix-q3', { defaultValue: 'Why does crossing fields count double?' }),
      a: t('rix-a3', {
        defaultValue:
          'A result that another field picks up has been checked by people with no stake in it and no shared habits. That is harder to earn than a citation from next door, and reaching across fields is what this institute exists for. The weight is {{w}}, not more, so breadth helps without swamping depth.',
        w: n(CARRIED_WEIGHT),
      }),
    },
    {
      q: t('rix-q4', { defaultValue: 'What is the grace window for?' }),
      a: t('rix-a4', {
        count: Number(n(GRACE_YEARS)), defaultValue_one: 'A paper from last year has not had time to be cited. Without the window, every citation from recent work would be a dead end, and new results would count for nothing. Citing papers from the last {{years}} year of the archive are treated as live.', defaultValue:
          'A paper from last year has not had time to be cited. Without the window, every citation from recent work would be a dead end, and new results would count for nothing. Citing papers from the last {{years}} years of the archive are treated as live.',
        years: n(GRACE_YEARS),
      }),
    },
    {
      q: t('rix-q5', { defaultValue: 'Can it be gamed?' }),
      a: t('rix-a5', {
        defaultValue:
          'Less cheaply than h. Citing yourself adds nothing. A ring of groups that cite each other has to keep citing the citing papers too, and each of those citations must come from someone outside the cited paper’s byline. Recent citations are trusted for a short window only. No single number is ungameable, which is why the archive publishes h beside r.',
      }),
    },
  ];
  return (
    <section className="sec sec--rule" aria-labelledby="rix-qs">
      <div className="wrap split">
        <div className="split-aside">
          <SecHead
            label={t('rix-qs-label', { defaultValue: 'Questions' })}
            title={<span id="rix-qs">{t('rix-qs-title', { defaultValue: 'What people ask about it' })}</span>}
          />
        </div>
        <div className="split-main rows">
          {qs.map((x) => (
            <details key={x.q} className="row rix-q">
              <summary className="rix-q-sum">
                <span className="h3">{x.q}</span>
                <span className="rix-q-mark" aria-hidden="true" />
              </summary>
              <p className="body mute prose rix-q-a">{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
