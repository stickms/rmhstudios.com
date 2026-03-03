/**
 * Athora — Room Engine (PixiJS v8)
 *
 * Main game loop, input handling, camera, and rendering orchestration
 * for the 2.5D isometric room view.
 */

import * as PIXI from "pixi.js";
import { getDepth } from "./IsometricUtils";
import { CollisionGrid } from "./CollisionGrid";
import { TilesetRenderer } from "./TilesetRenderer";
import { generateTemplateTileMap } from "./TemplateTileMaps";
import {
  compositeAvatarSpriteSheet,
  DIRECTIONS,
  FRAMES_PER_DIR,
  FRAME_W,
  FRAME_H,
} from "./SpriteCompositor";
import type { Socket } from "socket.io-client";
import type {
  RoomStatePayload,
  RoomUserPayload,
  StandPayload,
  ConversationPayload,
  CurrentUser,
  RoomConfig,
  AthoraDirection,
  TileMapData,
} from "@/types/athora";

const MOVE_SPEED = 3;
const PROXIMITY_RADIUS = 150;
const INTERPOLATION_SPEED = 0.2;
const EMIT_THROTTLE_MS = 66; // ~15fps
const WALK_ANIM_SPEED = 0.12; // frames per tick

interface RemoteAvatar {
  container: PIXI.Container;
  nameTag: PIXI.Text;
  statusDot: PIXI.Graphics;
  sprite: PIXI.Sprite | null;
  frameTextures: Map<string, PIXI.Texture[]> | null; // direction -> frame textures
  worldX: number;
  worldY: number;
  targetX: number;
  targetY: number;
  facing: string;
  userId: string;
  animFrame: number;
  isMoving: boolean;
}

interface StandDisplay {
  container: PIXI.Container;
  data: StandPayload;
}

interface ConversationDisplay {
  container: PIXI.Container;
  data: ConversationPayload;
  pulsePhase: number;
}

interface EngineConfig {
  canvas: HTMLCanvasElement;
  socket: Socket;
  currentUser: CurrentUser;
  onAvatarClick: (userId: string) => void;
  onStandClick: (standId: string) => void;
  onEmptyClick: (worldX: number, worldY: number) => void;
  onMyPositionChange?: (x: number, y: number, facing: string) => void;
}

const AVAILABILITY_COLORS: Record<string, number> = {
  OPEN_TO_CHAT: 0x22c55e,
  BROWSING: 0x3b82f6,
  IN_MEETING: 0xef4444,
  PITCHING: 0xf59e0b,
  DO_NOT_DISTURB: 0xef4444,
  AFK: 0x6b7280,
};

export class RoomEngine {
  private app: PIXI.Application;
  private worldContainer: PIXI.Container;
  private avatars: Map<string, RemoteAvatar> = new Map();
  private stands: Map<string, StandDisplay> = new Map();
  private conversations: Map<string, ConversationDisplay> = new Map();
  private collisionGrid!: CollisionGrid;
  private tilesetRenderer: TilesetRenderer;
  private socket: Socket;
  private currentUser: CurrentUser;
  private config: EngineConfig;

  private myWorldX = 400;
  private myWorldY = 300;
  private myFacing: AthoraDirection = "SOUTH";
  private moveTarget: { x: number; y: number } | null = null;
  private keysDown: Set<string> = new Set();
  private camera = { x: 0, y: 0, zoom: 1 };
  private lastEmit = 0;
  private boundUpdate: () => void;
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private _placementMode = false;
  private placementPreview: PIXI.Graphics | null = null;
  private mouseMoveHandler: ((e: PointerEvent) => void) | null = null;

  private constructor(config: EngineConfig) {
    this.socket = config.socket;
    this.currentUser = config.currentUser;
    this.config = config;
    this.tilesetRenderer = new TilesetRenderer();
    this.app = new PIXI.Application();
    this.worldContainer = new PIXI.Container();
    this.boundUpdate = this.update.bind(this);
    this.keydownHandler = (e: KeyboardEvent) =>
      this.keysDown.add(e.key.toLowerCase());
    this.keyupHandler = (e: KeyboardEvent) =>
      this.keysDown.delete(e.key.toLowerCase());
  }

  static async create(config: EngineConfig): Promise<RoomEngine> {
    const engine = new RoomEngine(config);
    const parent = config.canvas.parentElement!;

    await engine.app.init({
      canvas: config.canvas,
      resizeTo: parent,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    engine.worldContainer.sortableChildren = true;
    engine.app.stage.addChild(engine.worldContainer);

    engine.setupInput(config.canvas);
    engine.app.ticker.add(engine.boundUpdate);

    window.addEventListener("keydown", engine.keydownHandler);
    window.addEventListener("keyup", engine.keyupHandler);

    return engine;
  }

  // ── INITIALIZATION ─────────────────────────────────────────────

  loadRoomState(state: RoomStatePayload): void {
    this.collisionGrid = new CollisionGrid(
      state.room.mapWidth,
      state.room.mapHeight,
      32
    );

    this.drawFloor(state.room);

    for (const stand of state.stands) {
      this.addStand(stand);
    }

    for (const user of state.users) {
      this.addAvatar(user);
    }

    for (const conv of state.conversations) {
      this.addConversationBubble(conv);
    }

    this.myWorldX = state.myPosition.x;
    this.myWorldY = state.myPosition.y;
    this.centerCameraOn(this.myWorldX, this.myWorldY);
  }

  // ── FLOOR RENDERING ────────────────────────────────────────────

  private drawFloor(room: RoomConfig): void {
    const tileMapData: TileMapData | null =
      room.tileMapData ??
      generateTemplateTileMap(room.template, room.mapWidth, room.mapHeight);

    if (tileMapData) {
      this.tilesetRenderer
        .renderTileMap(tileMapData)
        .then((floorContainer) => {
          this.worldContainer.addChildAt(floorContainer, 0);
        })
        .catch(() => {
          this.drawProceduralFloor(room);
        });
    } else {
      this.drawProceduralFloor(room);
    }
  }

  private drawProceduralFloor(room: RoomConfig): void {
    const floor = new PIXI.Container();
    floor.zIndex = -1000;

    const gridCols = Math.ceil(room.mapWidth / 64);
    const gridRows = Math.ceil(room.mapHeight / 64);

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const tile = new PIXI.Graphics();
        const color = (row + col) % 2 === 0 ? 0x2a2a4a : 0x252545;
        tile
          .rect(col * 64, row * 64, 64, 64)
          .fill(color);
        tile
          .rect(col * 64, row * 64, 64, 64)
          .stroke({ width: 1, color: 0x3a3a5a, alpha: 0.15 });
        floor.addChild(tile);
      }
    }

    this.worldContainer.addChild(floor);
  }

  // ── AVATAR MANAGEMENT ──────────────────────────────────────────

  addAvatar(userData: RoomUserPayload): void {
    const container = new PIXI.Container();
    container.x = userData.x;
    container.y = userData.y;
    container.zIndex = getDepth(userData.x, userData.y);
    container.interactive = true;
    container.cursor =
      userData.id === this.currentUser.id ? "default" : "pointer";

    const isMe = userData.id === this.currentUser.id;

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 28, 22, 8).fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(shadow);

    // Placeholder body circle (shown until sprite loads)
    const body = new PIXI.Graphics();
    body.circle(0, 0, 16).fill(isMe ? 0x818cf8 : 0x6366f1);
    container.addChild(body);

    if (!userData.image) {
      const initial = new PIXI.Text({
        text: (userData.name?.[0] || "?").toUpperCase(),
        style: {
          fontSize: 14,
          fill: 0xffffff,
          fontWeight: "bold",
          fontFamily: "Inter, Arial, sans-serif",
        },
      });
      initial.anchor.set(0.5);
      container.addChild(initial);
    }

    // Highlight ring for own avatar
    if (isMe) {
      const ring = new PIXI.Graphics();
      ring.circle(0, 0, 20).stroke({ width: 2, color: 0x818cf8, alpha: 0.6 });
      container.addChildAt(ring, 0);
    }

    // Name tag
    const nameTag = new PIXI.Text({
      text: userData.name || "Unknown",
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 10,
        fill: isMe ? 0x818cf8 : 0xffffff,
        align: "center",
        dropShadow: {
          alpha: 0.8,
          angle: Math.PI / 4,
          blur: 2,
          color: 0x000000,
          distance: 1,
        },
      },
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.y = 32;
    container.addChild(nameTag);

    // Status dot
    const statusDot = new PIXI.Graphics();
    const dotColor = AVAILABILITY_COLORS[userData.availability] || 0x6b7280;
    statusDot.circle(26, -22, 5).fill(dotColor);
    statusDot
      .circle(26, -22, 5)
      .stroke({ width: 1.5, color: 0xffffff });
    container.addChild(statusDot);

    this.worldContainer.addChild(container);

    const avatar: RemoteAvatar = {
      container,
      nameTag,
      statusDot,
      sprite: null,
      frameTextures: null,
      worldX: userData.x,
      worldY: userData.y,
      targetX: userData.x,
      targetY: userData.y,
      facing: userData.facing,
      userId: userData.id,
      animFrame: 0,
      isMoving: false,
    };
    this.avatars.set(userData.id, avatar);

    // Load animated sprite asynchronously
    const avatarConfig = userData.avatarConfig as {
      bodyVariant?: string;
      bodyColor?: string;
      accessoryIds?: string[];
    } | null;

    compositeAvatarSpriteSheet({
      profileImageUrl: userData.image || "",
      bodyVariant: avatarConfig?.bodyVariant || "default",
      bodyColor: avatarConfig?.bodyColor,
      accessoryIds: avatarConfig?.accessoryIds,
    })
      .then((sheetCanvas) => {
        // Avatar might have been removed while loading
        if (!this.avatars.has(userData.id)) return;

        const baseTexture = PIXI.Texture.from(sheetCanvas);
        const frameTextures = new Map<string, PIXI.Texture[]>();

        for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
          const dir = DIRECTIONS[dirIdx];
          const frames: PIXI.Texture[] = [];
          for (let f = 0; f < FRAMES_PER_DIR; f++) {
            const frame = new PIXI.Texture({
              source: baseTexture.source,
              frame: new PIXI.Rectangle(
                f * FRAME_W,
                dirIdx * FRAME_H,
                FRAME_W,
                FRAME_H
              ),
            });
            frames.push(frame);
          }
          frameTextures.set(dir, frames);
        }

        // Create sprite showing idle south frame
        const idleFrames = frameTextures.get("SOUTH")!;
        const sprite = new PIXI.Sprite(idleFrames[4]); // frame 4 = idle
        sprite.anchor.set(0.5, 0.75); // anchor near feet
        sprite.scale.set(1.1); // scale to fit world scale, large enough to see

        // Remove placeholder body/initial
        const toRemove: PIXI.Container[] = [];
        for (const child of container.children) {
          if (child instanceof PIXI.Graphics && child !== shadow && child !== statusDot) {
            // Keep shadow, status dot, and ring (ring is at index 0 for own avatar)
            if (isMe && container.getChildIndex(child) === 0) continue;
            toRemove.push(child);
          }
          if (child instanceof PIXI.Text && child !== nameTag) {
            toRemove.push(child);
          }
        }
        for (const child of toRemove) {
          container.removeChild(child);
          child.destroy();
        }

        container.addChildAt(sprite, isMe ? 2 : 1); // after shadow (and ring for own avatar)

        avatar.sprite = sprite;
        avatar.frameTextures = frameTextures;
        this.updateSpriteFrame(avatar);
      })
      .catch(() => {
        // Sprite load failed — keep the placeholder circle
      });
  }

  private updateSpriteFrame(avatar: RemoteAvatar): void {
    if (!avatar.sprite || !avatar.frameTextures) return;

    // Map 4-direction facing to 8-direction
    const dir = avatar.facing;
    const frames = avatar.frameTextures.get(dir) || avatar.frameTextures.get("SOUTH")!;

    if (avatar.isMoving) {
      const frameIdx = Math.floor(avatar.animFrame) % 4; // frames 0-3 are walk
      avatar.sprite.texture = frames[frameIdx];
    } else {
      avatar.sprite.texture = frames[4]; // frame 4 = idle
    }
  }

  updateAvatarStatus(userId: string, availability: string): void {
    const avatar = this.avatars.get(userId);
    if (!avatar) return;

    const color = AVAILABILITY_COLORS[availability] || 0x6b7280;
    avatar.statusDot.clear();
    avatar.statusDot.circle(26, -22, 5).fill(color);
    avatar.statusDot.circle(26, -22, 5).stroke({ width: 1.5, color: 0xffffff });
  }

  removeAvatar(userId: string): void {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      this.worldContainer.removeChild(avatar.container);
      avatar.container.destroy({ children: true });
      this.avatars.delete(userId);
    }
  }

  moveRemoteAvatar(
    userId: string,
    x: number,
    y: number,
    facing: string
  ): void {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      avatar.targetX = x;
      avatar.targetY = y;
      avatar.facing = facing;
      this.updateSpriteFrame(avatar);
    }
  }

  // ── STAND MANAGEMENT ───────────────────────────────────────────

  addStand(standData: StandPayload): void {
    const container = new PIXI.Container();
    container.x = standData.posX;
    container.y = standData.posY;
    container.zIndex = getDepth(standData.posX, standData.posY);
    container.interactive = true;
    container.cursor = "pointer";

    const bgColor = (standData.style as any)?.bgColor
      ? parseInt(
          String((standData.style as any).bgColor).replace("#", ""),
          16
        )
      : 0x1e1b4b;
    const borderColor = (standData.style as any)?.borderColor
      ? parseInt(
          String((standData.style as any).borderColor).replace("#", ""),
          16
        )
      : 0x6366f1;

    const booth = new PIXI.Graphics();
    booth
      .roundRect(
        -standData.width / 2,
        -standData.height / 2,
        standData.width,
        standData.height,
        8
      )
      .fill({ color: bgColor, alpha: 0.85 });
    booth
      .roundRect(
        -standData.width / 2,
        -standData.height / 2,
        standData.width,
        standData.height,
        8
      )
      .stroke({ width: 2, color: borderColor, alpha: 0.8 });
    container.addChild(booth);

    // Load and display logo image if available
    if (standData.logoUrl) {
      const logoSize = Math.min(standData.width, standData.height) * 0.45;
      PIXI.Assets.load(standData.logoUrl)
        .then((texture: PIXI.Texture) => {
          // Check if stand is still rendered (may have been removed)
          if (!this.stands.has(standData.id) && !container.parent) return;

          const logoSprite = new PIXI.Sprite(texture);
          logoSprite.anchor.set(0.5);
          logoSprite.y = -standData.height * 0.12;

          // Fit the image within a square area
          const scale = logoSize / Math.max(texture.width, texture.height);
          logoSprite.width = texture.width * scale;
          logoSprite.height = texture.height * scale;

          // Round corners with a mask
          const mask = new PIXI.Graphics();
          mask.roundRect(
            -logoSprite.width / 2,
            -logoSprite.width / 2 + logoSprite.y,
            logoSprite.width,
            logoSprite.height,
            6
          ).fill({ color: 0xffffff });
          mask.y = 0;
          container.addChild(mask);
          logoSprite.mask = mask;

          container.addChild(logoSprite);
        })
        .catch(() => {
          // Silently fail if logo can't be loaded
        });
    }

    // Position text below logo if logo exists, otherwise centered
    const hasLogo = !!standData.logoUrl;
    const titleY = hasLogo ? standData.height * 0.25 : -10;

    const title = new PIXI.Text({
      text: standData.title,
      style: {
        fontSize: 11,
        fill: 0xffffff,
        fontFamily: "Inter, Arial, sans-serif",
        fontWeight: "bold",
        wordWrap: true,
        wordWrapWidth: standData.width - 20,
        align: "center",
      },
    });
    title.anchor.set(0.5);
    title.y = titleY;
    container.addChild(title);

    if (standData.tagline) {
      const tagline = new PIXI.Text({
        text: standData.tagline,
        style: {
          fontSize: 9,
          fill: 0xd1d5db,
          wordWrap: true,
          wordWrapWidth: standData.width - 20,
          align: "center",
        },
      });
      tagline.anchor.set(0.5);
      tagline.y = titleY + 16;
      container.addChild(tagline);
    }

    this.collisionGrid?.blockRect(
      standData.posX - standData.width / 2,
      standData.posY - standData.height / 2,
      standData.width,
      standData.height
    );

    container.hitArea = new PIXI.Rectangle(
      -standData.width / 2,
      -standData.height / 2,
      standData.width,
      standData.height
    );

    this.worldContainer.addChild(container);
    this.stands.set(standData.id, { container, data: standData });
  }

  moveStand(standId: string, newX: number, newY: number): void {
    const stand = this.stands.get(standId);
    if (!stand) return;

    // Unblock old position
    this.collisionGrid?.unblockRect(
      stand.data.posX - stand.data.width / 2,
      stand.data.posY - stand.data.height / 2,
      stand.data.width,
      stand.data.height
    );

    // Update position
    stand.data.posX = newX;
    stand.data.posY = newY;
    stand.container.x = newX;
    stand.container.y = newY;
    stand.container.zIndex = getDepth(newX, newY);

    // Block new position
    this.collisionGrid?.blockRect(
      newX - stand.data.width / 2,
      newY - stand.data.height / 2,
      stand.data.width,
      stand.data.height
    );
  }

  updateStand(standData: StandPayload): void {
    const existing = this.stands.get(standData.id);
    if (existing) {
      // Remove old stand display
      this.collisionGrid?.unblockRect(
        existing.data.posX - existing.data.width / 2,
        existing.data.posY - existing.data.height / 2,
        existing.data.width,
        existing.data.height
      );
      this.worldContainer.removeChild(existing.container);
      existing.container.destroy({ children: true });
      this.stands.delete(standData.id);
    }
    // Re-add with updated data
    this.addStand(standData);
  }

  // ── CONVERSATION BUBBLES ───────────────────────────────────────

  addConversationBubble(convData: ConversationPayload): void {
    const container = new PIXI.Container();
    container.x = convData.anchorX;
    container.y = convData.anchorY;
    container.zIndex = getDepth(convData.anchorX, convData.anchorY) - 0.5;
    container.interactive = true;
    container.cursor = "pointer";

    const radius = 40 + convData.members.length * 15;
    const bubble = new PIXI.Graphics();
    bubble
      .ellipse(0, 0, radius, radius * 0.6)
      .fill({ color: 0x7c3aed, alpha: 0.08 });
    bubble
      .ellipse(0, 0, radius, radius * 0.6)
      .stroke({ width: 2, color: 0x7c3aed, alpha: 0.3 });
    container.addChild(bubble);

    if (convData.topic) {
      const topicLabel = new PIXI.Text({
        text: convData.topic,
        style: {
          fontSize: 10,
          fill: 0xc4b5fd,
          fontFamily: "Inter, Arial, sans-serif",
          fontWeight: "600",
        },
      });
      topicLabel.anchor.set(0.5);
      topicLabel.y = -radius * 0.6 - 12;
      container.addChild(topicLabel);
    }

    if (convData.isOpen) {
      const joinHint = new PIXI.Text({
        text: "Open \u2014 click to join",
        style: {
          fontSize: 8,
          fill: 0x86efac,
        },
      });
      joinHint.anchor.set(0.5);
      joinHint.y = -radius * 0.6 - 2;
      container.addChild(joinHint);
    }

    const countLabel = new PIXI.Text({
      text: `${convData.members.length} people`,
      style: {
        fontSize: 10,
        fill: 0xa78bfa,
      },
    });
    countLabel.anchor.set(0.5);
    countLabel.y = radius * 0.6 + 4;
    container.addChild(countLabel);

    this.worldContainer.addChild(container);
    this.conversations.set(convData.id, {
      container,
      data: convData,
      pulsePhase: 0,
    });
  }

  removeConversation(convId: string): void {
    const conv = this.conversations.get(convId);
    if (conv) {
      this.worldContainer.removeChild(conv.container);
      conv.container.destroy({ children: true });
      this.conversations.delete(convId);
    }
  }

  // ── INPUT ──────────────────────────────────────────────────────

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const worldX = (screenX - this.camera.x) / this.camera.zoom;
      const worldY = (screenY - this.camera.y) / this.camera.zoom;

      // In placement mode, intercept ALL clicks — place the stand only
      if (this._placementMode) {
        this.config.onEmptyClick(worldX, worldY);
        return;
      }

      for (const [uid, avatar] of this.avatars) {
        if (uid === this.currentUser.id) continue;
        const dx = worldX - avatar.worldX;
        const dy = worldY - avatar.worldY;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 32) {
          this.config.onAvatarClick(uid);
          return;
        }
      }

      for (const [sid, stand] of this.stands) {
        const dx = worldX - stand.data.posX;
        const dy = worldY - stand.data.posY;
        if (
          Math.abs(dx) < stand.data.width / 2 &&
          Math.abs(dy) < stand.data.height / 2
        ) {
          this.config.onStandClick(sid);
          return;
        }
      }

      if (!this.collisionGrid.isBlocked(worldX, worldY)) {
        this.moveTarget = { x: worldX, y: worldY };
      }
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        this.camera.zoom = Math.max(
          0.5,
          Math.min(2, this.camera.zoom + zoomDelta)
        );
        this.applyCamera();
      },
      { passive: false }
    );
  }

  // ── GAME LOOP ──────────────────────────────────────────────────

  private update(): void {
    let dx = 0;
    let dy = 0;

    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) dy -= 1;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) dy += 1;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) dx -= 1;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) dx += 1;

    // Normalize diagonal movement so speed is consistent
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / len) * MOVE_SPEED;
      dy = (dy / len) * MOVE_SPEED;
    } else {
      dx *= MOVE_SPEED;
      dy *= MOVE_SPEED;
    }

    if (this.moveTarget && dx === 0 && dy === 0) {
      const tdx = this.moveTarget.x - this.myWorldX;
      const tdy = this.moveTarget.y - this.myWorldY;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);

      if (dist < 5) {
        this.moveTarget = null;
      } else {
        dx = (tdx / dist) * MOVE_SPEED;
        dy = (tdy / dist) * MOVE_SPEED;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const newX = this.myWorldX + dx;
      const newY = this.myWorldY + dy;

      if (!this.collisionGrid.isBlocked(newX, newY)) {
        this.myFacing = this.getFacing(dx, dy);
        this.myWorldX = newX;
        this.myWorldY = newY;

        const myAvatar = this.avatars.get(this.currentUser.id);
        if (myAvatar) {
          myAvatar.container.x = newX;
          myAvatar.container.y = newY;
          myAvatar.container.zIndex = getDepth(newX, newY);
          myAvatar.worldX = newX;
          myAvatar.worldY = newY;
          myAvatar.facing = this.myFacing;
          myAvatar.isMoving = true;
          myAvatar.animFrame += WALK_ANIM_SPEED;
          this.updateSpriteFrame(myAvatar);
        }

        this.emitMovement(newX, newY, this.myFacing);
        this.centerCameraOn(newX, newY);
      }
    } else {
      // Not moving — set own avatar to idle
      const myAvatar = this.avatars.get(this.currentUser.id);
      if (myAvatar && myAvatar.isMoving) {
        myAvatar.isMoving = false;
        myAvatar.animFrame = 0;
        this.updateSpriteFrame(myAvatar);
      }
    }

    for (const [uid, avatar] of this.avatars) {
      if (uid === this.currentUser.id) continue;

      const adx = avatar.targetX - avatar.worldX;
      const ady = avatar.targetY - avatar.worldY;
      const dist = Math.sqrt(adx * adx + ady * ady);

      if (dist > 1) {
        avatar.worldX += adx * INTERPOLATION_SPEED;
        avatar.worldY += ady * INTERPOLATION_SPEED;
        avatar.container.x = avatar.worldX;
        avatar.container.y = avatar.worldY;
        avatar.container.zIndex = getDepth(avatar.worldX, avatar.worldY);
        avatar.isMoving = true;
        avatar.animFrame += WALK_ANIM_SPEED;
        this.updateSpriteFrame(avatar);
      } else if (avatar.isMoving) {
        avatar.isMoving = false;
        avatar.animFrame = 0;
        this.updateSpriteFrame(avatar);
      }
    }

    for (const [, conv] of this.conversations) {
      conv.pulsePhase += 0.02;
      const scale = 1 + Math.sin(conv.pulsePhase) * 0.02;
      conv.container.scale.set(scale);
    }
  }

  private emitMovement(x: number, y: number, facing: AthoraDirection): void {
    const now = Date.now();
    if (now - this.lastEmit < EMIT_THROTTLE_MS) return;
    this.lastEmit = now;

    this.socket.emit("athora:room:move", {
      roomId: this.currentUser.currentRoomId,
      x,
      y,
      facing,
    });

    this.config.onMyPositionChange?.(x, y, facing);
  }

  private getFacing(dx: number, dy: number): AthoraDirection {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // If both axes have significant input, use diagonal directions
    if (absDx > 0.1 && absDy > 0.1) {
      if (dy < 0 && dx > 0) return "NORTHEAST";
      if (dy < 0 && dx < 0) return "NORTHWEST";
      if (dy > 0 && dx > 0) return "SOUTHEAST";
      return "SOUTHWEST";
    }

    // Cardinal directions
    if (absDx > absDy) {
      return dx > 0 ? "EAST" : "WEST";
    }
    return dy > 0 ? "SOUTH" : "NORTH";
  }

  private centerCameraOn(wx: number, wy: number): void {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    this.camera.x = screenW / 2 - wx * this.camera.zoom;
    this.camera.y = screenH / 2 - wy * this.camera.zoom;
    this.applyCamera();
  }

  private applyCamera(): void {
    this.worldContainer.x = this.camera.x;
    this.worldContainer.y = this.camera.y;
    this.worldContainer.scale.set(this.camera.zoom);
  }

  // ── PROXIMITY DETECTION ────────────────────────────────────────

  getNearbyUsers(): string[] {
    const nearby: string[] = [];
    for (const [uid, avatar] of this.avatars) {
      if (uid === this.currentUser.id) continue;
      const dist = Math.sqrt(
        (this.myWorldX - avatar.worldX) ** 2 +
          (this.myWorldY - avatar.worldY) ** 2
      );
      if (dist <= PROXIMITY_RADIUS) {
        nearby.push(uid);
      }
    }
    return nearby;
  }

  getMyPosition(): { x: number; y: number } {
    return { x: this.myWorldX, y: this.myWorldY };
  }

  setPlacementMode(enabled: boolean): void {
    this._placementMode = enabled;

    if (enabled) {
      // Create a green outline preview that follows the cursor
      const preview = new PIXI.Graphics();
      const w = 200; // default stand width
      const h = 150; // default stand height
      preview
        .roundRect(-w / 2, -h / 2, w, h, 8)
        .stroke({ width: 2, color: 0x22c55e, alpha: 0.9 });
      preview
        .roundRect(-w / 2, -h / 2, w, h, 8)
        .fill({ color: 0x22c55e, alpha: 0.12 });
      preview.zIndex = 99999;
      preview.visible = false;
      this.worldContainer.addChild(preview);
      this.placementPreview = preview;

      // Track pointer movement to position the preview
      const canvas = this.config.canvas;
      this.mouseMoveHandler = (e: PointerEvent) => {
        if (!this.placementPreview) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - this.camera.x) / this.camera.zoom;
        const worldY = (screenY - this.camera.y) / this.camera.zoom;
        this.placementPreview.x = worldX;
        this.placementPreview.y = worldY;
        this.placementPreview.visible = true;
      };
      canvas.addEventListener("pointermove", this.mouseMoveHandler);
    } else {
      // Remove preview
      if (this.placementPreview) {
        this.worldContainer.removeChild(this.placementPreview);
        this.placementPreview.destroy();
        this.placementPreview = null;
      }
      if (this.mouseMoveHandler) {
        this.config.canvas.removeEventListener("pointermove", this.mouseMoveHandler);
        this.mouseMoveHandler = null;
      }
    }
  }

  // ── CLEANUP ────────────────────────────────────────────────────

  destroy(): void {
    // Clean up placement mode if active
    this.setPlacementMode(false);
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("keyup", this.keyupHandler);
    this.app.ticker?.remove(this.boundUpdate);
    this.avatars.forEach((a) => a.container.destroy({ children: true }));
    this.stands.forEach((s) => s.container.destroy({ children: true }));
    this.conversations.forEach((c) =>
      c.container.destroy({ children: true })
    );
    this.tilesetRenderer.destroy();
    // Pass false to keep the canvas element alive (React owns it)
    this.app.destroy(false);
  }
}
