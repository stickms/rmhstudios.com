/**
 * A moderator's takedown of a reported AI persona (s12-16).
 *
 * The persona becomes private and is stamped `moderatedAt`. Personas have no update route, so nothing can make it
 * public again; the stamp is what the readers check as well, so a persona answers 404 to every member but its owner.
 * The owner keeps it and can still chat with it.
 */
import { prisma } from '@/lib/prisma.server';

/** Take a persona down. Idempotent: a persona already taken down keeps its first stamp. Returns whether this call did it. */
export async function moderatePersona(personaId: string, now: Date = new Date()): Promise<boolean> {
  const done = await prisma.aiPersona.updateMany({
    where: { id: personaId, moderatedAt: null },
    data: { moderatedAt: now, isPublic: false },
  });
  return done.count === 1;
}

/** Whether a viewer may reach a persona: public and not taken down, or the owner's own. */
export function personaVisibleTo(
  persona: { isPublic: boolean; moderatedAt: Date | null; ownerId: string },
  viewerId: string | null,
): boolean {
  if (viewerId !== null && persona.ownerId === viewerId) return true;
  return persona.isPublic && !persona.moderatedAt;
}

/** The owner of a persona a member may report: a public one that has not been taken down. Otherwise `null`. */
export async function personaReportAuthor(personaId: string): Promise<string | null> {
  const row = await prisma.aiPersona.findUnique({
    where: { id: personaId },
    select: { ownerId: true, isPublic: true, moderatedAt: true },
  });
  return row && row.isPublic && !row.moderatedAt ? row.ownerId : null;
}

/**
 * What an admin reading a report sees of a persona (whatever its state): the name and the system prompt the chat
 * answers from. Member text; never returned to a member.
 */
export async function personaReportTexts(
  ids: readonly string[],
): Promise<Map<string, { name: string; systemPrompt: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.aiPersona.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, systemPrompt: true },
  });
  return new Map(rows.map((r) => [r.id, { name: r.name, systemPrompt: r.systemPrompt }]));
}
