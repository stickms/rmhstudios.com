/**
 * Contract for the site's image upload endpoint (redesign audit C1, batch 9).
 * Client-safe. Multipart: `images` (up to 4 files); see the route for the policy.
 * The composer, DMs, group chats, the announcement editor and the homes listing
 * uploader all post here.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const uploadImagesApi = endpoint<{ body: FormData; res: { urls: string[] } }>()({
  method: 'POST',
  path: '/api/rmharks/image',
});
