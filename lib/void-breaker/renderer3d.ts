/**
 * renderer3d.ts — three.js (WebGL) renderer for Void Breaker.
 *
 * Renders the exact same top-down simulation as the 2D renderer, but in 3D:
 * a steep top-down perspective camera follows the player, entities are lit
 * emissive meshes, and an UnrealBloomPass gives everything its neon glow.
 *
 * The simulation (game.ts) is rendering-agnostic — it only tracks 2D positions
 * in a 1600x1000 arena. We map game (x, y) → world (x, 0, y), with +Y as up.
 *
 * Matches the imperative renderer interface the component uses:
 *   constructor(canvas), getAimPoint(cx, cy, game), draw(game, dt), dispose().
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import type { VoidBreakerEngine } from './game';
import { ENEMY_SPRITES } from './sprites';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, ARENA_W, ARENA_H, ARENA_HW, ARENA_HH,
  MAX_ENEMIES, MAX_PROJECTILES, MAX_SHARDS_POOL, MAX_PARTICLES, MAX_HEART_PICKUPS,
} from './constants';

// ── Camera framing ───────────────────────────────────────────────────────────
const FOV = 45;
const CAM_HEIGHT = 560; // how high above the player the camera sits (zoom)
const CAM_BACK = 150;   // how far "south" the camera sits (slight tilt for depth)

// Entity heights above the ground plane.
const PROJ_Y = 14;
const SHARD_Y = 20;
const SHOCKWAVE_POOL = 24;

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** A renderer interface both the 2D and 3D renderers satisfy. */
export interface VBRenderer {
  getAimPoint(canvasX: number, canvasY: number, game: VoidBreakerEngine): { x: number; y: number };
  draw(game: VoidBreakerEngine, dt: number): void;
  dispose(): void;
  /** Accessibility: dampen shake, disable CA/grain, soften flashes. */
  setReducedFx?(on: boolean): void;
}

export class VoidBreakerRenderer3D implements VBRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private rgbShift!: ShaderPass;
  private filmPass!: FilmPass;
  /** Accessibility: when true, dampen shake + flashes, disable CA/grain. */
  private reducedFx = false;
  /** Chromatic-aberration impact pulse (decays each frame). */
  private caPulse = 0;
  private lastDetonations = 0;
  // Smoothed camera state (aim lookahead + zoom punch).
  private focusX = ARENA_HW;
  private focusZ = ARENA_HH;
  private camH = CAM_HEIGHT;
  private camPunch = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private time = 0;
  /** Tracks the active map so we only re-tint the palette on zone change. */
  private lastMapId = -1;

  // Scene objects
  private player!: THREE.Group;
  private boss!: THREE.Group;
  private bossCore!: THREE.Mesh;
  private enemyMesh!: THREE.InstancedMesh;
  /** Distinct meshes for the sprite-less enemy types. */
  private typeMeshes!: Record<'sniper' | 'shielded' | 'healer', THREE.InstancedMesh>;
  /** Old enemy sprite art, laid flat on the ground for types that have it. */
  private readonly enemyTextures = new Map<string, THREE.Texture>();
  private spritePool: THREE.Mesh[] = [];
  /** Soft contact shadows grounding the player + enemies on the floor. */
  private shadowPool: THREE.Mesh[] = [];
  /** Sniper charge-up aim beams (ground telegraphs). */
  private telegraphPool: THREE.Mesh[] = [];
  private projMesh!: THREE.InstancedMesh;
  private shardMesh!: THREE.InstancedMesh;
  private obstacleMesh!: THREE.InstancedMesh;
  private heartMesh!: THREE.InstancedMesh;
  private particles!: THREE.Points;
  private shockwaves: THREE.Mesh[] = [];
  /** Danger discs telegraphing where bomber bombs will explode. */
  private bombRings: THREE.Mesh[] = [];
  private floor!: THREE.Mesh;
  private grid!: THREE.LineSegments;
  private border!: THREE.LineSegments;
  private rift!: THREE.Group;
  private keyLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  /** Dynamic lights: a big orange flash on detonate + a cyan muzzle flash. */
  private flashLight!: THREE.PointLight;
  private muzzleLight!: THREE.PointLight;
  private flashIntensity = 0;
  private muzzleFlash = 0;
  private lastFireTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
    this.renderer.setClearColor(0x04040c, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05050f, 600, 1600);

    this.camera = new THREE.PerspectiveCamera(FOV, CANVAS_WIDTH / CANVAS_HEIGHT, 1, 6000);
    this.camera.position.set(ARENA_HW, CAM_HEIGHT, ARENA_HH + CAM_BACK);
    this.camera.lookAt(ARENA_HW, 0, ARENA_HH);

    this.setupLights();
    this.setupEnvironment();
    this.setupEntities();
    this.setupComposer();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private setupLights(): void {
    this.ambient = new THREE.AmbientLight(0x335577, 0.6);
    this.scene.add(this.ambient);
    this.keyLight = new THREE.DirectionalLight(0x88bbff, 0.7);
    this.keyLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.keyLight);
    // A cool rim from below the horizon for neon ambience.
    const rim = new THREE.DirectionalLight(0xff3370, 0.25);
    rim.position.set(-0.3, 0.2, -0.6);
    this.scene.add(rim);

    // Dynamic point lights (driven each frame by combat events).
    this.flashLight = new THREE.PointLight(0xff8a4a, 0, 900, 2);
    this.flashLight.position.set(ARENA_HW, 70, ARENA_HH);
    this.scene.add(this.flashLight);
    this.muzzleLight = new THREE.PointLight(0x66f5ff, 0, 220, 2);
    this.muzzleLight.position.set(ARENA_HW, 24, ARENA_HH);
    this.scene.add(this.muzzleLight);
  }

  private setupEnvironment(): void {
    // Floor plane (XZ), centered on the arena.
    const floorGeo = new THREE.PlaneGeometry(ARENA_W, ARENA_H);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a16, roughness: 0.55, metalness: 0.5,
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.position.set(ARENA_HW, 0, ARENA_HH);
    this.scene.add(this.floor);

    // Neon grid as line segments on the floor.
    this.grid = this.buildGrid(0x1a2a44);
    this.scene.add(this.grid);

    // Glowing arena border frame.
    this.border = this.buildBorder(0x00f5ff);
    this.scene.add(this.border);

    // Central rift portal.
    this.rift = this.buildRift();
    this.rift.position.set(ARENA_HW, 4, ARENA_HH);
    this.scene.add(this.rift);
  }

  private buildGrid(color: number): THREE.LineSegments {
    const pts: number[] = [];
    for (let x = 0; x <= ARENA_W; x += 80) { pts.push(x, 0.5, 0, x, 0.5, ARENA_H); }
    for (let z = 0; z <= ARENA_H; z += 80) { pts.push(0, 0.5, z, ARENA_W, 0.5, z); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    return new THREE.LineSegments(geo, mat);
  }

  private buildBorder(color: number): THREE.LineSegments {
    const h = 60;
    const c = [
      [0, 0], [ARENA_W, 0], [ARENA_W, ARENA_H], [0, ARENA_H],
    ];
    const pts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = c[i];
      const [x2, z2] = c[(i + 1) % 4];
      // bottom edge + top edge + vertical posts at corners
      pts.push(x1, 1, z1, x2, 1, z2);
      pts.push(x1, h, z1, x2, h, z2);
      pts.push(x1, 1, z1, x1, h, z1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    return new THREE.LineSegments(geo, mat);
  }

  private buildRift(): THREE.Group {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xbe82ff, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(28 - i * 7, 1.5, 8, 48), ringMat);
      torus.rotation.x = Math.PI / 2;
      g.add(torus);
    }
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xe1e8ff }),
    );
    g.add(core);
    return g;
  }

  /** Soft radial shadow texture (black, alpha fades to the edge). */
  private buildShadowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** Procedural neon-window texture used for building map + emissiveMap. */
  private buildWindowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#08080f';
    x.fillRect(0, 0, 64, 64);
    const cols = ['#00f5ff', '#ff00cc', '#ffaa33', '#66ffcc'];
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        if (Math.random() > 0.5) {
          x.fillStyle = cols[Math.floor(Math.random() * cols.length)];
          x.globalAlpha = 0.55 + Math.random() * 0.45;
          x.fillRect(gx * 8 + 2, gy * 8 + 2, 4, 5);
        }
      }
    }
    x.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Re-tint floor/grid/border/fog/ambient to the current zone's palette. */
  private applyMapPalette(cfg: VoidBreakerEngine['currentMapConfig']): void {
    const amb = new THREE.Color(cfg.ambientGlow);
    (this.floor.material as THREE.MeshStandardMaterial).color.set(cfg.floorColor);
    (this.grid.material as THREE.LineBasicMaterial).color.set(cfg.gridColor);
    (this.border.material as THREE.LineBasicMaterial).color.set(cfg.borderColor);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(amb).multiplyScalar(0.12);
    this.renderer.setClearColor(amb.clone().multiplyScalar(0.05), 1);
    this.ambient.color.copy(amb).lerp(new THREE.Color(0x6688aa), 0.4);
  }

  private setupEntities(): void {
    // Player — a stylized craft: body + a forward spike to show facing.
    this.player = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffd24a, emissive: 0xffaa22, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(11, 0), bodyMat);
    body.position.y = 12;
    this.player.add(body);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88ddff, emissiveIntensity: 1.6 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 12), noseMat);
    nose.rotation.z = -Math.PI / 2; // point along +X (aim 0)
    nose.position.set(14, 12, 0);
    this.player.add(nose);
    this.scene.add(this.player);

    // Boss — a dramatic floating construct: faceted core + two orbiting rings.
    this.boss = new THREE.Group();
    this.bossCore = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x331016, emissive: 0xff2244, emissiveIntensity: 2, roughness: 0.3, metalness: 0.6 }),
    );
    this.boss.add(this.bossCore);
    const bossRingMat = new THREE.MeshBasicMaterial({ color: 0xff5577, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * 0.4, 0.06, 8, 40), bossRingMat);
      ring.rotation.x = Math.PI / 2 + i * 0.5;
      ring.userData.spin = 0.6 + i * 0.5;
      this.boss.add(ring);
    }
    this.boss.visible = false;
    this.scene.add(this.boss);

    // Enemies — lit octahedra that also glow with their per-instance color.
    // (InstancedMesh can't set per-instance emissive directly, so we inject the
    // instance color into emissive radiance via onBeforeCompile.)
    const enemyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x000000, roughness: 0.35, metalness: 0.4,
    });
    enemyMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.9;',
      );
    };
    this.enemyMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), enemyMat, MAX_ENEMIES);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.frustumCulled = false;
    this.scene.add(this.enemyMesh);

    // Distinct meshes for the sprite-less newcomers: sniper dart, shielded cube,
    // healer orb. Each is a single-colored emissive instanced mesh.
    const mkType = (geo: THREE.BufferGeometry, color: number, emissive: number): THREE.InstancedMesh => {
      const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.45 });
      const im = new THREE.InstancedMesh(geo, mat, 48);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };
    const dart = new THREE.ConeGeometry(0.8, 2.6, 6);
    dart.rotateZ(-Math.PI / 2); // apex points +X (toward aim after Y-rotation)
    this.typeMeshes = {
      sniper: mkType(dart, 0x551015, 0xff5544),
      shielded: mkType(new THREE.BoxGeometry(1.5, 1.5, 1.5), 0x101d3a, 0x5577ff),
      healer: mkType(new THREE.IcosahedronGeometry(1, 0), 0x0d3325, 0x33ff99),
    };

    // Old enemy sprite art → textures (additive blending makes the black bg
    // vanish and the art glow), plus a pool of flat ground planes to show them.
    const texLoader = new THREE.TextureLoader();
    for (const [type, cfg] of Object.entries(ENEMY_SPRITES)) {
      const tex = texLoader.load(cfg.url);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.enemyTextures.set(type, tex);
    }
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    planeGeo.rotateX(-Math.PI / 2); // lie flat on the ground, facing up
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const plane = new THREE.Mesh(planeGeo, mat);
      plane.visible = false;
      plane.frustumCulled = false;
      this.scene.add(plane);
      this.spritePool.push(plane);
    }

    // Contact shadows — one soft dark disc per entity (player + enemies).
    const shadowTex = this.buildShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false,
    });
    for (let i = 0; i < MAX_ENEMIES + 1; i++) {
      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.position.y = 1.5;
      sh.visible = false;
      sh.frustumCulled = false;
      this.scene.add(sh);
      this.shadowPool.push(sh);
    }

    // Sniper telegraph beams — thin ground strips that brighten as the shot locks.
    const beamGeo = new THREE.PlaneGeometry(1, 1);
    beamGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4030, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeo, mat);
      beam.position.y = 2.5;
      beam.visible = false;
      beam.frustumCulled = false;
      this.scene.add(beam);
      this.telegraphPool.push(beam);
    }

    // Projectiles — pure bright spheres (unlit; bloom carries the glow).
    const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 8), projMat, MAX_PROJECTILES);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.scene.add(this.projMesh);

    // Shards — small gold crystals.
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffcc33, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.8,
    });
    this.shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(4, 0), shardMat, MAX_SHARDS_POOL);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.frustumCulled = false;
    this.scene.add(this.shardMesh);

    // Obstacles — extruded neon-trimmed boxes (buildings/barriers).
    const winTex = this.buildWindowTexture();
    const obsMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d18, map: winTex, emissive: 0xffffff, emissiveMap: winTex,
      emissiveIntensity: 1.1, roughness: 0.7, metalness: 0.3,
    });
    this.obstacleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), obsMat, 96);
    this.obstacleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.obstacleMesh.frustumCulled = false;
    this.scene.add(this.obstacleMesh);

    // Heart pickups — glowing pink octahedra.
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xff3bd0 });
    this.heartMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(8, 0), heartMat, MAX_HEART_PICKUPS);
    this.heartMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heartMesh.frustumCulled = false;
    this.scene.add(this.heartMesh);

    // Particles — additive points cloud, colored per-particle, fading via brightness.
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    const pMat = new THREE.PointsMaterial({
      size: 10, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // Shockwave rings — flat additive rings scaled to their radius.
    const swGeo = new THREE.RingGeometry(0.86, 1.0, 48);
    swGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SHOCKWAVE_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const m = new THREE.Mesh(swGeo, mat);
      m.position.y = 3;
      m.visible = false;
      this.scene.add(m);
      this.shockwaves.push(m);
    }

    // Bomb danger discs (flat, additive) — telegraph the blast zone.
    const discGeo = new THREE.CircleGeometry(1, 32);
    discGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff8a3a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, mat);
      disc.position.y = 2;
      disc.visible = false;
      disc.frustumCulled = false;
      this.scene.add(disc);
      this.bombRings.push(disc);
    }
  }

  private setupComposer(): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(CANVAS_WIDTH, CANVAS_HEIGHT),
      0.9,  // strength
      0.6,  // radius
      0.2,  // threshold
    );
    this.composer.addPass(this.bloom);

    // Cinematic stack: chromatic aberration → vignette → film grain.
    this.rgbShift = new ShaderPass(RGBShiftShader);
    this.rgbShift.uniforms.amount.value = 0.0012;
    this.composer.addPass(this.rgbShift);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 1.0;
    vignette.uniforms.darkness.value = 1.05;
    this.composer.addPass(vignette);

    this.filmPass = new FilmPass(0.22);
    this.composer.addPass(this.filmPass);
  }

  setReducedFx(on: boolean): void {
    this.reducedFx = on;
    this.rgbShift.enabled = !on;   // no chromatic aberration
    this.filmPass.enabled = !on;   // no film grain
  }

  // ── Aim ──────────────────────────────────────────────────────────────────────

  getAimPoint(canvasX: number, canvasY: number, _game: VoidBreakerEngine): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    const ndcX = (canvasX / CANVAS_WIDTH) * 2 - 1;
    const ndcY = -((canvasY / CANVAS_HEIGHT) * 2 - 1);
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    if (!ok) return { x: ARENA_HW, y: ARENA_HH };
    return {
      x: Math.max(0, Math.min(ARENA_W, hit.x)),
      y: Math.max(0, Math.min(ARENA_H, hit.z)),
    };
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  draw(game: VoidBreakerEngine, dt: number): void {
    this.time += dt;
    const p = game.player;
    if (!p) { this.composer.render(); return; }

    // Re-tint the world when the player advances to a new zone.
    if (game.currentMapConfig.id !== this.lastMapId) {
      this.lastMapId = game.currentMapConfig.id;
      this.applyMapPalette(game.currentMapConfig);
    }

    // Impact events (detect once per frame; drive camera punch + CA pulse).
    if (game.detonations !== this.lastDetonations) {
      this.lastDetonations = game.detonations;
      this.caPulse = 1;
      this.camPunch = 70;
      this.flashIntensity = 11;
    }
    this.caPulse = Math.max(0, this.caPulse - dt * 3);
    this.camPunch = Math.max(0, this.camPunch - dt * 120);

    // Detonate flash light — a bright orange burst that decays over ~0.4s.
    this.flashIntensity = Math.max(0, this.flashIntensity - dt * 28);
    this.flashLight.intensity = this.flashIntensity * (this.reducedFx ? 0.35 : 1);
    this.flashLight.position.set(p.x, 70, p.y);

    // Muzzle flash — pulse when the fire timer resets (a shot was fired).
    if (p.fireTimer > this.lastFireTimer + 0.001) this.muzzleFlash = 2.2;
    this.lastFireTimer = p.fireTimer;
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 22);
    this.muzzleLight.intensity = this.muzzleFlash * (this.reducedFx ? 0.4 : 1);
    this.muzzleLight.position.set(p.x + Math.cos(p.aimAngle) * 16, 22, p.y + Math.sin(p.aimAngle) * 16);

    const bossActive = game.enemies.some(e => e.active && e.isBoss);

    // Smoothed follow with aim lookahead — you see ahead of where you aim.
    const k = 1 - Math.exp(-6 * dt);
    const aimLA = 80;
    this.focusX += (p.x + Math.cos(p.aimAngle) * aimLA - this.focusX) * k;
    this.focusZ += (p.y + Math.sin(p.aimAngle) * aimLA - this.focusZ) * k;
    // Pull back during boss fights; punch in on detonate.
    const targetH = CAM_HEIGHT + (bossActive ? 120 : 0) - this.camPunch * (this.reducedFx ? 0.3 : 1);
    this.camH += (targetH - this.camH) * k;

    const ss = this.reducedFx ? 0.3 : 1.5;
    const sx = game.shakeX * ss, sz = game.shakeY * ss;
    this.camera.position.set(this.focusX + sx, this.camH, this.focusZ + CAM_BACK + sz);
    this.camera.lookAt(this.focusX + sx, 0, this.focusZ + sz);

    // Player transform.
    this.player.position.set(p.x, 0, p.y);
    this.player.rotation.y = -p.aimAngle; // game angle is in XZ; +Y rotation maps aim
    const pmat = (this.player.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    pmat.emissiveIntensity = p.focusActive ? 2.6 : p.dashActive ? 3.2 : 1.4;

    this.syncShadows(game);
    this.syncTelegraphs(game);
    this.syncEnemies(game);
    this.syncBoss(game);
    this.syncProjectiles(game);
    this.syncShards(game);
    this.syncObstacles(game);
    this.syncHearts(game);
    this.syncParticles(game);
    this.syncShockwaves(game);
    this.syncBombs(game);

    // Rift animation.
    this.rift.rotation.y = this.time * 0.6;
    const riftPulse = 1 + Math.sin(this.time * 2.5) * 0.15;
    this.rift.scale.setScalar(riftPulse);

    // Bloom reacts to the moment: bosses flare, Focus swells into a dreamy glow.
    this.bloom.strength = (bossActive ? 1.15 : 0.9) + (p.focusActive ? 0.55 : 0);

    // Chromatic aberration: a base shimmer that punches on detonate / hits / boss.
    let ca = 0.0012 + (bossActive ? 0.0008 : 0) + this.caPulse * 0.005;
    if (game.elapsedMs < p.hitFlashUntil + 130) ca += 0.0035;
    this.rgbShift.uniforms.amount.value = ca;

    this.composer.render();
  }

  private syncEnemies(game: VoidBreakerEngine): void {
    const octa = this.enemyMesh;
    let spriteIdx = 0;
    const tIdx = { sniper: 0, shielded: 0, healer: 0 };
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const e = game.enemies[i];
      // Bosses render via the dedicated boss group, not the instanced octahedra.
      const active = !!e && e.active && !e.isBoss;
      let octaUsed = false;

      if (active) {
        const tex = this.enemyTextures.get(e.type);
        const dedicated = (e.type === 'sniper' || e.type === 'shielded' || e.type === 'healer')
          ? this.typeMeshes[e.type] : undefined;

        if (tex) {
          // Old model: flat ground sprite (additive glow).
          const plane = this.spritePool[spriteIdx++];
          const mat = plane.material as THREE.MeshBasicMaterial;
          if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
          const sz = e.radius * 3.4 * (e.isElite ? 1.3 : 1);
          plane.visible = true;
          plane.position.set(e.x, 7, e.y);
          plane.scale.set(sz, sz, sz);
          if (game.elapsedMs < e.hitFlashUntil) mat.color.setRGB(2.2, 2.2, 2.2);
          else if (e.isElite) mat.color.setRGB(1.4, 0.7, 1.1);
          else mat.color.setRGB(1, 1, 1);
        } else if (dedicated) {
          // Distinct shape: sniper dart aims at the player; others tumble.
          const r = e.radius * (e.isElite ? 1.3 : 1.1);
          tmpObj.position.set(e.x, r + 2, e.y);
          if (e.type === 'sniper') {
            tmpObj.rotation.set(0, -Math.atan2(game.player.y - e.y, game.player.x - e.x), 0);
          } else {
            tmpObj.rotation.set(this.time * 0.8 + i, this.time * 1.0 + i, 0);
          }
          tmpObj.scale.setScalar(r);
          tmpObj.updateMatrix();
          dedicated.setMatrixAt(tIdx[e.type as 'sniper' | 'shielded' | 'healer']++, tmpObj.matrix);
        } else {
          // Fallback crystal for any other type.
          const r = e.radius * 1.15;
          tmpObj.position.set(e.x, r, e.y);
          tmpObj.rotation.set(this.time * 0.8 + i, this.time * 1.1 + i, 0);
          tmpObj.scale.setScalar(r);
          const hot = game.elapsedMs < e.hitFlashUntil;
          tmpColor.set(hot ? '#ffffff' : (e.color || '#cc4466'));
          octa.setColorAt(i, tmpColor);
          tmpObj.updateMatrix();
          octa.setMatrixAt(i, tmpObj.matrix);
          octaUsed = true;
        }
      }

      if (!octaUsed) {
        tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0);
        tmpObj.updateMatrix();
        octa.setMatrixAt(i, tmpObj.matrix);
      }
    }
    octa.instanceMatrix.needsUpdate = true;
    if (octa.instanceColor) octa.instanceColor.needsUpdate = true;

    // Hide unused sprite planes + dedicated-mesh instances.
    for (let s = spriteIdx; s < this.spritePool.length; s++) this.spritePool[s].visible = false;
    for (const key of ['sniper', 'shielded', 'healer'] as const) {
      const mesh = this.typeMeshes[key];
      for (let s = tIdx[key]; s < mesh.count; s++) {
        tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0);
        tmpObj.updateMatrix();
        mesh.setMatrixAt(s, tmpObj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private syncProjectiles(game: VoidBreakerEngine): void {
    const m = this.projMesh;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const pr = game.projectiles[i];
      if (!pr || !pr.active || pr.fuse > 0) { tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0); }
      else {
        // Stretch into a tracer along the travel direction.
        const ang = Math.atan2(pr.vy, pr.vx);
        tmpObj.position.set(pr.x, PROJ_Y, pr.y);
        tmpObj.rotation.set(0, -ang, 0);
        tmpObj.scale.set(pr.radius * 4.5, pr.radius * 1.3, pr.radius * 1.3);
        tmpColor.set(pr.isPlayer ? '#66f5ff' : '#ff3bd0');
        m.setColorAt(i, tmpColor);
      }
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private syncShards(game: VoidBreakerEngine): void {
    const m = this.shardMesh;
    for (let i = 0; i < MAX_SHARDS_POOL; i++) {
      const s = game.shards[i];
      if (!s || !s.active) { tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0); }
      else {
        tmpObj.position.set(s.x, SHARD_Y, s.y);
        tmpObj.rotation.set(this.time * 2 + i, this.time * 2.5 + i, 0);
        tmpObj.scale.setScalar(1);
      }
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  private syncTelegraphs(game: VoidBreakerEngine): void {
    let idx = 0;
    const LEN = 700, WIDTH = 7;
    for (const e of game.enemies) {
      if (idx >= this.telegraphPool.length) break;
      if (!e.active || e.type !== 'sniper' || !e.bossSpecialActive || e.telegraphTimer <= 0) continue;
      const beam = this.telegraphPool[idx++];
      const ang = e.bossSpecialAngle;            // locked aim (game angle)
      const dx = Math.cos(ang), dz = Math.sin(ang);
      beam.visible = true;
      beam.position.set(e.x + dx * LEN / 2, 2.5, e.y + dz * LEN / 2);
      beam.rotation.y = -ang;
      beam.scale.set(LEN, 1, WIDTH);
      const charge = 1 - Math.max(0, e.telegraphTimer) / 0.85; // 0 → 1
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.15 + charge * 0.5;
    }
    for (let s = idx; s < this.telegraphPool.length; s++) this.telegraphPool[s].visible = false;
  }

  private syncShadows(game: VoidBreakerEngine): void {
    let idx = 0;
    // Player shadow.
    const p = game.player;
    const ps = this.shadowPool[idx++];
    ps.visible = true;
    ps.position.set(p.x, 1.5, p.y);
    ps.scale.set(p.radius * 3, 1, p.radius * 3);
    // Enemy shadows (bosses included — bigger).
    for (let i = 0; i < MAX_ENEMIES && idx < this.shadowPool.length; i++) {
      const e = game.enemies[i];
      if (!e || !e.active) continue;
      const sh = this.shadowPool[idx++];
      sh.visible = true;
      const s = e.radius * (e.isBoss ? 3.6 : 3);
      sh.position.set(e.x, 1.5, e.y);
      sh.scale.set(s, 1, s);
    }
    for (let s = idx; s < this.shadowPool.length; s++) this.shadowPool[s].visible = false;
  }

  private syncBoss(game: VoidBreakerEngine): void {
    const b = game.enemies.find(e => e.active && e.isBoss);
    if (!b) { this.boss.visible = false; return; }
    this.boss.visible = true;
    const r = b.radius;
    const float = r + 18 + Math.sin(this.time * 1.5) * 4;
    this.boss.position.set(b.x, float, b.y);
    // Void form: fade out while intangible.
    const phased = b.bossSpecialActive;
    const coreMat = this.bossCore.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = phased ? 0.4 : (game.elapsedMs < b.hitFlashUntil ? 4 : 2);
    this.bossCore.scale.setScalar(r);
    this.bossCore.rotation.set(this.time * 0.5, this.time * 0.7, 0);
    // Orbiting rings.
    for (let i = 1; i < this.boss.children.length; i++) {
      const ring = this.boss.children[i] as THREE.Mesh;
      ring.scale.setScalar(r);
      ring.rotation.z = this.time * (ring.userData.spin as number);
      (ring.material as THREE.MeshBasicMaterial).opacity = phased ? 0.15 : 0.7;
    }
  }

  private syncHearts(game: VoidBreakerEngine): void {
    const m = this.heartMesh;
    for (let i = 0; i < MAX_HEART_PICKUPS; i++) {
      const h = game.heartPickups[i];
      if (!h || !h.active) { tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0); }
      else {
        const bob = 16 + Math.sin(this.time * 4 + i) * 3;
        tmpObj.position.set(h.x, bob, h.y);
        tmpObj.rotation.set(0, this.time * 2, Math.PI / 4);
        tmpObj.scale.setScalar(1);
      }
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  private syncParticles(game: VoidBreakerEngine): void {
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.particles.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const pt = game.particles[i];
      if (!pt || !pt.active) { pos.setXYZ(i, 0, -9999, 0); continue; }
      pos.setXYZ(i, pt.x, 13, pt.y);
      const a = Math.max(0, pt.life / pt.maxLife);
      tmpColor.set(pt.color || '#ffffff');
      col.setXYZ(i, tmpColor.r * a, tmpColor.g * a, tmpColor.b * a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private syncBombs(game: VoidBreakerEngine): void {
    let idx = 0;
    for (const pr of game.projectiles) {
      if (!pr.active || pr.fuse <= 0) continue;
      if (idx >= this.bombRings.length) break;
      const disc = this.bombRings[idx++];
      const fill = 1 - Math.max(0, pr.fuse) / 1.3;
      disc.visible = true;
      disc.position.set(pr.x, 2, pr.y);
      disc.scale.set(pr.blastRadius, 1, pr.blastRadius);
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.12 + fill * 0.3;
    }
    for (let s = idx; s < this.bombRings.length; s++) this.bombRings[s].visible = false;
  }

  private syncShockwaves(game: VoidBreakerEngine): void {
    for (let i = 0; i < this.shockwaves.length; i++) {
      const m = this.shockwaves[i];
      const sw = game.shockwaves[i];
      if (!sw) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(sw.x, 3, sw.y);
      m.scale.set(Math.max(0.001, sw.radius), 1, Math.max(0.001, sw.radius));
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(sw.color || '#ffffff');
      mat.opacity = Math.max(0, sw.life / sw.maxLife) * 0.85;
    }
  }

  private syncObstacles(game: VoidBreakerEngine): void {
    const m = this.obstacleMesh;
    const max = m.count;
    for (let i = 0; i < max; i++) {
      const o = game.obstacles[i];
      const drawable = o && o.active && o.type !== 'hazard' && o.type !== 'billboard' && o.type !== 'terminal';
      if (!drawable) { tmpObj.scale.set(0, 0, 0); tmpObj.position.set(0, -9999, 0); }
      else {
        const h = Math.max(20, o.extrudeHeight ?? 40);
        tmpObj.position.set(o.x + o.w / 2, h / 2, o.y + o.h / 2);
        tmpObj.rotation.set(0, 0, 0);
        tmpObj.scale.set(o.w, h, o.h);
      }
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
      else if (mat) mat.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
