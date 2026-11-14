import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowIcon, PageHead, Plate } from './shared';

export default function CareersPage() {
  const { t } = useTranslation('c-rmh-capital');
  return (
    <>
      <PageHead
        title={t('careers-headline', {
          defaultValue: 'Build a career across the whole company arc.',
        })}
        lede={t('careers-lede', {
          defaultValue:
            'RMH Capital is a place to do the most interesting work in finance — advising founders one year and global institutions the next — and to grow with a platform built for the long term.',
        })}
      />

      <section className="sec" id="culture">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('culture-headline', { defaultValue: 'Elite standards, without the airlessness.' })}
            </h2>
            <p className="o-body rv d1">
              {t('culture-body-1', {
                defaultValue:
                  'We hold ourselves to a high bar — on judgment, on rigor, on integrity — because our clients trust us with decisions that matter. That standard is the point, not the pressure for its own sake.',
              })}
            </p>
            <p className="o-body2 rv d2">
              {t('culture-body-2', {
                defaultValue:
                  'What makes it work is the people. We hire advisors first, specialists second, and we reward the colleagues who bring the whole firm to a problem. Ambition here is collaborative, and the work is genuinely interesting.',
              })}
            </p>
          </div>
        </div>
      </section>

      <section className="sec sec--flush">
        <div className="wrap">
          <div className="plates">
            <div className="rv-wipe">
              <Plate kind="colonnade" />
            </div>
            <div className="rv-wipe">
              <Plate kind="disc" />
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('ways-in-headline', { defaultValue: 'Find the path that fits where you are.' })}
            </h2>
            <div className="o-full rows rv">
              <div className="row">
                <h3 className="row-title">
                  {t('analyst-programs-title', { defaultValue: 'Analyst Programs' })}
                </h3>
                <p className="row-text">
                  {t('analyst-programs-body', {
                    defaultValue:
                      'Our flagship entry point. Analysts join a business, take on real responsibility early, and learn the platform from the inside through structured training and senior mentorship.',
                  })}
                </p>
              </div>
              <div className="row">
                <h3 className="row-title">
                  {t('campus-recruiting-title', { defaultValue: 'Campus Recruiting' })}
                </h3>
                <p className="row-text">
                  {t('campus-recruiting-body', {
                    defaultValue:
                      'Internships and graduate roles for students ready to test themselves against the best. We recruit for curiosity and judgment as much as for résumés.',
                  })}
                </p>
              </div>
              <div className="row">
                <h3 className="row-title">
                  {t('experienced-professionals-title', {
                    defaultValue: 'Experienced Professionals',
                  })}
                </h3>
                <p className="row-text">
                  {t('experienced-professionals-body', {
                    defaultValue:
                      'For people who have built a track record and want a platform that lets them bring more to every client. We hire across all six businesses and corporate functions.',
                  })}
                </p>
              </div>
              <div className="row">
                <h3 className="row-title">
                  {t('engineering-technology-title', { defaultValue: 'Engineering & Technology' })}
                </h3>
                <p className="row-text">
                  {t('engineering-technology-body', {
                    defaultValue:
                      'The platform runs on the systems our engineers build — shared client data, real-time risk, and the tools our teams use every day. Technology is a first-class discipline here.',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="trio">
            <div className="trio-item rv">
              <h3 className="h3">{t('value-ownership-title', { defaultValue: 'Ownership' })}</h3>
              <p>
                {t('value-ownership-body', {
                  defaultValue: 'Real responsibility early, and the autonomy to act on it.',
                })}
              </p>
            </div>
            <div className="trio-item rv d1">
              <h3 className="h3">{t('value-mentorship-title', { defaultValue: 'Mentorship' })}</h3>
              <p>
                {t('value-mentorship-body', {
                  defaultValue:
                    'Senior people who invest in how you think, not just what you produce.',
                })}
              </p>
            </div>
            <div className="trio-item rv d2">
              <h3 className="h3">{t('value-mobility-title', { defaultValue: 'Mobility' })}</h3>
              <p>
                {t('value-mobility-body', {
                  defaultValue: 'Move across businesses and markets as your interests grow.',
                })}
              </p>
            </div>
            <div className="trio-item rv d3">
              <h3 className="h3">
                {t('value-long-term-title', { defaultValue: 'The long term' })}
              </h3>
              <p>
                {t('value-long-term-body-careers-page', {
                  defaultValue: 'Careers built to last, on a platform built the same way.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec" id="open-roles">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('open-roles-headline', { defaultValue: 'Ready when you are.' })}
            </h2>
            <div className="o-body rv d1 stack">
              <p>
                {t('open-roles-body', {
                  defaultValue:
                    "We're hiring across investment banking, markets, technology, and corporate functions in our offices worldwide. Tell us where you'd make the biggest difference.",
                })}
              </p>
              <Link
                className="cta cta--solid"
                to="/rmh-capital/contact"
                search={{ type: 'Careers' }}
              >
                {t('apply-or-inquire', { defaultValue: 'Apply or inquire' })} <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
