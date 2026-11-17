/**
 * RMH Research — /fields. The head, a pinned scene with one step per division
 * (the division large, its fields beneath), then the complete list of fields
 * as rows on rules. Flow mode is the four divisions one after another.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DIVISIONS, FIELDS, fieldsInDivision } from '@/lib/rmh-research/fields';
import { fieldStats } from '@/lib/rmh-research/catalog';
import { Arrow, PageHead, Scene, SceneDots, SecHead, Step, useFieldLabels, useNumber } from './shared';

export default function FieldsPage() {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const labels = useFieldLabels();
  const count = DIVISIONS.length;

  return (
    <>
      <PageHead
        crumbs={[{ label: t('nav-fields', { defaultValue: 'Fields' }) }]}
        title={t('fld-title', { defaultValue: 'Twelve fields' })}
        lede={t('fld-lede', {
          defaultValue: 'RMH Research publishes in the formal, physical, life and human sciences. Every field has its own papers, its own people and its own r-index.',
        })}
      />

      <Scene len={4.4} steps={count} className="fld-scene" pinClassName="fld-pin">
        <div className="sc-stack fld-stack">
          {DIVISIONS.map((d, i) => (
            <Step key={d} index={i} count={count} className="fld-step">
              <div className="wrap fld-div">
                <p className="meta">{t('fld-division-of', { defaultValue: 'Division {{index}} of {{total}}', index: i + 1, total: count })}</p>
                <h2 className="h1 fld-div-name">{labels.division(d)}</h2>
                <ul className="fld-div-fields cols-3">
                  {fieldsInDivision(d).map((f) => (
                    <li key={f.id}>
                      <Link className="fld-div-field" to="/rmh-research/fields/$fieldId" params={{ fieldId: f.id }}>
                        <span className="fld-div-top">
                          <span className="chip">{f.code}</span>
                          <Arrow />
                        </span>
                        <span className="h3">{labels.name(f.id)}</span>
                        <span className="fld-div-blurb">{labels.blurb(f.id)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Step>
          ))}
        </div>
        <div className="wrap fld-prog">
          <SceneDots count={count} />
          <i className="scene-rail" aria-hidden="true" />
        </div>
      </Scene>

      <section className="sec sec--rule" aria-labelledby="fld-all">
        <div className="wrap">
          <SecHead
            label={t('fld-all-label', { defaultValue: 'All fields' })}
            title={<span id="fld-all">{t('fld-all-title', { defaultValue: 'The complete list' })}</span>}
          />
          <div className="fld-head meta" aria-hidden="true">
            <span>{t('fld-col-code', { defaultValue: 'Code' })}</span>
            <span>{t('fld-col-field', { defaultValue: 'Field' })}</span>
            <span>{t('fld-col-papers', { defaultValue: 'Papers' })}</span>
            <span>{t('fld-col-authors', { defaultValue: 'Authors' })}</span>
            <span>{t('fld-col-active', { defaultValue: 'Active' })}</span>
            <span>{t('fld-col-r', { defaultValue: 'r-index' })}</span>
          </div>
          <ul className="rows fld-list">
            {FIELDS.map((f) => {
              const s = fieldStats(f.id);
              return (
                <li key={f.id}>
                  <Link className="row fld-row" to="/rmh-research/fields/$fieldId" params={{ fieldId: f.id }}>
                    <span className="chip fld-code">{f.code}</span>
                    <span className="fld-name">
                      <span className="h3">{labels.name(f.id)}</span>
                      <span className="fld-blurb">{labels.blurb(f.id)}</span>
                    </span>
                    <span className="fld-cell">
                      <span className="fld-k meta">{t('fld-col-papers', { defaultValue: 'Papers' })}</span>
                      <b className="num">{n(s?.papers ?? 0)}</b>
                    </span>
                    <span className="fld-cell">
                      <span className="fld-k meta">{t('fld-col-authors', { defaultValue: 'Authors' })}</span>
                      <b className="num">{n(s?.authors ?? 0)}</b>
                    </span>
                    <span className="fld-cell">
                      <span className="fld-k meta">{t('fld-col-active', { defaultValue: 'Active' })}</span>
                      <span className="num">{s?.span ? `${s.span.from}–${s.span.to}` : '—'}</span>
                    </span>
                    <span className="fld-cell fld-r">
                      <span className="fld-k meta">{t('fld-col-r', { defaultValue: 'r-index' })}</span>
                      <b className="num">{n(s?.r ?? 0)}</b>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
