// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Mission & Pursuit System
   Adds actual objectives to the sandbox:
     • Courier deliveries (pickup → drop-off,
       on a timer, paying credits)
     • A police "heat" / pursuit system you
       trigger by reckless driving and have to
       escape from
   All world markers and chase cars live in the
   Three.js scene; HUD state is exposed via
   getState() for the DOM overlay to render.
   ═══════════════════════════════════════════ */

import {
    Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
    CylinderGeometry, RingGeometry, BoxGeometry, Box3, Vector3,
    DoubleSide, AdditiveBlending,
} from 'three';

const BEST_KEY = 'neurodrive_best_credits';

/* ── Tunables ── */
const PICKUP_MIN = 70;
const PICKUP_MAX = 200;
const DROPOFF_MIN = 110;
const DROPOFF_MAX = 320;
const ARRIVE_RADIUS = 9;          // how close (XZ) counts as "reached"
const DELIVER_SPEED = 16;         // assumed avg m/s for the time budget
const DELIVER_BUFFER = 22;        // extra seconds on top of the estimate

const HEAT_MAX = 5;
const BUST_RADIUS = 7;            // cop within this for BUST_TIME ⇒ busted
const BUST_TIME = 3.5;
const ESCAPE_RADIUS = 78;        // all cops beyond this for ESCAPE_TIME ⇒ escaped
const ESCAPE_TIME = 6;
const POLICE_SPAWN_DIST = 46;
const HEAT_COLLISION_COOLDOWN = 1.2;

export class MissionManager {
    constructor(scene, vehicle, opts = {}) {
        this.scene = scene;          // CyberpunkScene
        this.vehicle = vehicle;
        this.onToast = opts.onToast || (() => {});

        this.credits = 0;
        this.best = this._loadBest();
        this.combo = 1;

        // Mission state
        this.phase = 'idle';         // 'idle' | 'pickup' | 'deliver'
        this.missionType = 'courier';// 'courier' | 'drug'
        this.isDrug = false;
        this.targetColor = 0x00ffd5; // current beacon colour (for the minimap)
        this.target = null;          // { x, z }
        this.timeLeft = null;
        this.timeMax = null;
        this._nextDelay = 0;         // delay before offering next delivery

        // Marker beacon (one, recoloured per phase)
        this._beacon = this._makeBeacon();
        this._beacon.visible = false;
        this.scene.scene.add(this._beacon);
        this._beaconT = 0;

        // Pursuit state
        this.heat = 0;
        this.police = [];
        this._bustTimer = 0;
        this._escapeTimer = 0;
        this._collisionCd = 0;
        this._lightT = 0;
        this._lastEvent = null;      // 'busted' | 'escaped' (one-shot for HUD flash)

        // Cop collision scratch (pooled to avoid per-frame allocation)
        this._policeBoxPool = [];
        this._policeSize = new Vector3(1.9, 1.4, 3.9);
        this._nearStatic = [];
    }

    /* ── lifecycle ── */

    startSession() {
        this.credits = 0;
        this.combo = 1;
        this.heat = 0;
        this._clearPolice();
        this._offerDelivery(true);
        this.onToast('接单 — 前往取货点  ·  PICK UP CARGO', 'info');
    }

    /** Pause/clean up world objects when leaving the simulation (back to menu). */
    suspend() {
        this._clearPolice();
        this.heat = 0;
        if (this._beacon) this._beacon.visible = false;
        this.phase = 'idle';
        this.target = null;
        this.timeLeft = null;
        this.timeMax = null;
    }

    /* ── deliveries ── */

    _offerDelivery(immediate) {
        const p = this.vehicle.position;
        const t = this.scene.findRoadTarget(p.x, p.z, PICKUP_MIN, PICKUP_MAX)
            || this.scene.findRoadTarget(p.x, p.z, 40, PICKUP_MAX + 120);
        if (!t) { this._nextDelay = 2; return; } // retry shortly

        // ~40% of runs are illicit "drug runs" — pay more but blow your cover.
        this.isDrug = Math.random() < 0.4;
        this.missionType = this.isDrug ? 'drug' : 'courier';
        this.phase = 'pickup';
        this.target = t;
        this.timeLeft = null;
        this.timeMax = null;
        this._showBeacon(t, this.isDrug ? 0x39ff14 : 0x00ffd5);
        if (this.isDrug) this.onToast('违禁品订单 — 高额报酬  ·  DRUG RUN', 'info');
        else if (!immediate) this.onToast('新订单 — 前往取货点  ·  NEW FARE', 'info');
    }

    _beginDropoff() {
        const t = this.scene.findRoadTarget(this.target.x, this.target.z, DROPOFF_MIN, DROPOFF_MAX)
            || this.scene.findRoadTarget(this.target.x, this.target.z, 60, DROPOFF_MAX + 160);
        if (!t) { this._completeDelivery(); return; }
        const dist = Math.hypot(t.x - this.target.x, t.z - this.target.z);
        this.phase = 'deliver';
        this.target = t;
        this.timeMax = dist / DELIVER_SPEED + DELIVER_BUFFER;
        this.timeLeft = this.timeMax;
        this._showBeacon(t, this.isDrug ? 0xaaff00 : 0xff2bd0);
        if (this.isDrug) {
            this.onToast('毒品到手 — 警方已盯上你！·  DEAL MADE — HEAT UP', 'bad');
            this._raiseHeat(1, '毒品交易暴露 — 警方追缉！·  NARCS ON YOU');
        } else {
            this.onToast('已取货 — 限时送达！·  CARGO SECURED', 'good');
        }
    }

    _completeDelivery() {
        const distBonus = this.timeMax ? Math.round((this.timeMax - (this.timeLeft || 0)) * 4) : 0;
        const timeBonus = Math.max(0, Math.round((this.timeLeft || 0) * 10));
        const base = this.isDrug ? 450 : 250;
        const mult = this.isDrug ? 1.8 : 1.0;
        const reward = Math.round((base + timeBonus + distBonus) * mult * this.combo);
        this.credits += reward;
        const tag = this.isDrug ? 'DEAL DONE' : 'DELIVERED';
        this.onToast(`送达完成  +¥${reward}  (x${this.combo.toFixed(1)})  ·  ${tag}`, 'good');
        this.combo = Math.min(4, this.combo + 0.5);
        this._saveBest();
        this._endDelivery(2.2);
    }

    _failDelivery(reason) {
        const penalty = Math.min(this.credits, 80);
        this.credits -= penalty;
        this.combo = 1;
        this.onToast(`${reason}  -¥${penalty}  ·  FARE LOST`, 'bad');
        this._endDelivery(2.8);
    }

    _endDelivery(delay) {
        this.phase = 'idle';
        this.target = null;
        this.timeLeft = null;
        this.timeMax = null;
        this._beacon.visible = false;
        this._nextDelay = delay;
    }

    /* ── pursuit / heat ── */

    /** Called from the main loop with the collisions returned by the vehicle. */
    reportCollisions(collisions) {
        if (!collisions || !collisions.length || this._collisionCd > 0) return;
        for (const c of collisions) {
            if (c.type === 'traffic') {
                this._collisionCd = HEAT_COLLISION_COOLDOWN;
                this._raiseHeat(1, '肇事逃逸 — 警方介入！·  HIT & RUN');
                break;
            }
        }
    }

    _raiseHeat(amount, msg) {
        const before = this.heat;
        this.heat = Math.min(HEAT_MAX, this.heat + amount);
        if (this.heat > before) {
            if (msg && before === 0) this.onToast(msg, 'bad');
            else if (this.heat > before) this.onToast(`通缉等级 ★${this.heat}  ·  WANTED`, 'bad');
            this._escapeTimer = 0;
        }
    }

    _spawnPoliceUpTo(n) {
        while (this.police.length < n) {
            const car = this._makePoliceCar();
            const p = this.vehicle.position;
            const ang = Math.random() * Math.PI * 2;
            const x = p.x + Math.cos(ang) * POLICE_SPAWN_DIST;
            const z = p.z + Math.sin(ang) * POLICE_SPAWN_DIST;
            car.position.set(x, this.scene.getGroundHeight(x, z), z);
            this.scene.scene.add(car);
            this.police.push({ mesh: car, speed: 0, rot: ang });
        }
    }

    _clearPolice() {
        for (const p of this.police) {
            this.scene.scene.remove(p.mesh);
            this._disposeGroup(p.mesh);
        }
        this.police.length = 0;
        this._bustTimer = 0;
        this._escapeTimer = 0;
    }

    _updatePursuit(dt) {
        // Spawn cops to match heat
        if (this.heat > 0) this._spawnPoliceUpTo(this.heat);

        const vp = this.vehicle.position;
        const chaseSpeed = (this.vehicle.maxSpeed || 55) * 0.9;
        let minDist = Infinity;

        this._lightT += dt;
        const flash = Math.sin(this._lightT * 12) > 0;

        for (const p of this.police) {
            const dx = vp.x - p.mesh.position.x;
            const dz = vp.z - p.mesh.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < minDist) minDist = dist;

            // Steer toward the player (vehicle forward convention: (-sin, -cos))
            const desired = Math.atan2(-dx, -dz);
            let da = desired - p.rot;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const turnRate = 2.4;
            p.rot += Math.max(-turnRate * dt, Math.min(turnRate * dt, da));
            p.mesh.rotation.y = p.rot;

            // Accelerate up to chase speed, ease off when very close
            const targetSpeed = dist < 5 ? chaseSpeed * 0.3 : chaseSpeed;
            p.speed += (targetSpeed - p.speed) * Math.min(1, 1.5 * dt);

            const fx = -Math.sin(p.rot);
            const fz = -Math.cos(p.rot);
            p.mesh.position.x += fx * p.speed * dt;
            p.mesh.position.z += fz * p.speed * dt;

            // Solid collision vs nearby buildings/poles so cops don't phase
            // through the city. Resolve the cruiser as a circle out of each box.
            this._resolveCarVsStatic(p);

            const gy = this.scene.getGroundHeight(p.mesh.position.x, p.mesh.position.z);
            p.mesh.position.y += (gy - p.mesh.position.y) * Math.min(1, 8 * dt);

            // Flashing light bar
            if (p.mesh._red) p.mesh._red.visible = flash;
            if (p.mesh._blue) p.mesh._blue.visible = !flash;
        }

        if (!this.police.length) return;

        // Bust check — a cop sitting on top of you
        if (minDist < BUST_RADIUS) {
            this._bustTimer += dt;
            this._escapeTimer = 0;
            if (this._bustTimer >= BUST_TIME) this._busted();
        } else {
            this._bustTimer = Math.max(0, this._bustTimer - dt * 0.5);
        }

        // Escape check — shake them all off
        if (minDist > ESCAPE_RADIUS) {
            this._escapeTimer += dt;
            if (this._escapeTimer >= ESCAPE_TIME) this._escaped();
        } else {
            this._escapeTimer = Math.max(0, this._escapeTimer - dt * 0.4);
        }
    }

    /** Push a chase car (treated as a circle) out of nearby static AABBs. */
    _resolveCarVsStatic(p) {
        const R = 1.7;
        const px = p.mesh.position.x, pz = p.mesh.position.z;
        const list = this.scene.getNearbyStatic(px, pz, 8, this._nearStatic);
        for (const c of list) {
            const b = c.box;
            // Closest point on the box (XZ) to the car centre
            const cx = Math.max(b.min.x, Math.min(px, b.max.x));
            const cz = Math.max(b.min.z, Math.min(pz, b.max.z));
            let dx = px - cx, dz = pz - cz;
            let d2 = dx * dx + dz * dz;
            if (d2 < R * R) {
                if (d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    const push = (R - d);
                    p.mesh.position.x += (dx / d) * push;
                    p.mesh.position.z += (dz / d) * push;
                } else {
                    // Centre inside the box — eject along the shallowest axis
                    const ox = Math.min(px - b.min.x, b.max.x - px);
                    const oz = Math.min(pz - b.min.z, b.max.z - pz);
                    if (ox < oz) p.mesh.position.x += (px - (b.min.x + b.max.x) * 0.5 < 0 ? -1 : 1) * (ox + R);
                    else p.mesh.position.z += (pz - (b.min.z + b.max.z) * 0.5 < 0 ? -1 : 1) * (oz + R);
                }
                p.speed *= 0.85;
            }
        }
    }

    /**
     * Return solid cop-car collidables for the player's collision pass, reusing
     * pooled Box3s. Appended to the scene collidables by the main loop.
     */
    getPoliceCollidables(out) {
        for (let i = 0; i < this.police.length; i++) {
            const p = this.police[i];
            let box = this._policeBoxPool[i];
            if (!box) { box = new Box3(); this._policeBoxPool[i] = box; }
            box.setFromCenterAndSize(p.mesh.position, this._policeSize);
            out.push({ box, mesh: p.mesh, type: 'police' });
        }
        return out;
    }

    _busted() {
        const penalty = Math.min(this.credits, 150 + this.heat * 40);
        this.credits -= penalty;
        this.combo = 1;
        this._lastEvent = 'busted';
        this.onToast(`被捕！  -¥${penalty}  ·  BUSTED`, 'bad');
        this.heat = 0;
        this._clearPolice();
        if (this.phase === 'deliver' || this.phase === 'pickup') this._endDelivery(2.5);
    }

    _escaped() {
        const bonus = 120 * this.heat;
        this.credits += bonus;
        this._lastEvent = 'escaped';
        this.onToast(`成功甩开警方  +¥${bonus}  ·  ESCAPED`, 'good');
        this.heat = 0;
        this._clearPolice();
        this._saveBest();
    }

    /* ── main update ── */

    update(dt) {
        if (this._collisionCd > 0) this._collisionCd -= dt;

        // Offer the next delivery after the cooldown
        if (this.phase === 'idle') {
            this._nextDelay -= dt;
            if (this._nextDelay <= 0) this._offerDelivery(false);
        }

        // Objective progress
        if (this.target && (this.phase === 'pickup' || this.phase === 'deliver')) {
            const dx = this.vehicle.position.x - this.target.x;
            const dz = this.vehicle.position.z - this.target.z;
            const dist = Math.hypot(dx, dz);

            if (this.phase === 'deliver') {
                this.timeLeft -= dt;
                if (this.timeLeft <= 0) { this._failDelivery('超时未送达  ·  TIMED OUT'); }
            }

            if (this.target && dist < ARRIVE_RADIUS) {
                if (this.phase === 'pickup') this._beginDropoff();
                else if (this.phase === 'deliver') this._completeDelivery();
            }
        }

        this._updatePursuit(dt);
        this._animateBeacon(dt);
    }

    /* ── HUD payload ── */

    getState() {
        let distance = null;
        let bearing = 0;
        if (this.target) {
            const dx = this.target.x - this.vehicle.position.x;
            const dz = this.target.z - this.vehicle.position.z;
            distance = Math.hypot(dx, dz);
            // Relative bearing vs. the car's heading (forward = (-sin, -cos))
            const ry = this.vehicle.rotation.y;
            const fx = -Math.sin(ry), fz = -Math.cos(ry);
            const tx = dx / (distance || 1), tz = dz / (distance || 1);
            const dot = fx * tx + fz * tz;
            const det = fx * tz - fz * tx;
            bearing = Math.atan2(det, dot);
        }

        let objective = '空闲 · STANDBY';
        const tag = this.isDrug ? ' [DRUG]' : '';
        if (this.phase === 'pickup') objective = `取货 · PICK UP${tag}`;
        else if (this.phase === 'deliver') objective = `送达 · DELIVER${tag}`;

        const event = this._lastEvent;
        this._lastEvent = null;

        return {
            credits: this.credits,
            best: this.best,
            combo: this.combo,
            heat: this.heat,
            phase: this.phase,
            missionType: this.missionType,
            isDrug: this.isDrug,
            targetColor: this.targetColor,
            objective,
            distance,
            bearing,
            timeLeft: this.timeLeft,
            timeMax: this.timeMax,
            police: this.police.length,
            bustProgress: this.police.length ? Math.min(1, this._bustTimer / BUST_TIME) : 0,
            escapeProgress: this.police.length ? Math.min(1, this._escapeTimer / ESCAPE_TIME) : 0,
            speedKmh: Math.abs(this.vehicle.velocity) * 3.6,
            event,
        };
    }

    /* ── persistence ── */

    _loadBest() {
        try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
        catch { return 0; }
    }

    _saveBest() {
        if (this.credits > this.best) {
            this.best = this.credits;
            try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* ignore */ }
        }
    }

    /* ── visuals ── */

    _showBeacon(t, color) {
        this.targetColor = color;
        this._beacon.position.set(t.x, this.scene.getGroundHeight(t.x, t.z), t.z);
        this._beacon.traverse(o => {
            if (o.material && o.material.color) o.material.color.setHex(color);
        });
        this._beacon.visible = true;
    }

    _makeBeacon() {
        const g = new Group();
        const pillar = new Mesh(
            new CylinderGeometry(1.6, 1.6, 50, 14, 1, true),
            new MeshBasicMaterial({ color: 0x00ffd5, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }),
        );
        pillar.position.y = 25;
        g.add(pillar);

        const core = new Mesh(
            new CylinderGeometry(0.3, 0.3, 50, 8),
            new MeshBasicMaterial({ color: 0x00ffd5, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending }),
        );
        core.position.y = 25;
        g.add(core);

        const ring = new Mesh(
            new RingGeometry(3.2, 4.2, 36),
            new MeshBasicMaterial({ color: 0x00ffd5, transparent: true, opacity: 0.65, side: DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;
        g.add(ring);

        g._ring = ring;
        g._pillar = pillar;
        return g;
    }

    _animateBeacon(dt) {
        if (!this._beacon.visible) return;
        this._beaconT += dt;
        const pulse = 0.5 + 0.5 * Math.sin(this._beaconT * 3);
        if (this._beacon._ring) {
            const s = 1 + 0.25 * pulse;
            this._beacon._ring.scale.set(s, s, s);
            this._beacon._ring.rotation.z += dt * 1.2;
            this._beacon._ring.material.opacity = 0.4 + 0.35 * pulse;
        }
        if (this._beacon._pillar) {
            this._beacon._pillar.material.opacity = 0.1 + 0.12 * pulse;
        }
    }

    _makePoliceCar() {
        const g = new Group();
        const body = new Mesh(
            new BoxGeometry(1.8, 0.7, 3.8),
            new MeshStandardMaterial({ color: 0x0c0c14, metalness: 0.4, roughness: 0.5, emissive: 0x05050a, emissiveIntensity: 0.4 }),
        );
        body.position.y = 0.55;
        g.add(body);

        const cabin = new Mesh(
            new BoxGeometry(1.5, 0.5, 1.7),
            new MeshStandardMaterial({ color: 0x05050a, metalness: 0.3, roughness: 0.4 }),
        );
        cabin.position.set(0, 1.0, -0.1);
        g.add(cabin);

        // White door panels (classic cruiser two-tone)
        for (const sx of [-0.91, 0.91]) {
            const door = new Mesh(
                new BoxGeometry(0.04, 0.4, 1.6),
                new MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.4 }),
            );
            door.position.set(sx, 0.55, 0);
            g.add(door);
        }

        // Flashing light bar
        const red = new Mesh(new BoxGeometry(0.55, 0.22, 0.42), new MeshBasicMaterial({ color: 0xff1133 }));
        red.position.set(-0.42, 1.35, 0);
        g.add(red);
        const blue = new Mesh(new BoxGeometry(0.55, 0.22, 0.42), new MeshBasicMaterial({ color: 0x2244ff }));
        blue.position.set(0.42, 1.35, 0);
        blue.visible = false;
        g.add(blue);

        // Headlights
        for (const sx of [-0.55, 0.55]) {
            const hl = new Mesh(new BoxGeometry(0.28, 0.14, 0.05), new MeshBasicMaterial({ color: 0xffffee }));
            hl.position.set(sx, 0.6, -1.92);
            g.add(hl);
        }

        g._red = red;
        g._blue = blue;
        return g;
    }

    /* ── cleanup ── */

    _disposeGroup(group) {
        group.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                else o.material.dispose();
            }
        });
    }

    dispose() {
        this._clearPolice();
        if (this._beacon) {
            this.scene.scene.remove(this._beacon);
            this._disposeGroup(this._beacon);
            this._beacon = null;
        }
    }
}
