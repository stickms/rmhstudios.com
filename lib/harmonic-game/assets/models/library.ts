/**
 * The `ModelLibrary` for Harmonic (plan H2.4, architecture §4): the entity renderer's model cache
 * built with an in-memory index and a stub loader, so `ModelAsset` sees a GLTF-shaped object
 * (`scene`, `animations`, `parser.getDependencies`) while the scene is a procedural Object3D.
 * Nothing is fetched. Browser/render side only.
 */
import type { Material } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelLibrary, type ModelIndexEntry } from '../../../tf2-game/render/entities/model-asset';
import { HARMONIC_MODELS } from './catalog';
import { MODEL_SPECS } from './info';

const PREFIX = 'mdl/';

/** `models/harmonic/x.mdl` → index entry; `glb` is the model's short name, read back by the loader. */
function harmonicIndex(): Record<string, ModelIndexEntry> {
  const out: Record<string, ModelIndexEntry> = {};
  for (const s of MODEL_SPECS)
    out[s.path] = {
      glb: s.name,
      kind: s.kind,
      skinned: s.kind === 'character' || s.kind === 'viewmodel',
    };
  return out;
}

/** Builds the GLTF-shaped result for one model. */
export function loadProceduralModel(name: string): GLTF {
  const model = Object.values(HARMONIC_MODELS).find((m) => m.name === name);
  if (!model) throw new Error(`unknown Harmonic model "${name}"`);
  const scene = model.build();
  const materials: Material[] = [];
  scene.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    for (const x of Array.isArray(m) ? m : m ? [m] : [])
      if (!materials.includes(x)) materials.push(x);
  });
  const gltf = {
    scene,
    scenes: [scene],
    animations: scene.animations,
    cameras: [],
    asset: { generator: 'harmonic-procedural' },
    userData: {},
    parser: {
      json: { meshes: [] },
      associations: new Map(),
      getDependencies: (type: string): Promise<unknown[]> =>
        Promise.resolve(type === 'material' ? materials : []),
    },
  };
  return gltf as unknown as GLTF;
}

export function createHarmonicModelLibrary(): ModelLibrary {
  return new ModelLibrary({
    url: (p) => p,
    index: harmonicIndex(),
    loader: {
      loadAsync: (url: string) => {
        const name = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url;
        try {
          return Promise.resolve(loadProceduralModel(name));
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    },
  });
}
