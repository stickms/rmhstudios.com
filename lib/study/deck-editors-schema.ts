/** Zod schemas for the deck-editor routes (s11-10). Routes only; the client reaches the types through the contract. */
import { z } from 'zod';

/** A member's handle as typed: with or without the leading `@`. */
export const HANDLE_INPUT_MAX = 40;

export const inviteEditorBody = z.object({
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ''))
    .pipe(
      z
        .string()
        .min(1)
        .max(HANDLE_INPUT_MAX)
        .regex(/^[A-Za-z0-9_.-]+$/),
    ),
});

/** The invitee's answer to an invitation. */
export const respondInvitationBody = z.object({ accept: z.boolean() });
