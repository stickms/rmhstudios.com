/**
 * The chrome ball as a BODY: the Steel reflection (lib/chrome/shader.ts, same room, same page lookup, same constants)
 * on a surface that turns, ripples and gives like dough.
 *
 * It is a separate program from the flat chrome shader so the renderer's own module stays small; the renderer compiles
 * it the first time a globe hands it over (`attachChromeBall`). What it adds:
 *
 *   - the dough field (lib/dough.ts), read as a texture: the material at pixel p rests at X = p - u(p), so a limb pushed
 *     outward bulges the silhouette, and the field's height tilts the normal, so the room's window and the page's
 *     reflection bend around every dent
 *   - ripples (lib/fluid rippleWave, the same Ricker wavelet) tilting the normal as the crest passes
 *   - the liquid globe's cage, fixed to the BODY and engraved as hairlines: meridians every 30 degrees, parallels every
 *     20 up to 60. A mirror ball looks the same at any rotation; the cage is what shows it turning.
 *   - the DESTINATIONS as dots on the sphere (`u_pin`, body space): docked, the globe shows where its pages are as
 *     dots that orbit with it, as the liquid globe did; open, the real icon pins (DOM links, lib/globe/view.ts) sit
 *     over them and the dots fade. A dot is a white disc inside a light grey outline one CSS pixel wide (owner,
 *     2026-11-13: no dark ring round it).
 *
 * The canvas hangs outside the disc by BLEED of its diameter on every side so the silhouette has somewhere to go.
 */
import { DOUGH_EXTENT, DOUGH_N } from '@/lib/dough';
import { RIPPLE } from '@/lib/fluid';
import { MAX_RIPPLES } from './engine';

/** The most destinations the shader marks as dots on the sphere. */
export const MAX_PINS = 24;

/** How far the canvas hangs outside the disc, as a fraction of its diameter (the liquid globe's 11%). */
export const BALL_BLEED = 0.11;
/** Half the canvas, in radii. */
export const BALL_EXTENT = 1 + 2 * BALL_BLEED;

const f = (n: number) => n.toFixed(4);

export const BALL_UNIFORMS = ['u_field', 'u_soft', 'u_rot', 'u_rip', 'u_dots', 'u_pin', 'u_pins'] as const;

/*
 * Notes (kept out of the shipped string):
 *   uniform sampler2D u_field; // DOUGH_N^2 RGBA float: R,G = displacement of the material that lands here, B = height
 *   uniform float u_soft;      // 1.0 while the field is deformed (skips three texture reads at rest)
 *   uniform mat3 u_rot;        // body -> view is the engine's drawM; uploaded row-major, so here it is view -> body
 *   uniform vec4 u_rip[n];     // view-space impact direction, age in seconds (negative: empty)
 *   uniform vec3 u_dots;       // dot size (1 = docked), dot strength, and the strength of the cage's lines
 *   uniform vec3 u_pin[n]; uniform float u_pins; // the destinations, body space, and how many
 * u_hs is the half-size of the DISC in CSS px; the canvas is BALL_EXTENT times that.
 */
export const BALL_FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_viewport;
uniform float u_dpr;
uniform vec2 u_hs;
uniform vec2 u_centre;
uniform vec2 u_envOrigin;
uniform vec2 u_envSize;
uniform sampler2D u_env;
uniform vec3 u_bg;
uniform vec3 u_lo;
uniform vec3 u_hi;
uniform vec2 u_pointer;
uniform float u_night;
uniform sampler2D u_field;
uniform float u_soft;
uniform mat3 u_rot;
uniform vec4 u_rip[${MAX_RIPPLES}];
uniform vec3 u_dots;
uniform vec3 u_pin[${MAX_PINS}];
uniform float u_pins;
vec3 page(vec2 pos) {
vec2 uv = (pos - u_envOrigin) / u_envSize;
if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return u_bg;
return texture2D(u_env, uv).rgb;
}
vec3 pointer(vec3 col, vec2 pos) {
vec2 a = pos - u_pointer;
float inside = step(0.0, a.x) * step(0.0, a.y) * step(a.y, 15.0) * step(a.x, a.y * 0.68);
float near = step(-1.5, a.x) * step(-1.5, a.y) * step(a.y, 17.0) * step(a.x, a.y * 0.68 + 2.2);
vec3 fill = mix(vec3(0.05), vec3(0.95), u_night);
vec3 line = mix(vec3(0.97), vec3(0.04), u_night);
col = mix(col, line, near);
return mix(col, fill, inside);
}
vec3 field(vec2 p) {
return texture2D(u_field, p / ${f(2 * DOUGH_EXTENT)} + 0.5).xyz;
}
float wave(float age, float dist) {
float q = (dist - ${f(RIPPLE.speed)} * age) / ${f(RIPPLE.width)};
if (abs(q) > 4.0) return 0.0;
float d = 1.0 - age / ${f(RIPPLE.life)};
return ${f(RIPPLE.amplitude)} * (1.0 - q * q) * exp(-0.5 * q * q) * d * d;
}
void main() {
vec2 fc = vec2(gl_FragCoord.x, u_viewport.y - gl_FragCoord.y);
float r = u_hs.x;
vec2 pp = fc / u_dpr - u_hs * ${f(BALL_EXTENT)};
vec2 p = pp / r;
vec3 fd = u_soft > 0.5 ? field(p) : vec3(0.0);
vec2 X = p - fd.xy;
float r2 = dot(X, X);
if (r2 > 1.0) discard;
vec3 n0 = vec3(X, sqrt(1.0 - r2));
vec3 n = n0;
for (int i = 0; i < ${MAX_RIPPLES}; i++) {
vec4 rip = u_rip[i];
if (rip.w < 0.0) continue;
float c = clamp(dot(n0, rip.xyz), -1.0, 1.0);
float dist = acos(c);
float slope = (wave(rip.w, dist + 0.03) - wave(rip.w, dist - 0.03)) / 0.06;
vec3 t = rip.xyz - n0 * c;
float tl = length(t);
if (tl > 1e-4) n = normalize(n + (t / tl) * slope * 2.2);
}
if (u_soft > 0.5) {
float e = ${f(((2 * DOUGH_EXTENT) / (DOUGH_N - 1)) * 1.25)};
vec2 gh = vec2(
field(p + vec2(e, 0.0)).z - field(p - vec2(e, 0.0)).z,
field(p + vec2(0.0, e)).z - field(p - vec2(0.0, e)).z
) / (2.0 * e);
n = normalize(vec3(n.xy - gh * 1.7, max(n.z, 0.0)));
}
vec3 R = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
float dz = R.z - 0.55;
vec3 room = mix(u_lo, u_hi, smoothstep(0.3, 1.0, R.z));
float window = smoothstep(0.9, 0.97, dot(R, normalize(vec3(-0.42, -0.52, 0.74))));
room = mix(room, min(u_hi * 1.25 + 0.04, vec3(1.0)), window);
vec3 col = room;
if (dz < 0.0) {
float t = r * (1.4 + n.z) / (-dz);
vec2 pos = u_centre + pp + t * R.xy;
vec3 hit = pointer(page(pos), pos);
hit *= mix(0.55, 1.0, smoothstep(1.0, 2.2, length(pos - u_centre) / r));
hit = mix(room, hit, smoothstep(32.0 * r, 7.0 * r, t));
col = mix(room, hit, smoothstep(0.0, -0.25, dz));
}
col += pow(1.0 - n.z, 4.0) * 0.4;
col += smoothstep(0.975, 0.99, dot(n, normalize(vec3(-0.5, -0.6, 0.62))));
col *= 0.9 + 0.1 * n.z;
vec3 b = u_rot * n0;
float lat = asin(clamp(-b.y, -1.0, 1.0));
float lon = atan(b.x, b.z);
float la = clamp(floor(lat / 0.349066 + 0.5), -3.0, 3.0) * 0.349066;
float lo = floor(lon / 0.523599 + 0.5) * 0.523599;
float dd = 9.0;
for (int i = 0; i < ${MAX_PINS}; i++) {
if (float(i) >= u_pins) break;
dd = min(dd, length(b - u_pin[i]));
}
dd /= u_dots.x;
float px = 1.0 / (r * u_dpr * u_dots.x);
float face = smoothstep(0.05, 0.35, n0.z) * u_dots.y;
float w1 = 1.0 / (r * u_dpr);
float par = abs(lat - la);
float mer = abs(asin(clamp(cos(lat) * sin(lon - lo), -1.0, 1.0)));
float line = smoothstep(1.6 * w1, 0.6 * w1, min(par, mer));
col = mix(col, vec3(0.0), 0.32 * u_dots.z * smoothstep(0.05, 0.35, n0.z) * line);
float ring = 0.052 + px * u_dpr;
col = mix(col, vec3(0.74), 0.9 * face * smoothstep(ring + px, ring - px, dd));
col = mix(col, vec3(1.0), face * smoothstep(0.052 + px, 0.052 - px, dd));
float edge = 1.5 / (r * u_dpr);
float rr = sqrt(r2);
col *= 1.0 - 0.45 * smoothstep(1.0 - 3.0 * edge, 1.0, rr);
float alpha = smoothstep(1.0, 1.0 - edge, rr);
gl_FragColor = vec4(min(col, vec3(1.0)) * alpha, alpha);
}
`;
