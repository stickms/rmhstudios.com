import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { FollowTab } from '@/lib/social/follow-filters';

/** The link from a member's own followers/following list to /follows. */
export function ManageFollowsLink({ tab, onNavigate }: { tab: FollowTab; onNavigate?: () => void }) {
  const { t } = useTranslation('follows');
  return (
    <Link to="/follows" search={{ tab }} onClick={onNavigate} className="t-body text-site-text underline">
      {t('manage', { defaultValue: 'Manage' })}
    </Link>
  );
}
