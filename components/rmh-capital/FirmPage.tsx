import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowIcon, PageHead, Plate } from './shared';

export default function FirmPage() {
  const { t } = useTranslation('c-rmh-capital');

  return (
    <>
      <PageHead
        title={t('hero-heading-firm-page', {
          defaultValue: 'A firm built around the client, not the product.',
        })}
        lede={t('hero-lede-firm-page', {
          defaultValue:
            'RMH Capital is an integrated investment bank and financial platform. We bring advisory, capital, and intelligence to a single relationship — and we stay with our clients through every stage of their growth.',
        })}
      />

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <div className="o-head rv">
              <h2 className="h2">
                {t('mission-heading', {
                  defaultValue: 'Serve a client across the full arc of their journey.',
                })}
              </h2>
            </div>
            <div className="o-body rv d1">
              <p className="body">
                {t('mission-p1', {
                  defaultValue:
                    "Most financial institutions are organized as a federation of product lines, each optimizing for its own mandate. The result is a client experience that fragments at exactly the moments that matter most — a financing that doesn't talk to an acquisition, advice that ends where capital begins.",
                })}
              </p>
            </div>
            <div className="o-body2 rv d2">
              <p className="body">
                {t('mission-p2', {
                  defaultValue:
                    'We built RMH Capital the other way around. One platform follows a company from its first venture round to large-cap M&A, from a revolving credit line to a public listing and beyond. Every interaction deepens what we know, and lowers the cost of serving the next need.',
                })}
              </p>
              <p className="body">
                {t('mission-p3', {
                  defaultValue:
                    'Our mission is simple to state and demanding to live: be the firm a client can rely on at every stage, and earn that trust through judgment, discretion, and results.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="rv-wipe">
          <Plate kind="louvres" className="plate--wide" />
        </div>
      </div>

      <section className="sec">
        <div className="wrap">
          <blockquote className="quote rv">
            {t('durable-advantage', { defaultValue: 'Durable advantage' })}{' '}
            {t('pullquote-body', {
              defaultValue:
                'belongs to the firm that serves a client across the full arc of their journey — not the firm that sells one product and walks away.',
            })}
          </blockquote>
          <p className="quote-by rv d1">
            {t('firm-pullquote-attrib', { defaultValue: 'The RMH Capital platform thesis' })}
          </p>
        </div>
      </section>

      <section className="sec sec--flush">
        <div className="wrap">
          <hr className="rule rv-rule" />
          <div className="offset firm-values">
            <div className="o-head rv">
              <h2 className="h2">
                {t('values-heading', { defaultValue: 'The principles behind every decision.' })}
              </h2>
            </div>
            <div className="o-full trio">
              <div className="trio-item rv">
                <h3 className="h3">
                  {t('value-clients-first-title', { defaultValue: 'Clients first' })}
                </h3>
                <p>
                  {t('value-clients-first-body', {
                    defaultValue:
                      "We measure ourselves on the total value of a relationship over its lifetime, not the revenue of a single transaction. The client's outcome leads.",
                  })}
                </p>
              </div>
              <div className="trio-item rv d1">
                <h3 className="h3">
                  {t('value-risk-discipline-title', { defaultValue: 'Risk discipline' })}
                </h3>
                <p>
                  {t('value-risk-discipline-body', {
                    defaultValue:
                      'A unified risk and compliance framework runs across every business. We protect the firm and our clients by understanding exposure before we take it.',
                  })}
                </p>
              </div>
              <div className="trio-item rv d2">
                <h3 className="h3">
                  {t('value-intellectual-rigor-title', { defaultValue: 'Intellectual rigor' })}
                </h3>
                <p>
                  {t('value-intellectual-rigor-body', {
                    defaultValue:
                      'We hire people who think for themselves and argue for the right answer. Strong opinions are welcome; sloppy reasoning is not.',
                  })}
                </p>
              </div>
              <div className="trio-item rv">
                <h3 className="h3">
                  {t('value-integrity-title', { defaultValue: 'Integrity, without exception' })}
                </h3>
                <p>
                  {t('value-integrity-body', {
                    defaultValue:
                      'Confidentiality and ethics walls are non-negotiable. Our reputation is the asset every business depends on.',
                  })}
                </p>
              </div>
              <div className="trio-item rv d1">
                <h3 className="h3">{t('value-one-firm-title', { defaultValue: 'One firm' })}</h3>
                <p>
                  {t('value-one-firm-body', {
                    defaultValue:
                      'Bankers here are advisors first and product specialists second. We are rewarded for bringing the whole platform to a client, not for guarding territory.',
                  })}
                </p>
              </div>
              <div className="trio-item rv d2">
                <h3 className="h3">
                  {t('value-long-term-title', { defaultValue: 'The long term' })}
                </h3>
                <p>
                  {t('value-long-term-body', {
                    defaultValue:
                      'We build relationships, businesses, and careers to last. Short-term wins that compromise the franchise are not wins at all.',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--flush">
        <div className="wrap">
          <hr className="rule rv-rule" />
          <div className="offset">
            <div className="o-head rv">
              <h2 className="h2">
                {t('platform-heading', { defaultValue: 'How the platform compounds.' })}
              </h2>
            </div>
            <div className="o-wide rv d1">
              <p className="body ink">
                {t('platform-lede', {
                  defaultValue:
                    'Integration is engineered, not hoped for. Three structural connectors turn six businesses into one advantage.',
                })}
              </p>
            </div>
            <div className="o-full rows firm-rows">
              <div className="row rv">
                <h3 className="row-title">
                  {t('card1-title', { defaultValue: 'One client record' })}
                </h3>
                <p className="row-text">
                  {t('card1-body', {
                    defaultValue:
                      'A shared view of every relationship across all businesses, so the firm always sees the whole client — not one transaction at a time.',
                  })}
                </p>
              </div>
              <div className="row rv">
                <h3 className="row-title">
                  {t('card2-title', { defaultValue: 'One risk framework' })}
                </h3>
                <p className="row-text">
                  {t('card2-body', {
                    defaultValue:
                      'A unified approach to risk and compliance keeps exposures coherent and ethics walls intact as a client moves between advisory, markets, and lending.',
                  })}
                </p>
              </div>
              <div className="row rv">
                <h3 className="row-title">{t('card3-title', { defaultValue: 'One incentive' })}</h3>
                <p className="row-text">
                  {t('card3-body', {
                    defaultValue:
                      'We reward collaboration over territory. Teams are measured on the value they create for the client across the platform, over the life of the relationship.',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="wrap">
          <hr className="rule rv-rule" />
          <div className="offset">
            <div className="o-head rv">
              <h2 className="h2">
                {t('cta-heading-firm-page', {
                  defaultValue: 'Bring the whole firm to your next decision.',
                })}
              </h2>
            </div>
            <div className="o-body rv d1 stack">
              <p className="body">
                {t('cta-body-firm-page', {
                  defaultValue:
                    "Whether you're raising your first round or weighing a transformative acquisition, our teams are ready to help.",
                })}
              </p>
              <div className="actions">
                <Link className="cta cta--solid" to="/rmh-capital/contact">
                  {t('cta-link', { defaultValue: 'Contact RMH Capital' })} <ArrowIcon />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
