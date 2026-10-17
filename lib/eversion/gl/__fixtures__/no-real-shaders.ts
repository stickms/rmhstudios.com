/**
 * Pins the renderer test to the STUB shaders (T24). The e2e bundle aliases
 * `./shaders` to this file, so the "forced flip" assertions keep meaning
 * "the stub's faked eversion" after T23 replaces `shaders.ts`. The message is
 * the one `notImplemented('getShaderSet', 'T23')` throws, which is what the
 * renderer recognises as "use the stub".
 */
export function getShaderSet(): never {
  throw new Error('eversion: getShaderSet not implemented (T23)');
}
