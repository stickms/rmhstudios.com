import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { PersonaChatColumn } from '@/components/feed/PersonaChatColumn';
import { auth } from '@/lib/auth';
import { getPersonaChat } from '@/lib/persona-chat.server';

// Prefetch the persona (and, for a signed-in viewer, their conversation) so the
// chat is present at first paint / prefetched on intent instead of fetched on
// mount. `null` means not-found / private, and the column seeds that state.
const fetchPersonaChat = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return { personaChat: await getPersonaChat(id, session?.user?.id ?? null) };
  });

export const Route = createFileRoute('/_site/personas/$id')({
  head: () => ({ meta: [{ title: 'Chat | RMH Studios' }] }),
  loader: ({ params }) => fetchPersonaChat({ data: params.id }),
  component: PersonaChatPage,
});

function PersonaChatPage() {
  const { id } = Route.useParams();
  const { personaChat } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0"
      >
        {/* `key` remounts the column on persona→persona navigation so it
            re-seeds cleanly from the new loader data (no stale-state carryover). */}
        <PersonaChatColumn key={id} id={id} initialData={personaChat} />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
