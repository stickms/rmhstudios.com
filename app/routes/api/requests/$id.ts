import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requestUpdateSchema } from '@/lib/requests/schema';
import { getRequest, updateRequest, RequestBoardError } from '@/lib/requests/board.server';
import { logAdminAction } from '@/lib/admin-audit.server';

const STATUS_BY_CODE = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

/**
 * GET   /api/requests/:id — one request.
 * PATCH /api/requests/:id — admin: status, official reply, merge target.
 *
 * The PATCH is where the board's social contract is enforced: setting `SHIPPED`
 * or `DECLINED` without an official reply is a 400, not a silent success. That
 * check lives in the service layer (`lib/requests/board.server.ts`) so it holds
 * for every caller, including future admin tooling that never touches this
 * route.
 */
export const Route = createFileRoute('/api/requests/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const request = await getRequest(params.id, userId);
        if (!request) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(request);
      }),
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: requestUpdateSchema },
        async ({ params, userId, body }) => {
          try {
            const updated = await updateRequest(userId, params.id, body);
            await logAdminAction(userId, 'request.update', {
              targetType: 'FeatureRequest',
              targetId: params.id,
              detail: [
                body.status ? `status:${body.status}` : null,
                body.mergedIntoId ? `merged:${body.mergedIntoId}` : null,
              ]
                .filter(Boolean)
                .join(' '),
            });
            return Response.json(updated);
          } catch (error) {
            if (error instanceof RequestBoardError) {
              return Response.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
            }
            throw error;
          }
        },
      ),
    },
  },
});
