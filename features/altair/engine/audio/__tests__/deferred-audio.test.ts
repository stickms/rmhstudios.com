import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-20 (e): Altair builds no Howl (and so no AudioContext) before the first pointer or key event. Music waits for
 * the gesture and then starts; sfx stays silent and unbuilt until then; stopping cancels the wait.
 */

const h = vi.hoisted(() => ({ howls: 0, plays: 0 }));

vi.mock('howler', () => {
  class Howl {
    constructor() {
      h.howls++;
    }
    play() {
      h.plays++;
      return 1;
    }
    volume() {
      return 1;
    }
    rate() {
      return 1;
    }
    load() {}
    stop() {}
    unload() {}
    once() {}
  }
  return { Howl, Howler: { ctx: undefined } };
});
vi.mock('@/lib/storage/asset', () => ({ asset: (p: string) => p }));
vi.mock('../../stores/settings-store', () => ({
  useAltairSettingsStore: { getState: () => ({ masterVolume: 1, musicVolume: 1, sfxVolume: 1 }) },
}));

import { altairMusic } from '../music';
import { altairSfx } from '../sfx';
import { hasGesture, resetGestureForTests } from '../gesture';

const press = (name: string) =>
  (globalThis as unknown as { document: EventTarget }).document.dispatchEvent(new Event(name));

beforeEach(() => {
  vi.stubGlobal('document', new EventTarget());
  altairMusic.stop();
  altairSfx.disable();
  resetGestureForTests();
  h.howls = 0;
  h.plays = 0;
});

describe('audio before the first gesture', () => {
  it('builds no Howl when music starts, and none for an sfx call or a prime-less enable', () => {
    altairMusic.start();
    altairSfx.enable();
    altairSfx.play('ui_click');
    expect(h.howls).toBe(0);
    expect(hasGesture()).toBe(false);
  });

  it('starts the music on the first pointer event', () => {
    altairMusic.start();
    press('pointerdown');
    expect(h.howls).toBe(1);
    expect(h.plays).toBe(1);
    expect(altairMusic.isPlaying()).toBe(true);
  });

  it('starts the music on the first key event, once', () => {
    altairMusic.start();
    press('keydown');
    press('pointerdown');
    expect(h.howls).toBe(1);
  });

  it('plays sfx only after a gesture', () => {
    altairSfx.enable();
    altairSfx.play('ui_click');
    expect(h.howls).toBe(0);
    press('pointerdown');
    altairSfx.play('ui_click');
    expect(h.howls).toBe(1);
    expect(h.plays).toBe(1);
  });

  it('prime counts as the gesture that unlocks audio', () => {
    altairSfx.enable();
    altairMusic.start();
    altairSfx.prime();
    expect(hasGesture()).toBe(true);
    expect(altairMusic.isPlaying()).toBe(true);
  });

  it('a stopped music manager does not start when the gesture arrives', () => {
    altairMusic.start();
    altairMusic.stop();
    press('pointerdown');
    expect(h.howls).toBe(0);
  });
});

describe('the gesture listeners', () => {
  it('are installed on first use and removed once the gesture has fired', () => {
    const doc = new EventTarget();
    const add = vi.spyOn(doc, 'addEventListener');
    const remove = vi.spyOn(doc, 'removeEventListener');
    vi.stubGlobal('document', doc);
    altairMusic.start();
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(['keydown', 'pointerdown', 'touchstart']);
    expect(remove).not.toHaveBeenCalled();
    doc.dispatchEvent(new Event('keydown'));
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['keydown', 'pointerdown', 'touchstart']);
  });
});
