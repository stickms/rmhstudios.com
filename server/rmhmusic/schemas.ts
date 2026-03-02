import type { Socket } from 'socket.io';
import type { ZodSchema } from 'zod';
import { S2C } from '../../lib/rmhmusic/events';
import { logger } from './logger';

export function validated<T>(
  socket: Socket,
  event: string,
  schema: ZodSchema<T>,
  handler: (socket: Socket, payload: T) => void | Promise<void>,
) {
  return async (raw: unknown) => {
    const result = schema.safeParse(raw ?? {});
    if (!result.success) {
      logger.warn({ event: 'validation_failed', socketEvent: event, errors: result.error.flatten() });
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Invalid payload' });
      return;
    }
    try {
      await handler(socket, result.data);
    } catch (err) {
      logger.error({ event: 'handler_error', socketEvent: event, error: err });
      socket.emit(S2C.ERROR, { code: 'INTERNAL_ERROR', message: 'Internal error' });
    }
  };
}
