import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteFolderApi, updateFolderApi } from '@/lib/study/folders.contract';
import { updateFolderBody } from '@/lib/study/folders-schema';
import { deleteFolder, moveFolder, renameFolder, setCollapsed } from '@/lib/study/folders.server';

/**
 * PATCH  /api/study/folders/$id — rename, collapse or expand, or move one step (owner).
 * DELETE /api/study/folders/$id — delete the folder; its decks move to "No folder" (owner).
 */
export const route = apiRoute('/api/study/folders/$id', {
  PATCH: implement(
    updateFolderApi,
    { rateLimit: 'write', body: updateFolderBody },
    async ({ userId, params, body }) => {
      const result =
        body.name !== undefined
          ? await renameFolder(userId, params.id, body.name)
          : body.collapsed !== undefined
            ? await setCollapsed(userId, params.id, body.collapsed)
            : await moveFolder(userId, params.id, body.move ?? 'up');
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return { success: true as const };
    },
  ),
  DELETE: implement(deleteFolderApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await deleteFolder(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return { success: true as const };
  }),
});
