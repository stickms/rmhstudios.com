import type { CloudSaveResult } from '@/lib/studio/cloud-projects.server';
import { MAX_CLOUD_PROJECTS } from '@/lib/studio/project-schema';

const STATUS = {
  stale: 409,
  exists: 409,
  'id-taken': 409,
  limit: 409,
  'too-large': 413,
  'not-found': 404,
} as const;

const MESSAGE = {
  stale: 'This project changed on another device',
  exists: 'This project is already on your account',
  'id-taken': 'This project id is already in use',
  limit: `You can keep ${MAX_CLOUD_PROJECTS} projects on your account`,
  'too-large': 'This project is too large to save to your account',
  'not-found': 'Project not found',
} as const;

/** The error response for a refused cloud save: a status, a message and a `code` (and `revision` when it has one). */
export function refusalResponse(result: Extract<CloudSaveResult, { ok: false }>): Response {
  return Response.json(
    {
      error: MESSAGE[result.reason],
      code: result.reason,
      ...('revision' in result ? { revision: result.revision } : {}),
    },
    { status: STATUS[result.reason] },
  );
}
