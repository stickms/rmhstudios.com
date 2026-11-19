import { Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GroupRef } from '@/lib/games/community-types';

/** One community in a games-shell list (a profile's groups, a hub's communities); opens its page. */
export function GroupRow({ group }: { group: GroupRef }) {
  const { t } = useTranslation('games-hub');
  return (
    <li>
      <Link to="/c/$slug" params={{ slug: group.slug }} className="stm-person">
        <span className="stm-group-icon" aria-hidden>
          {group.icon ?? <Users size={16} />}
        </span>
        <span className="stm-person-body">
          <span className="stm-person-name">{group.name}</span>
          <span className="stm-person-sub">
            {t('steam-members-n', { defaultValue: 'Members: {{n}}', n: group.memberCount })}
          </span>
        </span>
      </Link>
    </li>
  );
}
