// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Procedural Texture Generator
   Canvas-based textures for infinite variety
   ═══════════════════════════════════════════ */

import { CanvasTexture, RepeatWrapping, LinearMipMapLinearFilter, LinearFilter, Color } from 'three';

const TEX_SIZE = 256;

function createCanvas(w = TEX_SIZE, h = TEX_SIZE) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

function canvasToTexture(canvas, repeat = true) {
    const tex = new CanvasTexture(canvas);
    if (repeat) {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
    }
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

/* Seeded PRNG for deterministic textures */
function mulberry32(seed) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ── Building Facade Generators ── */

function facadeCorporateGlass(seed, palette) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dark blue-grey base
    const baseH = 200 + rng() * 20;
    ctx.fillStyle = `hsl(${baseH}, 15%, 12%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Window grid
    const cols = 6 + Math.floor(rng() * 4);
    const rows = 8 + Math.floor(rng() * 6);
    const gapX = TEX_SIZE / cols;
    const gapY = TEX_SIZE / rows;
    const pad = 2;

    for (let r = 0; r < rows; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
            const lit = rng() < 0.6;
            if (lit) {
                const warm = rng() < 0.7;
                const h = warm ? 35 + rng() * 25 : 190 + rng() * 40;
                const l = 40 + rng() * 30;
                ctx.fillStyle = `hsl(${h}, 50%, ${l}%)`;
            } else {
                ctx.fillStyle = `hsl(${baseH}, 10%, ${6 + rng() * 6}%)`;
            }
            ctx.fillRect(c2 * gapX + pad, r * gapY + pad, gapX - pad * 2, gapY - pad * 2);
        }
    }

    // Horizontal mullion bands
    ctx.fillStyle = `hsl(${baseH}, 8%, 18%)`;
    for (let r = 0; r <= rows; r++) {
        ctx.fillRect(0, r * gapY - 1, TEX_SIZE, 2);
    }

    return canvasToTexture(c);
}

function facadeResidential(seed, palette) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Warm concrete base
    const baseH = 20 + rng() * 20;
    const baseL = 18 + rng() * 8;
    ctx.fillStyle = `hsl(${baseH}, 12%, ${baseL}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Subtle concrete noise
    for (let i = 0; i < 600; i++) {
        const x = rng() * TEX_SIZE;
        const y = rng() * TEX_SIZE;
        const a = 0.03 + rng() * 0.06;
        ctx.fillStyle = `rgba(${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${a})`;
        ctx.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 3);
    }

    // Scattered windows — irregular placement
    const numWindows = 12 + Math.floor(rng() * 16);
    for (let i = 0; i < numWindows; i++) {
        const wx = 10 + rng() * (TEX_SIZE - 30);
        const wy = 10 + rng() * (TEX_SIZE - 30);
        const ww = 8 + rng() * 12;
        const wh = 10 + rng() * 16;

        // Window frame
        ctx.fillStyle = `hsl(0, 0%, ${8 + rng() * 6}%)`;
        ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);

        const lit = rng() < 0.5;
        if (lit) {
            const h = 30 + rng() * 30;
            ctx.fillStyle = `hsl(${h}, 60%, ${45 + rng() * 25}%)`;
        } else {
            ctx.fillStyle = `hsl(220, 15%, ${5 + rng() * 5}%)`;
        }
        ctx.fillRect(wx, wy, ww, wh);

        // Occasional curtain half
        if (lit && rng() < 0.4) {
            ctx.fillStyle = `hsl(${rng() * 360}, 20%, ${30 + rng() * 15}%)`;
            ctx.fillRect(wx, wy, ww * 0.4, wh);
        }
    }

    return canvasToTexture(c);
}

function facadeIndustrial(seed, palette) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Steel grey
    ctx.fillStyle = `hsl(210, 5%, ${14 + rng() * 6}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Large panels
    const panelCols = 2 + Math.floor(rng() * 2);
    const panelRows = 3 + Math.floor(rng() * 3);
    const pw = TEX_SIZE / panelCols;
    const ph = TEX_SIZE / panelRows;

    for (let r = 0; r < panelRows; r++) {
        for (let c2 = 0; c2 < panelCols; c2++) {
            const l = 10 + rng() * 10;
            ctx.fillStyle = `hsl(210, 4%, ${l}%)`;
            ctx.fillRect(c2 * pw + 2, r * ph + 2, pw - 4, ph - 4);
        }
    }

    // Panel seams
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    for (let r = 0; r <= panelRows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * ph);
        ctx.lineTo(TEX_SIZE, r * ph);
        ctx.stroke();
    }
    for (let c2 = 0; c2 <= panelCols; c2++) {
        ctx.beginPath();
        ctx.moveTo(c2 * pw, 0);
        ctx.lineTo(c2 * pw, TEX_SIZE);
        ctx.stroke();
    }

    // Rivets
    ctx.fillStyle = 'rgba(100,100,110,0.3)';
    for (let r = 0; r <= panelRows; r++) {
        for (let c2 = 0; c2 <= panelCols; c2++) {
            ctx.beginPath();
            ctx.arc(c2 * pw, r * ph, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Grime streaks
    for (let i = 0; i < 8; i++) {
        const x = rng() * TEX_SIZE;
        const w = 3 + rng() * 8;
        const grad = ctx.createLinearGradient(x, 0, x, TEX_SIZE);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.3, `rgba(0,0,0,${0.05 + rng() * 0.1})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - w / 2, 0, w, TEX_SIZE);
    }

    return canvasToTexture(c);
}

function facadeNeonAccent(seed, palette) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Very dark base
    ctx.fillStyle = `hsl(260, 15%, ${6 + rng() * 4}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Horizontal neon strips
    const neonCount = 2 + Math.floor(rng() * 4);
    const neonColor = palette ? palette.neons[Math.floor(rng() * palette.neons.length)] : 0xff0080;
    const nc = new Color(neonColor);
    const r2 = Math.floor(nc.r * 255);
    const g2 = Math.floor(nc.g * 255);
    const b2 = Math.floor(nc.b * 255);

    for (let i = 0; i < neonCount; i++) {
        const y = 20 + rng() * (TEX_SIZE - 40);
        const h = 1 + rng() * 3;

        // Glow
        ctx.shadowColor = `rgb(${r2},${g2},${b2})`;
        ctx.shadowBlur = 12;
        ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
        ctx.fillRect(0, y, TEX_SIZE, h);
        ctx.shadowBlur = 0;

        // Softer glow halo
        const grad = ctx.createLinearGradient(0, y - 10, 0, y + h + 10);
        grad.addColorStop(0, `rgba(${r2},${g2},${b2},0)`);
        grad.addColorStop(0.4, `rgba(${r2},${g2},${b2},0.15)`);
        grad.addColorStop(0.6, `rgba(${r2},${g2},${b2},0.15)`);
        grad.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 10, TEX_SIZE, h + 20);
    }

    // Dark window grid behind neon
    const cols = 8 + Math.floor(rng() * 4);
    const rows = 10 + Math.floor(rng() * 6);
    for (let r3 = 0; r3 < rows; r3++) {
        for (let c2 = 0; c2 < cols; c2++) {
            if (rng() < 0.8) continue;
            const wx = c2 * (TEX_SIZE / cols) + 2;
            const wy = r3 * (TEX_SIZE / rows) + 2;
            ctx.fillStyle = `rgba(${r2},${g2},${b2},${0.05 + rng() * 0.1})`;
            ctx.fillRect(wx, wy, TEX_SIZE / cols - 4, TEX_SIZE / rows - 4);
        }
    }

    return canvasToTexture(c);
}

function facadeBrutalist(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Concrete grey
    const base = 16 + rng() * 8;
    ctx.fillStyle = `hsl(30, 5%, ${base}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Concrete texture noise
    for (let i = 0; i < 1200; i++) {
        const x = rng() * TEX_SIZE;
        const y = rng() * TEX_SIZE;
        const bright = rng() < 0.5;
        ctx.fillStyle = `rgba(${bright ? 180 : 0},${bright ? 170 : 0},${bright ? 160 : 0},${0.02 + rng() * 0.04})`;
        ctx.fillRect(x, y, 1 + rng() * 4, 1 + rng() * 4);
    }

    // Deep-set windows in bands
    const bandCount = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < bandCount; b++) {
        const by = (b + 0.5) * (TEX_SIZE / bandCount);
        const bh = TEX_SIZE / bandCount * 0.4;
        // Recessed band shadow
        ctx.fillStyle = `rgba(0,0,0,0.25)`;
        ctx.fillRect(8, by - bh / 2 - 2, TEX_SIZE - 16, bh + 4);

        const winCount = 4 + Math.floor(rng() * 4);
        const winGap = (TEX_SIZE - 16) / winCount;
        for (let w = 0; w < winCount; w++) {
            const lit = rng() < 0.35;
            ctx.fillStyle = lit
                ? `hsl(${40 + rng() * 20}, 50%, ${35 + rng() * 20}%)`
                : `hsl(220, 10%, ${4 + rng() * 4}%)`;
            ctx.fillRect(10 + w * winGap + 3, by - bh / 2 + 2, winGap - 6, bh - 4);
        }
    }

    return canvasToTexture(c);
}

function facadeLEDMatrix(seed, palette) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Black base
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    const dotSize = 3;
    const gap = 6;
    const cols = Math.floor(TEX_SIZE / gap);
    const rows = Math.floor(TEX_SIZE / gap);

    const neonColor = palette ? palette.neons[Math.floor(rng() * palette.neons.length)] : 0x00ffff;
    const nc = new Color(neonColor);
    const r2 = Math.floor(nc.r * 255);
    const g2 = Math.floor(nc.g * 255);
    const b2 = Math.floor(nc.b * 255);

    // Scrolling text / pattern blocks
    const patternRows = 3 + Math.floor(rng() * 5);
    const patterns = [];
    for (let p = 0; p < patternRows; p++) {
        const startRow = Math.floor(rng() * rows);
        const height = 3 + Math.floor(rng() * 8);
        const density = 0.1 + rng() * 0.4;
        patterns.push({ startRow, height, density });
    }

    for (let r3 = 0; r3 < rows; r3++) {
        for (let c2 = 0; c2 < cols; c2++) {
            let on = false;
            let brightness = 0;
            for (const pat of patterns) {
                if (r3 >= pat.startRow && r3 < pat.startRow + pat.height) {
                    if (rng() < pat.density) {
                        on = true;
                        brightness = 0.3 + rng() * 0.7;
                    }
                }
            }
            if (on) {
                ctx.fillStyle = `rgba(${r2},${g2},${b2},${brightness})`;
            } else {
                ctx.fillStyle = `rgba(${r2},${g2},${b2},${rng() * 0.03})`;
            }
            ctx.fillRect(c2 * gap + 1, r3 * gap + 1, dotSize, dotSize);
        }
    }

    return canvasToTexture(c);
}

function facadeArtDeco(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dark teal/navy base
    const baseH = 180 + rng() * 40;
    ctx.fillStyle = `hsl(${baseH}, 20%, 12%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Vertical fluted columns
    const fluteCount = 8 + Math.floor(rng() * 6);
    const fluteW = TEX_SIZE / fluteCount;
    for (let f = 0; f < fluteCount; f++) {
        const l = 10 + rng() * 5;
        ctx.fillStyle = `hsl(${baseH}, 15%, ${l}%)`;
        ctx.fillRect(f * fluteW + 1, 0, fluteW - 2, TEX_SIZE);
    }

    // Ornamental horizontal bands
    const bandColor = `hsl(${40 + rng() * 10}, 60%, 45%)`;
    for (let b = 0; b < 3; b++) {
        const y = (b + 1) * (TEX_SIZE / 4);
        ctx.fillStyle = bandColor;
        ctx.fillRect(0, y - 2, TEX_SIZE, 4);

        // Chevron/zigzag pattern in band
        ctx.strokeStyle = bandColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < TEX_SIZE; x += 12) {
            ctx.moveTo(x, y - 6);
            ctx.lineTo(x + 6, y - 10);
            ctx.lineTo(x + 12, y - 6);
        }
        ctx.stroke();
    }

    // Windows between bands
    for (let b = 0; b < 4; b++) {
        const bandY = b * (TEX_SIZE / 4) + 15;
        const bandH = TEX_SIZE / 4 - 30;
        for (let f = 0; f < fluteCount; f++) {
            if (rng() < 0.3) continue;
            const lit = rng() < 0.5;
            ctx.fillStyle = lit
                ? `hsl(${40 + rng() * 15}, 55%, ${40 + rng() * 25}%)`
                : `hsl(${baseH}, 15%, ${4 + rng() * 4}%)`;
            ctx.fillRect(f * fluteW + 3, bandY, fluteW - 6, bandH);
        }
    }

    return canvasToTexture(c);
}

function facadeAbandoned(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dirty dark base
    ctx.fillStyle = `hsl(${20 + rng() * 20}, 8%, ${10 + rng() * 5}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Heavy noise/grime
    for (let i = 0; i < 2000; i++) {
        const x = rng() * TEX_SIZE;
        const y = rng() * TEX_SIZE;
        ctx.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.08})`;
        ctx.fillRect(x, y, 1 + rng() * 6, 1 + rng() * 6);
    }

    // Stains/drip marks
    for (let i = 0; i < 5; i++) {
        const x = rng() * TEX_SIZE;
        const w = 4 + rng() * 15;
        const startY = rng() * TEX_SIZE * 0.3;
        const grad = ctx.createLinearGradient(x, startY, x, TEX_SIZE);
        grad.addColorStop(0, `rgba(0,0,0,${0.1 + rng() * 0.15})`);
        grad.addColorStop(0.5, `rgba(0,0,0,${0.05 + rng() * 0.1})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - w / 2, startY, w, TEX_SIZE - startY);
    }

    // Sparse, mostly dark windows
    const cols = 4 + Math.floor(rng() * 3);
    const rows = 5 + Math.floor(rng() * 4);
    const gapX = TEX_SIZE / cols;
    const gapY = TEX_SIZE / rows;
    for (let r3 = 0; r3 < rows; r3++) {
        for (let c2 = 0; c2 < cols; c2++) {
            if (rng() < 0.4) continue; // missing windows
            const broken = rng() < 0.3;
            const lit = !broken && rng() < 0.15;
            ctx.fillStyle = lit
                ? `hsl(${30 + rng() * 15}, 40%, ${30 + rng() * 15}%)`
                : `hsl(220, 5%, ${2 + rng() * 3}%)`;
            ctx.fillRect(c2 * gapX + 4, r3 * gapY + 4, gapX - 8, gapY - 8);

            // Boarded-up effect
            if (broken) {
                ctx.strokeStyle = `hsl(30, 15%, ${18 + rng() * 8}%)`;
                ctx.lineWidth = 2;
                const wx = c2 * gapX + 4;
                const wy = r3 * gapY + 4;
                ctx.beginPath();
                ctx.moveTo(wx, wy);
                ctx.lineTo(wx + gapX - 8, wy + gapY - 8);
                ctx.moveTo(wx + gapX - 8, wy);
                ctx.lineTo(wx, wy + gapY - 8);
                ctx.stroke();
            }
        }
    }

    return canvasToTexture(c);
}

/* ── Ground Texture Generators ── */

function groundWetConcrete(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dark concrete
    ctx.fillStyle = `hsl(230, 8%, ${16 + rng() * 4}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Concrete noise
    for (let i = 0; i < 1500; i++) {
        const x = rng() * TEX_SIZE;
        const y = rng() * TEX_SIZE;
        const bright = rng() < 0.5;
        ctx.fillStyle = `rgba(${bright ? 100 : 0},${bright ? 95 : 0},${bright ? 110 : 0},${0.03 + rng() * 0.05})`;
        ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
    }

    // Puddle patches — subtle darker wet spots
    const puddleCount = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < puddleCount; i++) {
        const px = rng() * TEX_SIZE;
        const py = rng() * TEX_SIZE;
        const pr = 15 + rng() * 35;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, 'rgba(100,120,160,0.15)');
        grad.addColorStop(0.6, 'rgba(60,70,100,0.1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }

    // Cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    const crackCount = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < crackCount; i++) {
        ctx.beginPath();
        let x = rng() * TEX_SIZE;
        let y = rng() * TEX_SIZE;
        ctx.moveTo(x, y);
        const segs = 4 + Math.floor(rng() * 6);
        for (let s = 0; s < segs; s++) {
            x += (rng() - 0.5) * 40;
            y += (rng() - 0.5) * 40;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Tile lines (sidewalk grid)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    const tileSize = 32 + Math.floor(rng() * 32);
    for (let x = 0; x < TEX_SIZE; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TEX_SIZE); ctx.stroke();
    }
    for (let y = 0; y < TEX_SIZE; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TEX_SIZE, y); ctx.stroke();
    }

    return canvasToTexture(c);
}

function groundMetalGrate(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dark metallic
    ctx.fillStyle = `hsl(210, 6%, ${10 + rng() * 4}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Diamond grate pattern
    const spacing = 10 + Math.floor(rng() * 6);
    ctx.strokeStyle = `hsl(210, 4%, ${20 + rng() * 6}%)`;
    ctx.lineWidth = 1.5;
    for (let x = -TEX_SIZE; x < TEX_SIZE * 2; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + TEX_SIZE, TEX_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + TEX_SIZE, 0);
        ctx.lineTo(x, TEX_SIZE);
        ctx.stroke();
    }

    return canvasToTexture(c);
}

/* ── Road Texture Generators ── */

function roadAsphalt(seed) {
    const c = createCanvas();
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);

    // Dark asphalt base
    ctx.fillStyle = `hsl(0, 0%, ${10 + rng() * 4}%)`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Asphalt grain
    for (let i = 0; i < 3000; i++) {
        const x = rng() * TEX_SIZE;
        const y = rng() * TEX_SIZE;
        const l = rng() * 20;
        ctx.fillStyle = `rgba(${l},${l},${l},${0.1 + rng() * 0.15})`;
        ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
    }

    // Tar patches
    const patchCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < patchCount; i++) {
        const px = rng() * TEX_SIZE;
        const py = rng() * TEX_SIZE;
        const pw = 20 + rng() * 40;
        const ph = 15 + rng() * 30;
        ctx.fillStyle = `hsl(0, 0%, ${6 + rng() * 4}%)`;
        ctx.fillRect(px, py, pw, ph);
    }

    // Subtle wear marks
    for (let i = 0; i < 3; i++) {
        const y = rng() * TEX_SIZE;
        ctx.fillStyle = `rgba(80,80,80,${0.03 + rng() * 0.04})`;
        ctx.fillRect(0, y, TEX_SIZE, 8 + rng() * 15);
    }

    return canvasToTexture(c);
}

/* ── Public API ── */

const FACADE_GENERATORS = [
    facadeCorporateGlass,
    facadeResidential,
    facadeIndustrial,
    facadeNeonAccent,
    facadeBrutalist,
    facadeLEDMatrix,
    facadeArtDeco,
    facadeAbandoned,
];

export class ProceduralTextures {
    constructor() {
        this._cache = new Map();
    }

    /**
     * Get a procedural building facade texture.
     * @param {number} seed - Deterministic seed
     * @param {object} palette - Active color palette (optional)
     * @returns {Texture}
     */
    getFacade(seed, palette) {
        const idx = Math.abs(Math.floor(seed * 10000)) % FACADE_GENERATORS.length;
        const cacheKey = `facade_${idx}_${Math.floor(seed * 1000)}`;
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

        const tex = FACADE_GENERATORS[idx](Math.floor(seed * 99999), palette);
        this._cache.set(cacheKey, tex);
        return tex;
    }

    /**
     * Get a procedural ground texture.
     * @param {number} seed - Deterministic seed
     * @returns {Texture}
     */
    getGround(seed) {
        const variant = Math.abs(Math.floor(seed * 10000)) % 2;
        const cacheKey = `ground_${variant}_${Math.floor(seed * 100)}`;
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

        const gen = variant === 0 ? groundWetConcrete : groundMetalGrate;
        const tex = gen(Math.floor(seed * 99999));
        this._cache.set(cacheKey, tex);
        return tex;
    }

    /**
     * Get a procedural road texture.
     * @param {number} seed - Deterministic seed
     * @returns {Texture}
     */
    getRoad(seed) {
        const cacheKey = `road_${Math.floor(seed * 100)}`;
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

        const tex = roadAsphalt(Math.floor(seed * 99999));
        this._cache.set(cacheKey, tex);
        return tex;
    }

    dispose() {
        for (const [, tex] of this._cache) {
            tex.dispose();
        }
        this._cache.clear();
    }
}
