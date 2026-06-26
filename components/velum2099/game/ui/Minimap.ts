// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — GTA-style Minimap
   Rotating (player-up) radar showing the road
   network, the active objective with a routed
   path along the roads, police units and the
   player. Pure 2D canvas overlay.
   ═══════════════════════════════════════════ */

const STYLE_ID = 'neurodrive-minimap-style';
const CSS = `
.nd-map { position:fixed; left:14px; bottom:14px; z-index:300; pointer-events:none;
  border:2px solid rgba(0,255,213,0.45); border-radius:10px; overflow:hidden;
  box-shadow:0 0 16px rgba(0,255,213,0.25), inset 0 0 22px rgba(0,0,0,0.6);
  background:rgba(4,8,18,0.55); }
.nd-map canvas { display:block; }
`;

const SIZE = 176;            // px
const VIEW_RANGE = 230;      // world units from centre to edge
const PATH_REFRESH = 0.4;    // seconds between route recomputes
const DRAW_INTERVAL = 1 / 20; // throttle redraw to 20 Hz

export class Minimap {
    constructor(container, scene, vehicle, mission) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.mission = mission;
        this.chunkSize = scene.getChunkSize();
        this._injectStyle();

        const wrap = document.createElement('div');
        wrap.className = 'nd-map';
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * dpr;
        canvas.height = SIZE * dpr;
        canvas.style.width = `${SIZE}px`;
        canvas.style.height = `${SIZE}px`;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        this._wrap = wrap;
        this._ctx = canvas.getContext('2d');
        this._ctx.scale(dpr, dpr);
        this._scale = (SIZE / 2 - 6) / VIEW_RANGE;

        this._path = [];           // route as [{x,z}, ...] world centres
        this._pathT = PATH_REFRESH;
        this._drawT = 0;
    }

    show() { if (this._wrap) this._wrap.style.display = 'block'; }
    hide() { if (this._wrap) this._wrap.style.display = 'none'; }

    update(dt) {
        // Recompute the road route periodically (not every frame)
        this._pathT += dt;
        if (this._pathT >= PATH_REFRESH) {
            this._pathT = 0;
            this._computePath();
        }
        // Throttle the redraw
        this._drawT += dt;
        if (this._drawT < DRAW_INTERVAL) return;
        this._drawT = 0;
        this._draw();
    }

    /* ── world → rotated map space (player faces up) ── */
    _project(wx, wz) {
        const ry = this.vehicle.rotation.y;
        const c = Math.cos(ry), s = Math.sin(ry);
        const dx = wx - this.vehicle.position.x;
        const dz = wz - this.vehicle.position.z;
        const rx = dx * c - dz * s;
        const rz = dx * s + dz * c;
        return [SIZE / 2 + rx * this._scale, SIZE / 2 + rz * this._scale];
    }

    /* ── BFS over road chunks for a GTA-style route ── */
    _computePath() {
        this._path = [];
        const t = this.mission && this.mission.target;
        if (!t) return;

        const cs = this.chunkSize;
        const sx = Math.round(this.vehicle.position.x / cs);
        const sz = Math.round(this.vehicle.position.z / cs);
        const gx = Math.round(t.x / cs);
        const gz = Math.round(t.z / cs);
        if (sx === gx && sz === gz) { this._path = [{ x: t.x, z: t.z }]; return; }

        const key = (x, z) => `${x},${z}`;
        const visited = new Set();
        const parent = new Map();
        const queue = [[sx, sz]];
        visited.add(key(sx, sz));
        let best = null, bestD = Infinity;
        let guard = 0;
        const MAX = 1200;

        while (queue.length && guard++ < MAX) {
            const [cx, cz] = queue.shift();
            const d = Math.abs(cx - gx) + Math.abs(cz - gz);
            if (d < bestD) { bestD = d; best = [cx, cz]; }
            if (cx === gx && cz === gz) { best = [cx, cz]; break; }
            for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
                const k = key(nx, nz);
                if (visited.has(k)) continue;
                // keep the search bounded to the map's neighbourhood
                if (Math.abs(nx - sx) > 14 || Math.abs(nz - sz) > 14) continue;
                if (!this.scene.isRoadChunk(nx, nz) && !(nx === gx && nz === gz)) continue;
                visited.add(k);
                parent.set(k, [cx, cz]);
                queue.push([nx, nz]);
            }
        }
        if (!best) return;

        // Reconstruct
        const pts = [];
        let cur = best;
        while (cur) {
            pts.push({ x: cur[0] * cs, z: cur[1] * cs });
            const pk = parent.get(key(cur[0], cur[1]));
            cur = pk || null;
        }
        pts.reverse();
        // End exactly on the marker
        pts.push({ x: t.x, z: t.z });
        this._path = pts;
    }

    /* ── render ── */
    _draw() {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, SIZE, SIZE);

        // Backdrop
        ctx.fillStyle = 'rgba(6,10,22,0.65)';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Roads
        this._drawRoads(ctx);

        // Route line (GTA-style)
        if (this._path.length > 1) {
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(120,235,255,0.95)';
            ctx.shadowColor = 'rgba(120,235,255,0.8)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            for (let i = 0; i < this._path.length; i++) {
                const [x, y] = this._project(this._path[i].x, this._path[i].z);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Police blips
        for (const p of (this.mission ? this.mission.police : [])) {
            const [x, y] = this._project(p.mesh.position.x, p.mesh.position.z);
            this._blip(ctx, x, y, 3.6, '#ff3b5c', true);
        }

        // Objective marker (with edge clamp + arrow)
        const t = this.mission && this.mission.target;
        if (t) {
            const col = '#' + (this.mission.targetColor >>> 0).toString(16).padStart(6, '0');
            this._marker(ctx, t.x, t.z, col);
        }

        // Player arrow (always centre, pointing up)
        this._player(ctx);

        // Vignette ring
        ctx.strokeStyle = 'rgba(0,255,213,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    }

    _drawRoads(ctx) {
        const cs = this.chunkSize;
        const pcx = Math.round(this.vehicle.position.x / cs);
        const pcz = Math.round(this.vehicle.position.z / cs);
        const range = Math.ceil(VIEW_RANGE / cs) + 1;

        ctx.strokeStyle = 'rgba(70,95,130,0.85)';
        ctx.lineWidth = Math.max(2.5, cs * this._scale * 0.42);
        ctx.lineCap = 'round';

        for (let dx = -range; dx <= range; dx++) {
            for (let dz = -range; dz <= range; dz++) {
                const cx = pcx + dx, cz = pcz + dz;
                if (!this.scene.isRoadChunk(cx, cz)) continue;
                // Connect to the +X and +Z neighbours if they are also road
                if (this.scene.isRoadChunk(cx + 1, cz)) this._seg(ctx, cx, cz, cx + 1, cz, cs);
                if (this.scene.isRoadChunk(cx, cz + 1)) this._seg(ctx, cx, cz, cx, cz + 1, cs);
            }
        }
    }

    _seg(ctx, ax, az, bx, bz, cs) {
        const [x1, y1] = this._project(ax * cs, az * cs);
        const [x2, y2] = this._project(bx * cs, bz * cs);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    _blip(ctx, x, y, r, color, glow) {
        // Clamp inside the map
        x = Math.max(r, Math.min(SIZE - r, x));
        y = Math.max(r, Math.min(SIZE - r, y));
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    _marker(ctx, wx, wz, color) {
        let [x, y] = this._project(wx, wz);
        const pad = 8;
        const off = x < pad || x > SIZE - pad || y < pad || y > SIZE - pad;
        x = Math.max(pad, Math.min(SIZE - pad, x));
        y = Math.max(pad, Math.min(SIZE - pad, y));

        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        if (off) {
            // Edge arrow toward the objective
            const ang = Math.atan2(y - SIZE / 2, x - SIZE / 2);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    _player(ctx) {
        const cx = SIZE / 2, cy = SIZE / 2;
        ctx.fillStyle = '#eafcff';
        ctx.shadowColor = 'rgba(0,255,213,0.9)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx - 5, cy + 6);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx + 5, cy + 6);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    dispose() {
        if (this._wrap) this._wrap.remove();
        this._wrap = null;
    }
}
