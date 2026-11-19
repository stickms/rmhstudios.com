import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Footer link from the What's new dialog to the release notes on /site-history. */
export function ChangelogLink() {
  const {
    t,
  } =
    useTranslation(
      'f-devplatform',
    );
  return (
    <Link
      to="/site-history"
      hash="changes"
      className="text-sm text-site-accent hover:underline"
    >
      {t(
        'changelog-link',
        {
          defaultValue:
            'Full changelog',
        },
      )}
    </Link>
  );
}
