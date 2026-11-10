/**
 * Contracts for /api/personas (redesign audit C1, batches 3 and 9). Client-safe: request types come from
 * the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PersonaChatPayload } from '@/lib/persona-chat.server';
import type { createPersonaBody } from '@/lib/personas/personas-schema';
import type { ResolvedUser } from '@/lib/user-display';

export interface PersonaListItem {
  id: string;
  name: string;
  tagline: string | null;
  emoji: string | null;
  avatarUrl: string | null;
  chatCount: number;
  owner: ResolvedUser;
}

export interface MyPersonaItem {
  id: string;
  name: string;
  tagline: string | null;
  emoji: string | null;
  avatarUrl: string | null;
  chatCount: number;
  isPublic: boolean;
}

/** Public personas (most chatted) plus the viewer's own. Works signed out. */
export const listPersonasApi = endpoint<{
  res: { personas: PersonaListItem[]; mine: MyPersonaItem[]; signedIn: boolean };
}>()({ method: 'GET', path: '/api/personas' });

/** 201. */
export const createPersonaApi = endpoint<{
  body: z.infer<typeof createPersonaBody>;
  res: { success: true; id: string };
}>()({ method: 'POST', path: '/api/personas' });

/** Persona detail plus this viewer's conversation. 404 when missing or private. */
export const getPersonaApi = endpoint<{ res: PersonaChatPayload }>()({
  method: 'GET',
  path: '/api/personas/$id',
});

export const deletePersonaApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/personas/$id',
});

/** One chat turn with a persona (a model call: pass `AI_TIMEOUT_MS`). */
export const chatWithPersonaApi = endpoint<{
  body: { message: string };
  res: { reply: string };
}>()({ method: 'POST', path: '/api/personas/$id/chat' });
