import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Admin hub card linking to the release-notes writer. */
export function AdminReleaseNotesLink() {
  const { t } = useTranslation('f-devplatform');
  return (
    <Link
      to="/admin/release-notes"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-cardTitle', { defaultValue: 'Release notes' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-cardBody', {
          defaultValue:
            'Draft a changelog entry from merged PRs with AI, edit it, and publish it to the changelog.',
        })}
      </p>
    </Link>
  );
}
