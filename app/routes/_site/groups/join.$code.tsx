import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getRequestSession } from '@/lib/auth-session.server';
import {
  previewInviteForRequest,
  type InvitePreview,
} from '@/lib/group-chat/invites.server';
import { GroupInvitePage } from '@/components/feed/group-chat/GroupInvitePage';

// Resolve the link on the server so an invalid code renders nothing about any group. Public by design: a signed-out
// visitor sees the group's name and a sign-in button, nothing else.
const fetchInvite =
  createServerFn(
    {
      method:
        'GET',
    },
  )
    .validator(
      (input: {
        code: string;
      }) =>
        input,
    )
    .handler(
      async ({
        data,
      }): Promise<InvitePreview> => {
        const session =
          await getRequestSession();
        return previewInviteForRequest(
          getRequest(),
          data.code,
          session
            ?.user
            ?.id ??
            null,
        );
      },
    );

export const Route =
  createFileRoute(
    '/_site/groups/join/$code',
  )(
    {
      // An invite link is a credential: never indexed, never followed, never sent on as a referrer. The card is the
      // generic groups one, so a pasted link does not leak the group's name.
      head: () => ({
        meta: [
          {
            title:
              'Group invite | RMH Studios',
          },
          {
            name: 'robots',
            content:
              'noindex, nofollow',
          },
          {
            name: 'referrer',
            content:
              'no-referrer',
          },
        ],
      }),
      loader:
        ({
          params,
        }) =>
          fetchInvite(
            {
              data: {
                code: params.code,
              },
            },
          ),
      component:
        JoinPage,
    },
  );

function JoinPage() {
  const {
    code,
  } =
    Route.useParams();
  const preview =
    Route.useLoaderData() as InvitePreview;
  return (
    <GroupInvitePage
      code={
        code
      }
      preview={
        preview
      }
    />
  );
}
