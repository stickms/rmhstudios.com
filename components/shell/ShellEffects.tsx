import { TabBadge } from '@/components/site/TabBadge';
import { useSession } from '@/components/Providers';
import { useInboxCount } from './use-inbox-count';

/**
 * What the shell does on every page that is not chrome (M8: route changes swap content with no transition). Renders nothing visible.
 *
 *  - The unread total is mirrored onto the tab title, the favicon and the installed-app badge (TabBadge).
 */
export function ShellEffects() {
  const { data: session } = useSession();
  const inbox = useInboxCount(Boolean(session));

  return <TabBadge count={inbox} />;
}
