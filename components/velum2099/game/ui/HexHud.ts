// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Hexagonal Grid HUD
   Faint corner hex grids that pulse on
   collision proximity. Pure 2D canvas overlay.
   ═══════════════════════════════════════════ */

export class HexHud {
    constructor() {
        this._container = document.getElementById('hex-hud');
        this._canvases = ['hex-tl', 'hex-tr', 'hex-bl', 'hex-br'].map(id => {
            const c = document.getElementById(id);
            c.width = 200;
            c.height = 200;
            return c;
        });
        this._baseOpacity = 0.12;
        this._pulseIntensity = 0;
        this._drawAllGrids();
    }

    show() { this._container.style.display = 'block'; }
    hide() { this._container.style.display = 'none'; }

    update(dt, collisionProximity) {
        const target = collisionProximity;
        this._pulseIntensity += (target - this._pulseIntensity) * (1 - Math.exp(-6 * dt));

        const pulse = Math.sin(Date.now() * 0.008) * 0.5 + 0.5;
        const opacity = this._baseOpacity + this._pulseIntensity * 0.35 * pulse;
        const hue = this._pulseIntensity * -60;

        for (const canvas of this._canvases) {
            canvas.style.opacity = opacity;
            canvas.style.filter = `hue-rotate(${hue}deg)`;
        }
    }

    _drawAllGrids() {
        const corners = [
            { idx: 0, fadeX: 1, fadeY: 1 },
            { idx: 1, fadeX: -1, fadeY: 1 },
            { idx: 2, fadeX: 1, fadeY: -1 },
            { idx: 3, fadeX: -1, fadeY: -1 },
        ];
        for (const corner of corners) {
            this._drawHexGrid(this._canvases[corner.idx].getContext('2d'), 200, 200, corner.fadeX, corner.fadeY);
        }
    }

    _drawHexGrid(ctx, w, h, fadeX, fadeY) {
        ctx.clearRect(0, 0, w, h);
        const hexSize = 18;
        const hexH = hexSize * Math.sqrt(3);

        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 0.8;

        for (let row = -1; row < h / hexH + 1; row++) {
            for (let col = -1; col < w / (hexSize * 1.5) + 1; col++) {
                const cx = col * hexSize * 1.5;
                const cy = row * hexH + (col % 2 ? hexH / 2 : 0);

                const normX = fadeX > 0 ? cx / w : 1 - cx / w;
                const normY = fadeY > 0 ? cy / h : 1 - cy / h;
                const fade = Math.max(0, 1 - (normX + normY) * 0.7);
                if (fade < 0.05) continue;

                ctx.globalAlpha = fade;
                this._drawHex(ctx, cx, cy, hexSize * 0.45);
            }
        }
        ctx.globalAlpha = 1;
    }

    _drawHex(ctx, cx, cy, r) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i - Math.PI / 6;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}
