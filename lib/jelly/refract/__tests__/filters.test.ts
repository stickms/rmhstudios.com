import { describe, expect, it } from 'vitest';
import { acquireRefractFilter, refractFilterCount } from '../filters';
import { sizeClass } from '../profile';
import { FakeDoc } from './fake-dom';

const encode = () => 'data:image/png;base64,AAAA';
const asDoc = (d: FakeDoc) => d as unknown as Document;

describe('acquireRefractFilter', () => {
  it('creates one filter for two hosts of the same class and removes it with the last release', () => {
    const doc = new FakeDoc();
    const c = sizeClass(300, 100, 24);
    const a = acquireRefractFilter(asDoc(doc), c, { encode })!;
    const b = acquireRefractFilter(asDoc(doc), c, { encode })!;
    expect(a.id).toBe(b.id);
    expect(refractFilterCount(asDoc(doc))).toBe(1);
    expect(doc.body.descendants().filter((n) => n.tagName === 'filter')).toHaveLength(1);
    a.release();
    a.release(); // idempotent: a second release does not take b's share
    expect(refractFilterCount(asDoc(doc))).toBe(1);
    b.release();
    expect(refractFilterCount(asDoc(doc))).toBe(0);
    expect(doc.body.descendants()).toHaveLength(0);
  });

  it('builds the displacement graph: a map, three displacements, channel isolations, two blends and the band composite', () => {
    const doc = new FakeDoc();
    const f = acquireRefractFilter(asDoc(doc), sizeClass(300, 100, 24), { encode })!;
    const names = doc.body.descendants().map((n) => n.tagName);
    expect(names.filter((n) => n === 'feImage')).toHaveLength(1);
    expect(names.filter((n) => n === 'feDisplacementMap')).toHaveLength(3);
    expect(names.filter((n) => n === 'feColorMatrix')).toHaveLength(4);
    expect(names.filter((n) => n === 'feComposite')).toHaveLength(1);
    expect(names.filter((n) => n === 'feGaussianBlur')).toHaveLength(1);
    expect(names.filter((n) => n === 'feBlend')).toHaveLength(2);
    const scales = doc.body
      .descendants()
      .filter((n) => n.tagName === 'feDisplacementMap')
      .map((n) => Number(n.getAttribute('scale')));
    expect(scales[0]).toBeGreaterThan(scales[1]);
    expect(scales[1]).toBeGreaterThan(scales[2]);
    f.release();
  });

  it('keeps a 200 to 800 px width sweep to 12 filters at most (Review Focus 2)', () => {
    const doc = new FakeDoc();
    const held = [];
    for (let w = 200; w <= 800; w++) {
      const f = acquireRefractFilter(asDoc(doc), sizeClass(w, 120, 32), { encode });
      if (f) held.push(f);
      expect(refractFilterCount(asDoc(doc))).toBeLessThanOrEqual(12);
    }
    expect(doc.body.descendants().filter((n) => n.tagName === 'filter').length).toBeLessThanOrEqual(
      12,
    );
    for (const f of held) f.release();
    expect(refractFilterCount(asDoc(doc))).toBe(0);
  });

  it('returns null, and leaves nothing behind, where the map cannot be built', () => {
    const doc = new FakeDoc();
    expect(
      acquireRefractFilter(asDoc(doc), sizeClass(300, 100, 24), { encode: () => null }),
    ).toBeNull();
    expect(refractFilterCount(asDoc(doc))).toBe(0);
  });
});
