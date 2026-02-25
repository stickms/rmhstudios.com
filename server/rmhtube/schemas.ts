/**
 * RmhTube — Server-Side Zod Validation Schemas
 *
 * Provides the `validated()` wrapper that performs rate limiting +
 * schema validation before calling handlers.
 */

import type { Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { S2C } from '../../lib/rmhtube/events';
import { checkRateLimit } from './rate-limit';
import { logger } from './logger';

// Re-export shared schemas for server convenience
export * from '../../lib/rmhtube/schemas';

/**
 * Wraps a Socket.io event handler with rate limiting and Zod validation.
 *
 * Usage: socket.on('event', validated(socket, 'event', Schema, handler))
 */
export function validated<T>(
  socket: Socket,
  eventName: string,
  schema: ZodType<T>,
  handler: (socket: Socket, payload: T) => void,
): (rawPayload: unknown) => void {
  return (rawPayload: unknown) => {
    if (!checkRateLimit(socket.id, eventName)) {
      logger.warn({ event: 'rate_limited', socketId: socket.id, eventName, userId: socket.data?.userId });
      socket.emit(S2C.ERROR, {
        code: 'RATE_LIMITED',
        message: `Too many ${eventName} requests. Please slow down.`,
      });
      return;
    }

    const result = schema.safeParse(rawPayload);
    if (!result.success) {
      logger.warn({
        event: 'invalid_payload',
        socketId: socket.id,
        eventName,
        userId: socket.data?.userId,
        errors: result.error.issues,
      });
      socket.emit(S2C.ERROR, {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload.',
      });
      return;
    }

    try {
      handler(socket, result.data);
    } catch (err) {
      logger.error({
        event: 'handler_uncaught_error',
        socketId: socket.id,
        eventName,
        userId: socket.data?.userId,
        error: String(err),
      });
      socket.emit(S2C.ERROR, {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
      });
    }
  };
}
