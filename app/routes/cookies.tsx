import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LegalLayout } from '@/components/lockdown/LegalLayout';

export const Route = createFileRoute('/cookies')({
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
      <div className="glass-pane rounded-site px-6 py-8 sm:px-10 sm:py-10">
      <h2>{t('cookie-what-heading', { defaultValue: '1. What Are Cookies' })}</h2>
      <p>
        {t('cookie-what-body', { defaultValue: 'Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work, or to work more efficiently, as well as to provide information to site owners. Similar technologies — including local storage, session storage, and pixel tags — may be used for comparable purposes and are covered by this policy.' })}
      </p>

      <h2>{t('cookie-how-heading', { defaultValue: '2. How We Use Cookies' })}</h2>
      <p>{t('cookie-how-intro', { defaultValue: 'RMHStudios uses cookies and similar technologies for the following purposes:' })}</p>
      <ul>
        <li>
          <strong>{t('cookie-essential-label', { defaultValue: 'Essential cookies' })}</strong>
          {t('cookie-essential-desc', { defaultValue: ' — Required for the Services to function. These include session tokens, authentication state, and security cookies. They cannot be disabled without impacting functionality.' })}
        </li>
        <li>
          <strong>{t('cookie-preference-label', { defaultValue: 'Preference cookies' })}</strong>
          {t('cookie-preference-desc', { defaultValue: " — Used to remember choices you make, such as your selected theme or language preference, so you do not need to re-enter them on each visit." })}
        </li>
        <li>
          <strong>{t('cookie-analytics-label', { defaultValue: 'Analytics cookies' })}</strong>
          {t('cookie-analytics-desc', { defaultValue: ' — Help us understand how visitors interact with the Services by collecting and reporting information anonymously. We use this data to improve performance and usability.' })}
        </li>
        <li>
          <strong>{t('cookie-performance-label', { defaultValue: 'Performance cookies' })}</strong>
          {t('cookie-performance-desc', { defaultValue: ' — Monitor site load times, error rates, and other technical metrics to maintain and improve infrastructure.' })}
        </li>
      </ul>

      <h2>{t('cookie-third-party-heading', { defaultValue: '3. Third-Party Cookies' })}</h2>
      <p>
        {t('cookie-third-party-body', { defaultValue: 'Some pages on our Services may include content from or links to third-party services (for example, embedded video players or analytics providers). These third parties may set their own cookies, which are governed by their respective privacy and cookie policies. RMHStudios has no control over these cookies.' })}
      </p>

      <h2>{t('cookie-choices-heading', { defaultValue: '4. Your Choices' })}</h2>
      <p>
        {t('cookie-choices-intro', { defaultValue: 'Most web browsers allow you to control cookies through their settings. You can typically:' })}
      </p>
      <ul>
        <li>{t('cookie-choice-delete', { defaultValue: 'Delete all cookies currently stored on your device.' })}</li>
        <li>{t('cookie-choice-block', { defaultValue: 'Block cookies from being set in future.' })}</li>
        <li>{t('cookie-choice-first-party', { defaultValue: 'Allow only first-party cookies (blocking third-party cookies).' })}</li>
        <li>{t('cookie-choice-notify', { defaultValue: 'Configure browser settings to notify you when a cookie is placed.' })}</li>
      </ul>
      <p>
        {t('cookie-choices-note', { defaultValue: 'Please note that disabling certain cookies may affect the functionality of the Services. Essential cookies cannot be disabled without impacting your ability to use core features.' })}
      </p>

      <h2>{t('cookie-retention-heading', { defaultValue: '5. Retention' })}</h2>
      <p>
        {t('cookie-retention-body', { defaultValue: 'Session cookies expire when you close your browser. Persistent cookies remain on your device until they expire or you delete them. The specific duration of each cookie varies; preference and analytics cookies typically expire within 12 months.' })}
      </p>

      <h2>{t('cookie-changes-heading', { defaultValue: '6. Changes to This Policy' })}</h2>
      <p>
        {t('cookie-changes-body', { defaultValue: 'We may update this Cookie Policy from time to time. We will post the updated version on this page with a revised “Last updated” date.' })}
      </p>

      <h2>{t('cookie-contact-heading', { defaultValue: '7. Contact' })}</h2>
      <p>
        {t('cookie-contact-body', { defaultValue: 'If you have questions about how we use cookies, please contact us at' })}{' '}
        <strong>privacy@rmhstudios.com</strong>.
      </p>
      </div>
    </LegalLayout>
  );
}
