/**
 * Change the descriptions of the images in a message you sent. Server-only.
 *
 * One module for both kinds of chat, keyed by chat and message id: a direct
 * message answers with the existing `message-edited` event (the same one a text
 * edit sends, so an open thread patches in place), a group message with a
 * `chat-update` of op `alts`. The text edit window is 15 minutes
 * (`edit-policy.ts`); descriptions stay editable for 24 hours
 * (`image-alts.ts`), because fixing accessibility should not be blocked by it.
 *
 * Only `imageAlts` is written. `editedAt` stays as it was: describing an image
 * does not change what the message says, so no "edited" marker and no prior-text
 * snapshot.
 */

import { prisma } from '@/lib/prisma.server';
import {
  getChatAccess,
  publishChatUpdate,
} from '@/lib/chat-plus/access.server';
import {
  altEditEligibility,
  altEditMessage,
  altEditStatus,
  imageAltsAligned,
  normalizeImageAlts,
} from '@/lib/messages/image-alts';
import { publishMutation } from '@/lib/messages/mutations.server';

export type EditAltsResult =
  | {
      ok: true;
      imageAlts: string[];
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const fail =
  (
    status: number,
    error: string,
  ): EditAltsResult => ({
    ok: false,
    status,
    error,
  });

export async function editMessageImageAlts(args: {
  chatId: string;
  messageId: string;
  userId: string;
  imageAlts: string[];
  now?: Date;
}): Promise<EditAltsResult> {
  const now =
    args.now ??
    new Date();
  const access =
    (await getChatAccess(
      'dm',
      args.chatId,
      args.userId,
    )) ??
    (await getChatAccess(
      'group',
      args.chatId,
      args.userId,
    ));
  if (
    !access
  )
    return fail(
      404,
      'Conversation not found',
    );

  const existing =
    await prisma.chatMessage.findFirst(
      {
        where:
          {
            id: args.messageId,
            chatId:
              args.chatId,
          },
        select:
          {
            id: true,
            senderId: true,
            createdAt: true,
            deletedAt: true,
            imageUrls: true,
            imageAlts: true,
            content: true,
            editedAt: true,
            gifUrl: true,
            deletedBy: true,
            audioUrl: true,
          },
      },
    );
  if (
    !existing
  )
    return fail(
      404,
      'Message not found',
    );

  const eligible =
    altEditEligibility(
      existing,
      args.userId,
      now.getTime(),
    );
  if (
    !eligible.ok
  )
    return fail(
      altEditStatus(
        eligible.reason,
      ),
      altEditMessage(
        eligible.reason,
      ),
    );
  if (
    !imageAltsAligned(
      existing.imageUrls,
      args.imageAlts,
    )
  ) {
    return fail(
      400,
      'Provide exactly one description per image',
    );
  }

  const imageAlts =
    normalizeImageAlts(
      existing.imageUrls,
      args.imageAlts,
    );
  await prisma.chatMessage.update(
    {
      where:
        {
          id: existing.id,
        },
      data: {
        imageAlts,
        altsEditedAt:
          now,
      },
    },
  );

  if (
    access.kind ===
    'dm'
  ) {
    const [
      one,
      two,
    ] =
      access.participants ?? [
        args.userId,
        args.userId,
      ];
    await publishMutation(
      'message-edited',
      {
        conversation:
          {
            participantOneId:
              one,
            participantTwoId:
              two,
          },
        actorId:
          args.userId,
        imageAlts,
        row: {
          ...existing,
          imageAlts,
          conversationId:
            args.chatId,
        },
      },
    );
  } else {
    publishChatUpdate(
      access,
      {
        kind: 'group',
        chatId:
          args.chatId,
        op: 'alts',
        messageId:
          existing.id,
        imageAlts,
      },
    );
  }
  return {
    ok: true,
    imageAlts,
  };
}
