import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useTranslation } from 'react-i18next';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/cookies')({
  head: () => ({
    meta: buildMeta({
      title: 'Cookie Policy | RMH Studios',
      description:
        'The cookies and similar technologies RMH Studios uses, what each is for, and how to control them.',
      path: '/cookies',
    }),
    links: [buildCanonical('/cookies')],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  const { t } = useTranslation('pages');
  return (
    <LegalLayout
      title={t('cookie-policy-title', { defaultValue: 'Cookie Policy' })}
      eyebrow={t('cookie-policy-eyebrow', { defaultValue: 'Legal' })}
      updatedDate="June 11, 2025"
    >
      {/* Document under glass: the whole article body sits on one wide pane. */}
      <div className="legal-content__pane">
        <h2>{t('cookie-what-heading', { defaultValue: '1. What Are Cookies' })}</h2>
        <p>
          {t('cookie-what-body', {
            defaultValue:
              'Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work, or to work more efficiently, as well as to provide information to site owners. Similar technologies — including local storage, session storage, and pixel tags — may be used for comparable purposes and are covered by this policy.',
          })}
        </p>

        <h2>{t('cookie-how-heading', { defaultValue: '2. How We Use Cookies' })}</h2>
        <p>
          {t('cookie-how-intro', {
            defaultValue:
              'RMHStudios uses cookies and similar technologies for the following purposes:',
          })}
        </p>
        <ul>
          <li>
            <strong>{t('cookie-essential-label', { defaultValue: 'Essential cookies' })}</strong>
            {t('cookie-essential-desc', {
              defaultValue:
                ' — Required for the Services to function. These include session tokens, authentication state, and security cookies. They cannot be disabled without impacting functionality.',
            })}
          </li>
          <li>
            <strong>{t('cookie-preference-label', { defaultValue: 'Preference cookies' })}</strong>
            {t('cookie-preference-desc', {
              defaultValue:
                ' — Used to remember choices you make, such as your selected theme or language preference, so you do not need to re-enter them on each visit.',
            })}
          </li>
          <li>
            <strong>{t('cookie-analytics-label', { defaultValue: 'Analytics cookies' })}</strong>
            {t('cookie-analytics-desc', {
              defaultValue:
                ' — Help us understand how visitors interact with the Services by collecting and reporting information anonymously. We use this data to improve performance and usability.',
            })}
          </li>
          <li>
            <strong>
              {t('cookie-performance-label', { defaultValue: 'Performance cookies' })}
            </strong>
            {t('cookie-performance-desc', {
              defaultValue:
                ' — Monitor site load times, error rates, and other technical metrics to maintain and improve infrastructure.',
            })}
          </li>
          <li>
            <strong>
              {t('cookie-advertising-label', { defaultValue: 'Advertising cookies' })}
            </strong>
            {t('cookie-advertising-desc', {
              defaultValue:
                ' — Set by Google AdSense on pages that display ads, to serve the ad, cap how often you see the same one, and detect invalid traffic. They are only set after you answer the cookie notice, are never set for members on a paid plan, and are never set on sign-in, settings, wallet, checkout or messages pages.',
            })}
          </li>
        </ul>

        <h2>{t('cookie-third-party-heading', { defaultValue: '3. Third-Party Cookies' })}</h2>
        <p>
          {t('cookie-third-party-body', {
            defaultValue:
              'Some pages on our Services may include content from or links to third-party services (for example, embedded video players or analytics providers). These third parties may set their own cookies, which are governed by their respective privacy and cookie policies. RMHStudios has no control over these cookies.',
          })}
        </p>
        {/* Advertising lives inside §3 rather than under a heading of its own:
            the numbered sections are shipped translated strings in 16 locales, so
            inserting a new numbered heading would renumber every section after
            it, and the body has no styled `h3` level to demote it to. */}
        <p>
          {t('cookie-advertising-body', {
            defaultValue:
              'Some pages carry advertising served by Google AdSense, which is how the free tier of the Services is paid for. Google acts as a third-party vendor and may use cookies and similar identifiers to serve and measure ads. If you choose “Essential only” in the cookie notice, we ask Google for non-personalised advertising: the ads you see are then based on the page you are reading rather than on a profile of you. Note that non-personalised advertising still uses a limited amount of storage for frequency capping and fraud detection.',
          })}
        </p>
        <p>
          {t('cookie-advertising-controls', {
            defaultValue:
              'You can change or withdraw your choice at any time under Settings → Privacy & data, review or change your Google ad settings at adssettings.google.com, and opt out of personalised advertising from participating vendors at aboutads.info/choices. Members on any paid plan are never shown ads and never have advertising cookies set.',
          })}
        </p>

        <h2>{t('cookie-choices-heading', { defaultValue: '4. Your Choices' })}</h2>
        <p>
          {t('cookie-choices-intro', {
            defaultValue:
              'Most web browsers allow you to control cookies through their settings. You can typically:',
          })}
        </p>
        <ul>
          <li>
            {t('cookie-choice-delete', {
              defaultValue: 'Delete all cookies currently stored on your device.',
            })}
          </li>
          <li>
            {t('cookie-choice-block', { defaultValue: 'Block cookies from being set in future.' })}
          </li>
          <li>
            {t('cookie-choice-first-party', {
              defaultValue: 'Allow only first-party cookies (blocking third-party cookies).',
            })}
          </li>
          <li>
            {t('cookie-choice-notify', {
              defaultValue: 'Configure browser settings to notify you when a cookie is placed.',
            })}
          </li>
        </ul>
        <p>
          {t('cookie-choices-note', {
            defaultValue:
              'Please note that disabling certain cookies may affect the functionality of the Services. Essential cookies cannot be disabled without impacting your ability to use core features.',
          })}
        </p>

        <h2>{t('cookie-retention-heading', { defaultValue: '5. Retention' })}</h2>
        <p>
          {t('cookie-retention-body', {
            defaultValue:
              'Session cookies expire when you close your browser. Persistent cookies remain on your device until they expire or you delete them. The specific duration of each cookie varies; preference and analytics cookies typically expire within 12 months.',
          })}
        </p>

        <h2>{t('cookie-changes-heading', { defaultValue: '6. Changes to This Policy' })}</h2>
        <p>
          {t('cookie-changes-body', {
            defaultValue:
              'We may update this Cookie Policy from time to time. We will post the updated version on this page with a revised “Last updated” date.',
          })}
        </p>

        <h2>{t('cookie-contact-heading', { defaultValue: '7. Contact' })}</h2>
        <p>
          {t('cookie-contact-body', {
            defaultValue: 'If you have questions about how we use cookies, please contact us at',
          })}{' '}
          <strong>privacy@rmhstudios.com</strong>.
        </p>
      </div>
    </LegalLayout>
  );
}
