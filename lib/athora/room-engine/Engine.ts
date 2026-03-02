/**
 * Athora — Room Engine (PixiJS)
 *
 * Main game loop, input handling, camera, and rendering orchestration
 * for the 2.5D isometric room view.
 */

import * as PIXI from "pixi.js";
import { getDepth } from "./IsometricUtils";
import { CollisionGrid } from "./CollisionGrid";
import type { Socket } from "socket.io-client";
import type {
  RoomStatePayload,
  RoomUserPayload,
  StandPayload,
  ConversationPayload,
  CurrentUser,
  RoomConfig,
  AthoraDirection,
} from "@/types/athora";

const MOVE_SPEED = 3;
const PROXIMITY_RADIUS = 150;
const INTERPOLATION_SPEED = 0.2;
const EMIT_THROTTLE_MS = 66; // ~15fps

interface RemoteAvatar {
  container: PIXI.Container;
  nameTag: PIXI.Text;
  statusDot: PIXI.Graphics;
  worldX: number;
  worldY: number;
  targetX: number;
  targetY: number;
  facing: string;
  userId: string;
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

  constructor(config: EngineConfig) {
    this.socket = config.socket;
    this.currentUser = config.currentUser;
    this.config = config;

    const parent = config.canvas.parentElement!;

    this.app = new PIXI.Application({
      view: config.canvas,
      width: parent.clientWidth,
      height: parent.clientHeight,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.worldContainer = new PIXI.Container();
    this.worldContainer.sortableChildren = true;
    this.app.stage.addChild(this.worldContainer);

    this.setupInput(config.canvas);

    this.boundUpdate = this.update.bind(this);
    this.app.ticker.add(this.boundUpdate);

    // Keyboard handlers stored for cleanup
    this.keydownHandler = (e: KeyboardEvent) =>
      this.keysDown.add(e.key.toLowerCase());
    this.keyupHandler = (e: KeyboardEvent) =>
      this.keysDown.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("keyup", this.keyupHandler);
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
    const floor = new PIXI.Container();
    floor.zIndex = -1000;

    // Draw isometric grid
    const gridCols = Math.ceil(room.mapWidth / 64);
    const gridRows = Math.ceil(room.mapHeight / 64);

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const tile = new PIXI.Graphics();
        const color = (row + col) % 2 === 0 ? 0x2a2a4a : 0x252545;
        tile.beginFill(color);
        tile.drawRect(col * 64, row * 64, 64, 64);
        tile.endFill();
        tile.lineStyle(1, 0x3a3a5a, 0.15);
        tile.drawRect(col * 64, row * 64, 64, 64);
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

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.3);
    shadow.drawEllipse(0, 20, 16, 6);
    shadow.endFill();
    container.addChild(shadow);

    // Body (placeholder circle - replaced by sprite compositor when available)
    const isMe = userData.id === this.currentUser.id;
    const body = new PIXI.Graphics();
    body.beginFill(isMe ? 0x818cf8 : 0x6366f1);
    body.drawCircle(0, 0, 16);
    body.endFill();

    // Profile image circle
    if (userData.image) {
      try {
        const texture = PIXI.Texture.from(userData.image);
        const profileSprite = new PIXI.Sprite(texture);
        profileSprite.width = 28;
        profileSprite.height = 28;
        profileSprite.anchor.set(0.5);

        // Create circular mask
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawCircle(0, 0, 14);
        mask.endFill();
        profileSprite.mask = mask;

        container.addChild(mask);
        container.addChild(profileSprite);
      } catch {
        container.addChild(body);
      }
    } else {
      container.addChild(body);

      // Initial letter
      const initial = new PIXI.Text(
        (userData.name?.[0] || "?").toUpperCase(),
        {
          fontSize: 14,
          fill: 0xffffff,
          fontWeight: "bold",
          fontFamily: "Inter, Arial, sans-serif",
        }
      );
      initial.anchor.set(0.5);
      container.addChild(initial);
    }

    // Highlight ring for own avatar
    if (isMe) {
      const ring = new PIXI.Graphics();
      ring.lineStyle(2, 0x818cf8, 0.6);
      ring.drawCircle(0, 0, 20);
      container.addChildAt(ring, 0);
    }

    // Name tag
    const nameTag = new PIXI.Text(userData.name || "Unknown", {
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
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.y = 24;
    container.addChild(nameTag);

    // Status dot
    const statusDot = new PIXI.Graphics();
    const dotColor = AVAILABILITY_COLORS[userData.availability] || 0x6b7280;
    statusDot.beginFill(dotColor);
    statusDot.drawCircle(18, -14, 4);
    statusDot.endFill();
    statusDot.lineStyle(1.5, 0xffffff);
    statusDot.drawCircle(18, -14, 4);
    container.addChild(statusDot);

    this.worldContainer.addChild(container);

    this.avatars.set(userData.id, {
      container,
      nameTag,
      statusDot,
      worldX: userData.x,
      worldY: userData.y,
      targetX: userData.x,
      targetY: userData.y,
      facing: userData.facing,
      userId: userData.id,
    });
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

    // Booth background
    const booth = new PIXI.Graphics();
    const bgColor = (standData.style as any)?.bgColor
      ? parseInt(String((standData.style as any).bgColor).replace("#", ""), 16)
      : 0x1e1b4b;
    const borderColor = (standData.style as any)?.borderColor
      ? parseInt(
          String((standData.style as any).borderColor).replace("#", ""),
          16
        )
      : 0x6366f1;

    booth.beginFill(bgColor, 0.85);
    booth.lineStyle(2, borderColor, 0.8);
    booth.drawRoundedRect(
      -standData.width / 2,
      -standData.height / 2,
      standData.width,
      standData.height,
      8
    );
    booth.endFill();
    container.addChild(booth);

    // Title
    const title = new PIXI.Text(standData.title, {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: "bold",
      wordWrap: true,
      wordWrapWidth: standData.width - 20,
      align: "center",
    });
    title.anchor.set(0.5);
    title.y = -10;
    container.addChild(title);

    // Tagline
    if (standData.tagline) {
      const tagline = new PIXI.Text(standData.tagline, {
        fontSize: 9,
        fill: 0xd1d5db,
        wordWrap: true,
        wordWrapWidth: standData.width - 20,
        align: "center",
      });
      tagline.anchor.set(0.5);
      tagline.y = 6;
      container.addChild(tagline);
    }

    // Block stand area in collision grid
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
    bubble.beginFill(0x7c3aed, 0.08);
    bubble.lineStyle(2, 0x7c3aed, 0.3);
    bubble.drawEllipse(0, 0, radius, radius * 0.6);
    bubble.endFill();
    container.addChild(bubble);

    if (convData.topic) {
      const topicLabel = new PIXI.Text(convData.topic, {
        fontSize: 10,
        fill: 0xc4b5fd,
        fontFamily: "Inter, Arial, sans-serif",
        fontWeight: "600",
      });
      topicLabel.anchor.set(0.5);
      topicLabel.y = -radius * 0.6 - 12;
      container.addChild(topicLabel);
    }

    if (convData.isOpen) {
      const joinHint = new PIXI.Text("Open — click to join", {
        fontSize: 8,
        fill: 0x86efac,
      });
      joinHint.anchor.set(0.5);
      joinHint.y = -radius * 0.6 - 2;
      container.addChild(joinHint);
    }

    const countLabel = new PIXI.Text(`${convData.members.length} people`, {
      fontSize: 10,
      fill: 0xa78bfa,
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

      // Check avatar clicks
      for (const [uid, avatar] of this.avatars) {
        if (uid === this.currentUser.id) continue;
        const dx = worldX - avatar.worldX;
        const dy = worldY - avatar.worldY;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 32) {
          this.config.onAvatarClick(uid);
          return;
        }
      }

      // Check stand clicks
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

      // Click-to-move
      if (!this.collisionGrid.isBlocked(worldX, worldY)) {
        this.moveTarget = { x: worldX, y: worldY };
      }
    });

    // Mouse wheel zoom
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

    // Keyboard movement
    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) dy -= MOVE_SPEED;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown"))
      dy += MOVE_SPEED;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft"))
      dx -= MOVE_SPEED;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright"))
      dx += MOVE_SPEED;

    // Click-to-move
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

        // Update own avatar position
        const myAvatar = this.avatars.get(this.currentUser.id);
        if (myAvatar) {
          myAvatar.container.x = newX;
          myAvatar.container.y = newY;
          myAvatar.container.zIndex = getDepth(newX, newY);
          myAvatar.worldX = newX;
          myAvatar.worldY = newY;
        }

        this.emitMovement(newX, newY, this.myFacing);
        this.centerCameraOn(newX, newY);
      }
    }

    // Interpolate remote avatars
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
      }
    }

    // Pulse conversation bubbles
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
  }

  private getFacing(dx: number, dy: number): AthoraDirection {
    if (Math.abs(dx) > Math.abs(dy)) {
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

  // ── CLEANUP ────────────────────────────────────────────────────

  destroy(): void {
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("keyup", this.keyupHandler);
    this.app.ticker.remove(this.boundUpdate);
    this.avatars.forEach((a) => a.container.destroy({ children: true }));
    this.stands.forEach((s) => s.container.destroy({ children: true }));
    this.conversations.forEach((c) =>
      c.container.destroy({ children: true })
    );
    this.app.destroy(true);
  }
}
