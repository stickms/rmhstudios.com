import { describe, it, expect } from 'vitest';
import { CRAFT_SYSTEM, craftDirectives } from '../craft';

describe('craft module', () => {
  it('CRAFT_SYSTEM names the core craft rules', () => {
    const s = CRAFT_SYSTEM.toLowerCase();
    expect(s).toContain('goal');
    expect(s).toContain('subtext');
    expect(s).toContain('payoff');
  });

  it('craftDirectives reminds the model that choices must echo', () => {
    expect(craftDirectives().toLowerCase()).toContain('choice');
  });
});
