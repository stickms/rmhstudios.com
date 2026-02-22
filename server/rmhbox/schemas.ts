/**
 * RMHbox — Server-Side Zod Validation Schemas
 *
 * Re-exports all shared schemas and provides the `validated()` wrapper
 * that performs rate limiting + schema validation before calling handlers.
 *
 * Reference: docs/rmhbox/design-spec/core.md §4 (validation)
 */

import type { Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { S2C } from '../../lib/rmhbox/events';
import { checkRateLimit } from './rate-limit';
import { logger } from './logger';

// Re-export all shared schemas for server convenience
export * from '../../lib/rmhbox/schemas';

/**
 * Wraps a Socket.io event handler with rate limiting and Zod schema validation.
 *
 * If the rate limit is exceeded, emits `rmhbox:error` with code `RATE_LIMITED`.
 * If the payload fails validation, emits `rmhbox:error` with code `INVALID_PAYLOAD`.
 * Otherwise, calls the handler with the parsed (validated) payload.
 *
 * @param eventName - The Socket.io event name (used for rate limiting key)
 * @param schema - The Zod schema to validate the incoming payload against
 * @param handler - The handler function to call with the validated payload
 * @returns A function suitable for use as a Socket.io event listener
 */
export function validated<T>(
  eventName: string,
  schema: ZodType<T>,
  handler: (socket: Socket, payload: T) => void,
): (socket: Socket, rawPayload: unknown) => void {
  return (socket: Socket, rawPayload: unknown) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, eventName)) {
      logger.warn({ event: 'rate_limited', socketId: socket.id, eventName, userId: socket.data.userId });
      socket.emit(S2C.ERROR, {
        code: 'RATE_LIMITED',
        message: `Too many ${eventName} requests. Please slow down.`,
      });
      return;
    }

    // Schema validation
    const result = schema.safeParse(rawPayload);
    if (!result.success) {
      logger.warn({
        event: 'invalid_payload',
        socketId: socket.id,
        eventName,
        userId: socket.data.userId,
        errors: result.error.issues,
      });
      socket.emit(S2C.ERROR, {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload.',
        details: { issues: result.error.issues },
      });
      return;
    }

    handler(socket, result.data);
  };
}
