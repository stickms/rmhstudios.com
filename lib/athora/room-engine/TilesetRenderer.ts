/**
 * Athora — Tileset Renderer
 *
 * Loads a tileset spritesheet and renders tile-based floors/terrain
 * into PixiJS containers. Supports multiple layers for ground, paths,
 * and decoration overlays.
 */

import * as PIXI from "pixi.js";
import type { TileMapData, TileMapLayer, TilesetDef } from "@/types/athora";

interface LoadedTileset {
  texture: PIXI.BaseTexture;
  tileSize: number;
  cols: number;
  rows: number;
  tileTextures: Map<number, PIXI.Texture>;
}

export class TilesetRenderer {
  private tilesetCache: Map<string, LoadedTileset> = new Map();

  /**
   * Load a tileset image and pre-slice it into individual tile textures.
   */
  async loadTileset(def: TilesetDef): Promise<LoadedTileset> {
    const cached = this.tilesetCache.get(def.src);
    if (cached) return cached;

    const baseTex = await new Promise<PIXI.BaseTexture>((resolve, reject) => {
      const tex = PIXI.BaseTexture.from(`/assets/athora/${def.src}`, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });

      if (tex.valid) {
        resolve(tex);
        return;
      }

      tex.once("loaded", () => resolve(tex));
      tex.once("error", () => reject(new Error(`Failed to load tileset: ${def.src}`)));
    });

    const tileTextures = new Map<number, PIXI.Texture>();
    const totalTiles = def.cols * def.rows;

    for (let i = 0; i < totalTiles; i++) {
      const col = i % def.cols;
      const row = Math.floor(i / def.cols);
      const rect = new PIXI.Rectangle(
        col * def.tileSize,
        row * def.tileSize,
        def.tileSize,
        def.tileSize
      );
      tileTextures.set(i, new PIXI.Texture(baseTex, rect));
    }

    const loaded: LoadedTileset = {
      texture: baseTex,
      tileSize: def.tileSize,
      cols: def.cols,
      rows: def.rows,
      tileTextures,
    };

    this.tilesetCache.set(def.src, loaded);
    return loaded;
  }

  /**
   * Render a complete tilemap (all layers) into a PIXI.Container.
   * Returns the container ready to be added to the world.
   */
  async renderTileMap(data: TileMapData): Promise<PIXI.Container> {
    const tileset = await this.loadTileset(data.tileset);
    const container = new PIXI.Container();
    container.zIndex = -1000;

    const scale = data.renderSize / data.tileset.tileSize;

    for (let layerIdx = 0; layerIdx < data.layers.length; layerIdx++) {
      const layer = data.layers[layerIdx];
      const layerContainer = this.renderLayer(tileset, layer, scale, data.renderSize);
      layerContainer.zIndex = -1000 + (layer.zOffset ?? layerIdx);
      container.addChild(layerContainer);
    }

    return container;
  }

  /**
   * Render a single tile layer.
   */
  private renderLayer(
    tileset: LoadedTileset,
    layer: TileMapLayer,
    scale: number,
    renderSize: number
  ): PIXI.Container {
    const layerContainer = new PIXI.Container();

    for (let row = 0; row < layer.tiles.length; row++) {
      const tileRow = layer.tiles[row];
      for (let col = 0; col < tileRow.length; col++) {
        const tileIdx = tileRow[col];
        if (tileIdx < 0) continue; // empty tile

        const texture = tileset.tileTextures.get(tileIdx);
        if (!texture) continue;

        const sprite = new PIXI.Sprite(texture);
        sprite.x = col * renderSize;
        sprite.y = row * renderSize;
        sprite.scale.set(scale);
        layerContainer.addChild(sprite);
      }
    }

    return layerContainer;
  }

  destroy(): void {
    this.tilesetCache.clear();
  }
}
