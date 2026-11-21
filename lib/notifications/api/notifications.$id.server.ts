import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteNotificationApi,
  setNotificationReadApi,
} from '@/lib/notifications/inbox.contract';
import { setReadBody } from '@/lib/notifications/inbox-schema';
import {
  dismiss,
  setRead,
} from '@/lib/notifications/inbox.server';

const notFound =
  () =>
    Response.json(
      {
        error:
          'Notification not found',
      },
      {
        status: 404,
      },
    );

/**
 * PATCH  /api/notifications/$id — body { read }: mark one notification read or unread.
 * DELETE /api/notifications/$id — dismiss (delete) one notification.
 * A notification that is not the caller's answers 404 and nothing changes.
 */
export const route =
  apiRoute(
    '/api/notifications/$id',
    {
      PATCH:
        implement(
          setNotificationReadApi,
          {
            rateLimit:
              'write',
            body: setReadBody,
          },
          async ({
            session,
            params,
            body,
          }) => {
            const {
              found,
              changed,
            } =
              await setRead(
                session
                  .user
                  .id,
                [
                  params.id,
                ],
                body.read,
              );
            if (
              found ===
              0
            )
              return notFound();
            return {
              success:
                true as const,
              changed,
            };
          },
        ),
      DELETE:
        implement(
          deleteNotificationApi,
          {
            rateLimit:
              'write',
          },
          async ({
            session,
            params,
          }) => {
            const {
              found,
            } =
              await dismiss(
                session
                  .user
                  .id,
                [
                  params.id,
                ],
              );
            if (
              found ===
              0
            )
              return notFound();
            return {
              success:
                true as const,
            };
          },
        ),
    },
  );
