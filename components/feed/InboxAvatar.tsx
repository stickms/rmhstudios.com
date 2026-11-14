import type { LucideIcon } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useFreshUser } from '@/stores/userDisplayStore';

/** The picture at the start of an inbox row (a conversation, a notification): 40px, a circle (K11). */
const SIZE = 40;

interface InboxPerson {
  id: string;
  name?: string | null;
  handle?: string | null;
  username?: string | null;
  image?: string | null;
}

/**
 * The picture at the start of an inbox row: the person's avatar beside each conversation in Messages and each
 * notification in Notifications (owner, 2026-11-14: "In private messages show user avatars in both notifications and in
 * the dm list"). It reads the freshest picture the client knows (userDisplayStore), so a changed avatar shows without a
 * refetch.
 *
 * A row with no person (Saved Messages, a system notification) passes `icon` instead and gets a picture placeholder
 * (S: `--site-bg-subtle`, a 1px border) holding that icon, so every row's text starts at the same place.
 *
 * The name beside it is the row's accessible name, so the picture is decorative (empty alt).
 */
export function InboxAvatar({
  person,
  icon: Icon,
}: {
  person?: InboxPerson | null;
  icon?: LucideIcon;
}) {
  const fresh = useFreshUser(person) ?? person;
  if (!fresh) {
    return (
      <span
        aria-hidden
        data-slot="inbox-avatar"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-site-border bg-site-bg-subtle text-site-text-muted"
      >
        {Icon && <Icon className="size-4" />}
      </span>
    );
  }
  const name = fresh.name || fresh.handle || fresh.username || undefined;
  return <UserAvatar src={fresh.image} alt="" size={SIZE} fallbackName={name} />;
}
