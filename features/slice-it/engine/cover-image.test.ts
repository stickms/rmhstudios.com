import { describe, expect, it } from 'vitest';
import { isHeicCover } from './cover-image';

describe('isHeicCover', () => {
  it('recognises HEIC/HEIF by MIME type or extension (some platforms send an empty type)', () => {
    expect(isHeicCover({ type: 'image/heic', name: 'a.bin' })).toBe(true);
    expect(isHeicCover({ type: 'image/heif', name: 'a' })).toBe(true);
    expect(isHeicCover({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
    expect(isHeicCover({ type: '', name: 'photo.heif' })).toBe(true);
  });
  it('leaves other formats alone', () => {
    expect(isHeicCover({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
    expect(isHeicCover({ type: 'image/webp', name: 'heic.webp' })).toBe(false);
  });
});
