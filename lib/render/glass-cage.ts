/**
 * **Glass over a cage** — the material the whole site's 3D surfaces are made of.
 *
 * The navigation globe established it: a translucent shell that is nearly
 * invisible face-on and nearly solid at the limb, with a wireframe over it in
 * three ink tiers, lit by a static sun. The RMH family of cars wears it; so does
 * RMH Fashion. This module is the one place the shaders and the ink live, so
 * "the same material" is a fact about the code rather than a resemblance.
 *
 * Two programs, both unlit. There are no lights in these scenes and there need
 * not be any: the site's glass answers a STATIC SUN (design-language §5.1.1 —
 * nothing tracks the cursor), so the specular is one fixed direction and the
 * rest of the surface is Fresnel. That is also what makes the material cheap
 * enough to sit on a content page rather than in a game.
 */

import * as THREE from 'three';

/** The three cage tiers, as alphas. Named for the globe's `--cage-*` tokens. */
export interface CagePaint {
  /** `--site-text`: the cage's ink and the body of the glass. */
  ink: string;
  /** `--site-accent`: the tint, the ripple crest and the ground ring. */
  accent: string;
  minor: number;
  parallel: number;
  major: number;
}

export type CageTier = 'minor' | 'parallel' | 'major';
export type InkTier = 'glass' | CageTier;

export interface InkTarget {
  material: THREE.ShaderMaterial;
  tier: InkTier;
  /** Overrides the paint's ink for this material — a dyed garment. */
  colour?: THREE.Color;
}

/** The static scene sun, in view space. One direction, everywhere. */
const SUN = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();

/**
 * A pane of the glass.
 *
 * @param accentMix how strongly this surface takes the accent, 0…1.
 * @param strength overall opacity multiplier — the far side of a hull is drawn
 *   weaker than the near side so the two passes read as one volume.
 */
export function glassMaterial(
  accentMix: number,
  side: THREE.Side,
  strength: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInk: { value: new THREE.Color() },
      uAccent: { value: new THREE.Color() },
      uAccentMix: { value: accentMix },
      uStrength: { value: strength },
      uSun: { value: SUN.clone() },
    },
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side,
  });
}

/** One tier of the wireframe. */
export function cageMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uCrest: { value: new THREE.Color() },
      uAlpha: { value: 0.2 },
    },
    vertexShader: CAGE_VERTEX,
    fragmentShader: CAGE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

/** Re-ink every material from the page's tokens. Cheap enough for a theme flip. */
export function applyPaint(targets: readonly InkTarget[], paint: CagePaint): void {
  const ink = new THREE.Color().setStyle(paint.ink);
  const accent = new THREE.Color().setStyle(paint.accent);
  for (const { material, tier, colour } of targets) {
    if (tier === 'glass') {
      (material.uniforms.uInk.value as THREE.Color).copy(colour ?? ink);
      (material.uniforms.uAccent.value as THREE.Color).copy(colour ?? accent);
    } else {
      (material.uniforms.uColor.value as THREE.Color).copy(colour ?? ink);
      (material.uniforms.uCrest.value as THREE.Color).copy(accent);
      material.uniforms.uAlpha.value = paint[tier];
    }
  }
}

/* ── Reading the page's ink ──────────────────────────────────────────────────
   A custom property's computed value is whatever the theme wrote — `#f5f5f7`,
   `rgba(...)`, an `oklch()`, or a `color-mix()` an engine has not resolved.
   `THREE.Color.setStyle` understands the first two and silently falls back to
   WHITE on the rest, which is how a themed scene ends up rendered in white. So
   each value goes through the browser's OWN parser first: a 2D context's
   `fillStyle` accepts any colour the engine can parse and hands back a
   normalised value, and rejects what it cannot by leaving the previous one in
   place — which is also how a value that must not be passed on is detected. */

let probe: CanvasRenderingContext2D | null | undefined;

/** A CSS colour three.js can take, or `null` if the engine cannot parse it. */
export function resolveColor(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (probe === undefined) probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  // Set from two different starting points: an unparseable value leaves each one
  // where it was, so the two answers disagree and the value is rejected.
  probe.fillStyle = '#000000';
  probe.fillStyle = raw;
  const fromBlack = probe.fillStyle;
  probe.fillStyle = '#ffffff';
  probe.fillStyle = raw;
  return probe.fillStyle === fromBlack ? String(fromBlack) : null;
}

/**
 * Read a custom property off an element and resolve it, falling back to the
 * element's own resolved `color` — which is `--site-text` by inheritance on
 * every theme, already normalised, and can never be missing.
 */
export function readToken(cs: CSSStyleDeclaration, name: string, fallback: string): string {
  return resolveColor(cs.getPropertyValue(name)) ?? fallback;
}

export function readAlpha(cs: CSSStyleDeclaration, name: string, dflt: number): number {
  const parsed = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : dflt;
}

/* ── Shaders ─────────────────────────────────────────────────────────────── */

export const GLASS_VERTEX = /* glsl */ `
  attribute float aWave;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWave;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vWave = aWave;
    gl_Position = projectionMatrix * mv;
  }
`;

export const GLASS_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform float uAccentMix;
  uniform float uStrength;
  uniform vec3 uSun;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWave;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    // Fresnel: glass is nearly invisible face-on and nearly solid at the limb,
    // which is what lets a transparent body still read as a volume.
    float rim = pow(1.0 - abs(dot(n, v)), 2.6);
    float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 44.0);
    float wave = clamp(abs(vWave), 0.0, 1.0);

    vec3 tint = mix(uInk, uAccent, clamp(uAccentMix + wave * 0.35, 0.0, 1.0));
    vec3 colour = mix(tint, uAccent, rim * 0.5) + spec * 0.6;
    float alpha = uStrength * (0.07 + 0.5 * rim + 0.28 * spec + 0.24 * wave);

    gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export const CAGE_VERTEX = /* glsl */ `
  attribute float aWave;
  varying float vWave;
  void main() {
    vWave = aWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CAGE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCrest;
  uniform float uAlpha;
  varying float vWave;
  void main() {
    // The crest is carried BY the wireframe rather than drawn as a second bright
    // ring on top of it — the globe's decision, for the globe's reason: a hard
    // bright circle stops being light on a wave and becomes a line somebody drew.
    float wave = clamp(abs(vWave), 0.0, 1.0);
    gl_FragColor = vec4(mix(uColor, uCrest, wave), min(1.0, uAlpha + wave * 0.6));
    #include <colorspace_fragment>
  }
`;
