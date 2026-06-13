/**
 * Shared location of rendered vibe-page thumbnails on disk.
 *
 * Kept in its own tiny module (no Playwright/sharp imports) so the web app's
 * thumbnail-serving route can reference the directory without pulling the
 * headless-browser capture code into the web bundle. The vibe-worker writes
 * here; the web app serves from here. Both share the `db/` volume.
 */

import path from 'path';

export const THUMB_DIR = path.join(process.cwd(), 'db', 'vibe-thumbs');
