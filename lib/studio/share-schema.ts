/** Request shapes for Studio shares (zod). Client-safe types ride in `share.contract.ts` by `import type`. */
import { z } from 'zod';
import { projectIdSchema } from '@/lib/studio/project-schema';
import { SHARE_TOKEN_PATTERN } from '@/lib/studio/share';

/** A share token as it appears in a path or in `?share=`. */
export const shareTokenSchema = z.string().regex(SHARE_TOKEN_PATTERN);

/** POST /api/studio/shares: the cloud project to share. The server reads its own copy; no project JSON is accepted. */
export const createShareBody = z.object({ projectId: projectIdSchema });
