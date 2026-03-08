// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Texture Manager (Layer 1)
   Loads pre-generated StreamDiffusion textures
   with graceful fallback to procedural materials
   ═══════════════════════════════════════════ */

import { TextureLoader, RepeatWrapping, LinearMipMapLinearFilter, LinearFilter, SRGBColorSpace, Vector2 } from 'three';

const TEXTURE_BASE = '/textures/velum2099/';

const TEXTURE_MANIFEST = {
    facades: [
        'buildings/facade_a.png',
        'buildings/facade_b.png',
        'buildings/facade_c.png',
        'buildings/facade_d.png',
    ],
    road: 'roads/road_atlas.png',
    roadWet: 'roads/road_wet.png',
    billboard: 'billboards/billboard_atlas.png',
    ground: 'ground/ground_tile.png',
    window: 'windows/window_atlas.png',
};

// Billboard atlas: 4 columns × 2 rows = 8 cells
const BILLBOARD_COLS = 4;
const BILLBOARD_ROWS = 2;

// Window atlas: 8 columns × 8 rows = 64 cells
const WINDOW_COLS = 8;
const WINDOW_ROWS = 8;

export class TextureManager {
    constructor() {
        this.loader = new TextureLoader();
        this.textures = {
            facades: [],
            road: null,
            roadWet: null,
            billboard: null,
            ground: null,
            window: null,
        };
        this._loaded = false;
    }

    /**
     * Load all textures from public/textures/.
     * Returns a promise that resolves when all textures are loaded (or failed gracefully).
     */
    async loadAll() {
        const promises = [];

        // Load facades
        for (const path of TEXTURE_MANIFEST.facades) {
            promises.push(
                this._loadTexture(TEXTURE_BASE + path, { wrapS: true, wrapT: true })
                    .then(tex => { if (tex) this.textures.facades.push(tex); })
            );
        }

        // Load tileable textures
        for (const key of ['road', 'roadWet', 'ground', 'window']) {
            promises.push(
                this._loadTexture(TEXTURE_BASE + TEXTURE_MANIFEST[key], { wrapS: true, wrapT: true })
                    .then(tex => { this.textures[key] = tex; })
            );
        }

        // Load billboard atlas (clamped, not repeating)
        promises.push(
            this._loadTexture(TEXTURE_BASE + TEXTURE_MANIFEST.billboard, { wrapS: false, wrapT: false })
                .then(tex => { this.textures.billboard = tex; })
        );

        await Promise.all(promises);
        this._loaded = true;

        const loaded = this.textures.facades.length
            + (this.textures.road ? 1 : 0)
            + (this.textures.roadWet ? 1 : 0)
            + (this.textures.billboard ? 1 : 0)
            + (this.textures.ground ? 1 : 0)
            + (this.textures.window ? 1 : 0);

        console.log(`[TextureManager] Loaded ${loaded}/9 textures`);
    }

    /**
     * Get a deterministic facade texture based on seed.
     * Returns null if no facades loaded (caller should use procedural fallback).
     */
    getRandomFacade(seed) {
        if (this.textures.facades.length === 0) return null;
        const idx = Math.abs(Math.floor(seed * 1000)) % this.textures.facades.length;
        return this.textures.facades[idx];
    }

    /** Get road texture (or null for fallback). */
    getRoadTexture() {
        return this.textures.road;
    }

    /** Get ground texture (or null for fallback). */
    getGroundTexture() {
        return this.textures.ground;
    }

    /** Get billboard atlas texture (or null for fallback). */
    getBillboardTexture() {
        return this.textures.billboard;
    }

    /**
     * Get UV offset/repeat for a billboard atlas cell.
     * @param {number} cellIdx - Cell index (0-7)
     * @returns {{ offset: Vector2, repeat: Vector2 }}
     */
    getBillboardUVs(cellIdx) {
        const col = cellIdx % BILLBOARD_COLS;
        const row = Math.floor(cellIdx / BILLBOARD_COLS) % BILLBOARD_ROWS;
        return {
            offset: new Vector2(col / BILLBOARD_COLS, 1 - (row + 1) / BILLBOARD_ROWS),
            repeat: new Vector2(1 / BILLBOARD_COLS, 1 / BILLBOARD_ROWS),
        };
    }

    /**
     * Get UV offset/repeat for a window atlas cell.
     * @param {number} cellIdx - Cell index (0-63)
     * @returns {{ offset: Vector2, repeat: Vector2 }}
     */
    getWindowUVs(cellIdx) {
        const col = cellIdx % WINDOW_COLS;
        const row = Math.floor(cellIdx / WINDOW_COLS) % WINDOW_ROWS;
        return {
            offset: new Vector2(col / WINDOW_COLS, 1 - (row + 1) / WINDOW_ROWS),
            repeat: new Vector2(1 / WINDOW_COLS, 1 / WINDOW_ROWS),
        };
    }

    // ── Internal ──

    _loadTexture(path, { wrapS = false, wrapT = false } = {}) {
        return new Promise((resolve) => {
            this.loader.load(
                path,
                (texture) => {
                    if (wrapS) {
                        texture.wrapS = RepeatWrapping;
                    }
                    if (wrapT) {
                        texture.wrapT = RepeatWrapping;
                    }
                    texture.minFilter = LinearMipMapLinearFilter;
                    texture.magFilter = LinearFilter;
                    texture.generateMipmaps = true;
                    texture.colorSpace = SRGBColorSpace;
                    resolve(texture);
                },
                undefined,
                (err) => {
                    console.warn(`[TextureManager] Failed to load ${path}:`, err?.message || err);
                    resolve(null);
                }
            );
        });
    }
}
