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
import type { VoidBreakerEngine } from './game';
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
}

export class VoidBreakerRenderer3D implements VBRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;

  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private time = 0;

  // Scene objects
  private player!: THREE.Group;
  private boss!: THREE.Group;
  private bossCore!: THREE.Mesh;
  private enemyMesh!: THREE.InstancedMesh;
  private projMesh!: THREE.InstancedMesh;
  private shardMesh!: THREE.InstancedMesh;
  private obstacleMesh!: THREE.InstancedMesh;
  private heartMesh!: THREE.InstancedMesh;
  private particles!: THREE.Points;
  private shockwaves: THREE.Mesh[] = [];
  private floor!: THREE.Mesh;
  private grid!: THREE.LineSegments;
  private border!: THREE.LineSegments;
  private rift!: THREE.Group;
  private keyLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;

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
    const obsMat = new THREE.MeshStandardMaterial({
      color: 0x12121e, emissive: 0x0a1a2a, emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.3,
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

    // Camera follows the player (+ shake jitter).
    const sx = game.shakeX * 1.5, sz = game.shakeY * 1.5;
    this.camera.position.set(p.x + sx, CAM_HEIGHT, p.y + CAM_BACK + sz);
    this.camera.lookAt(p.x + sx, 0, p.y + sz);

    // Player transform.
    this.player.position.set(p.x, 0, p.y);
    this.player.rotation.y = -p.aimAngle; // game angle is in XZ; +Y rotation maps aim
    const pmat = (this.player.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    pmat.emissiveIntensity = p.focusActive ? 2.6 : p.dashActive ? 3.2 : 1.4;

    this.syncEnemies(game);
    this.syncBoss(game);
    this.syncProjectiles(game);
    this.syncShards(game);
    this.syncObstacles(game);
    this.syncHearts(game);
    this.syncParticles(game);
    this.syncShockwaves(game);

    // Rift animation.
    this.rift.rotation.y = this.time * 0.6;
    const riftPulse = 1 + Math.sin(this.time * 2.5) * 0.15;
    this.rift.scale.setScalar(riftPulse);

    // Boss-aware bloom flare.
    const bossActive = game.enemies.some(e => e.active && e.isBoss);
    this.bloom.strength = bossActive ? 1.15 : 0.9;

    this.composer.render();
  }

  private syncEnemies(game: VoidBreakerEngine): void {
    const m = this.enemyMesh;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const e = game.enemies[i];
      // Bosses render via the dedicated boss group, not the instanced octahedra.
      if (!e || !e.active || e.isBoss) { tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0); }
      else {
        const r = e.radius * 1.15;
        tmpObj.position.set(e.x, r, e.y);
        tmpObj.rotation.set(this.time * 0.8 + i, this.time * 1.1 + i, 0);
        tmpObj.scale.setScalar(r);
        const hot = game.elapsedMs < e.hitFlashUntil;
        tmpColor.set(hot ? '#ffffff' : (e.color || '#cc4466'));
        m.setColorAt(i, tmpColor);
      }
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private syncProjectiles(game: VoidBreakerEngine): void {
    const m = this.projMesh;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const pr = game.projectiles[i];
      if (!pr || !pr.active) { tmpObj.scale.setScalar(0); tmpObj.position.set(0, -9999, 0); }
      else {
        tmpObj.position.set(pr.x, PROJ_Y, pr.y);
        tmpObj.rotation.set(0, 0, 0);
        tmpObj.scale.setScalar(pr.radius * 1.4);
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
