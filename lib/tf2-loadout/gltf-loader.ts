import { TextureLoader, type LoadingManager, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** What a glTF parser asks of its texture loader (`TextureLoader.load`). */
export interface GltfTextureLoader {
  load(url: string, onLoad: (texture: Texture) => void, onProgress?: unknown, onError?: (error: unknown) => void): unknown;
}

/**
 * Published GLBs name their textures by URL (`../tex/<sha>.webp`); a few embed them, which GLTFLoader
 * exposes as blob URLs. `textures` is one loader for every file this loader parses (a match shares
 * decoded textures between its models: lib/tf2-game/render/model-textures.ts); without it each parse
 * gets a `TextureLoader` of its own.
 */
export class Tf2GLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager, textures?: GltfTextureLoader) {
    super(manager);
    this.register((parser) => {
      // ImageBitmapLoader fetches blobs under connect-src. Use HTML images
      // (img-src) so textures also work before the host's Apache CSP is updated.
      // Keep this on a dedicated loader: other viewers retain their defaults.
      parser.textureLoader = (textures ??
        new TextureLoader(parser.options.manager)
          .setCrossOrigin(parser.options.crossOrigin)
          .setRequestHeader(parser.options.requestHeader)) as TextureLoader;
      return { name: 'RMH_tf2_html_images' };
    });
  }
}
