import { describe, it, expect } from 'vitest';
import {
  CRAFT_SYSTEM, craftDirectives,
  VN_FORMAT, PROSE_CRAFT, SETTING_CRAFT, CHOICE_CRAFT, ANTI_REPETITION,
} from '../craft';

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

describe('writing-guide blocks', () => {
  it('VN_FORMAT covers pacing, hooks, and registers', () => {
    const s = VN_FORMAT.toLowerCase();
    expect(s).toContain('scene');
    expect(s).toContain('hook');
    expect(s).toContain('narration');
  });

  it('PROSE_CRAFT bans clichés and demands distinct voices', () => {
    const s = PROSE_CRAFT.toLowerCase();
    expect(s).toContain('clich');
    expect(s).toContain('distinct');
  });

  it('SETTING_CRAFT covers worldbuilding', () => {
    const s = SETTING_CRAFT.toLowerCase();
    expect(s).toContain('world');
    expect(s).toContain('place');
  });

  it('CHOICE_CRAFT requires materially distinct options', () => {
    const s = CHOICE_CRAFT.toLowerCase();
    expect(s).toContain('direction');
    expect(s).toContain('different');
  });

  it('ANTI_REPETITION forbids repeats within and across chapters', () => {
    const s = ANTI_REPETITION.toLowerCase();
    expect(s).toContain('repetition');
    expect(s).toContain('story so far');
  });
});
