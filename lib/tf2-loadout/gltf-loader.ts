import { TextureLoader, type LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** TF2 GLBs embed their textures, which GLTFLoader exposes as blob URLs. */
export class Tf2GLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager);
    this.register((parser) => {
      // ImageBitmapLoader fetches blobs under connect-src. Use HTML images
      // (img-src) so textures also work before the host's Apache CSP is updated.
      // Keep this on a dedicated loader: other viewers retain their defaults.
      parser.textureLoader = new TextureLoader(parser.options.manager)
        .setCrossOrigin(parser.options.crossOrigin)
        .setRequestHeader(parser.options.requestHeader);
      return { name: 'RMH_tf2_html_images' };
    });
  }
}
