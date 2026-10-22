/** Independent dielectric globe coat. One WebGL context, no DOM capture.
 * The transparent output composites over the live cage; procedural studio
 * reflection is deliberately distinct from page-texture refraction in eversion.
 */
export interface GlobeMaterialFrame {
  radius: number;
  dpr: number;
  grabX: number;
  grabY: number;
  pinch: number;
  stretchX: number;
  stretchY: number;
}

const VERTEX = `attribute vec2 a; varying vec2 uv;
void main(){ uv=a; gl_Position=vec4(a,0.,1.); }`;
const FRAGMENT = `precision highp float;
varying vec2 uv;
uniform vec3 bg, ink, accent;
uniform vec2 grab, stretch;
uniform float pinch, pixel;
vec3 environment(vec3 ray) {
  float strip=pow(max(0.,dot(ray,normalize(vec3(-.6,.8,1.)))),24.);
  float horizon=exp(-10.*abs(ray.y+.2));
  return mix(bg,accent,.06+.12*horizon)+mix(ink,vec3(1.),.8)*strip*.65;
}
void main(){
  vec2 q=vec2(uv.x,-uv.y)/stretch;
  float r2=dot(q,q);
  if(r2>1.) discard;
  float z=sqrt(max(.0001,1.-r2));
  vec2 contact=q-grab;
  float d2=dot(contact,contact)/.1296;
  float dent=exp(-.5*d2);
  // Gradient of the local indentation and compensating shoulder changes the
  // normal, so the highlight bends around an actual contact-shaped depression.
  vec2 slope=pinch*contact/.1296*(2.-.5*d2)*dent;
  vec3 N=normalize(vec3(q+slope,z));
  vec3 V=vec3(0.,0.,1.);
  float nv=max(.001,dot(N,V));
  float F=.034+(.966)*pow(1.-nv,5.); // IOR 1.45, Schlick dielectric reflectance
  vec3 reflected=environment(reflect(-V,N));
  vec3 inside=refract(-V,N,1./1.45);
  vec3 exitNormal=normalize(vec3(q+inside.xy*2.*z,-z));
  vec3 transmitted=refract(inside,-exitNormal,1.45);
  vec3 through=environment(transmitted);
  vec3 L=normalize(vec3(-.45,-.6,1.2)+vec3(grab*.35,0.));
  vec3 H=normalize(V+L);
  float spec=pow(max(dot(N,H),0.),100.)*.8;
  float shoulder=pinch*dent*(.5*d2-1.);
  vec3 colour=mix(through,reflected,F)+vec3(spec)+ink*max(0.,shoulder)*.25;
  float edge=1.-smoothstep(1.-pixel*2.,1.,r2);
  float alpha=(.08+.65*F+spec*.35)*edge;
  gl_FragColor=vec4(colour*alpha,alpha);
}`;

export function createGlobeMaterial(canvas: HTMLCanvasElement): {
  draw(frame: GlobeMaterialFrame): void;
  dispose(): void;
} | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const contrast = matchMedia('(forced-colors: active)');
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let lost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    canvas.style.visibility = 'hidden';
  };
  // A lost coat degrades to the CSS fallback. Remounting the navigator creates
  // fresh resources; it never takes navigation down with the graphics driver.
  canvas.addEventListener('webglcontextlost', onLost);
  const dispose = () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    program = gl.createProgram();
    if (!program) throw new Error('No glass program');
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('No glass shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Glass shader unavailable');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Glass program unavailable');
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, 'a');
    const locations = Object.fromEntries(
      ['bg', 'ink', 'accent', 'grab', 'stretch', 'pinch', 'pixel'].map((name) => [
        name,
        gl.getUniformLocation(program!, name),
      ]),
    );
    // Resolve any CSS colour syntax through the browser, once per theme change.
    const swatch = canvas.ownerDocument.createElement('canvas');
    swatch.width = swatch.height = 1;
    const ctx = swatch.getContext('2d', { willReadFrequently: true })!;
    let theme = '';
    const colours = [new Float32Array(3), new Float32Array(3), new Float32Array(3)];
    return {
      draw(frame) {
        if (
          lost ||
          canvas.ownerDocument.hidden ||
          transparency.matches ||
          contrast.matches ||
          canvas.ownerDocument.documentElement.matches(
            '.perf-lite,.reduce-transparency,.style-high-contrast',
          )
        )
          return;
        const size = Math.max(1, Math.round(frame.radius * 2 * Math.min(frame.dpr, 1.5)));
        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = canvas.height = size;
        }
        gl.viewport(0, 0, size, size);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        const root = canvas.ownerDocument.documentElement;
        const key = root.className + root.getAttribute('style');
        if (key !== theme) {
          theme = key;
          const style = getComputedStyle(root);
          ['--site-bg', '--site-text', '--site-accent'].forEach((name, i) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = style.getPropertyValue(name).trim();
            ctx.fillRect(0, 0, 1, 1);
            const rgba = ctx.getImageData(0, 0, 1, 1).data;
            for (let j = 0; j < 3; j++) colours[i]![j] = rgba[j]! / 255;
          });
        }
        gl.uniform3fv(locations.bg!, colours[0]!);
        gl.uniform3fv(locations.ink!, colours[1]!);
        gl.uniform3fv(locations.accent!, colours[2]!);
        gl.uniform2f(locations.grab!, frame.grabX, frame.grabY);
        gl.uniform2f(locations.stretch!, frame.stretchX, frame.stretchY);
        gl.uniform1f(locations.pinch!, frame.pinch);
        gl.uniform1f(locations.pixel!, 1 / size);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
