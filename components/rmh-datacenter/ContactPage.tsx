/**
 * /rmh-datacenter/contact — the capacity desk.
 *
 * There is no backend behind this form and it does not pretend there is. A real
 * API route would mean an inbox, a rate limit and a spam story for a page whose
 * job is to publish four desk addresses. So the submit button composes the
 * enquiry into a `mailto:` and hands it to the visitor's mail client: what they
 * typed actually goes somewhere, and the panel that follows names the address
 * to copy for the case where no mail client is registered. A form that flashes
 * "thank you" and drops the message is the failure mode this avoids.
 *
 * Fields are the shared `Input` / `Textarea` / `Label` / `Select` primitives
 * rather than styled elements of its own, so the section's one form behaves and
 * re-themes like every other form on the site.
 *
 * `?intent=` is set by the facilities tour CTA, the peering CTA and the power
 * page, so a visitor arriving from one lands with the right desk chosen.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatacenterTabs } from './DatacenterTabs';
import { SectionHeading, SpecRow } from './parts';

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
    const data = new FormData(e.currentTarget);
    const read = (k: string) => String(data.get(k) ?? '').trim();

    // Built from the fields rather than from the form's own encoding: `mailto:`
    // takes a percent-encoded body, and a `<form action="mailto:">` would hand
    // the mail client a urlencoded blob instead of a readable note.
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
    <PageLayout
      title={t('con-title', { defaultValue: 'Contact' })}
      description={t('con-description', {
        defaultValue: 'The capacity desk — send a load, not a product name.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter/contact" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <p className="max-w-prose text-site-text-muted">
            {t('con-lede', {
              defaultValue:
                'Kilowatts, cabinets, where your users are and what you have to be compliant with. That is enough to answer with the halls that fit — and the ones that do not, which is usually the more useful half.',
            })}
          </p>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeading
              kicker={t('con-desks', { defaultValue: 'Desks' })}
              heading={t('con-desks-heading', { defaultValue: 'Who reads what' })}
            />
            <dl className="mt-4">
              <SpecRow term={t('con-desk-sales', { defaultValue: 'Capacity' })}>
                capacity@rmhdatacenter.com
              </SpecRow>
              <SpecRow term={t('con-desk-noc', { defaultValue: 'NOC (24/7)' })}>
                noc@rmhdatacenter.com
              </SpecRow>
              <SpecRow term={t('con-desk-peering', { defaultValue: 'Peering' })}>
                peering@rmhdatacenter.com · AS-RMHDC
              </SpecRow>
              <SpecRow term={t('con-desk-abuse', { defaultValue: 'Abuse' })}>
                abuse@rmhdatacenter.com
              </SpecRow>
            </dl>
          </Card>
          <Card className="p-5">
            <SectionHeading
              kicker={t('con-response', { defaultValue: 'What happens next' })}
              heading={t('con-response-heading', { defaultValue: 'An engineer, not a queue' })}
            />
            <p className="mt-4 text-sm text-site-text-muted">
              {t('con-response-desc', {
                defaultValue:
                  'Capacity enquiries are answered within two working days with a named campus, an available power envelope and a delivery date we can hold. A P1 raised at the NOC address is acknowledged in fifteen minutes, at any hour.',
              })}
            </p>
            <p className="mt-3 text-sm text-site-text-muted">
              {t('con-response-tour', {
                defaultValue:
                  'Site tours run on weekday mornings and are escorted by the engineer who runs that floor. Bring photo ID that matches the name on the request.',
              })}
            </p>
          </Card>
        </div>

        {sent ? (
          <section
            className="glass-pane rounded-site border border-site-accent p-6 sm:p-8"
            role="status"
          >
            <h2 className="font-display text-xl font-semibold text-site-text">
              {t('con-sent-heading', { defaultValue: 'Handed to your mail client' })}
            </h2>
            <p className="mt-3 max-w-prose text-site-text-muted">
              {t('con-sent-body', {
                defaultValue:
                  'Your enquiry was composed as an email to capacity@rmhdatacenter.com — send it from there and an engineer replies within two working days. If no mail window opened, your browser has no mail client registered: copy what you wrote to that address instead.',
              })}
            </p>
          </section>
        ) : null}

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('con-form-kicker', { defaultValue: 'Capacity request' })}
            heading={t('con-form-heading', { defaultValue: 'Tell us the shape of the load' })}
          />
          <form className="mt-6" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-name">{t('con-f-name', { defaultValue: 'Name' })}</Label>
                <Input id="dc-name" name="name" type="text" autoComplete="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-org">{t('con-f-org', { defaultValue: 'Organisation' })}</Label>
                <Input
                  id="dc-org"
                  name="organisation"
                  type="text"
                  autoComplete="organization"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-email">{t('con-f-email', { defaultValue: 'Work email' })}</Label>
                <Input id="dc-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-intent">{t('con-f-intent', { defaultValue: 'Desk' })}</Label>
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-power">
                  {t('con-f-power', { defaultValue: 'Power envelope' })}
                </Label>
                <Input id="dc-power" name="power" type="text" placeholder="240 kW → 1 MW" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dc-region">
                  {t('con-f-region', { defaultValue: 'Regions of interest' })}
                </Label>
                <Input id="dc-region" name="region" type="text" placeholder="us-east + eu-west" />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="dc-detail">
                  {t('con-f-detail', { defaultValue: 'What are you running?' })}
                </Label>
                <Textarea
                  id="dc-detail"
                  name="detail"
                  rows={5}
                  required
                  placeholder={t('con-f-detail-ph', {
                    defaultValue:
                      'Workload, cabinet count, density per cabinet, compliance obligations, and when you need the floor.',
                  })}
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button type="submit" variant="accent">
                {t('con-submit', { defaultValue: 'Compose request' })}
              </Button>
              <p className="text-sm text-site-text-dim">
                {t('con-form-note', {
                  defaultValue:
                    'Opens your own mail client with the request written out. Nothing is submitted to a server from this page.',
                })}
              </p>
            </div>
          </form>
        </section>

        <section>
          <SectionHeading
            kicker={t('con-faq-kicker', { defaultValue: 'Asked first, usually' })}
            heading={t('con-faq-heading', { defaultValue: 'Four answers before you write' })}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [
                t('con-q1', { defaultValue: 'What is the smallest thing you sell?' }),
                t('con-a1', {
                  defaultValue:
                    'A quarter cabinet, or a single bare-metal server. There is no minimum commit on either, and no floor on the cross-connect count.',
                }),
              ],
              [
                t('con-q2', { defaultValue: 'How long until we can rack?' }),
                t('con-a2', {
                  defaultValue:
                    'Standard density, two to three weeks from signature at any campus with committed capacity below 85%. Liquid-cooled rows are quoted individually because the manifold work is real.',
                }),
              ],
              [
                t('con-q3', { defaultValue: 'Can we audit the facility?' }),
                t('con-a3', {
                  defaultValue:
                    'Yes. SOC 2 Type II and ISO 27001 reports are available under NDA, and customers above 100 kW may run their own on-site audit annually at their own cost.',
                }),
              ],
              [
                t('con-q4', { defaultValue: 'Are you selling us RMH Studios too?' }),
                t('con-a4', {
                  defaultValue:
                    'No. RMH Datacenter is a separate company inside the group and the platform is simply its largest tenant. Nothing about buying floor space obliges you to use anything else the group makes.',
                }),
              ],
            ].map(([q, a]) => (
              <Card key={q} className="flex flex-col gap-2 p-5">
                <h3 className="font-display text-lg font-semibold text-site-text">{q}</h3>
                <p className="text-sm text-site-text-muted">{a}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
