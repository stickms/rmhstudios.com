import { createFileRoute } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { PageFrame } from '@/components/feed/PageLayout';
import { GroupChatView } from '@/components/feed/GroupChatView';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/groups/$id')({
  head: () => ({ meta: [{ title: 'Group Chat | RMH Studios' }] }),
  component: GroupChatPage,
});

function GroupChatPage() {
  const { t } = useTranslation('groups');
  const { id } = Route.useParams();
  const { data: session, isPending } = useSession();

  return (
    <PageFrame noDockPadding>
      {isPending ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !session ? (
        <SignedOutPrompt
          icon={Users}
          callbackURL={`/groups/${id}`}
          title={t('sign-in-to-view-group', { defaultValue: 'Sign in to view this group' })}
          actionLabel={t('sign-in', { defaultValue: 'Sign in' })}
        />
      ) : (
        <GroupChatView id={id} currentUserId={session.user.id} />
      )}
    </PageFrame>
  );
}
