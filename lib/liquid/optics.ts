/**
 * Shared optical crown glass: SCHOTT N-BK7, Sellmeier dispersion at 20 °C.
 * Manufacturer coefficients use wavelength in micrometres:
 * https://media.schott.com/api/public/content/41e799d0bf874807a0bb8e702fbb75b5?v=54856406
 *
 * An RGB capture is not a spectrum. Sample three representative visible
 * wavelengths, then refract each independently; never scale RGB UV offsets.
 * Indices are evaluated once on the CPU, not per pixel.
 */
// C/e/g spectral lines; exact wavelengths from SCHOTT TIE-29, table 1:
// https://www.schott.com/en-in/products/optical-glass/-/media/project/onex/products/o/optical-glass/downloads/schott-optical-glass-pocket-catalog-2020_row.pdf
export const GLASS_WAVELENGTHS_NM = [656.2725, 546.074, 435.8343] as const;

export function glassIorAtWavelength(wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm) || wavelengthNm < 380 || wavelengthNm > 780) {
    throw new RangeError('Glass wavelength must be between 380 and 780 nm');
  }
  const l2 = (wavelengthNm / 1000) ** 2;
  return Math.sqrt(
    1 +
      (1.03961212 * l2) / (l2 - 0.006000699) +
      (0.231792344 * l2) / (l2 - 0.0200179144) +
      (1.01046945 * l2) / (l2 - 103.560653),
  );
}

export const GLASS_IOR_RGB = GLASS_WAVELENGTHS_NM.map(glassIorAtWavelength);
const f0 = GLASS_IOR_RGB.map((n) => ((n - 1) / (n + 1)) ** 2);

/** Snell geometry shared by slabs, the ball lens and the eversion coat. */
export const GLASS_OPTICS_GLSL = /* glsl */ `
const vec3 GLASS_IOR_RGB = vec3(${GLASS_IOR_RGB.map((n) => n.toFixed(9)).join(', ')});
const vec3 GLASS_F0_RGB = vec3(${f0.map((n) => n.toFixed(9)).join(', ')});

vec3 glassFresnel(float cosTheta) {
  float grazing = pow(clamp(1.0 - abs(cosTheta), 0.0, 1.0), 5.0);
  return GLASS_F0_RGB + (vec3(1.0) - GLASS_F0_RGB) * grazing;
}

// Ray/plane intersection: thickness is normal to the page, so use tan, not sin.
vec2 glassSlabOffset(vec3 normal, float ior, float thickness) {
  vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / ior);
  return ray.xy / max(-ray.z, 1e-4) * thickness;
}

// Exact intersection with the reference unit sphere, followed by glass -> air.
// The entry normal may carry dents/ripples; the exit geometry is the reference
// sphere. Using an approximate exit normal produced an artificial TIR ring.
vec3 glassSphereRay(vec3 entry, vec3 normal, float ior, out vec3 exitPoint) {
  vec3 insideRay = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / ior);
  exitPoint = entry + insideRay * max(-2.0 * dot(entry, insideRay), 0.0);
  return refract(insideRay, -normalize(exitPoint), ior);
}

// z is the background plane, in sphere radii. A ray that turns toward the
// viewer or totally reflects has no background sample; the reflection remains.
vec3 glassSphereSample(vec3 exitPoint, vec3 ray, float z) {
  float valid = step(1e-4, -ray.z);
  float travel = max(exitPoint.z - z, 0.0) / max(-ray.z, 1e-4);
  return vec3(exitPoint.xy + ray.xy * travel, valid);
}
`;
