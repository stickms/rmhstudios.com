import { describe, expect, it } from 'vitest';
import { ADAPTERS, getAdapter } from './index';

describe('adapter registry', () => {
  it('has exactly 4 adapters', () => {
    expect(Object.keys(ADAPTERS)).toHaveLength(4);
  });

  describe('ADAPTERS record', () => {
    it('contains greenhouse, lever, ashby, smartrecruiters', () => {
      const keys = Object.keys(ADAPTERS).sort();
      expect(keys).toEqual(['ashby', 'greenhouse', 'lever', 'smartrecruiters']);
    });
  });

  describe('getAdapter', () => {
    it('returns greenhouse adapter for "greenhouse"', () => {
      const adapter = getAdapter('greenhouse');
      expect(adapter).not.toBeNull();
      expect(adapter!.platform).toBe('greenhouse');
    });

    it('returns lever adapter for "lever"', () => {
      const adapter = getAdapter('lever');
      expect(adapter).not.toBeNull();
      expect(adapter!.platform).toBe('lever');
    });

    it('returns ashby adapter for "ashby"', () => {
      const adapter = getAdapter('ashby');
      expect(adapter).not.toBeNull();
      expect(adapter!.platform).toBe('ashby');
    });

    it('returns smartrecruiters adapter for "smartrecruiters"', () => {
      const adapter = getAdapter('smartrecruiters');
      expect(adapter).not.toBeNull();
      expect(adapter!.platform).toBe('smartrecruiters');
    });

    it('returns null for "manual"', () => {
      expect(getAdapter('manual')).toBeNull();
    });

    it('returns null for unknown platform "bogus"', () => {
      expect(getAdapter('bogus')).toBeNull();
    });
  });
});
