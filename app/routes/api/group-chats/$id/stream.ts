import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { subscribeGroup, type GroupEventPayload } from '@/lib/group-events';

/**
 * GET /api/group-chats/$id/stream — SSE stream of new messages for a member.
 * Mirrors /api/messages/stream. The client falls back to `?after=` polling
 * when EventSource isn't available or the connection drops.
 */
export const Route = createFileRoute('/api/group-chats/$id/stream')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        // Members only.
        const membership = await prisma.groupChatMember.findUnique({
          where: { groupId_userId: { groupId: params.id, userId } },
          select: { id: true },
        });
        if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

        let cleanup: (() => void) | null = null;

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const send = (eventName: string, data: string) => {
              try {
                controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`));
              } catch {
                // stream closed
              }
            };

            // Initial comment so the connection opens promptly.
            send('open', JSON.stringify({ ok: true }));

            const unsubscribe = subscribeGroup(params.id, (event: GroupEventPayload) => {
              if ('type' in event && event.type === 'reaction') {
                send('reaction', JSON.stringify(event));
                return;
              }
              send('message', JSON.stringify(event));
            });

            const heartbeat = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': heartbeat\n\n'));
              } catch {
                clearInterval(heartbeat);
              }
            }, 30_000);

            // Auto-close after 5 min to avoid leaks; the client reconnects.
            const timeout = setTimeout(() => {
              unsubscribe();
              clearInterval(heartbeat);
              try {
                controller.close();
              } catch {
                // already closed
              }
            }, 5 * 60_000);

            cleanup = () => {
              unsubscribe();
              clearInterval(heartbeat);
              clearTimeout(timeout);
            };
          },
          cancel() {
            cleanup?.();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Disable proxy buffering so events flush immediately.
            'X-Accel-Buffering': 'no',
          },
        });
      },
    },
  },
});
