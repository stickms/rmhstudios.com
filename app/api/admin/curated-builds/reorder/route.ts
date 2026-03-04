import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session || !(session.user as any).isAdmin) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { updates } = await req.json();

        if (!Array.isArray(updates)) {
            return new NextResponse('Invalid payload', { status: 400 });
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

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error reordering curated builds:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
