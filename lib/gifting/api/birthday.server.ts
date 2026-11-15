import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { birthdaySchema } from '@/lib/gifting/birthday-schema';
import { clearBirthday, getBirthday, setBirthday } from '@/lib/gifting/birthday.server';

/**
 * The caller's own opt-in birthday (G1). Month/day only; a row means opted in.
 * GET reads it, PUT sets it, DELETE opts out.
 */
export const route = apiRoute('/api/birthday', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
    return Response.json(
      { birthday: await getBirthday(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }),
  PUT: defineHandler({ rateLimit: 'write', body: birthdaySchema }, async ({ userId, body }) => {
    await setBirthday(userId, body.month, body.day);
    return Response.json({ birthday: { month: body.month, day: body.day } });
  }),
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
    await clearBirthday(userId);
    return Response.json({ ok: true });
  }),
});
