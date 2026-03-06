import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const APIRoute = createAPIFileRoute("/api/admin/curated-builds/reorder")({
  POST: async ({ request }) => {
    try {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session || !(session.user as any).isAdmin) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { updates } = await request.json();

        if (!Array.isArray(updates)) {
            return new Response('Invalid payload', { status: 400 });
        }

        // We run these inside a transaction so that if one fails, they all fail
        await prisma.$transaction(
            updates.map((update: { id: string; position: number }) =>
                prisma.userBuild.update({
                    where: { id: update.id },
                    data: { position: update.position },
                })
            )
        );

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error reordering curated builds:', error);
        return new Response('Internal Error', { status: 500 });
    }
},
});
