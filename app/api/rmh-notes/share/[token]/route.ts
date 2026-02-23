import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ token: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { token } = await params;

  const share = await prisma.noteShare.findUnique({
    where: { token },
    include: {
      note: {
        include: { tags: { include: { tag: true } }, folder: { select: { name: true } } },
      },
    },
  });

  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
  }
  if (share.note.isDeleted || share.note.isLocked) {
    return NextResponse.json({ error: 'Note unavailable' }, { status: 403 });
  }

  // Never expose lockHash
  const { lockHash: _, ...noteData } = share.note;

  return NextResponse.json({ note: noteData, sharedAt: share.createdAt });
}
