// lib/game/render3d/NoteField.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import type { Slice } from '@/lib/game/types';
import { noteColor, LANE_COLORS } from './palette';
import { scrollWorldX, laneWorldY, WORLD_LOOKAHEAD_S, type FieldOpts } from './fieldMapping';

export type FieldCtx = {
  isMobileV: boolean; speedMod: number; oneTrack: boolean;
  invisible: boolean; reducedFx: boolean;
};

const MAX_NOTES = 256; // instanced cap; far above on-screen note count
const MAX_ORBS = 64;
const MAX_TAILS = 64;

export class NoteField {
  private group = new THREE.Group();
  private cubes: THREE.InstancedMesh;       // STANDARD/MOVING/SPEED/SILENT/SWITCH
  private orbs: THREE.InstancedMesh;        // BOMB
  private tails: THREE.InstancedMesh;       // LONG tails
  private rails: THREE.Mesh[] = [];
  private railsOneTrack: boolean | null = null;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private targetedIds = new Set<string>();  // Fix 3: reuse per-frame targeted set

  constructor(scene: THREE.Scene) {
    const cubeGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const cubeMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.1 });
    this.cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, MAX_NOTES);
    this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOTES * 3), 3);
    this.applyEmissiveFromColor(cubeMat);

    const orbGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.6, roughness: 0.4 });
    this.orbs = new THREE.InstancedMesh(orbGeo, orbMat, MAX_ORBS);

    const tailGeo = new THREE.BoxGeometry(1, 0.18, 0.18); // scaled per-instance along X
    const tailMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
    this.tails = new THREE.InstancedMesh(tailGeo, tailMat, MAX_TAILS);
    this.tails.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TAILS * 3), 3);
    this.applyEmissiveFromColor(tailMat);

    this.group.add(this.cubes, this.orbs, this.tails);
    scene.add(this.group);
  }

  /** Make instanceColor drive emissive so each note glows in its own color. */
  private applyEmissiveFromColor(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor * emissiveIntensity;'
      );
    };
    mat.vertexColors = true;
  }

  update(engine: GameEngine, audioTime: number, ctx: FieldCtx): void {
    this.ensureRails(ctx);
    const map = engine.getActiveMap();
    const opts: FieldOpts = { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack };

    // Fix 3: reuse persistent Set instead of allocating per frame
    this.targetedIds.clear();
    const t0 = engine.getTargetedSlice(0); if (t0) this.targetedIds.add(t0.id);
    const t1 = engine.getTargetedSlice(1); if (t1) this.targetedIds.add(t1.id);

    let cubeI = 0, orbI = 0, tailI = 0;

    if (map) {
      for (const slice of map.slices as Slice[]) {
        const dt = slice.time - audioTime;
        // Fix 1: type-aware cull so LONG notes survive their full hold duration.
        const far = WORLD_LOOKAHEAD_S / ctx.speedMod + 0.2;
        if (dt > far) continue;
        if (slice.type === 'LONG') {
          // keep LONG note alive until the hold ends (plus 50ms grace)
          if (dt < -(slice.duration ?? 0) - 0.05) continue;
        } else if (dt < -0.25) {
          continue;
        }

        const lane = engine.getEffectiveLane(slice, audioTime);
        const x = scrollWorldX(dt, ctx.speedMod);
        const y = laneWorldY(lane, opts);
        const c = noteColor(slice.type, lane);

        // Invisible modifier: fade to nothing approaching the hit line (skip bombs).
        if (ctx.invisible && slice.type !== 'BOMB') {
          const ratio = dt / (WORLD_LOOKAHEAD_S / ctx.speedMod);
          if (ratio < 0.08) continue;
        }

        let scale = 1;
        if (slice.hit && slice.type !== 'LONG') {
          const fade = Math.max(0, 1 - (performance.now() - (slice.hitTime ?? 0)) / 90);
          if (fade <= 0) continue;
          scale = fade;
        }

        // Fix 2: targeted notes brighten via emissive color, not scale.
        const glow = this.targetedIds.has(slice.id) ? 1.4 : 1.0;

        if (slice.type === 'BOMB') {
          // Orbs use scale-based glow (fixed material color, cannot be per-instance brightened).
          if (orbI < MAX_ORBS) this.place(this.orbs, orbI++, x, y, 0, glow);
        } else {
          if (slice.type === 'LONG' && (slice.duration ?? 0) > 0) {
            const len = scrollWorldX(slice.duration!, ctx.speedMod);
            // Fix 4: guard tail instanced-array bounds independently.
            if (tailI < MAX_TAILS) this.placeTail(tailI++, x, y, len, c);
          }
          // Fix 2: pass scale only (no glow multiplier); glow drives color brightness.
          // Fix 4: guard cube instanced-array bounds independently.
          if (cubeI < MAX_NOTES) this.placeColored(this.cubes, cubeI++, x, y, scale, c, glow);
        }
      }
    }

    this.cubes.count = cubeI; this.cubes.instanceMatrix.needsUpdate = true;
    (this.cubes.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.orbs.count = orbI; this.orbs.instanceMatrix.needsUpdate = true;
    this.tails.count = tailI; this.tails.instanceMatrix.needsUpdate = true;
    (this.tails.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number) {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.setScalar(Math.max(0.001, s));
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }

  // Fix 2: bright > 1 intentionally overdrives emissive (bloom harder for targeted notes).
  private placeColored(mesh: THREE.InstancedMesh, i: number, x: number, y: number, s: number, hex: number, bright = 1) {
    this.place(mesh, i, x, y, 0, s);
    mesh.setColorAt(i, this.color.setHex(hex).multiplyScalar(bright));
  }

  private placeTail(i: number, x: number, y: number, len: number, hex: number) {
    this.dummy.position.set(x + len / 2, y, -0.05);
    this.dummy.scale.set(Math.max(0.001, len), 1, 1);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.tails.setMatrixAt(i, this.dummy.matrix);
    this.tails.setColorAt(i, this.color.setHex(hex));
  }

  private ensureRails(ctx: FieldCtx) {
    if (this.railsOneTrack === ctx.oneTrack) return;
    // dispose any existing rails before rebuilding for the new layout
    for (const rail of this.rails) {
      rail.geometry.dispose();
      (rail.material as THREE.Material).dispose();
      rail.removeFromParent();
    }
    this.rails = [];
    const lanes = ctx.oneTrack ? [0] : [0, 1];
    const depth = scrollWorldX(WORLD_LOOKAHEAD_S / ctx.speedMod, ctx.speedMod);
    lanes.forEach((lane) => {
      const geo = new THREE.PlaneGeometry(depth, 0.7);
      const mat = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[lane], transparent: true, opacity: 0.12,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const rail = new THREE.Mesh(geo, mat);
      rail.rotation.x = -Math.PI / 2;
      rail.position.set(depth / 2, laneWorldY(lane, { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack }), 0);
      this.group.add(rail);
      this.rails.push(rail);
    });
    this.railsOneTrack = ctx.oneTrack;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.group.removeFromParent();
  }
}
