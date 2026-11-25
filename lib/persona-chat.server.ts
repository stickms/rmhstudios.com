import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { personaVisibleTo } from '@/lib/personas/moderation.server';

export interface PersonaChatPayload {
  persona: {
    id: string;
    name: string;
    tagline: string | null;
    greeting: string | null;
    emoji: string | null;
    avatarUrl: string | null;
    chatCount: number;
    isOwner: boolean;
    /** s12-16: a moderator took this persona down; only its owner ever sees it, so the page says so. */
    removedByModerator: boolean;
    owner: ReturnType<typeof resolveUser>;
  };
  messages: { role: string; content: string }[];
  signedIn: boolean;
}

/**
 * Persona detail plus, for a signed-in viewer, their conversation with it.
 * Shared by the `/api/personas/$id` GET handler and the `/personas/$id` route
 * loader so the persona is server-rendered / prefetched instead of fetched
 * client-side on mount. Pass `null` for a signed-out viewer.
 *
 * Returns `null` when the persona doesn't exist or is private and the viewer
 * isn't its owner (the caller maps that to a 404 / not-found state).
 */
export async function getPersonaChat(
  id: string,
  userId: string | null
): Promise<PersonaChatPayload | null> {
  const persona = await prisma.aiPersona.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tagline: true,
      greeting: true,
      emoji: true,
      avatarUrl: true,
      isPublic: true,
      moderatedAt: true,
      chatCount: true,
      ownerId: true,
      owner: { select: userDisplaySelect },
    },
  });
  if (!persona) return null;

  const isOwner = userId === persona.ownerId;
  // s12-16 member-reports: a persona a moderator took down is 404 to everyone but its owner.
  if (!personaVisibleTo(persona, userId)) return null;

  let messages: { role: string; content: string }[] = [];
  if (userId) {
    messages = await prisma.aiPersonaMessage.findMany({
      where: { personaId: persona.id, userId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { role: true, content: true },
    });
  }

  return {
    persona: {
      id: persona.id,
      name: persona.name,
      tagline: persona.tagline,
      greeting: persona.greeting,
      emoji: persona.emoji,
      avatarUrl: persona.avatarUrl,
      chatCount: persona.chatCount,
      isOwner,
      removedByModerator: persona.moderatedAt !== null,
      owner: resolveUser(persona.owner),
    },
    messages,
    signedIn: !!userId,
  };
}
