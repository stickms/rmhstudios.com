import { describe, expect, it } from 'vitest';
import {
  buildBannerUpload,
  buildProfilePatch,
  canSaveDraft,
  cleanLinks,
  coinsToField,
  fieldToCoins,
  isDirty,
  localHandleStatus,
  remoteHandleStatus,
  sanitizeHandle,
  songFromInitial,
  type ProfileDraft,
  type ProfileEditInitial,
} from './profile-edit-state';

const INITIAL: ProfileEditInitial = {
  handle: 'ana',
  handleCooldownMs: 0,
  name: 'Ana',
  image: null,
  bio: 'hi',
  location: null,
  website: null,
  links: [{ label: 'Blog', url: 'https://b.example' }],
  showLikes: true,
  dmPrivacy: 'EVERYONE',
  tipGoal: 100,
  tipGoalLabel: null,
  membershipPriceCoins: null,
  profileSongSpotifyId: null,
  profileSongTitle: null,
  profileSongArtist: null,
  profileSongPreviewUrl: null,
  profileSongAlbumArt: null,
};

const SONG = { id: 's1', title: 'T', artist: 'A', previewUrl: null, albumArt: null };

/** A draft equal to INITIAL (the song matches because both are "none"). */
const draft = (over: Partial<ProfileDraft> = {}): ProfileDraft => ({
  handle: 'ana',
  displayName: 'Ana',
  bio: 'hi',
  location: '',
  website: '',
  links: [{ label: 'Blog', url: 'https://b.example' }],
  showLikes: true,
  dmPrivacy: 'EVERYONE',
  tipGoal: '100',
  tipGoalLabel: '',
  membershipPrice: '',
  avatarFile: null,
  bannerFile: null,
  bannerRemoved: false,
  selectedSong: null,
  ...over,
});

describe('coins fields', () => {
  it('round-trips unset and set values', () => {
    expect(coinsToField(null)).toBe('');
    expect(coinsToField(0)).toBe('');
    expect(coinsToField(250)).toBe('250');
    expect(fieldToCoins('  ')).toBeNull();
    expect(fieldToCoins('250')).toBe(250);
    expect(fieldToCoins('-5')).toBe(0);
    expect(fieldToCoins('abc')).toBe(0);
  });
});

describe('handles', () => {
  it('sanitizes to lowercase word characters, capped at 20', () => {
    expect(sanitizeHandle('Ana-K!_9')).toBe('anak_9');
    expect(sanitizeHandle('a'.repeat(30))).toHaveLength(20);
  });
  it('decides locally what it can', () => {
    expect(localHandleStatus('', 'ana')).toBe('idle');
    expect(localHandleStatus('ana', 'ana')).toBe('idle');
    expect(localHandleStatus('ab', 'ana')).toBe('invalid');
    expect(localHandleStatus('9ana', 'ana')).toBe('invalid');
    expect(localHandleStatus('new_name', 'ana')).toBeNull();
  });
  it('maps the server answer', () => {
    expect(remoteHandleStatus({ available: true })).toBe('available');
    expect(remoteHandleStatus({ available: false, reason: 'reserved' })).toBe('invalid');
    expect(remoteHandleStatus({ available: false })).toBe('taken');
  });
});

describe('songFromInitial', () => {
  it('is null without a song and fills blanks with empty strings', () => {
    expect(songFromInitial(INITIAL)).toBeNull();
    expect(songFromInitial({ ...INITIAL, profileSongSpotifyId: 's1' })).toEqual({
      id: 's1',
      title: '',
      artist: '',
      previewUrl: null,
      albumArt: null,
    });
  });
});

describe('isDirty', () => {
  // Regression: with no song on either side this used to compare `undefined !== null`,
  // so an untouched editor always claimed unsaved changes and prompted on close.
  it('is clean when neither side has a song', () => {
    expect(isDirty(draft(), INITIAL)).toBe(false);
  });
  it('notices a song being added or removed', () => {
    expect(isDirty(draft({ selectedSong: SONG }), INITIAL)).toBe(true);
    const initial = { ...INITIAL, profileSongSpotifyId: 's1' };
    expect(isDirty(draft({ selectedSong: null }), initial)).toBe(true);
  });
  it('is clean once the song matches', () => {
    const initial = { ...INITIAL, profileSongSpotifyId: 's1' };
    expect(isDirty(draft({ selectedSong: SONG }), initial)).toBe(false);
  });
  it('notices each kind of edit', () => {
    const initial = { ...INITIAL, profileSongSpotifyId: 's1' };
    const clean = draft({ selectedSong: SONG });
    expect(isDirty({ ...clean, displayName: 'Ana B' }, initial)).toBe(true);
    expect(isDirty({ ...clean, handle: 'ana2' }, initial)).toBe(true);
    expect(isDirty({ ...clean, links: [] }, initial)).toBe(true);
    expect(isDirty({ ...clean, tipGoal: '101' }, initial)).toBe(true);
    expect(isDirty({ ...clean, bannerRemoved: true }, initial)).toBe(true);
    expect(isDirty({ ...clean, avatarFile: new File([], 'a.png') }, initial)).toBe(true);
    expect(isDirty({ ...clean, selectedSong: { ...SONG, id: 's2' } }, initial)).toBe(true);
  });
});

describe('canSaveDraft', () => {
  it('needs a name within limits and, for a new handle, an available one', () => {
    expect(canSaveDraft('Ana', 'bio', false, 'idle')).toBe(true);
    expect(canSaveDraft('  ', 'bio', false, 'idle')).toBe(false);
    expect(canSaveDraft('n'.repeat(51), 'bio', false, 'idle')).toBe(false);
    expect(canSaveDraft('Ana', 'b'.repeat(161), false, 'idle')).toBe(false);
    expect(canSaveDraft('Ana', 'bio', true, 'checking')).toBe(false);
    expect(canSaveDraft('Ana', 'bio', true, 'available')).toBe(true);
  });
});

describe('links and the PATCH body', () => {
  it('trims links and drops incomplete ones', () => {
    expect(
      cleanLinks([
        { label: ' A ', url: ' https://a.x ' },
        { label: '', url: 'https://b.x' },
        { label: 'C', url: ' ' },
      ]),
    ).toEqual([{ label: 'A', url: 'https://a.x' }]);
  });
  it('builds the body, omitting the handle when unchanged', () => {
    const body = buildProfilePatch(
      draft({ displayName: ' Ana ', bio: ' ', tipGoal: '', selectedSong: SONG }),
      false,
    );
    expect(body).toMatchObject({
      displayName: 'Ana',
      bio: null,
      location: null,
      tipGoal: null,
      membershipPriceCoins: null,
      profileSongSpotifyId: 's1',
      profileSongTitle: 'T',
    });
    expect('handle' in body).toBe(false);
    expect(buildProfilePatch(draft({ handle: ' new ' }), true)).toMatchObject({ handle: 'new' });
  });
});

describe('buildBannerUpload', () => {
  const crop = new File(['c'], 'banner.png', { type: 'image/png' });
  const picture = new Blob(['whole picture'], { type: 'image/jpeg' });

  it('sends a newly chosen picture with its crop, as the source for later re-crops', () => {
    const form = buildBannerUpload(crop, { blob: picture, kept: false });
    expect(form.get('banner')).toBeInstanceOf(File);
    expect((form.get('original') as File).size).toBe(picture.size);
    expect(form.get('source')).toBeNull();
  });

  it('sends only the crop when the server already keeps the picture', () => {
    const form = buildBannerUpload(crop, { blob: picture, kept: true });
    expect(form.get('original')).toBeNull();
    expect(form.get('source')).toBe('keep');
  });

  it('sends the crop alone when there is no picture behind it', () => {
    const form = buildBannerUpload(crop, null);
    expect([...form.keys()]).toEqual(['banner']);
  });
});
