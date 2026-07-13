import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { LegalCanvasPage, type LegalBlock } from '@/components/lockdown/LegalCanvasPage';

export const Route = createFileRoute('/cookies')({
  component: CookiesPage,
});

function CookiesPage() {
  const { t } = useTranslation('pages');

  const blocks: LegalBlock[] = useMemo(() => [
    { kind: "h2", text: t('cookie-what-heading', { defaultValue: '1. What Are Cookies' }) },
    { kind: "p", runs: [{ text: t('cookie-what-body', { defaultValue: 'Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work, or to work more efficiently, as well as to provide information to site owners. Similar technologies — including local storage, session storage, and pixel tags — may be used for comparable purposes and are covered by this policy.' }) }] },

    { kind: "h2", text: t('cookie-how-heading', { defaultValue: '2. How We Use Cookies' }) },
    { kind: "p", runs: [{ text: t('cookie-how-intro', { defaultValue: 'RMHStudios uses cookies and similar technologies for the following purposes:' }) }] },
    {
      kind: "ul",
      items: [
        [
          { text: t('cookie-essential-label', { defaultValue: 'Essential cookies' }), bold: true },
          { text: t('cookie-essential-desc', { defaultValue: ' — Required for the Services to function. These include session tokens, authentication state, and security cookies. They cannot be disabled without impacting functionality.' }) },
        ],
        [
          { text: t('cookie-preference-label', { defaultValue: 'Preference cookies' }), bold: true },
          { text: t('cookie-preference-desc', { defaultValue: " — Used to remember choices you make, such as your selected theme or language preference, so you do not need to re-enter them on each visit." }) },
        ],
        [
          { text: t('cookie-analytics-label', { defaultValue: 'Analytics cookies' }), bold: true },
          { text: t('cookie-analytics-desc', { defaultValue: ' — Help us understand how visitors interact with the Services by collecting and reporting information anonymously. We use this data to improve performance and usability.' }) },
        ],
        [
          { text: t('cookie-performance-label', { defaultValue: 'Performance cookies' }), bold: true },
          { text: t('cookie-performance-desc', { defaultValue: ' — Monitor site load times, error rates, and other technical metrics to maintain and improve infrastructure.' }) },
        ],
      ],
    },

    { kind: "h2", text: t('cookie-third-party-heading', { defaultValue: '3. Third-Party Cookies' }) },
    { kind: "p", runs: [{ text: t('cookie-third-party-body', { defaultValue: 'Some pages on our Services may include content from or links to third-party services (for example, embedded video players or analytics providers). These third parties may set their own cookies, which are governed by their respective privacy and cookie policies. RMHStudios has no control over these cookies.' }) }] },

    { kind: "h2", text: t('cookie-choices-heading', { defaultValue: '4. Your Choices' }) },
    { kind: "p", runs: [{ text: t('cookie-choices-intro', { defaultValue: 'Most web browsers allow you to control cookies through their settings. You can typically:' }) }] },
    {
      kind: "ul",
      items: [
        [{ text: t('cookie-choice-delete', { defaultValue: 'Delete all cookies currently stored on your device.' }) }],
        [{ text: t('cookie-choice-block', { defaultValue: 'Block cookies from being set in future.' }) }],
        [{ text: t('cookie-choice-first-party', { defaultValue: 'Allow only first-party cookies (blocking third-party cookies).' }) }],
        [{ text: t('cookie-choice-notify', { defaultValue: 'Configure browser settings to notify you when a cookie is placed.' }) }],
      ],
    },
    { kind: "p", runs: [{ text: t('cookie-choices-note', { defaultValue: 'Please note that disabling certain cookies may affect the functionality of the Services. Essential cookies cannot be disabled without impacting your ability to use core features.' }) }] },

    { kind: "h2", text: t('cookie-retention-heading', { defaultValue: '5. Retention' }) },
    { kind: "p", runs: [{ text: t('cookie-retention-body', { defaultValue: 'Session cookies expire when you close your browser. Persistent cookies remain on your device until they expire or you delete them. The specific duration of each cookie varies; preference and analytics cookies typically expire within 12 months.' }) }] },

    { kind: "h2", text: t('cookie-changes-heading', { defaultValue: '6. Changes to This Policy' }) },
    { kind: "p", runs: [{ text: t('cookie-changes-body', { defaultValue: 'We may update this Cookie Policy from time to time. We will post the updated version on this page with a revised “Last updated” date.' }) }] },

    { kind: "h2", text: t('cookie-contact-heading', { defaultValue: '7. Contact' }) },
    {
      kind: "p",
      runs: [
        { text: t('cookie-contact-body', { defaultValue: 'If you have questions about how we use cookies, please contact us at' }) },
        { text: " " },
        { text: "privacy@rmhstudios.com", bold: true },
        { text: "." },
      ],
    },
  ], [t]);

  return (
    <LegalCanvasPage
      routeId="/cookies"
      title={t('cookie-policy-title', { defaultValue: 'Cookie Policy' })}
      eyebrow={t('cookie-policy-eyebrow', { defaultValue: 'Legal' })}
      updatedDate="June 11, 2025"
      blocks={blocks}
    />
  );
}
