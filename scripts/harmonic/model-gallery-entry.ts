/**
 * Browser half of the model gallery (plan H2.4): bundled by `model-gallery.ts` and run in
 * Chromium. `window.__harmonicGallery.sheet(name)` renders a contact sheet for one catalog model
 * and returns it as a PNG data URL. Lit with a plain hemisphere + key light — this checks shapes,
 * proportions, colours and clips, not the game's own shader (that is the in-game screenshot).
 */
import {
  AnimationMixer,
  LoopOnce,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HARMONIC_MODELS } from '../../lib/harmonic-game/assets/models/catalog';

type View = 'front' | 'q' | 'side' | 'back' | 'eye';
interface Tile {
  clip?: string;
  t?: number;
  view: View;
  label: string;
}

const U = 0.01905;

function tilesFor(
  kind: string,
  clips: string[],
): { tiles: Tile[]; w: number; h: number; cols: number } {
  if (kind === 'character') {
    const t = (clip: string, at: number): Tile => ({
      clip,
      t: at,
      view: 'q',
      label: `${clip} ${at}`,
    });
    return {
      tiles: [
        t('idle', 0),
        t('walk', 0.25),
        t('walk', 0.5),
        t('run', 0.15),
        t('aim', 0),
        t('fire', 0.03),
        t('reload', 0.6),
        t('die', 0.5),
        t('die', 1.2),
        t('hurt', 0.09),
      ].filter((x) => clips.includes(x.clip!)),
      w: 260,
      h: 340,
      cols: 5,
    };
  }
  if (kind === 'viewmodel') {
    return {
      tiles: [
        { clip: 'draw', t: 0.12, view: 'eye', label: 'draw .12' },
        { clip: 'idle', t: 0, view: 'eye', label: 'idle' },
        { clip: 'fire', t: 0.05, view: 'eye', label: 'fire .05' },
        { clip: 'reload', t: 0.55, view: 'eye', label: 'reload .55' },
      ],
      w: 480,
      h: 270,
      cols: 2,
    };
  }
  return {
    tiles: [
      { view: 'q', label: 'q' },
      { view: 'side', label: 'side' },
      { view: 'back', label: 'back' },
    ],
    w: 320,
    h: 320,
    cols: 3,
  };
}

let renderer: WebGLRenderer | null = null;
const gl = document.createElement('canvas');

function frame(obj: Object3D, view: View, kind: string, aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(30, aspect, 0.01, 50);
  if (view === 'eye') {
    // The game's view-model camera: Source fov 54 on a 4:3 base, so a 41.2 degree vertical fov.
    cam.fov = (2 * Math.atan(Math.tan((54 * 0.5 * Math.PI) / 180) * 0.75) * 180) / Math.PI;
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, 1);
    cam.updateProjectionMatrix();
    return cam;
  }
  const box = new Box3().setFromObject(obj);
  const centre = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  let radius = size.length() * 0.5 * 1.05;
  if (kind === 'character') {
    centre.set(0, 36 * U, 0);
    radius = 0.5 * 80 * U;
  }
  const az = { front: 0, q: 0.7, side: Math.PI / 2, back: Math.PI, eye: 0 }[view];
  const dist = (radius / Math.tan((cam.fov * Math.PI) / 360)) * (aspect < 1 ? 1 / aspect : 1);
  cam.position.set(
    centre.x + Math.sin(az) * dist,
    centre.y + dist * 0.18,
    centre.z + Math.cos(az) * dist,
  );
  cam.lookAt(centre);
  return cam;
}

const clipLoops = (clips: readonly { name: string; looping: boolean }[], name: string): boolean =>
  clips.find((c) => c.name === name)?.looping ?? true;

function sheet(name: string, only?: { clip: string; t: number; view: View }): string {
  const model = Object.values(HARMONIC_MODELS).find((m) => m.name === name);
  if (!model) throw new Error(`no model ${name}`);
  const kind = model.spec.kind;
  const clips = model.spec.clips.map((c) => c.name);
  const layout = tilesFor(kind, clips);
  if (only) {
    layout.tiles = [
      {
        clip: only.clip || undefined,
        t: only.t,
        view: only.view,
        label: `${only.clip} ${only.t} ${only.view}`,
      },
    ];
    layout.w = 640;
    layout.h = kind === 'viewmodel' ? 360 : 640;
    layout.cols = 1;
  }
  const rows = Math.ceil(layout.tiles.length / layout.cols);
  const out = document.createElement('canvas');
  out.width = layout.cols * layout.w;
  out.height = rows * layout.h;
  const g = out.getContext('2d')!;
  g.fillStyle = '#10151a';
  g.fillRect(0, 0, out.width, out.height);
  renderer ??= new WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(layout.w, layout.h, false);
  renderer.outputColorSpace = SRGBColorSpace;
  layout.tiles.forEach((tile, i) => {
    const scene = new Scene();
    scene.background = new Color(tile.view === 'eye' ? '#2a323a' : '#1b2229');
    scene.add(new HemisphereLight(0xdfeaf5, 0x2a2f36, 1.7));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-2, 4, 3);
    scene.add(key);
    const rim = new DirectionalLight(0x9fc4e0, 0.9);
    rim.position.set(3, 2, -3);
    scene.add(rim);
    if (tile.view !== 'eye' && (kind === 'character' || kind === 'prop')) {
      const floor = new Mesh(
        new CylinderGeometry(0.9, 0.9, 0.01, 40),
        new MeshStandardMaterial({ color: 0x2c343c }),
      );
      floor.position.y = -0.006;
      scene.add(floor);
    }
    const built = model.build();
    const obj = clone(built);
    scene.add(obj);
    if (tile.clip) {
      const mixer = new AnimationMixer(obj);
      const clip = built.animations.find((c) => c.name === tile.clip)!;
      const action = mixer.clipAction(clip);
      if (!clipLoops(model.spec.clips, tile.clip)) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      mixer.setTime(tile.t ?? 0);
    }
    obj.updateMatrixWorld(true);
    const cam = frame(obj, tile.view, kind, layout.w / layout.h);
    renderer!.render(scene, cam);
    g.drawImage(gl, (i % layout.cols) * layout.w, Math.floor(i / layout.cols) * layout.h);
    g.fillStyle = '#9fb4c4';
    g.font = '12px monospace';
    g.fillText(
      tile.label,
      (i % layout.cols) * layout.w + 8,
      Math.floor(i / layout.cols) * layout.h + 16,
    );
  });
  return out.toDataURL('image/png');
}

(window as unknown as { __harmonicGallery: unknown }).__harmonicGallery = {
  sheet,
  names: Object.values(HARMONIC_MODELS).map((m) => m.name),
};
