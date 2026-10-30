/**
 * What a multiplayer game on the shared engine tells the client loop (./tf2-client.ts): its maps and
 * their modes, its asset tree, its movement, the prediction world and how the predicted player is set
 * from its records, the models to preload, its entity renderables and view model, and its HUD.
 *
 * TF2's is here (TF2_PROFILE). Another game supplies its own: CS:GO's lives in lib/csgo-game/client
 * and is loaded only when a CS:GO session starts, so TF2's bundle never carries it.
 *
 * Browser only (it hands the client renderer hooks), but nothing here touches the DOM.
 */

import type { Matrix4 } from 'three';
import type { Vec3 } from '../core/vec';
import { CLASS_DATA } from '../data/classes';
import { findTf2Map } from '../data/maps';
import type { GameId } from '../assets/versions';
import type { RoomGame, RoomMode } from '../net/events';
import type { MatchOptions } from '../server/match-host';
import { classEyeHeight } from '../sim/class-speeds';
import { TF_MOVE_PARAMS } from '../sim/movement';
import type { MoveParams } from '../sim/movement-types';
import type { NetRecord } from '../sim/net-schema';
import type { Player } from '../sim/player';
import { GameWorld, type GameWorldInit } from '../sim/world';
import type { EffectSystem, EntityRenderable, EntityState, RenderContext } from '../render/entities';
import type { WebGLRenderer } from 'three';
import type { SourceCamera } from '../render/camera';
import type { HudState } from './hud-state';
import { restorePlayerFromRecords } from './net/prediction';

/** A map a game publishes, and the mode a match on it plays. */
export interface ProfileMap {
  name: string;
  title: string;
  mode: RoomMode;
}

/** What a game's HUD part reads: the server clock, the newest records by schema type, our own. */
export interface HudDecorateContext {
  serverTime: number;
  /** Every entity record of a schema type in the newest snapshot. */
  entities(type: string): NetRecord[];
  /** Our player's record (owner view: private fields included), and our weapons by slot. */
  me: NetRecord | null;
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>;
}

/** The first-person view's game-specific parts, each frame. */
export interface ProfileView {
  /** The zoomed FOV (0: not zoomed) and how fast the view moves to it (TF2's sniper rifle, CS:GO's scopes). */
  zoomFov: number;
  zoomRate: number;
  /** Extra view punch to add to the movement's (CS:GO's aim punch × view_recoil_tracking). */
  punch?: Vec3;
  /** Whether the view model hides (scoped). */
  hideViewModel?: boolean;
}

/**
 * A game's own first-person view model (CS:GO's v_ models and arms). The client draws it after the
 * world; while a game has one, the shared TF2 view model stays hidden.
 */
export interface ProfileViewModel {
  update(p: Player | null, me: NetRecord | null, frame: { eyeOrigin: Vec3; eyeAngles: Vec3; velocity: Vec3; dt: number; visible: boolean }, ctx: RenderContext): void;
  render(renderer: WebGLRenderer, cam: SourceCamera): void;
  attachment(name: string, out: Matrix4): boolean;
  setFov(fov: number): void;
  dispose(): void;
}

export interface ClientGameProfile {
  readonly id: RoomGame;
  /** The asset tree its maps, models, particles and sounds come from. */
  readonly assets: GameId;
  /** The map, when published; `mode` asks for a mode the map can play (CS:GO's deathmatch on de_dust2). */
  findMap(name: string, mode?: RoomMode): ProfileMap | null;
  /** What `MatchOptions` say about the game (`game`, `variant`, `mode`). */
  matchOptions(map: ProfileMap): Pick<MatchOptions, 'mode'> & Partial<Pick<MatchOptions, 'game' | 'variant'>>;
  readonly moveParams: MoveParams;
  /** TF2's item schema (unlocks, cosmetics) is fetched and handed to the listen server. */
  readonly itemCatalog: boolean;
  /** Loads what the client's simulation needs before predicting (CS:GO: its module and weapon data). */
  prepare(): Promise<void>;
  /** Models every match shows (bodies and arms), preloaded so nobody pops in. */
  preloadModels(): readonly string[];
  /** The prediction world on the client (CS:GO's has CS players and rules). */
  createWorld(init: GameWorldInit, map: ProfileMap): GameWorld;
  /** Sets the predicted player from its authoritative records. */
  restorePlayer(player: Player, rec: NetRecord, weapons: ReadonlyArray<{ slot: number; record: NetRecord }>): void;
  /** Eye height of a player seen from its record (spectating, the dead). */
  eyeHeight(rec: NetRecord | null): number;
  /** The game's renderables, asked before the shared ones (null: TF2's). */
  readonly entityFactory?: (s: EntityState, fx: EffectSystem) => EntityRenderable | null;
  /** The game's own view model (null: TF2's). */
  createViewModel?(fx: EffectSystem): ProfileViewModel;
  /** Zoom and punch for the local player this frame. */
  view?(p: Player | null, me: NetRecord | null): ProfileView;
  /** Adds the game's part of the HUD to the shared state (CS:GO: money, the round, the bomb). */
  decorateHud?(state: HudState, p: Player | null, ctx: HudDecorateContext): void;
}

const num = (rec: NetRecord | null, k: string): number => (rec && typeof rec[k] === 'number' ? (rec[k] as number) : 0);

export const TF2_PROFILE: ClientGameProfile = {
  id: 'tf2',
  assets: 'tf2',
  findMap: (name) => {
    const m = findTf2Map(name);
    return m ? { name: m.name, title: m.title, mode: m.mode } : null;
  },
  matchOptions: (map) => ({ mode: map.mode as MatchOptions['mode'] }),
  moveParams: TF_MOVE_PARAMS,
  itemCatalog: true,
  prepare: async () => {},
  preloadModels: () => Object.values(CLASS_DATA).flatMap((c) => [c.model, c.handsModel]).filter(Boolean),
  createWorld: (init) => new GameWorld(init),
  restorePlayer: restorePlayerFromRecords,
  eyeHeight: (rec) => classEyeHeight(num(rec, 'cls')),
};

/** The profile of a game: TF2's here, another game's from its own module (loaded on demand). */
export async function loadClientProfile(game: RoomGame | undefined): Promise<ClientGameProfile> {
  if (game === 'csgo') return (await import('../../csgo-game/client/profile')).CSGO_PROFILE;
  return TF2_PROFILE;
}
