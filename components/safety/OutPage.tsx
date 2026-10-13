import { useEffect, useState } from 'react';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { hostOfUrl, type LinkRisk } from '@/lib/safety/link-risk';

/** S6: the interstitial for links to denylisted or newly seen domains. */
export default function OutPage({ url }: { url: string }) {
  const { t } = useTranslation('f-safety');
  const host = hostOfUrl(url);
  const [risk, setRisk] = useState<LinkRisk | null>(null);

  useEffect(() => {
    if (!host) return;
    fetch('/api/links/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hosts: [host] }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { risk?: Record<string, LinkRisk> } | null) => setRisk(d?.risk?.[host] ?? 'ok'))
      .catch(() => setRisk('ok'));
  }, [host]);

  return (
    <PageLayout title={t('out-title', { defaultValue: 'Leaving RMH Studios' })} backTo="/">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-8">
        {!host ? (
          <p className="text-site-text-muted">
            {t('out-invalid', { defaultValue: 'That is not a web link we can open.' })}
          </p>
        ) : (
          <div className="glass-pane flex flex-col gap-4 rounded-site p-5">
            <div className="flex items-center gap-2 text-site-text">
              <ShieldAlert className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
              <h2 className="text-lg font-bold">
                {risk === 'deny'
                  ? t('out-deny', { defaultValue: 'This site has been flagged as unsafe' })
                  : t('out-new', {
                      defaultValue: 'You are about to visit a site that is new here',
                    })}
              </h2>
            </div>
            <p className="text-sm text-site-text-muted">
              {risk === 'deny'
                ? t('out-deny-body', {
                    defaultValue:
                      'Moderators have flagged {{host}}. Only continue if you know what you are opening.',
                    host,
                  })
                : t('out-new-body', {
                    defaultValue:
                      '{{host}} has only recently started appearing on RMH Studios, so we have not seen much of it yet.',
                    host,
                  })}
            </p>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-site-text-dim">
                {t('out-destination', { defaultValue: 'Full destination' })}
              </p>
              <p className="glass-inset break-all rounded-site p-3 font-mono text-sm text-site-text">
                {url}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => window.history.back()}>
                {t('out-back', { defaultValue: 'Go back' })}
              </Button>
              <Button asChild variant={risk === 'deny' ? 'outline' : 'accent'}>
                <a href={url} rel="noopener noreferrer nofollow">
                  {t('out-continue', { defaultValue: 'Continue to site' })}
                  <ExternalLink className="ml-1 h-4 w-4" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
