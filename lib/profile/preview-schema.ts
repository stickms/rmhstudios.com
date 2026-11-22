/** The profile preview's request schema (sprint 10 08). The endpoint takes no profile id: it previews the caller. */
import { z } from 'zod';
import { PREVIEW_AUDIENCES } from '@/lib/profile/preview';

export const previewQuery = z.object({ audience: z.enum(PREVIEW_AUDIENCES) });
