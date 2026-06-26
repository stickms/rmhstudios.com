import { describe, it, expect } from 'vitest';
import { fallbackWorld } from '../fallback';
import { renderBible } from '../bible';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('renderBible', () => {
  it('includes every character id and name', () => {
    const bible = renderBible(world);
    for (const c of world.characters) {
      expect(bible).toContain(c.id);
      expect(bible).toContain(c.name);
    }
  });

  it('states the name-lock constraint', () => {
    const bible = renderBible(world).toLowerCase();
    expect(bible).toContain('never rename');
  });

  it('includes the story title and setting', () => {
    const bible = renderBible(world);
    expect(bible).toContain(world.title);
    expect(bible).toContain(world.setting);
  });
});
