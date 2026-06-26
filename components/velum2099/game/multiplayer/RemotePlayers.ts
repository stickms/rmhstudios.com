// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM 2099 — Remote Players
   Renders other lobby members as ghost AE86s
   with floating nameplates, smoothly
   interpolated from network snapshots.
   ═══════════════════════════════════════════ */

import {
    Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, BoxGeometry,
    CylinderGeometry, PlaneGeometry, DoubleSide, Sprite, SpriteMaterial,
    CanvasTexture, Color,
} from 'three';

/** Eight distinct neon body colours keyed by server-assigned colorIndex. */
export const PLAYER_COLORS = [
    0x00ffff, // cyan
    0xff00aa, // magenta
    0x66ff33, // toxic green
    0xffaa00, // amber
    0xaa66ff, // violet
    0xff3344, // red
    0x33aaff, // blue
    0xffff44, // yellow
];

export function playerColor(idx) {
    return PLAYER_COLORS[((idx % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;          // THREE.Scene
        this.players = new Map();    // id -> { group, target, body, underglow, nameplate, drifting }
    }

    /** Create or update the remote car for a player from a network snapshot. */
    upsert(state) {
        if (!state || !state.id) return;
        let p = this.players.get(state.id);
        if (!p) {
            p = this._spawn(state);
            this.players.set(state.id, p);
        }
        // Update interpolation target (don't snap — see update()).
        p.target.x = state.x;
        p.target.y = state.y;
        p.target.z = state.z;
        p.target.ry = state.ry;
        p.drifting = !!state.drifting;
        p.speed = state.speed || 0;
        p._lastSeen = 0;
        if (state.name && state.name !== p.name) {
            p.name = state.name;
            this._setNameplate(p, state.name);
        }
    }

    remove(id) {
        const p = this.players.get(id);
        if (!p) return;
        this.scene.remove(p.group);
        this._disposeGroup(p.group);
        this.players.delete(id);
    }

    /** Smoothly interpolate every ghost toward its latest snapshot. */
    update(dt) {
        const posLerp = 1 - Math.exp(-10 * dt);
        const rotLerp = 1 - Math.exp(-9 * dt);
        for (const [id, p] of this.players) {
            const g = p.group;
            g.position.x += (p.target.x - g.position.x) * posLerp;
            g.position.y += (p.target.y - g.position.y) * posLerp;
            g.position.z += (p.target.z - g.position.z) * posLerp;

            // Shortest-arc heading interpolation.
            let da = p.target.ry - g.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            g.rotation.y += da * rotLerp;

            // Pulse underglow; brighter while drifting.
            if (p.underglow) {
                const base = p.drifting ? 0.6 : 0.35;
                p.underglow.material.opacity = base + 0.15 * Math.sin(Date.now() * 0.003);
            }

            // Drop players we haven't heard from in a while (safety net; the
            // server also emits velum:playerLeft on disconnect).
            p._lastSeen += dt;
            if (p._lastSeen > 15) this.remove(id);
        }
    }

    dispose() {
        for (const [, p] of this.players) {
            this.scene.remove(p.group);
            this._disposeGroup(p.group);
        }
        this.players.clear();
    }

    /* ── internal ── */

    _spawn(state) {
        const group = new Group();
        const color = playerColor(state.colorIndex || 0);

        const bodyMat = new MeshStandardMaterial({
            color, roughness: 0.4, metalness: 0.2,
            emissive: color, emissiveIntensity: 0.35,
        });
        const darkMat = new MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 });
        const glassMat = new MeshStandardMaterial({
            color: 0x224466, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.55,
        });

        // Lower body
        const lower = new Mesh(new BoxGeometry(1.7, 0.4, 4.2), darkMat);
        lower.position.y = 0.38;
        group.add(lower);
        // Upper body (player colour)
        const upper = new Mesh(new BoxGeometry(1.62, 0.34, 4.0), bodyMat);
        upper.position.y = 0.72;
        group.add(upper);
        // Cabin
        const cabin = new Mesh(new BoxGeometry(1.4, 0.45, 1.7), glassMat);
        cabin.position.set(0, 1.06, -0.1);
        group.add(cabin);
        // Roof
        const roof = new Mesh(new BoxGeometry(1.3, 0.06, 1.5), bodyMat);
        roof.position.set(0, 1.3, -0.1);
        group.add(roof);

        // Tail lights
        for (const sx of [-0.6, 0.6]) {
            const tl = new Mesh(new BoxGeometry(0.34, 0.12, 0.06), new MeshBasicMaterial({ color: 0xff1122 }));
            tl.position.set(sx, 0.6, 2.1);
            group.add(tl);
        }
        // Headlights
        for (const sx of [-0.55, 0.55]) {
            const hl = new Mesh(new BoxGeometry(0.28, 0.12, 0.05), new MeshBasicMaterial({ color: 0xffffee }));
            hl.position.set(sx, 0.7, -2.05);
            group.add(hl);
        }

        // Wheels
        const wheelGeo = new CylinderGeometry(0.28, 0.28, 0.18, 8);
        const wheelMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.85 });
        for (const [x, z] of [[-0.82, -1.4], [0.82, -1.4], [-0.82, 1.4], [0.82, 1.4]]) {
            const w = new Mesh(wheelGeo, wheelMat);
            w.rotation.z = Math.PI / 2;
            w.position.set(x, 0.28, z);
            group.add(w);
        }

        // Underglow
        const underglow = new Mesh(
            new PlaneGeometry(2.2, 5.0),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: DoubleSide, depthWrite: false }),
        );
        underglow.rotation.x = -Math.PI / 2;
        underglow.position.y = 0.06;
        group.add(underglow);

        // Floating nameplate
        const nameplate = new Sprite(new SpriteMaterial({ transparent: true, depthTest: false }));
        nameplate.position.set(0, 2.4, 0);
        group.add(nameplate);

        group.position.set(state.x || 0, state.y || 0, state.z || 0);
        group.rotation.y = state.ry || 0;
        this.scene.add(group);

        const p = {
            group, underglow, nameplate, body: upper, color,
            name: state.name || 'Driver', drifting: false, speed: 0, _lastSeen: 0,
            target: { x: state.x || 0, y: state.y || 0, z: state.z || 0, ry: state.ry || 0 },
        };
        this._setNameplate(p, p.name);
        return p;
    }

    _setNameplate(p, name) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const hex = '#' + new Color(p.color).getHexString();
        ctx.font = 'bold 34px "VT323", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = String(name).slice(0, 16);

        // Glow + outline for readability over the bright city.
        ctx.shadowColor = hex;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#000';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, 128, 34);
        ctx.fillStyle = hex;
        ctx.fillText(label, 128, 34);

        const tex = new CanvasTexture(canvas);
        tex.needsUpdate = true;
        if (p.nameplate.material.map) p.nameplate.material.map.dispose();
        p.nameplate.material.map = tex;
        p.nameplate.material.needsUpdate = true;
        p.nameplate.scale.set(4.5, 1.125, 1);
    }

    _disposeGroup(group) {
        group.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (c.material.map) c.material.map.dispose();
                c.material.dispose();
            }
        });
    }
}
