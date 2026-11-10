/** Contract for counting a TF2 HUD download (redesign audit C1, batch 10). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/** Count a download of a public or unlisted HUD (the zip itself is built in the browser). */
export const countTf2HudDownloadApi = endpoint<{ res: { success: true } }>()({
  method: 'POST',
  path: '/api/tf2-hud/huds/$id/download',
});
