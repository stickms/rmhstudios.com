import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { ArrowIcon, PageHead } from './shared';

const INQUIRY_TYPES = [
  'Investment Banking',
  'Markets',
  'Corporate Banking',
  'Venture Capital',
  'Careers',
  'Media',
  'General Inquiry',
] as const;

export default function ContactPage({ initialType }: { initialType?: string }) {
  const [type, setType] = useState<string>(
    initialType && INQUIRY_TYPES.includes(initialType as (typeof INQUIRY_TYPES)[number])
      ? initialType
      : 'Investment Banking',
  );
  const [sent, setSent] = useState(false);
  const { t } = useTranslation('c-rmh-capital');

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSent(true);
    e.currentTarget.reset();
    setType('Investment Banking');
    requestAnimationFrame(() => {
      document
        .getElementById('form-success')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <>
      <PageHead
        title={t('reach-the-right-team', { defaultValue: 'Reach the right team.' })}
        lede={t('lede', {
          defaultValue:
            "Tell us what you're working on and we'll route your message to the people who can help. For anything time-sensitive, choose the matching inquiry type below.",
        })}
      />

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <div className="o-lead rv">
              <h2 className="h3">{t('offices', { defaultValue: 'Offices' })}</h2>
              <div className="rows contact-offices">
                <div className="row">
                  <h3 className="row-title">New York</h3>
                  <p className="row-text">
                    {t('ny-desc', { defaultValue: 'Global headquarters' })}
                    <br />
                    One Platform Plaza, New York, NY
                  </p>
                </div>
                <div className="row">
                  <h3 className="row-title">London</h3>
                  <p className="row-text">
                    {t('london-desc', { defaultValue: 'EMEA' })}
                    <br />
                    Threadneedle Court, London EC2
                  </p>
                </div>
                <div className="row">
                  <h3 className="row-title">Singapore</h3>
                  <p className="row-text">
                    {t('singapore-desc', { defaultValue: 'APAC' })}
                    <br />
                    Marina Financial Centre, Singapore
                  </p>
                </div>
              </div>
              <div className="stack">
                <h2 className="h3">{t('general', { defaultValue: 'General' })}</h2>
                <p style={{ fontSize: 15 }}>
                  {t('general-inquiries', { defaultValue: 'General inquiries' })}
                  <br />
                  <a className="gold-text" href="mailto:hello@rmhcapital.example">
                    hello@rmhcapital.example
                  </a>
                </p>
                <p style={{ fontSize: 15 }}>
                  {t('media', { defaultValue: 'Media' })}
                  <br />
                  <a className="gold-text" href="mailto:press@rmhcapital.example">
                    press@rmhcapital.example
                  </a>
                </p>
              </div>
            </div>

            <div className="o-wide rv d1">
              <h2 className="h3">{t('send-a-message', { defaultValue: 'Send a message' })}</h2>
              <div className={`form-success${sent ? ' show' : ''}`} id="form-success" role="status">
                {t('form-success', {
                  defaultValue:
                    'Thank you — your message is on its way. The right team will be in touch shortly.',
                })}
              </div>
              <form id="inquiry-form" noValidate onSubmit={onSubmit}>
                <div className="field">
                  <label htmlFor="inquiry-type">
                    {t('inquiry-type', { defaultValue: 'Inquiry type' })}
                  </label>
                  <Select
                    id="inquiry-type"
                    name="inquiry-type"
                    required
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    {INQUIRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="name">{t('full-name', { defaultValue: 'Full name' })}</label>
                    <input id="name" name="name" type="text" autoComplete="name" required />
                  </div>
                  <div className="field">
                    <label htmlFor="org">
                      {t('company-org', { defaultValue: 'Company / organization' })}
                    </label>
                    <input id="org" name="org" type="text" autoComplete="organization" />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="email">{t('email', { defaultValue: 'Email' })}</label>
                    <input id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">
                      {t('phone', { defaultValue: 'Phone' })}{' '}
                      <span
                        style={{
                          textTransform: 'none',
                          color: 'var(--gray-dim)',
                          letterSpacing: 0,
                        }}
                      >
                        ({t('optional', { defaultValue: 'optional' })})
                      </span>
                    </label>
                    <input id="phone" name="phone" type="tel" autoComplete="tel" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="message">
                    {t('how-can-we-help', { defaultValue: 'How can we help?' })}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    placeholder={t('message-placeholder', {
                      defaultValue: "Share a few details about what you're working on.",
                    })}
                  />
                </div>
                <button className="cta cta--solid" type="submit">
                  {t('send-message', { defaultValue: 'Send message' })}
                  <ArrowIcon />
                </button>
                <p className="form-note">
                  {t('form-note', {
                    defaultValue:
                      'By submitting, you agree that RMH Capital may contact you about your inquiry. We never share your information. This form is for general contact and does not transmit confidential or material non-public information.',
                  })}
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
