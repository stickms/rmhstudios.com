/**
 * The chrome shader (Steel 4.3): one fragment program for balls and pills.
 *
 * A pixel at offset `p` from the element's centre is a point on a rounded solid seen from
 * straight above. Its surface normal reflects the view ray either down onto the page (it
 * samples the environment texture there) or up into the room (an even ceiling and one soft
 * window). Every constant below is from the Steel document; do not tune them here.
 */

export const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/*
 * Notes on the fragment shader (kept here so they are not shipped inside the string):
 *   uniform vec2 u_viewport;   // the element's backing size, device px
 *   uniform float u_dpr;       // device px per CSS px for this element
 *   uniform vec2 u_hs;         // half-size, CSS px
 *   uniform vec2 u_centre;     // element centre, page CSS px
 *   uniform vec2 u_envOrigin;  // page CSS px of the environment's top-left
 *   uniform vec2 u_envSize;    // page CSS px covered by the environment
 *   uniform vec3 u_bg;         // the page colour, shown where the environment has nothing
 *   uniform vec3 u_lo;         // room, low
 *   uniform vec3 u_hi;         // room, high
 *   uniform vec2 u_pointer;    // page CSS px; far away when there is no pointer
 *   uniform float u_night;     // 1.0 in the Night edition
 *   // A small pointer arrow with its tip at the pointer position: fill, then a 1.5px outline.
 *   // The room: an even ceiling and one soft window.
 */
export const FRAGMENT_SHADER = `
precision mediump float;
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
void main() {
vec2 fc = vec2(gl_FragCoord.x, u_viewport.y - gl_FragCoord.y);
vec2 p = fc / u_dpr - u_hs;
float r = min(u_hs.x, u_hs.y);
vec2 q = clamp(p, -(u_hs - r), u_hs - r);
vec2 d = (p - q) / r;
float r2 = dot(d, d);
if (r2 > 1.0) discard;
vec3 n = vec3(d, sqrt(1.0 - r2));
vec3 R = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
float dz = R.z - 0.55;
vec3 room = mix(u_lo, u_hi, smoothstep(0.3, 1.0, R.z));
float window = smoothstep(0.9, 0.97, dot(R, normalize(vec3(-0.42, -0.52, 0.74))));
room = mix(room, min(u_hi * 1.25 + 0.04, vec3(1.0)), window);
vec3 col = room;
if (dz < 0.0) {
float t = r * (1.4 + n.z) / (-dz);
vec2 pos = u_centre + p + t * R.xy;
vec3 hit = pointer(page(pos), pos);
hit *= mix(0.55, 1.0, smoothstep(1.0, 2.2, length(pos - u_centre - q) / r));
hit = mix(room, hit, smoothstep(32.0 * r, 7.0 * r, t));
col = mix(room, hit, smoothstep(0.0, -0.25, dz));
}
col += pow(1.0 - n.z, 4.0) * 0.4;
col += smoothstep(0.975, 0.99, dot(n, normalize(vec3(-0.5, -0.6, 0.62))));
col *= 0.9 + 0.1 * n.z;
float alpha = smoothstep(1.0, 0.94, sqrt(r2));
gl_FragColor = vec4(min(col, vec3(1.0)) * alpha, alpha);
}
`;

/** Room colours (Steel 4.3). */
export const ROOM = {
  day: { lo: [0.83, 0.88, 0.92], hi: [0.95, 0.97, 0.99] },
  night: { lo: [0.07, 0.08, 0.1], hi: [0.2, 0.23, 0.27] },
} as const;
