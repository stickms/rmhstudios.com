import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listScreenshotsApi, saveScreenshotsApi } from '@/lib/builds/screenshots.contract';
import { saveScreenshotsBody } from '@/lib/builds/screenshots-schema';
import { findScreenshotBuild, listScreenshots, saveScreenshots } from '@/lib/builds/screenshots.server';

/**
 * GET /api/user-builds/[id]/screenshots  the screenshots in order (a private build's are its owner's alone)
 * PUT /api/user-builds/[id]/screenshots  replace the list: at most 8, each described (owner only)
 */
export const route = apiRoute('/api/user-builds/$id/screenshots', {
  GET: implement(
    listScreenshotsApi,
    {
      auth: 'optional',
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      const items = await listScreenshots(await findScreenshotBuild(params.id), userId);
      if (!items)
        return Response.json(
          {
            ...refusalBody('BUILD_NOT_FOUND'),
          },
          {
            status: 404,
          },
        );
      return {
        items,
      };
    },
  ),
  PUT: implement(
    saveScreenshotsApi,
    {
      rateLimit: 'write',
      body: saveScreenshotsBody,
    },
    async ({ params, userId, body }) => {
      const result = await saveScreenshots(await findScreenshotBuild(params.id), userId, body.screenshots);
      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
            code: result.code,
            index: result.index,
          },
          {
            status: result.status,
          },
        );
      }
      return {
        items: result.items,
      };
    },
  ),
});
