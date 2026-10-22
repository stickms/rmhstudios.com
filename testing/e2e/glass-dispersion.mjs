/** Real GPU checks for wavelength-dependent glass. No app or database needed.
 * LIQUID_BROWSER=firefox|chromium|webkit node testing/e2e/glass-dispersion.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const bundle = await build({
  stdin: {
    contents: `import * as optics from './lib/liquid/optics';
      import { GlassRenderer } from './lib/liquid/glass/renderer';
      import { getShaderSet } from './lib/eversion/gl/shaders';
      window.dispersion = { ...optics, GlassRenderer, getShaderSet };`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
});
const name = process.env.LIQUID_BROWSER ?? 'chromium';
assert.ok({ chromium, firefox, webkit }[name], 'known browser');
const browser = await { chromium, firefox, webkit }[name].launch({
  headless: true,
  ...(name === 'chromium'
    ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      }
    : name === 'firefox' && process.env.FIREFOX_PATH
      ? { executablePath: process.env.FIREFOX_PATH }
      : {}),
});
let checks = 0;
const check = (label, value) => {
  assert.ok(value, label);
  checks++;
};
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const { GLASS_OPTICS_GLSL, GLASS_IOR_RGB, GlassRenderer, getShaderSet } = window.dispersion;
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('WebGL 2 unavailable');
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const link = (vertex, fragment, varyings) => {
      const program = gl.createProgram();
      const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
      for (const shader of shaders) gl.attachShader(program, shader);
      if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      for (const shader of shaders) gl.deleteShader(shader);
      return program;
    };
    // Compile the real eversion programs at all quality tiers, including both
    // sides and the flat endpoints' cheap path.
    const programs = [];
    for (const tier of ['low', 'mid', 'high']) {
      const set = getShaderSet({ tier });
      for (const kind of ['surface', 'surfaceMasked', 'cage', 'cosmos', 'stars']) {
        if (!set[kind]) continue;
        gl.deleteProgram(link(set[kind].vertex, set[kind].fragment));
        programs.push(`${tier}/${kind}`);
      }
    }
    const p = link(
      `#version 300 es
      precision highp float;
      ${GLASS_OPTICS_GLSL}
      uniform float uX;
      out vec3 vSlab; out vec3 vBall; out vec3 vValid;
      void main() {
        vec3 entry = vec3(uX, 0.0, sqrt(1.0 - uX * uX));
        vec3 a, b, c;
        vec3 ar = glassSphereRay(entry, entry, GLASS_IOR_RGB.r, a);
        vec3 br = glassSphereRay(entry, entry, GLASS_IOR_RGB.g, b);
        vec3 cr = glassSphereRay(entry, entry, GLASS_IOR_RGB.b, c);
        vec3 sa = glassSphereSample(a, ar, -3.0);
        vec3 sb = glassSphereSample(b, br, -3.0);
        vec3 sc = glassSphereSample(c, cr, -3.0);
        vSlab = vec3(glassSlabOffset(entry, GLASS_IOR_RGB.r, 18.0).x,
          glassSlabOffset(entry, GLASS_IOR_RGB.g, 18.0).x,
          glassSlabOffset(entry, GLASS_IOR_RGB.b, 18.0).x);
        vBall = vec3(sa.x, sb.x, sc.x); vValid = vec3(sa.z, sb.z, sc.z);
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
      }`,
      '#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(0.0);}',
      ['vSlab', 'vBall', 'vValid'],
    );
    gl.useProgram(p);
    gl.bindVertexArray(gl.createVertexArray());
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, gl.createTransformFeedback());
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 9 * 4, gl.STREAM_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    const samples = [];
    for (const x of [-0.95, -0.75, -0.4, 0, 0.4, 0.75, 0.95]) {
      gl.uniform1f(gl.getUniformLocation(p, 'uX'), x);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.endTransformFeedback();
      const values = new Float32Array(9);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
      samples.push({ x, values: Array.from(values) });
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU optical readback failed');

    // Read actual slab pixels over a neutral ramp. A long optical path makes
    // physical channel separation measurable in an 8-bit readback.
    const scene = document.createElement('canvas');
    scene.width = 900;
    scene.height = 640;
    const ctx = scene.getContext('2d');
    const ramp = ctx.createLinearGradient(0, 0, 900, 0);
    ramp.addColorStop(0, '#000');
    ramp.addColorStop(1, '#fff');
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, 900, 640);
    const renderer = GlassRenderer.create();
    if (!renderer || !renderer.setScene(scene)) throw new Error('Slab renderer unavailable');
    const target = document.createElement('canvas');
    const ripples = new Float32Array(12);
    ripples[2] = ripples[6] = ripples[10] = -1;
    renderer.draw(
      {
        width: 100,
        height: 100,
        dpr: 1,
        radius: 0,
        bezel: 20,
        thickness: 450,
        sceneX: 400,
        sceneY: 200,
        sceneW: 900,
        sceneH: 640,
        sceneOn: 1,
        tint: [0, 0, 0, 0],
        rim: [1, 1, 1],
        ink: [0, 0, 0],
        dark: 0,
        lightX: -1000,
        lightY: -1000,
        lightZ: 96,
        lightOn: 0,
        ripples,
        press: 0,
      },
      target,
    );
    const pixels = target.getContext('2d');
    const left = Array.from(pixels.getImageData(2, 50, 1, 1).data);
    const right = Array.from(pixels.getImageData(97, 50, 1, 1).data);
    renderer.dispose();
    return { samples, ior: GLASS_IOR_RGB, programs, left, right };
  });
  for (const program of result.programs) check(`${program} compiles and links`, true);
  for (const { x, values } of result.samples) {
    check(`finite rays at x=${x}`, values.every(Number.isFinite));
    for (let c = 0; c < 3; c++) {
      // Analytic meridional ray: Snell angle and exact sphere chord, independent
      // of the vector GLSL implementation under test.
      const incidence = Math.asin(x);
      const transmitted = Math.asin(x / result.ior[c]);
      const bend = incidence - transmitted;
      const slab = -Math.tan(bend) * 18;
      const exitX = x - 2 * Math.cos(transmitted) * Math.sin(bend);
      const exitZ = Math.cos(incidence) - 2 * Math.cos(transmitted) * Math.cos(bend);
      const ball = exitX - Math.tan(2 * bend) * (exitZ + 3);
      check(`slab Snell law x=${x}, channel ${c}`, Math.abs(values[c] - slab) < 0.0001);
      check(`two-interface sphere x=${x}, channel ${c}`, Math.abs(values[c + 3] - ball) < 0.0002);
      check(`no artificial TIR ring x=${x}, channel ${c}`, values[c + 6] === 1);
    }
    if (x !== 0) {
      check(`blue slab bends more than red x=${x}`, Math.abs(values[2]) > Math.abs(values[0]));
      check(`blue ball bends more than red x=${x}`, Math.abs(values[5]) > Math.abs(values[3]));
      check(`ball inverts background x=${x}`, x * values[4] < 0);
    } else
      check(
        'no chromatic offset on axis',
        values.slice(0, 6).every((v) => Math.abs(v) < 1e-6),
      );
  }
  check(
    `left slab rim has physical channel order (${result.left})`,
    result.left[0] <= result.left[1] &&
      result.left[1] <= result.left[2] &&
      result.left[2] > result.left[0],
  );
  check(
    `right slab rim has physical channel order (${result.right})`,
    result.right[0] >= result.right[1] &&
      result.right[1] >= result.right[2] &&
      result.right[0] > result.right[2],
  );
  console.log(`${checks} wavelength/refraction checks passed on ${name}`);
} finally {
  await browser.close();
}
