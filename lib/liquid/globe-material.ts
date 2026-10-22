/** The same studio reflection and specular response on the navigator and its eversion.
 * Direction space is x right, y down, z toward the viewer. Colours come from the
 * active theme; no texture, extra pass, timer or continuously animated environment.
 */
export const LIQUID_GLOBE_MATERIAL_GLSL = /* glsl */ `
float globeSoftbox(vec2 q, vec2 centre, vec2 halfSize, float feather) {
  vec2 e = abs(q - centre) - halfSize;
  float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  return 1.0 - smoothstep(-feather, feather, d);
}
vec3 globeEnvironment(vec3 reflected, vec3 ground, vec3 highlight) {
  float sky = 1.0 - smoothstep(-0.9, 0.3, reflected.y);
  float window = globeSoftbox(reflected.xy, vec2(-0.56, -0.66), vec2(0.13, 0.055), 0.035);
  float floor = smoothstep(-0.1, 0.8, reflected.y);
  return ground * (1.0 - floor * 0.25) + highlight * (window * 0.84 + sky * 0.3);
}
float globeSpecular(vec3 normal, vec3 eye) {
  vec3 key = normalize(vec3(-0.5, -0.62, 0.6));
  vec3 kicker = normalize(vec3(0.62, 0.5, 0.6));
  float k = max(dot(normal, normalize(key + eye)), 0.0);
  return pow(k, 1400.0) * 1.1 + pow(k, 90.0) * 0.08
       + pow(max(dot(normal, normalize(kicker + eye)), 0.0), 220.0) * 0.28;
}
`;
