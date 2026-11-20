/**
 * RMH PMC contact. The page head is the one stage; the stations and the inquiry
 * form follow on paper: stations as rows on hairlines, the form as plain fields.
 */
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { Arrow, PageHead } from './shared';

const INQUIRY_TYPES = [
  'General',
  'Protective Services',
  'Static Guarding',
  'Intelligence',
  'Logistics',
  'Strategic Advisory',
  'Sovereign Solutions',
  'Recruiting',
  'Media',
] as const;

export default function ContactPage({ initialType }: { initialType?: string }) {
  const { t } = useTranslation('c-rmh-pmc');
  const [type, setType] = useState<string>(
    initialType && INQUIRY_TYPES.includes(initialType as (typeof INQUIRY_TYPES)[number]) ? initialType : 'General',
  );
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSent(true);
    e.currentTarget.reset();
    setType('General');
    // One frame later the confirmation is laid out; bring it into view.
    requestAnimationFrame(() => {
      document.getElementById('form-success')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="pg-contact">
      <PageHead
        seed={13}
        meta={[
          [t('field-file', { defaultValue: 'File' }), 'CONTACT'],
          [t('field-class', { defaultValue: 'Class' }), 'OPEN CHANNEL'],
          [t('field-status', { defaultValue: 'Status' }), 'MONITORED'],
        ]}
        desig={t('contact-desig', { defaultValue: 'Contact // Request a Briefing' })}
        title={t('open-a-channel-heading', { defaultValue: 'Open a channel.' })}
        lede={t('contact-lede', { defaultValue: "Tell us what you need protected, secured, or understood, and we'll route the inquiry to the desk that owns it. Every engagement begins with vetting — sanctions screening, jurisdictional review, and a hard look at the task. Nothing is taken on without it." })}
      />

      <section className="sec">
        <div className="wrap split">
          {/* stations */}
          <div className="rv">
            <span className="desig">{t('stations-desig', { defaultValue: 'Stations' })}</span>
            <div className="rows" style={{ marginTop: 24 }}>
              <div className="row row--2">
                <h3 className="row-t">{t('ops-center-title', { defaultValue: 'Operations Center' })}</h3>
                <p className="row-d">
                  {t('ops-center-desc', { defaultValue: 'Undisclosed location' })}
                  <br />
                  {t('ops-center-hours', { defaultValue: 'Manned 24/7 · secure watch floor' })}
                  <br />
                  {t('ops-center-liaison', { defaultValue: 'Standby liaison for active clients' })}
                </p>
              </div>
              <div className="row row--2">
                <h3 className="row-t">{t('reg-office-title', { defaultValue: 'Registered Office' })}</h3>
                <p className="row-d">
                  RMH PMC (Holdings) Ltd.
                  <br />
                  Dubai International Financial Centre
                  <br />
                  United Arab Emirates
                </p>
              </div>
              <div className="row row--2">
                <h3 className="row-t">{t('selection-recruiting-title', { defaultValue: 'Selection & Recruiting' })}</h3>
                <p className="row-d">
                  {t('selection-recruiting-desc', { defaultValue: 'By referral and direct application' })}
                  <br />
                  {t('cleared-candidates', { defaultValue: 'Cleared candidates only' })}
                  <br />
                  <span className="meta ink">select@rmhpmc.example</span>
                </p>
              </div>
              <div className="row row--2">
                <h3 className="row-t">{t('media-affairs-title', { defaultValue: 'Media & Public Affairs' })}</h3>
                <p className="row-d">
                  {t('media-affairs-desc', { defaultValue: 'On-record inquiries only' })}
                  <br />
                  <span className="meta ink">press@rmhpmc.example</span>
                </p>
              </div>
            </div>
            <p className="form-note">
              {t('station-note', { defaultValue: 'Detailed station locations, callsigns, and secure contact channels are shared after vetting.' })}
            </p>
          </div>

          {/* form */}
          <div className="rv">
            <span className="desig">{t('open-channel-desig', { defaultValue: 'Open a Channel' })}</span>
            <div style={{ marginTop: 24 }}>
              <div className={`form-success${sent ? ' show' : ''}`} id="form-success" role="status">
                {t('form-success-msg', { defaultValue: 'Channel opened. A member of our liaison staff will reach out through secure contact.' })}
              </div>
              <form id="inquiry-form" noValidate onSubmit={onSubmit}>
                <div className="form-field">
                  <label htmlFor="inquiry-type">{t('inquiry-type-label', { defaultValue: 'Inquiry type' })}</label>
                  <Select id="inquiry-type" name="inquiry-type" required value={type} onChange={(e) => setType(e.target.value)}>
                    {INQUIRY_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="name">{t('full-name-label', { defaultValue: 'Full name' })}</label>
                    <input id="name" name="name" type="text" autoComplete="name" required />
                  </div>
                  <div className="form-field">
                    <label htmlFor="org">{t('organization-label', { defaultValue: 'Organization' })}</label>
                    <input id="org" name="org" type="text" autoComplete="organization" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="email">{t('email-label', { defaultValue: 'Email' })}</label>
                    <input id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="form-field">
                    <label htmlFor="theater">{t('theater-label', { defaultValue: 'Country / theater of operation' })}</label>
                    <input id="theater" name="theater" type="text" autoComplete="country-name" required />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="message">{t('brief-us-label', { defaultValue: 'Brief us' })}</label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    placeholder={t('message-placeholder', { defaultValue: "Outline the task, the environment, and your timeline. Share only what you're comfortable sending unencrypted." })}
                  />
                </div>
                <button className="btn" type="submit">
                  {t('submit-btn', { defaultValue: 'Open channel' })} <Arrow />
                </button>
                <p className="form-note">
                  {t('form-disclaimer', { defaultValue: 'Submissions are screened before any reply. Treat this form as an open channel — do not transmit classified, proprietary, or operationally sensitive detail until a secure line is established. RMH PMC engages only after vetting, and reserves the right to decline any inquiry without explanation.' })}
                </p>
                <p className="form-note">
                  {t('form-existing-contact', { defaultValue: 'Already in contact with a desk? Continue through your assigned liaison rather than this form.' })}{' '}
                  <Link to="/rmh-pmc/capabilities">{t('review-capabilities', { defaultValue: 'Review capabilities' })}</Link>{' '}
                  {t('form-unsure', { defaultValue: "first if you're unsure which line you need." })}
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
