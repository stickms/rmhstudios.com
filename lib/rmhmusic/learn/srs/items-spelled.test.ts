import { describe, expect, it } from 'vitest';
import { DECKS, deckCards } from '../content/decks';
import { isKnownItemId, itemFamily } from './items';

describe('spelled staff card ids', () => {
  it('are staff cards, so Practice may deal them and the cards API accepts them', () => {
    for (const id of ['treble:66:sharp', 'treble:70:flat', 'bass:46:flat', 'key:G:treble:66', 'key:Eb:bass:46']) {
      expect(itemFamily(id), id).toBe('staff');
      expect(isKnownItemId(id), id).toBe(true);
    }
  });

  it('accept every card of every spelled deck, and nothing else of their shape', () => {
    for (const deck of ['accidentals-treble', 'accidentals-bass', 'keys-sharps', 'keys-flats']) {
      for (const c of deckCards(DECKS[deck]!)) expect(itemFamily(c.id), c.id).toBe('staff');
    }
    for (const id of [
      'treble:66:sharp:2',
      'treble:66:natural',
      'treble:66:Sharp',
      'treble:65:sharp', // F♯ sounds as 66
      'key:G:treble:65', // F in G major sounds as 66
      'key:C:treble:60', // C major has no key cards
      'key:G:treble:66:x',
      'key::treble:66',
      'key:G:alto:66',
    ]) {
      expect(isKnownItemId(id), id).toBe(false);
    }
  });

  it('keep every natural id as it was', () => {
    for (const id of ['treble:64', 'bass:43', 'treble:60', 'treble:81']) expect(itemFamily(id), id).toBe('staff');
  });

  it('fit the 64-character column', () => {
    for (const deck of Object.values(DECKS))
      for (const c of deckCards(deck)) expect(c.id.length).toBeLessThanOrEqual(64);
  });
});
