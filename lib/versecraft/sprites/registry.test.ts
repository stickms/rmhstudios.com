import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_PACKS, packSpriteUrls } from './registry';

// The eight legacy packs (luna, kai, sable, wren, rowan, milo, teacher, hoshiko) once resolved to
// `.png` while only `.webp` files ship, so every dialogue portrait for them 404'd.
describe('sprite registry', () => {
  it('only references sprite files that exist in public/', () => {
    const missing: string[] = [];
    for (const pack of SPRITE_PACKS) {
      for (const url of packSpriteUrls(pack.id)) {
        const rel = url.replace(/^https?:\/\/[^/]+/, '');
        const file = path.join(process.cwd(), 'public', rel);
        if (!existsSync(file)) missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });
});
