// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Vehicle Laser Cannon
   A hood-mounted laser the player can fire to
   take out pursuing cops. Bolts are pooled
   glowing meshes that travel forward and test
   against the police list each frame. Has an
   overheat gauge so it can't be held forever.
   ═══════════════════════════════════════════ */

import {
    Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3, AdditiveBlending,
} from 'three';

const BOLT_SPEED = 150;
const BOLT_LIFE = 1.1;
const FIRE_INTERVAL = 0.16;     // seconds between bolts
const HIT_RADIUS = 3.2;
const HEAT_PER_SHOT = 0.13;
const HEAT_COOL = 0.35;         // per second

export class Weapon {
    constructor(scene, vehicle, mission, opts = {}) {
        this.scene = scene;       // CyberpunkScene
        this.vehicle = vehicle;
        this.mission = mission;
        this.onToast = opts.onToast || (() => {});

        this.cooldown = 0;
        this.heatGauge = 0;       // 0..1 overheat
        this.overheated = false;

        this._bolts = [];         // active bolts
        this._pool = [];          // recyclable bolt objects
        this._fwd = new Vector3();
    }

    fire() {
        if (this.cooldown > 0 || this.overheated) return false;
        this.cooldown = FIRE_INTERVAL;

        const ry = this.vehicle.rotation.y;
        const fx = -Math.sin(ry), fz = -Math.cos(ry);
        const px = this.vehicle.position.x + fx * 3.2;
        const pz = this.vehicle.position.z + fz * 3.2;
        const py = (this.vehicle.position.y || 0) + 0.7;

        const bolt = this._acquire();
        bolt.mesh.position.set(px, py, pz);
        bolt.mesh.rotation.y = ry;
        bolt.mesh.visible = true;
        bolt.dx = fx; bolt.dz = fz; bolt.life = BOLT_LIFE; bolt.alive = true;

        this.heatGauge = Math.min(1, this.heatGauge + HEAT_PER_SHOT);
        if (this.heatGauge >= 1) {
            this.overheated = true;
            this.onToast('激光过热 — 冷却中  ·  LASER OVERHEAT', 'bad');
        }
        return true;
    }

    update(dt) {
        if (this.cooldown > 0) this.cooldown -= dt;
        this.heatGauge = Math.max(0, this.heatGauge - HEAT_COOL * dt);
        if (this.overheated && this.heatGauge <= 0.25) this.overheated = false;

        const police = this.mission ? this.mission.police : [];
        for (const b of this._bolts) {
            if (!b.alive) continue;
            b.mesh.position.x += b.dx * BOLT_SPEED * dt;
            b.mesh.position.z += b.dz * BOLT_SPEED * dt;
            b.life -= dt;
            if (b.life <= 0) { this._retire(b); continue; }

            // Hit test against pursuing cops
            for (const p of police) {
                const ddx = p.mesh.position.x - b.mesh.position.x;
                const ddz = p.mesh.position.z - b.mesh.position.z;
                if (ddx * ddx + ddz * ddz < HIT_RADIUS * HIT_RADIUS) {
                    if (this.mission.damagePolice) this.mission.damagePolice(p, 1, b.mesh.position);
                    this._retire(b);
                    break;
                }
            }
        }
    }

    getState() {
        return { heat: this.heatGauge, overheated: this.overheated };
    }

    /* ── bolt pooling ── */
    _acquire() {
        let b = this._pool.pop();
        if (!b) {
            const g = new Group();
            const core = new Mesh(
                new BoxGeometry(0.16, 0.16, 2.6),
                new MeshBasicMaterial({ color: 0xff2a44 }),
            );
            const glow = new Mesh(
                new BoxGeometry(0.5, 0.5, 3.4),
                new MeshBasicMaterial({ color: 0xff5566, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false }),
            );
            g.add(core); g.add(glow);
            this.scene.scene.add(g);
            b = { mesh: g, dx: 0, dz: 0, life: 0, alive: false };
            this._bolts.push(b);
        }
        return b;
    }

    _retire(b) {
        b.alive = false;
        b.mesh.visible = false;
        this._pool.push(b);
    }

    dispose() {
        for (const b of this._bolts) {
            this.scene.scene.remove(b.mesh);
            b.mesh.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
        }
        this._bolts.length = 0;
        this._pool.length = 0;
    }
}
