/** Instanced cards support rotation, non-square sprites and geometry-sized trails. */
export const PARTICLE_VERTEX = `
  attribute vec3 aCenter;
  attribute vec3 aRight;
  attribute vec3 aUp;
  attribute vec4 aTint;
  attribute vec4 aUv0;
  attribute vec4 aUv1;
  attribute vec4 aUv2;
  attribute vec4 aUv3;
  attribute vec2 aBlend;
  varying vec4 vTint;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec2 vUv3;
  varying vec2 vBlend;
  varying float vDepth;
  uniform vec4 uSize;
  vec2 sheetUv(vec4 box) { return vec2(mix(box.x,box.z,uv.x),mix(box.w,box.y,uv.y)); }
  void main() {
    // The game's vertex shader takes the tint from gamma to linear (GammaToLinear: pow 2.2 on rgb, alpha as is)
    // before it multiplies the sRGB-decoded texture; used raw, every tinted particle came out pale.
    vTint = vec4(pow(aTint.rgb, vec3(2.2)), aTint.a);
    vBlend = aBlend;
    vUv0=sheetUv(aUv0); vUv1=sheetUv(aUv1); vUv2=sheetUv(aUv2); vUv3=sheetUv(aUv3);
    vec3 right = aRight;
    vec3 up = aUp;
    #ifdef SIZE_LIMITS
      // spritecard_vsxx.fxc: a sprite is never smaller than $minsize of its distance from the eye, never
      // larger than $maxsize of it, and fades out between $startfadesize and $endfadesize (gone past that),
      // so a particle right up at the camera does not fill the screen. Sizes are fractions of the distance.
      float dist = length((modelViewMatrix * vec4(aCenter,1.0)).xyz);
      float radius = length(aUp) * length(modelMatrix[0].xyz);
      float size = max(radius, uSize.x * dist);
      if (size > uSize.z * dist) {
        if (size > uSize.w * dist) { vTint = vec4(0.0); size = 0.0; }
        else vTint *= 1.0 - (size - uSize.z * dist) / max(1e-6, (uSize.w - uSize.z) * dist);
      }
      size = min(size, uSize.y * dist);
      float grow = radius > 1e-9 ? size / radius : 0.0;
      right *= grow;
      up *= grow;
    #endif
    vec4 view = modelViewMatrix * vec4(aCenter + position.x*right + position.y*up,1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

export const PARTICLE_FRAGMENT = `
  uniform sampler2D uMap;
  uniform sampler2D uSecond;
  uniform sampler2D uRamp;
  uniform sampler2D uDepth;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform vec3 uColor;
  uniform vec4 uUvTransform;
  uniform vec2 uNearFar;
  uniform float uAlpha;
  uniform float uOverbright;
  uniform float uAddSelf;
  uniform float uAddSecond;
  uniform float uAlphaTest;
  uniform float uDepthScale;
  uniform float uRefract;
  uniform float uBlendMode;
  uniform float uZoomSecond;
  varying vec4 vTint;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec2 vUv3;
  varying vec2 vBlend;
  varying float vDepth;
  vec2 transformUv(vec2 uv) { return (uv-0.5)*uUvTransform.xy+0.5+uUvTransform.zw; }
  vec4 frame(vec2 a,vec2 b,float blend,bool maxLum) {
    vec4 first=texture2D(uMap,transformUv(a));
    vec4 second=texture2D(uMap,transformUv(b));
    #ifndef BLEND_FRAMES
      return first;
    #endif
    if(maxLum) {
      float l1=dot(first.rgb,vec3(.3,.59,.11))*(1.0-blend);
      float l2=dot(second.rgb,vec3(.3,.59,.11))*blend;
      return l1>l2?first:second;
    }
    return mix(first,second,blend);
  }
  float viewDepth(float d) { return uNearFar.x*uNearFar.y/(uNearFar.y-d*(uNearFar.y-uNearFar.x)); }
  void main() {
    vec4 sample1=frame(vUv0,vUv1,vBlend.x,
    #ifdef MAX_LUM1
      true
    #else
      false
    #endif
    );
    #ifdef EXTRACT_GREEN_ALPHA
      sample1=vec4(sample1.g);
    #endif
    #ifdef DUAL_SEQUENCE
      vec2 uv2=(vUv2-0.5)/uZoomSecond+0.5;
      vec2 uv3=(vUv3-0.5)/uZoomSecond+0.5;
      vec4 sample2=frame(uv2,uv3,vBlend.y,
      #ifdef MAX_LUM2
        true
      #else
        false
      #endif
      );
      if(uBlendMode<0.5) sample1=(sample1+sample2)*0.5;
      else if(uBlendMode<1.5) sample1.rgb=sample2.rgb;
      else sample1.rgb=mix(sample1.rgb,sample2.rgb,sample2.a);
    #endif
    #ifdef COLOR_RAMP
      sample1.rgb=texture2D(uRamp,sample1.rg).rgb;
    #endif
    #ifdef SECOND_TEXTURE
      sample1.rgb += texture2D(uSecond,transformUv(vUv0)).rgb*uAddSecond;
    #endif
    float opacity=vTint.a*uAlpha;
    vec2 screen=gl_FragCoord.xy/uResolution;
    #ifdef SOFT_PARTICLE
      float sceneDepth=viewDepth(texture2D(uDepth,screen).x);
      opacity*=clamp((sceneDepth-vDepth)/max(.0001,uDepthScale),0.0,1.0);
    #endif
    vec4 result=sample1*vec4(vTint.rgb*uColor*uOverbright,opacity);
    #ifdef REFRACT
      vec2 displacement=(sample1.rg*2.0-1.0)*uRefract*opacity;
      vec4 background=texture2D(uScene,clamp(screen+displacement,vec2(0.0),vec2(1.0)));
      result=vec4(background.rgb*vTint.rgb*uColor,background.a*opacity);
    #endif
    if(result.a<uAlphaTest) discard;
    #ifdef PREMULTIPLIED
      // spritecard_ps2x.fxc ($addself): premultiply by alpha, add the premultiplied colour back in scaled by
      // overbright, $addself and the particle's alpha, then apply the tint. That is
      // tint * texture * overbright * alpha * (1 + overbright * addself * particleAlpha): the self-add is
      // itself scaled by alpha and overbright (the old form added it unscaled, so glows were too strong).
      result.rgb*=result.a * (1.0 + uOverbright*uAddSelf*opacity);
    #endif
    gl_FragColor=result;
    #include <colorspace_fragment>
  }
`;
