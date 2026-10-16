import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

type Kind = 'privacy' | 'terms' | 'cookies';

/**
 * Plain-language summary at the top of a legal page. Written by hand from the
 * page it sits on — when that page changes, this box must be re-checked.
 */
export function LegalSummaryBox({ kind }: { kind: Kind }) {
  const { t } = useTranslation('f-access');

  const items: Record<Kind, string[]> = {
    privacy: [
      t('sum-privacy-1', {
        defaultValue:
          'We collect what you give us (name, email, account details), how you use the site (pages, features, device identifiers) and technical data (IP address, browser, operating system, screen size).',
      }),
      t('sum-privacy-2', {
        defaultValue:
          'We use it to run and improve the site, handle early-access requests, keep things secure, meet legal duties, and send product updates only if you opted in.',
      }),
      t('sum-privacy-3', {
        defaultValue:
          'We do not sell your personal data. We share it with service providers who help run the site, with authorities when the law requires it, and in a merger or sale.',
      }),
      t('sum-privacy-4', {
        defaultValue:
          'Depending on where you live you can ask to access, correct, delete, restrict or move your data, or object to some uses. Write to privacy@rmhstudios.com.',
      }),
      t('sum-privacy-5', {
        defaultValue:
          'The site is not for people under 18, and your data may be processed in other countries.',
      }),
    ],
    terms: [
      t('sum-terms-1', {
        defaultValue:
          'You must be at least 18 to use the site, and using it means you accept these terms.',
      }),
      t('sum-terms-2', {
        defaultValue:
          'Do not break the law, try to get into systems you should not, send harmful content, reverse engineer the software, scrape it without written consent, or disrupt it.',
      }),
      t('sum-terms-3', {
        defaultValue: 'The content and software belong to RMHStudios or its licensors.',
      }),
      t('sum-terms-4', {
        defaultValue:
          'Early-access and beta features come with no warranty and can change or end at any time.',
      }),
      t('sum-terms-5', {
        defaultValue:
          'The site is provided as is, and our liability is limited as far as the law allows. We can change the terms, and continuing to use the site means you accept the new ones.',
      }),
    ],
    cookies: [
      t('sum-cookies-1', {
        defaultValue:
          'We use cookies and similar storage for essentials such as sign-in and security, for remembering choices like theme and language, for analytics and performance, and for advertising.',
      }),
      t('sum-cookies-2', {
        defaultValue:
          'Ad cookies come from Google AdSense, only after you answer the cookie notice. They are never set for paid members, and never on sign-in, settings, wallet, checkout or messages pages.',
      }),
      t('sum-cookies-3', {
        defaultValue:
          'You can change your choice any time under Settings, Privacy and data, and through your browser. Blocking essential cookies will break parts of the site.',
      }),
      t('sum-cookies-4', {
        defaultValue: 'Preference and analytics cookies typically expire within 12 months.',
      }),
    ],
  };

  return (
    <aside
      className="glass-fill not-prose mb-8 rounded-site p-4"
      aria-label={t('sum-label', { defaultValue: 'Plain-language summary' })}
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-site-text">
        <FileText className="h-4 w-4" aria-hidden />
        {t('sum-title', { defaultValue: 'In plain language' })}
      </p>
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-site-text">
        {items[kind].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-site-text-muted">
        {t('sum-disclaimer', {
          defaultValue:
            'This is a summary, not the legal text. The full policy below is what applies.',
        })}
      </p>
    </aside>
  );
}
