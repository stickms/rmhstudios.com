import {
  describe,
  expect,
  it,
} from 'vitest';
import { chooseFighterView } from './fighterView';

const ok =
  {
    source: false,
    skeletal: false,
  };

describe('chooseFighterView', () => {
  it('uses the animated Y-Bot by default', () => {
    expect(
      chooseFighterView(
        'ybot',
        ok,
      ),
    ).toBe(
      'skeletal',
    );
  });
  it('uses the chosen Source model', () => {
    expect(
      chooseFighterView(
        'tf2_heavy',
        ok,
      ),
    ).toBe(
      'source',
    );
  });
  it('falls back to the Y-Bot, not the stick figure, when the Source model fails', () => {
    expect(
      chooseFighterView(
        'tf2_heavy',
        {
          source: true,
          skeletal: false,
        },
      ),
    ).toBe(
      'skeletal',
    );
  });
  it('uses the stick figure only when every animated option failed', () => {
    expect(
      chooseFighterView(
        'ybot',
        {
          source: false,
          skeletal: true,
        },
      ),
    ).toBe(
      'stick',
    );
    expect(
      chooseFighterView(
        'hl2_alyx',
        {
          source: true,
          skeletal: true,
        },
      ),
    ).toBe(
      'stick',
    );
  });
});
