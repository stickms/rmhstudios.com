import { createLucideIcon } from 'lucide-react';

/**
 * The letters GIF, drawn on lucide's grid (24px, 2px stroke, round caps) so it sits beside the lucide icons and takes
 * the same props, including the `LucideIcon` slots of `IconButton`, `MenuItem` and the composer rows. Lucide's own
 * `ImagePlay` is a picture with a play triangle, which reads as video and looks like "Add image" at 16px.
 */
export const GifIcon = createLucideIcon('gif', [
  ['path', { d: 'M8 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v-4H7', key: 'g' }],
  ['path', { d: 'M12 8v8', key: 'i' }],
  ['path', { d: 'M20 8h-4v8', key: 'f1' }],
  ['path', { d: 'M16 12h3', key: 'f2' }],
]);
