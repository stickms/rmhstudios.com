import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createFolderApi, listFoldersApi } from '@/lib/study/folders.contract';
import { createFolderBody } from '@/lib/study/folders-schema';
import { createFolder, listFolders } from '@/lib/study/folders.server';

/**
 * GET  /api/study/folders — the member's own deck folders.
 * POST /api/study/folders — make one (at most 30, names unique ignoring case).
 */
export const route = apiRoute('/api/study/folders', {
  GET: implement(listFoldersApi, { rateLimit: 'read' }, async ({ userId }) => ({
    folders: await listFolders(userId),
  })),
  POST: implement(createFolderApi, { rateLimit: 'write', body: createFolderBody }, async ({ userId, body }) => {
    const result = await createFolder(userId, body.name);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return Response.json({ success: true, folder: result.folder }, { status: 201 });
  }),
});
