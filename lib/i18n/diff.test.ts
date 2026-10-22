import { describe, expect, it } from 'vitest';
import { planCatalogTranslations, validateTranslationBatch, type Catalog } from './diff';

describe('merge translation spending', () => {
  it('does not mistake separately parsed legacy nested catalogs for English edits', () => {
    const legacy = JSON.stringify({ bums: { title: 'Bums Rush' } });
    const plan = planCatalogTranslations({
      source: JSON.parse(legacy) as Catalog,
      previousSource: JSON.parse(legacy) as Catalog,
      target: {},
      sources: {},
    });
    expect(plan.todo).toEqual([]);
  });

  it('translates new strings without paying for the historical backlog', () => {
    const plan = planCatalogTranslations({
      source: { old: 'Old', added: 'New' },
      previousSource: { old: 'Old' },
      target: {},
      sources: {},
    });
    expect(plan.todo).toEqual(['added']);
  });

  it('updates changed English even when the old catalog has no source metadata', () => {
    const plan = planCatalogTranslations({
      source: { greeting: 'Good evening' },
      previousSource: { greeting: 'Good morning' },
      target: { greeting: 'Bonjour' },
      sources: {},
    });
    expect(plan.todo).toEqual(['greeting']);
  });

  const pending = {
    source: { added: 'New' },
    previousSource: {},
    target: {},
    sources: {},
    previousTarget: {},
    previousSources: {},
    pendingTarget: { added: 'Nouveau' },
    pendingSources: { added: 'New' },
  };

  it('reuses an unmerged translation without another model call', () => {
    const plan = planCatalogTranslations(pending);
    expect(plan.todo).toEqual([]);
    expect(plan.target).toEqual({ added: 'Nouveau' });
    expect(plan.sources).toEqual({ added: 'New' });
  });

  it('does not reuse a paid translation after its English changes again', () => {
    const plan = planCatalogTranslations({ ...pending, source: { added: 'Latest' } });
    expect(plan.todo).toEqual(['added']);
    expect(plan.target).toEqual({});
  });

  it('preserves a human correction merged while the translation PR is pending', () => {
    const plan = planCatalogTranslations({
      ...pending,
      target: { added: 'Nouvelle' },
      sources: { added: 'New' },
    });
    expect(plan.todo).toEqual([]);
    expect(plan.target).toEqual({ added: 'Nouvelle' });
  });

  it('keeps previous pending namespaces when a later merge changes another namespace', () => {
    const plan = planCatalogTranslations({ ...pending, previousSource: pending.source });
    expect(plan.todo).toEqual([]);
    expect(plan.target).toEqual(pending.pendingTarget);
  });

  it('does not pay again when the translation landed in the English merge itself', () => {
    const plan = planCatalogTranslations({
      ...pending,
      pendingTarget: undefined,
      pendingSources: undefined,
      target: { added: 'Nouveau' },
      sources: { added: 'New' },
    });
    expect(plan.todo).toEqual([]);
  });

  it('rejects incomplete responses instead of treating English fallback as translated', () => {
    const entries = { a: 'Hello', b: 'Goodbye' };
    for (const response of [null, [], {}, { a: 'Bonjour' }, { a: 'Bonjour', b: ' ' }]) {
      expect(() => validateTranslationBatch(entries, response)).toThrow();
    }
    expect(validateTranslationBatch(entries, { a: 'Bonjour', b: 'Au revoir' })).toEqual({
      a: 'Bonjour',
      b: 'Au revoir',
    });
  });
});
