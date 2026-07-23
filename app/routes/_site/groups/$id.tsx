import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { GroupChatView } from '@/components/feed/GroupChatView';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
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
    <>
      <AnimatedMain className="w-full min-w-0">
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">{t("sign-in-to-view-group", { defaultValue: "Sign in to view this group" })}</p>
            <Link to="/login" search={{ callbackURL: `/groups/${id}` }}>
              <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
            </Link>
          </div>
        ) : (
          <GroupChatView id={id} currentUserId={session.user.id} />
        )}
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
