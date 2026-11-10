/**
 * Optional external-asset pipeline for Dream Rift.
 *
 * If `public/dream-rift/manifest.json` exists, the game loads the sprite sheets
 * and music tracks it points at and uses them in place of the built-in
 * procedural art/synth. If the manifest (or any individual asset) is missing,
 * the game silently falls back to the procedural versions — so dropping in real
 * art is purely additive and never breaks the game.
 *
 * Only commit assets whose license permits redistribution (CC0, or CC-BY with
 * attribution recorded in public/dream-rift/CREDITS.md). See the README there.
 */

import type { PlayerId } from './types';

export interface SpriteSheetDef {
    url: string;
    frameW: number;
    frameH: number;
    /** Frame indices (into the row-major sheet) for each animation. */
    idle: number[];
    left: number[];
    right: number[];
}

export interface BossSheetDef {
    url: string;
    frameW: number;
    frameH: number;
    frames: number[];
}

export interface AssetManifest {
    music?: Partial<Record<string, string>>;
    sprites?: {
        players?: Partial<Record<PlayerId, SpriteSheetDef>>;
        bosses?: Partial<Record<string, BossSheetDef>>;
    };
}

export interface LoadedSheet<T> {
    image: HTMLImageElement;
    def: T;
}

export interface LoadedSpriteAssets {
    players: Partial<Record<PlayerId, LoadedSheet<SpriteSheetDef>>>;
    bosses: Record<string, LoadedSheet<BossSheetDef>>;
}

const MANIFEST_URL = '/dream-rift/manifest.json';

let cached: Promise<AssetManifest | null> | null = null;

/** Fetch the manifest once; returns null if absent or invalid (→ procedural). */
export function loadManifest(): Promise<AssetManifest | null> {
    if (cached) return cached;
    cached = (async () => {
        if (typeof fetch === 'undefined') return null;
        try {
            const res = await fetch(MANIFEST_URL, { cache: 'force-cache' });
            if (!res.ok) return null;
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('json')) return null;
            return (await res.json()) as AssetManifest;
        } catch {
            return null;
        }
    })();
    return cached;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined') return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/** Load any sprite sheets named in the manifest. Missing ones are skipped. */
export async function loadSpriteAssets(manifest: AssetManifest | null): Promise<LoadedSpriteAssets> {
    const out: LoadedSpriteAssets = { players: {}, bosses: {} };
    if (!manifest?.sprites) return out;
    const players = manifest.sprites.players ?? {};
    for (const id of Object.keys(players) as PlayerId[]) {
        const def = players[id]!;
        const image = await loadImage(def.url);
        if (image) out.players[id] = { image, def };
    }
    const bosses = manifest.sprites.bosses ?? {};
    for (const key of Object.keys(bosses)) {
        const def = bosses[key]!;
        const image = await loadImage(def.url);
        if (image) out.bosses[key] = { image, def };
    }
    return out;
}
