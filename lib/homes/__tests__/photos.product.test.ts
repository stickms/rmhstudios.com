import { describe, expect, it } from 'vitest';
import {
  LISTING_PHOTO_ALT_MAX,
  appendPhotos,
  cleanAlt,
  coverAlt,
  imageAltsRefusal,
  isolateText,
  movePhoto,
  normalizeAlts,
  photoAlt,
  removePhoto,
  setPhotoAlt,
  undescribedCount,
} from '../photos';

const images = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];

describe('normalizeAlts', () => {
  it('pads a short list with empty descriptions', () => {
    expect(normalizeAlts(images, ['Kitchen'])).toEqual(['Kitchen', '', '', '']);
    expect(normalizeAlts(images, undefined)).toEqual(['', '', '', '']);
  });

  it('truncates a long list to the photos', () => {
    expect(normalizeAlts(['a.jpg'], ['One', 'Two', 'Three'])).toEqual(['One']);
    expect(normalizeAlts([], ['One'])).toEqual([]);
  });

  it('trims and strips control characters', () => {
    expect(normalizeAlts(['a.jpg', 'b.jpg'], ['  Hall\u0007way\u0000  ', '\u0001\u001f'])).toEqual(['Hallway', '']);
    expect(cleanAlt('Two\nlines\tand tab')).toBe('Two lines and tab');
  });

  it('turns anything that is not text into "not described"', () => {
    expect(normalizeAlts(['a.jpg', 'b.jpg'], [42, null])).toEqual(['', '']);
  });

  it('cuts a description to the limit as a last resort', () => {
    expect(normalizeAlts(['a.jpg'], ['x'.repeat(LISTING_PHOTO_ALT_MAX + 50)])[0]).toHaveLength(LISTING_PHOTO_ALT_MAX);
  });
});

describe('imageAltsRefusal', () => {
  it('is null while every description fits, trimmed', () => {
    expect(
      imageAltsRefusal(['x'.repeat(LISTING_PHOTO_ALT_MAX), `  ${'y'.repeat(LISTING_PHOTO_ALT_MAX)}  `]),
    ).toBeNull();
    expect(imageAltsRefusal(undefined)).toBeNull();
  });

  it('carries the code and the limit for one that is too long', () => {
    expect(imageAltsRefusal(['ok', 'x'.repeat(LISTING_PHOTO_ALT_MAX + 1)])).toMatchObject({
      code: 'LISTING_PHOTO_ALT_TOO_LONG',
      max: LISTING_PHOTO_ALT_MAX,
    });
  });
});

describe('movePhoto and removePhoto keep pairs together', () => {
  const set = { images, alts: ['Kitchen', '', 'Bedroom', 'Garden'] };

  it('moves a photo and its description to the cover', () => {
    expect(movePhoto(set, 2, 0)).toEqual({
      images: ['c.jpg', 'a.jpg', 'b.jpg', 'd.jpg'],
      alts: ['Bedroom', 'Kitchen', '', 'Garden'],
    });
  });

  it('moves a photo later, clamping the target', () => {
    expect(movePhoto(set, 0, 99)).toEqual({
      images: ['b.jpg', 'c.jpg', 'd.jpg', 'a.jpg'],
      alts: ['', 'Bedroom', 'Garden', 'Kitchen'],
    });
  });

  it('leaves the lists alone for a move to the same place or from nowhere', () => {
    expect(movePhoto(set, 1, 1)).toEqual(set);
    expect(movePhoto(set, 9, 0)).toEqual(set);
  });

  it('pads before it moves, so a short list cannot shift a description onto the wrong photo', () => {
    expect(movePhoto({ images, alts: ['Kitchen'] }, 0, 1)).toEqual({
      images: ['b.jpg', 'a.jpg', 'c.jpg', 'd.jpg'],
      alts: ['', 'Kitchen', '', ''],
    });
  });

  it('removes a photo with its description', () => {
    expect(removePhoto(set, 1)).toEqual({
      images: ['a.jpg', 'c.jpg', 'd.jpg'],
      alts: ['Kitchen', 'Bedroom', 'Garden'],
    });
    expect(removePhoto(set, 0).alts).toEqual(['', 'Bedroom', 'Garden']);
  });

  it('does not change the input', () => {
    const copy = JSON.parse(JSON.stringify(set));
    movePhoto(set, 3, 0);
    removePhoto(set, 3);
    expect(set).toEqual(copy);
  });

  it('adds new photos undescribed, and edits one description', () => {
    const added = appendPhotos({ images: ['a.jpg'], alts: ['Kitchen'] }, ['b.jpg', 'c.jpg']);
    expect(added).toEqual({ images: ['a.jpg', 'b.jpg', 'c.jpg'], alts: ['Kitchen', '', ''] });
    expect(setPhotoAlt(added, 1, ' Hall\n').alts).toEqual(['Kitchen', ' Hall ', '']);
    expect(setPhotoAlt(added, 7, 'x')).toEqual(added);
  });
});

describe('undescribedCount', () => {
  it('counts photos with no description, padding a short list', () => {
    expect(undescribedCount(images, ['Kitchen', '', 'Bedroom'])).toBe(2);
    expect(undescribedCount(images, ['A', 'B', 'C', '   '])).toBe(1);
    expect(undescribedCount(images, [])).toBe(4);
  });
});

describe('photoAlt', () => {
  const listing = {
    images,
    imageAlts: ['Kitchen with a gas hob and a window over the sink', '', '', ''],
    title: 'Sunny two-bed near the park',
  };

  it('is the description when there is one', () => {
    expect(photoAlt(listing, 0)).toEqual({
      kind: 'described',
      text: 'Kitchen with a gas hob and a window over the sink',
    });
  });

  it('gives the parts of the fallback for an undescribed photo, counting from one', () => {
    expect(photoAlt(listing, 3)).toEqual({
      kind: 'fallback',
      index: 4,
      total: 4,
      title: 'Sunny two-bed near the park',
    });
  });

  it('falls back for a listing with no descriptions at all (an old or external one)', () => {
    expect(photoAlt({ images, title: 'T' }, 0)).toMatchObject({ kind: 'fallback', index: 1, total: 4 });
    expect(photoAlt({ images, imageAlts: [], title: 'T' }, 2)).toMatchObject({ kind: 'fallback', index: 3 });
  });

  it('treats a description of only spaces as none', () => {
    expect(photoAlt({ images, imageAlts: ['   '], title: 'T' }, 0).kind).toBe('fallback');
  });
});

describe('coverAlt and isolateText', () => {
  it('uses the first description, else the title', () => {
    expect(coverAlt({ images, imageAlts: ['Front door'], title: 'Title' })).toBe('Front door');
    expect(coverAlt({ images, imageAlts: ['', 'Other'], title: 'Title' })).toBe('Title');
    expect(coverAlt({ images: [], title: 'Title' })).toBe('Title');
  });

  it('wraps text in a first-strong isolate', () => {
    expect(isolateText('شقة')).toBe('⁨شقة⁩');
  });
});
