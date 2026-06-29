// lib/game/render3d/EffectsLayer.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import { impactFor, shouldEmitImpact } from './impactConfig';
import { scrollWorldX, laneWorldY } from './fieldMapping';
import type { FieldCtx } from './NoteField';

const MAX_P = 600;

export class EffectsLayer {
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private head = 0;
  private lastFeedbackId = -1;
  private shake = 0;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  getShake(): number { return this.shake; }

  consume(engine: GameEngine, ctx: FieldCtx, _audioTime: number): void {
    const q = engine.feedbackQueue;
    const latest = q[q.length - 1];
    if (!latest || latest.id === this.lastFeedbackId) return;
    this.lastFeedbackId = latest.id;
    if (!shouldEmitImpact(latest.text)) return;

    const cfg = impactFor(latest.text);
    if (!ctx.reducedFx) this.shake = Math.min(1, this.shake + cfg.shake);

    const x = scrollWorldX((latest.offset ?? 0) * -1, ctx.speedMod);
    const y = laneWorldY(latest.lane, { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack });
    const c = new THREE.Color(latest.color || '#ffffff');

    for (let k = 0; k < cfg.particles; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX_P;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = (0.4 + Math.random()) * cfg.speed * 0.12;
      this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = 0;
      this.vel[i*3] = Math.cos(a) * Math.cos(b) * sp;
      this.vel[i*3+1] = Math.sin(b) * sp;
      this.vel[i*3+2] = Math.sin(a) * Math.cos(b) * sp;
      this.col[i*3] = c.r; this.col[i*3+1] = c.g; this.col[i*3+2] = c.b;
      this.life[i] = 1;
    }
  }

  update(dt: number): void {
    const f = Math.min(dt, 0.05) * 60; // normalize to ~per-frame at 60fps
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) { this.col[i*3]=this.col[i*3+1]=this.col[i*3+2]=0; continue; }
      this.pos[i*3]   += this.vel[i*3]   * f;
      this.pos[i*3+1] += this.vel[i*3+1] * f - 0.004 * f; // slight gravity
      this.pos[i*3+2] += this.vel[i*3+2] * f;
      this.life[i] -= 0.03 * f;
      const l = Math.max(0, this.life[i]);
      // fade color toward black as life ends
      this.col[i*3] *= l > 0 ? 1 : 0;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.shake *= Math.max(0, 1 - 0.12 * f); // decay shake
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
