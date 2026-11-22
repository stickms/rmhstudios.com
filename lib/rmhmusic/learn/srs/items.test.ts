import { describe, expect, it } from 'vitest';
import { earItemId, isKnownItemId, itemFamily, sprintChordItemId, sprintNoteItemId } from './items';

describe('item ids', () => {
  it('knows staff cards, and the ids the builders make', () => {
    expect(itemFamily('treble:64')).toBe('staff');
    expect(itemFamily(earItemId('interval', 'third'))).toBe('ear');
    expect(itemFamily(earItemId('chord', 'diminished'))).toBe('ear');
    expect(itemFamily(sprintNoteItemId('bass', 48, -1))).toBe('sprint');
    expect(itemFamily(sprintChordItemId('treble', 60, 'minor'))).toBe('sprint');
  });

  it('rejects ids no drill produces', () => {
    for (const id of [
      '',
      'treble:61x',
      'ear:interval:tritone',
      'ear:chord:sus4',
      'ear:other:third',
      'sprint:note:treble:61:0', // C♯ is not a written natural
      'sprint:note:alto:60:0',
      'sprint:note:treble:60:2',
      'sprint:note:treble:600:0',
      'sprint:chord:treble:60:power',
      'sprint:bar:treble:60:0',
      'ear:interval:third:extra',
    ]) {
      expect(isKnownItemId(id), id).toBe(false);
    }
  });
});
