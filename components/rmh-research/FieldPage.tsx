/**
 * RMH Research — one field: its numbers, a pinned "the field over time" chart
 * (a flat bar per year, grown by scroll), its most resonant papers, its people
 * ranked by r, the fields it trades citations with, and every paper.
 */
import type { ReactNode } from 'react';
import { Link, getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AUTHOR_RANKING,
  fieldExchange,
  fieldStats,
  papersInField,
  papersPerYear,
  topPapers,
} from '@/lib/rmh-research/catalog';
import { getField, isFieldId } from '@/lib/rmh-research/fields';
import { Arrow, cssVars, PageHead, PaperRow, Scene, SecHead, Stat, useFieldLabels, useNumber } from './shared';

const route = getRouteApi('/rmh-research/fields/$fieldId');

function Block({ label, title, children, id }: { label: ReactNode; title: ReactNode; children: ReactNode; id: string }) {
  return (
    <section className="sec sec--rule" aria-labelledby={id}>
      <div className="wrap split">
        <div className="split-aside fld-aside">
          <SecHead label={label} title={<span id={id}>{title}</span>} />
        </div>
        <div className="split-main">{children}</div>
      </div>
    </section>
  );
}

export default function FieldPage() {
  const { fieldId } = route.useParams();
  if (!isFieldId(fieldId)) return null;
  return <FieldBody id={fieldId} />;
}

function FieldBody({ id }: { id: Parameters<typeof getField>[0] }) {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const name = labels.name(id);
  const stats = fieldStats(id);
  const papers = papersInField(id);
  const series = papersPerYear(papers);
  const peak = series.reduce((best, y) => (y.count > best.count ? y : best), { year: 0, count: 0 });
  const top = topPapers(5, id);
  const people = AUTHOR_RANKING.filter((m) => m.author.field === id);
  const exchange = fieldExchange(id);
  const maxTraffic = Math.max(1, ...exchange.map((e) => e.cites + e.citedBy));
  const step = Math.max(1, Math.ceil(series.length / 7));
  const showValues = series.length <= 16;
  const first = series[0]?.year;
  const last = series[series.length - 1]?.year;

  return (
    <>
      <PageHead
        crumbs={[{ label: t('nav-fields', { defaultValue: 'Fields' }), to: '/rmh-research/fields' }, { label: name }]}
        title={name}
        lede={labels.blurb(id)}
      >
        <div className="stats fld-stats" style={cssVars({ '--stats': 5 })}>
          <Stat value={n(stats?.papers ?? 0)} label={t('fld-stat-papers', { defaultValue: 'Papers' })} />
          <Stat value={n(stats?.authors ?? 0)} label={t('fld-stat-authors', { defaultValue: 'Authors' })} />
          <Stat value={n(stats?.citations ?? 0)} label={t('fld-stat-citations', { defaultValue: 'Citations' })} />
          <Stat value={n(stats?.h ?? 0)} label={t('fld-stat-h', { defaultValue: 'Field h-index' })} />
          <Stat value={n(stats?.r ?? 0)} label={t('fld-stat-r', { defaultValue: 'Field r-index' })} />
        </div>
      </PageHead>

      {series.length > 0 ? (
        <Scene len={2.2} steps={1} className="fld-time" pinClassName="fld-time-pin">
          <div className="wrap fld-time-in">
            <span className="label">{t('fld-time-label', { defaultValue: 'The field over time' })}</span>
            <h2 className="h2">{t('fld-time-title', { defaultValue: 'Papers per year' })}</h2>
            <p className="lede">
              {t('fld-time-lede', { defaultValue: 'Every paper in {{field}}, counted by the year it appeared, {{from}} to {{to}}.', field: name, from: first, to: last })}
            </p>
            <div
              className="fld-chart"
              role="img"
              aria-label={t('fld-chart-label', {
                defaultValue: 'Bar chart of papers per year in {{field}}, {{from}} to {{to}}. The busiest year is {{year}}.',
                field: name,
                from: first,
                to: last,
                year: peak.year,
              })}
            >
              <div className="fld-bars" style={cssVars({ '--cols': series.length })} aria-hidden="true">
                {series.map((y, i) => {
                  const a = Math.round((i * 50) / series.length);
                  return (
                    <div key={y.year} className="fld-bar sc-t" style={cssVars({ '--a': a, '--b': a + 45, '--v': y.count / (peak.count || 1) })}>
                      {showValues ? <span className="fld-bv num">{y.count}</span> : null}
                      <i className={`fld-bf${y.year === peak.year && peak.count > 1 ? ' is-peak' : ''}`} />
                    </div>
                  );
                })}
              </div>
              <div className="fld-axis num" style={cssVars({ '--cols': series.length })} aria-hidden="true">
                {series.map((y, i) => (
                  <span key={y.year}>{i % step === 0 ? y.year : ''}</span>
                ))}
              </div>
            </div>
            <p className="meta">
              {t('fld-peak', { defaultValue: 'Papers in the busiest year: {{papers}} ({{year}})', papers: n(peak.count), year: peak.year })}
            </p>
          </div>
          <div className="wrap fld-prog">
            <i className="scene-rail" aria-hidden="true" />
          </div>
        </Scene>
      ) : null}

      <Block id="fld-top" label={t('fld-top-label', { defaultValue: 'Most resonant' })} title={t('fld-top-title', { defaultValue: 'The papers that travelled furthest' })}>
        <ul className="rows">
          {top.map((p) => (
            <PaperRow key={p.id} paper={p} abstract field={false} />
          ))}
        </ul>
      </Block>

      <Block id="fld-people" label={t('fld-people-label', { defaultValue: 'People' })} title={t('fld-people-title', { defaultValue: 'Ranked by r-index' })}>
        {people.length > 0 ? (
          <ul className="rows">
            {people.map((m) => (
              <li key={m.author.id}>
                <Link className="row fld-person" to="/rmh-research/authors/$authorId" params={{ authorId: m.author.id }}>
                  <span className="fld-person-who">
                    <span className="h3">{m.author.name}</span>
                    <span className="meta">
                      {m.author.role} · {m.author.lab}
                    </span>
                  </span>
                  <span className="fld-person-n">
                    <span className="fld-k meta">h</span>
                    <span className="num">{n(m.h)}</span>
                  </span>
                  <span className="fld-person-n fld-person-r">
                    <span className="fld-k meta">r</span>
                    <b className="num">{n(m.r)}</b>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="body mute">{t('fld-people-empty', { defaultValue: 'No one has this field as a home field yet.' })}</p>
        )}
      </Block>

      <Block id="fld-exchange" label={t('fld-exchange-label', { defaultValue: 'Exchange' })} title={t('fld-exchange-title', { defaultValue: 'Fields it trades citations with' })}>
        {exchange.length > 0 ? (
          <ul className="rows">
            {exchange.map((e) => (
              <li key={e.field}>
                <Link className="row fld-ex" to="/rmh-research/fields/$fieldId" params={{ fieldId: e.field }}>
                  <span className="fld-ex-name">
                    <span className="chip">{getField(e.field).code}</span>
                    <span className="h3">{labels.name(e.field)}</span>
                  </span>
                  <span className="bar-track fld-ex-bar" aria-hidden="true">
                    <span className="bar-fill" style={cssVars({ '--v': (e.cites + e.citedBy) / maxTraffic }, { display: 'block' })} />
                  </span>
                  <span className="meta fld-ex-n">
                    <span>{t('fld-ex-cites', { defaultValue: 'Cites {{value}}', value: n(e.cites) })}</span>
                    <span>{t('fld-ex-cited', { defaultValue: 'Cited by {{value}}', value: n(e.citedBy) })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="body mute">{t('fld-exchange-empty', { defaultValue: 'No citations cross this field yet.' })}</p>
        )}
      </Block>

      <Block id="fld-all" label={t('fld-papers-label', { defaultValue: 'Every paper' })} title={t('fld-papers-title', { defaultValue: 'Newest first' })}>
        <ul className="rows">
          {papers.map((p) => (
            <PaperRow key={p.id} paper={p} field={false} />
          ))}
        </ul>
        <p className="fld-more">
          <Link className="btn-text" to="/rmh-research/archive" search={{ field: id }}>
            {t('fld-open-archive', { defaultValue: 'Search {{field}} in the archive', field: name })}
            <Arrow />
          </Link>
        </p>
      </Block>
    </>
  );
}
