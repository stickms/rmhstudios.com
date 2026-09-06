/**
 * /rmh-datacenter/contact — the capacity request desk.
 *
 * There is no backend behind this form, and it does not pretend there is. A
 * real API route would mean an inbox, a rate limit and a spam story for a page
 * whose job is to publish four desk addresses. So the submit button composes
 * the enquiry into a `mailto:` and hands it to the visitor's mail client: what
 * they typed actually goes somewhere, and the panel that follows names the
 * address to copy for the case where no mail client is registered. A form that
 * flashes "thank you" and drops the message is the failure mode this avoids.
 *
 * `?intent=` is set by the footer, the facilities tour CTA and the peering CTA,
 * so a visitor arriving from one of those lands with the right desk already
 * chosen.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';

const INTENTS = [
  'Colocation',
  'Bare metal',
  'Accelerated compute',
  'Storage',
  'Resilience',
  'Site tour',
  'Peering',
  'Sustainability reporting',
  'Media',
] as const;

type Intent = (typeof INTENTS)[number];

/** Every request lands here; the desk inside routes it by the subject line. */
const DESK_EMAIL = 'capacity@rmhdatacenter.com';

export default function ContactPage({ initialIntent }: { initialIntent?: string }) {
  const { t } = useTranslation('c-rmh-datacenter');
  const [intent, setIntent] = useState<string>(
    initialIntent && INTENTS.includes(initialIntent as Intent) ? initialIntent : 'Colocation',
  );
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const read = (k: string) => String(data.get(k) ?? '').trim();

    // Built from the fields rather than from the form's own encoding: `mailto:`
    // takes a percent-encoded body, and a `<form method="post" action="mailto:">`
    // would hand the mail client a urlencoded blob instead of a readable note.
    const body = [
      `Organisation: ${read('organisation')}`,
      `Contact: ${read('name')} <${read('email')}>`,
      `Desk: ${intent}`,
      `Power envelope: ${read('power') || '—'}`,
      `Regions: ${read('region') || '—'}`,
      '',
      read('detail'),
    ].join('\n');
    const href =
      `mailto:${DESK_EMAIL}?subject=${encodeURIComponent(`${intent} — ${read('organisation')}`)}` +
      `&body=${encodeURIComponent(body)}`;

    setSent(true);
    window.location.href = href;
  };

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="kicker">{t('con-kicker', { defaultValue: 'Capacity desk' })}</span>
          <h1>{t('con-title', { defaultValue: 'Send us a load' })}</h1>
          <p className="lede">
            {t('con-lede', {
              defaultValue:
                'Kilowatts, cabinets, where your users are and what you have to be compliant with. That is enough to answer with the halls that fit — and the ones that do not, which is usually the more useful half.',
            })}
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="tiles reveal">
            <div className="tile">
              <span className="kicker">{t('con-desks', { defaultValue: 'Desks' })}</span>
              <dl className="spec" style={{ marginTop: 10 }}>
                <div className="spec-row">
                  <dt>{t('con-desk-sales', { defaultValue: 'Capacity' })}</dt>
                  <dd>capacity@rmhdatacenter.com</dd>
                </div>
                <div className="spec-row">
                  <dt>{t('con-desk-noc', { defaultValue: 'NOC (24/7)' })}</dt>
                  <dd>noc@rmhdatacenter.com</dd>
                </div>
                <div className="spec-row">
                  <dt>{t('con-desk-peering', { defaultValue: 'Peering' })}</dt>
                  <dd>peering@rmhdatacenter.com · AS-RMHDC</dd>
                </div>
                <div className="spec-row">
                  <dt>{t('con-desk-abuse', { defaultValue: 'Abuse' })}</dt>
                  <dd>abuse@rmhdatacenter.com</dd>
                </div>
              </dl>
            </div>
            <div className="tile">
              <span className="kicker">
                {t('con-response', { defaultValue: 'What happens next' })}
              </span>
              <p style={{ marginTop: 10 }}>
                {t('con-response-desc', {
                  defaultValue:
                    'An engineer reads it, not a queue. Capacity enquiries are answered within two working days with a named campus, an available power envelope and a delivery date we can hold. A P1 raised at the NOC address is acknowledged in fifteen minutes, at any hour.',
                })}
              </p>
              <p style={{ marginTop: 14 }}>
                {t('con-response-tour', {
                  defaultValue:
                    'Site tours run on weekday mornings and are escorted by the engineer who runs that floor. Bring photo ID that matches the name on the request.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">REQ</div>
            <div className="sechead-body">
              <span className="kicker">
                {t('con-form-kicker', { defaultValue: 'Capacity request' })}
              </span>
              <h2>{t('con-form-heading', { defaultValue: 'Tell us the shape of the load' })}</h2>
            </div>
          </div>

          {sent ? (
            <div className="form-sent reveal" id="dc-form-sent" role="status">
              <h3>{t('con-sent-heading', { defaultValue: 'Handed to your mail client' })}</h3>
              <p>
                {t('con-sent-body', {
                  defaultValue:
                    'Your enquiry was composed as an email to capacity@rmhdatacenter.com — send it from there and an engineer replies within two working days. If no mail window opened, your browser has no mail client registered: copy what you wrote to that address instead.',
                })}
              </p>
            </div>
          ) : null}

          <form className="form-box reveal d1" onSubmit={onSubmit}>
            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="dc-name">{t('con-f-name', { defaultValue: 'Name' })}</label>
                <input id="dc-name" name="name" type="text" autoComplete="name" required />
              </div>
              <div className="form-row">
                <label htmlFor="dc-org">{t('con-f-org', { defaultValue: 'Organisation' })}</label>
                <input
                  id="dc-org"
                  name="organisation"
                  type="text"
                  autoComplete="organization"
                  required
                />
              </div>
              <div className="form-row">
                <label htmlFor="dc-email">{t('con-f-email', { defaultValue: 'Work email' })}</label>
                <input id="dc-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="form-row">
                <label htmlFor="dc-intent">{t('con-f-intent', { defaultValue: 'Desk' })}</label>
                <Select
                  id="dc-intent"
                  name="intent"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                >
                  {INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="form-row">
                <label htmlFor="dc-power">
                  {t('con-f-power', { defaultValue: 'Power envelope' })}
                </label>
                <input
                  id="dc-power"
                  name="power"
                  type="text"
                  placeholder="e.g. 240 kW, growing to 1 MW"
                />
              </div>
              <div className="form-row">
                <label htmlFor="dc-region">
                  {t('con-f-region', { defaultValue: 'Regions of interest' })}
                </label>
                <input
                  id="dc-region"
                  name="region"
                  type="text"
                  placeholder="e.g. us-east + eu-west"
                />
              </div>
              <div className="form-row wide">
                <label htmlFor="dc-detail">
                  {t('con-f-detail', { defaultValue: 'What are you running?' })}
                </label>
                <textarea
                  id="dc-detail"
                  name="detail"
                  required
                  placeholder={t('con-f-detail-ph', {
                    defaultValue:
                      'Workload, cabinet count, density per cabinet, compliance obligations, and when you need the floor.',
                  })}
                />
              </div>
            </div>
            <div
              style={{
                marginTop: 22,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 18,
                alignItems: 'center',
              }}
            >
              <button className="btn btn-signal" type="submit">
                {t('con-submit', { defaultValue: 'Compose request' })}{' '}
                <span className="arw">→</span>
              </button>
              <p className="form-note">
                {t('con-form-note', {
                  defaultValue:
                    'Opens your own mail client with the request written out. Nothing is submitted to a server from this page.',
                })}
              </p>
            </div>
          </form>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">FAQ</div>
            <div className="sechead-body">
              <span className="kicker">
                {t('con-faq-kicker', { defaultValue: 'Asked first, usually' })}
              </span>
              <h2>{t('con-faq-heading', { defaultValue: 'Four answers before you write' })}</h2>
            </div>
          </div>
          <div className="cards c2 reveal d1">
            <div className="qa">
              <h3>{t('con-q1', { defaultValue: 'What is the smallest thing you sell?' })}</h3>
              <p>
                {t('con-a1', {
                  defaultValue:
                    'A quarter cabinet, or a single bare-metal server. There is no minimum commit on either, and no floor on the cross-connect count.',
                })}
              </p>
            </div>
            <div className="qa">
              <h3>{t('con-q2', { defaultValue: 'How long until we can rack?' })}</h3>
              <p>
                {t('con-a2', {
                  defaultValue:
                    'Standard density, two to three weeks from signature at any campus with committed capacity below 85%. Liquid-cooled rows are quoted individually because the manifold work is real.',
                })}
              </p>
            </div>
            <div className="qa">
              <h3>{t('con-q3', { defaultValue: 'Can we audit the facility?' })}</h3>
              <p>
                {t('con-a3', {
                  defaultValue:
                    'Yes. SOC 2 Type II and ISO 27001 reports are available under NDA, and customers above 100 kW may run their own on-site audit annually at their own cost.',
                })}
              </p>
            </div>
            <div className="qa">
              <h3>{t('con-q4', { defaultValue: 'Are you selling us RMH Studios too?' })}</h3>
              <p>
                {t('con-a4', {
                  defaultValue:
                    'No. RMH Datacenter is a separate company inside the group and the platform is simply its largest tenant. Nothing about buying floor space obliges you to use anything else the group makes.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
