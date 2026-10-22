import { describe, expect, it } from 'vitest';
import { GLASS_IOR_RGB, GLASS_WAVELENGTHS_NM, glassIorAtWavelength } from '../optics';

describe('N-BK7 visible dispersion', () => {
  // Independent measurements in the SCHOTT data sheet, rounded to five decimals.
  it.each([
    [656.2725, 1.51432],
    [587.5618, 1.5168],
    [546.074, 1.51872],
    [486.1327, 1.52238],
    [435.8343, 1.52668],
    [404.6561, 1.53024],
  ])('matches the published index at %f nm', (wavelength, expected) => {
    expect(Math.abs(glassIorAtWavelength(wavelength) - expected)).toBeLessThan(0.000005);
  });

  it('has normal dispersion across the visible band: shorter wavelengths bend more', () => {
    for (let nm = 380; nm < 780; nm += 5) {
      expect(glassIorAtWavelength(nm)).toBeGreaterThan(glassIorAtWavelength(nm + 5));
    }
    expect(GLASS_WAVELENGTHS_NM[0]).toBeGreaterThan(GLASS_WAVELENGTHS_NM[2]);
    expect(GLASS_IOR_RGB[0]).toBeLessThan(GLASS_IOR_RGB[1]);
    expect(GLASS_IOR_RGB[1]).toBeLessThan(GLASS_IOR_RGB[2]);
  });

  it.each([0, 379, 781, Number.NaN, Infinity])('rejects unsupported wavelengths (%f)', (nm) => {
    expect(() => glassIorAtWavelength(nm)).toThrow(RangeError);
  });
});
