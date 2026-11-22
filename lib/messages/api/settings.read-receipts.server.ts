import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getReadReceiptsApi, setReadReceiptsApi } from '@/lib/messages/read-receipts.contract';
import { getAccountReceiptPrefs } from '@/lib/chat-plus/receipts.server';
import { prisma } from '@/lib/prisma.server';

const body = z
  .object({
    readReceipts: z.boolean().optional(),
    typingIndicators: z.boolean().optional(),
  })
  .refine((v) => v.readReceipts !== undefined || v.typingIndicators !== undefined, 'Nothing to change');

/**
 * `/api/settings/read-receipts` — the caller's account-wide "Seen" and typing switches (sprint 06 #17).
 * Only ever the caller's own profile row. Conversation preferences are never rewritten: the effective
 * value is computed where it is read (`lib/chat-plus/receipts.server.ts`).
 */
export const route = apiRoute('/api/settings/read-receipts', {
  GET: implement(
    getReadReceiptsApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) =>
      Response.json(await getAccountReceiptPrefs(userId), {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }),
  ),
  PUT: implement(
    setReadReceiptsApi,
    {
      rateLimit: 'write',
      body,
    },
    async ({ userId, body: patch }) => {
      const data = {
        ...(patch.readReceipts !== undefined
          ? {
              readReceipts: patch.readReceipts,
            }
          : {}),
        ...(patch.typingIndicators !== undefined
          ? {
              typingIndicators: patch.typingIndicators,
            }
          : {}),
      };
      const row = await prisma.userProfile.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          ...data,
        },
        update: data,
        select: {
          readReceipts: true,
          typingIndicators: true,
        },
      });
      return Response.json(row);
    },
  ),
});
