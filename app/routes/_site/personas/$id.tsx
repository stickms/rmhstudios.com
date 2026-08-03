import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { PersonaChatColumn } from '@/components/feed/PersonaChatColumn';
import { auth } from '@/lib/auth';
import { getPersonaChat, type PersonaChatPayload } from '@/lib/persona-chat.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

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
  /**
   * Every public persona shared the title "Chat | RMH Studios" and had no
   * description, so a hundred distinct characters looked to a crawler — and in
   * a shared link — like a hundred copies of one page. The persona's own name
   * and tagline are already in the loader.
   *
   * A private persona is loaded as `null` for anyone but its owner, so the
   * fallback branch carries no name and stays out of the index.
   */
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({
    loaderData,
    params,
  }: {
    loaderData?: { personaChat: PersonaChatPayload | null };
    params: { id: string };
  }) => {
    const persona = loaderData?.personaChat?.persona;
    if (!persona) {
      return {
        meta: [{ title: 'Persona | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
      };
    }
    const path = `/personas/${params.id}`;
    const description =
      persona.tagline || `Chat with ${persona.name}, an AI persona on RMH Studios.`;
    return {
      meta: buildMeta({
        title: `${persona.name} — AI persona | RMH Studios`,
        description,
        path,
        image: persona.avatarUrl || undefined,
        imageAlt: persona.avatarUrl ? `${persona.name}'s avatar.` : undefined,
        imageSize: persona.avatarUrl ? null : undefined,
      }),
      links: [buildCanonical(path)],
    };
  },
  loader: ({ params }) => fetchPersonaChat({ data: params.id }),
  component: PersonaChatPage,
});

function PersonaChatPage() {
  const { id } = Route.useParams();
  const { personaChat } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain className="w-full min-w-0">
        {/* `key` remounts the column on persona→persona navigation so it
            re-seeds cleanly from the new loader data (no stale-state carryover). */}
        <PersonaChatColumn key={id} id={id} initialData={personaChat} />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
