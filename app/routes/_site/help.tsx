import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageFrame } from '@/components/feed/PageLayout';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { SendFeedback } from '@/components/feedback/SendFeedback';
import { ConciergePanel } from '@/components/assistant/ConciergePanel';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/_site/help')({
  head: () => ({
    meta: buildMeta({
      title: 'Help & Concierge | RMH Studios',
      description:
        'Ask the concierge about games, apps, coins, settings, and where things are.',
      path: '/help',
    }),
    links: [buildCanonical('/help')],
  }),
  component: HelpPage,
});

function HelpPage() {
  const { t } = useTranslation('site');
  return (
    <PageFrame noDockPadding>
      {/* h-screen with no bottom clearance parked the concierge's input and
            its suggestion chips permanently under the hub orb (and, on a first
            visit, under the cookie bar too). Reserve the floating chrome's own
            band — the same token the feed column uses — so the composer always
            clears it. */}
      <div
        className="flex flex-col"
        style={{ height: 'calc(100dvh - var(--site-floating-reserve))' }}
      >
        {/* The shared page title (ColumnHeader's page mode = PageLayout's
              header), not a hand-rolled glass capsule with an icon and an
              untranslated "Help" — the one page whose title read differently
              from every other (consistency audit, 2026-10-09). */}
        <ColumnHeader title={t('help-title', { defaultValue: 'Help' })} />

        <div className="border-b border-site-border px-4 py-2">
          <SendFeedback className="t-body font-medium underline">
            {t('help-send-feedback', { ns: 'feedback-inbox', defaultValue: 'Send feedback' })}
          </SendFeedback>
          <span className="t-meta ms-2">
            {t('help-send-feedback-hint', { ns: 'feedback-inbox',
              defaultValue: 'Report a bug or an accessibility barrier.',
            })}
          </span>
        </div>

        <ConciergePanel className="flex-1 min-h-0" />
      </div>
    </PageFrame>
  );
}
