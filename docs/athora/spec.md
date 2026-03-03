# Spatial Networking Platform — Implementation Specification

> **Stack**: Next.js (App Router) · Prisma · PostgreSQL (+ PostGIS) · Tailwind CSS · Socket.IO · HTML5 Canvas  
> **Assumption**: Existing project with auth (NextAuth/Clerk/etc.), user model with `profileImageUrl`, and Tailwind already configured.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema (Prisma)](#2-database-schema-prisma)
3. [Real-Time Infrastructure](#3-real-time-infrastructure)
4. [World Map Layer](#4-world-map-layer)
5. [Room Engine (2.5D Canvas)](#5-room-engine-25d-canvas)
6. [Avatar System (Sprite + Profile Face)](#6-avatar-system-sprite--profile-face)
7. [Chat & Conversation System](#7-chat--conversation-system)
8. [Stands System](#8-stands-system)
9. [API Routes](#9-api-routes)
10. [Frontend Component Tree](#10-frontend-component-tree)
11. [State Management](#11-state-management)
12. [Moderation & Safety](#12-moderation--safety)
13. [Performance & Scaling](#13-performance--scaling)
14. [Deployment Checklist](#14-deployment-checklist)

---

## 1. Architecture Overview

### 1.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ World Map │  │  Room Canvas  │  │  UI Panels (Chat, Stand) │  │
│  │ (Leaflet) │  │ (HTML5 Canvas │  │  (React + Tailwind)      │  │
│  │           │  │  or PixiJS)   │  │                           │  │
│  └─────┬─────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│        │               │                        │                │
│        └───────────────┼────────────────────────┘                │
│                        │                                         │
│                  Socket.IO Client                                │
└────────────────────────┼─────────────────────────────────────────┘
                         │ WSS
┌────────────────────────┼─────────────────────────────────────────┐
│                  NEXT.JS SERVER                                  │
│  ┌─────────────────────┴──────────────────────┐                  │
│  │           Socket.IO Server (custom server   │                 │
│  │           or standalone sidecar)            │                 │
│  └─────────────────────┬──────────────────────┘                  │
│                        │                                         │
│  ┌──────────────┐ ┌────┴─────┐ ┌──────────┐ ┌────────────────┐  │
│  │ API Routes   │ │  Prisma  │ │  Redis   │ │  S3 / R2       │  │
│  │ /api/rooms   │ │  Client  │ │ (pubsub  │ │ (avatars,      │  │
│  │ /api/stands  │ │          │ │  + cache) │ │  stand assets) │  │
│  │ /api/map     │ │          │ │          │ │                │  │
│  └──────────────┘ └────┬─────┘ └──────────┘ └────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                 ┌────────┴────────┐
                 │   PostgreSQL    │
                 │   + PostGIS     │
                 └─────────────────┘
```

### 1.2 Key Technology Choices

| Concern | Technology | Rationale |
|---|---|---|
| World map | `react-leaflet` + OpenStreetMap tiles | Free, customizable, supports clustering |
| 2.5D room rendering | **PixiJS** (preferred) or raw HTML5 Canvas | GPU-accelerated 2D rendering, sprite support, great perf |
| Real-time sync | Socket.IO with Redis adapter | Room-scoped events, reconnection, scalable via Redis pub/sub |
| Spatial queries | PostGIS extension on PostgreSQL | Native `ST_DWithin`, spatial indexes for "rooms near me" |
| Asset storage | S3-compatible (AWS S3 / Cloudflare R2) | Profile pics, stand media, avatar spritesheets |
| Caching | Redis | Room state, online presence, map heatmap counters |

### 1.3 Directory Structure Addition

```
src/
├── app/
│   ├── map/
│   │   └── page.tsx                 # World map view (entry point)
│   ├── room/
│   │   └── [roomId]/
│   │       └── page.tsx             # Room canvas view
│   └── api/
│       ├── rooms/
│       │   ├── route.ts             # CRUD rooms
│       │   ├── [roomId]/
│       │   │   ├── route.ts         # Single room details
│       │   │   ├── join/route.ts    # Join room
│       │   │   └── leave/route.ts   # Leave room
│       ├── stands/
│       │   ├── route.ts             # CRUD stands
│       │   └── [standId]/route.ts
│       ├── conversations/
│       │   ├── route.ts             # Create conversation bubble
│       │   └── [convId]/
│       │       ├── invite/route.ts
│       │       └── messages/route.ts
│       └── map/
│           ├── rooms/route.ts       # Geo-query rooms for viewport
│           └── heatmap/route.ts     # Activity heatmap data
├── components/
│   ├── map/
│   │   ├── WorldMap.tsx
│   │   ├── RoomMarker.tsx
│   │   ├── RoomCluster.tsx
│   │   ├── HeatmapOverlay.tsx
│   │   └── MapFilters.tsx
│   ├── room/
│   │   ├── RoomCanvas.tsx           # Main PixiJS canvas wrapper
│   │   ├── AvatarSprite.ts          # PixiJS sprite class
│   │   ├── StandObject.ts           # PixiJS stand display
│   │   ├── ConversationBubble.ts    # Visual bubble around groups
│   │   ├── RoomHUD.tsx              # React overlay (minimap, status)
│   │   ├── ProximityIndicator.tsx
│   │   └── RoomToolbar.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ProximityChatOverlay.tsx  # Floating chat near avatars
│   │   └── ConversationRequestModal.tsx
│   ├── stands/
│   │   ├── StandEditor.tsx
│   │   ├── StandViewer.tsx
│   │   ├── StandCard.tsx
│   │   └── StandAnalytics.tsx
│   └── avatar/
│       ├── AvatarCustomizer.tsx
│       ├── SpritePreview.tsx
│       └── AvatarRenderer.ts        # Composites profile pic onto sprite
├── lib/
│   ├── socket.ts                    # Socket.IO client singleton
│   ├── room-engine/
│   │   ├── Engine.ts                # Game loop, input, camera
│   │   ├── Pathfinding.ts           # A* or simple grid movement
│   │   ├── IsometricUtils.ts        # Coordinate transforms
│   │   ├── SpriteCompositor.ts      # Generates avatar spritesheets
│   │   └── CollisionGrid.ts
│   ├── map/
│   │   ├── geoUtils.ts              # Viewport bounds → query
│   │   └── clusterUtils.ts
│   └── redis.ts                     # Redis client
├── server/
│   ├── socket-server.ts             # Socket.IO server setup
│   ├── handlers/
│   │   ├── roomHandler.ts           # Room join/leave/move events
│   │   ├── chatHandler.ts           # Message relay
│   │   ├── conversationHandler.ts   # Bubble lifecycle
│   │   └── standHandler.ts          # Stand interactions
│   └── middleware/
│       ├── socketAuth.ts            # Verify JWT/session on WS connect
│       └── rateLimiter.ts
└── prisma/
    ├── schema.prisma
    └── migrations/
```

---

## 2. Database Schema (Prisma)

### 2.1 Enable PostGIS

Before running migrations, enable PostGIS on your database:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2.2 Full Prisma Schema Additions

```prisma
// ============================================================
// EXISTING — extend your User model (do NOT replace)
// ============================================================
model User {
  id               String   @id @default(cuid())
  name             String?
  email            String   @unique
  profileImageUrl  String?  // Already exists in your auth setup

  // --- NEW FIELDS ---
  avatarConfig     Json?    // { bodyColor, accessoryIds, spriteSheetUrl }
  statusMessage    String?  @db.VarChar(140)
  availability     Availability @default(OPEN_TO_CHAT)
  interestTags     String[]    // ["AI/ML", "indie-games", "hiring"]
  passportVisits   Int      @default(0)  // total rooms visited counter

  // --- RELATIONS ---
  ownedRooms              Room[]              @relation("RoomOwner")
  roomMemberships         RoomMember[]
  stands                  Stand[]
  conversationMembers     ConversationMember[]
  sentMessages            Message[]
  businessCard            BusinessCard?
  sentJoinRequests        ConversationJoinRequest[] @relation("JoinRequester")
  receivedConnections     Connection[]         @relation("ConnectionReceiver")
  sentConnections         Connection[]         @relation("ConnectionSender")

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

enum Availability {
  OPEN_TO_CHAT
  BROWSING
  IN_MEETING
  PITCHING
  DO_NOT_DISTURB
  AFK
}

// ============================================================
// BUSINESS CARD
// ============================================================
model BusinessCard {
  id          String  @id @default(cuid())
  userId      String  @unique
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  headline    String  @db.VarChar(120)  // "Senior Engineer @ Acme"
  bio         String? @db.VarChar(500)
  company     String?
  role        String?
  websiteUrl  String?
  linkedinUrl String?
  twitterUrl  String?
  githubUrl   String?
  customLinks Json?   // [{ label, url }]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ============================================================
// CONNECTIONS (bidirectional networking)
// ============================================================
model Connection {
  id         String           @id @default(cuid())
  senderId   String
  receiverId String
  sender     User             @relation("ConnectionSender", fields: [senderId], references: [id])
  receiver   User             @relation("ConnectionReceiver", fields: [receiverId], references: [id])
  status     ConnectionStatus @default(PENDING)
  metInRoom  String?          // roomId where they met
  note       String?          @db.VarChar(300)

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([senderId, receiverId])
  @@index([receiverId])
}

enum ConnectionStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}

// ============================================================
// ROOMS
// ============================================================
model Room {
  id            String      @id @default(cuid())
  name          String      @db.VarChar(100)
  description   String?     @db.VarChar(500)
  slug          String      @unique  // URL-friendly identifier

  // --- GEOGRAPHY ---
  latitude      Float
  longitude     Float
  // PostGIS geography column managed via raw SQL migration:
  // ALTER TABLE "Room" ADD COLUMN location geography(Point, 4326);
  // CREATE INDEX room_location_idx ON "Room" USING GIST(location);
  address       String?     // Human-readable address
  city          String?
  country       String?

  // --- ROOM CONFIG ---
  ownerId       String
  owner         User        @relation("RoomOwner", fields: [ownerId], references: [id])
  category      RoomCategory @default(GENERAL)
  template      RoomTemplate @default(OPEN_FLOOR)
  capacity      Int          @default(50)
  accessType    RoomAccess   @default(PUBLIC)
  entryPassword String?      // hashed, for PRIVATE rooms
  mapWidth      Int          @default(1600)  // canvas pixels
  mapHeight     Int          @default(1200)
  tileMapData   Json?        // floor layout, obstacles, decoration positions
  backgroundUrl String?      // custom background image

  // --- STATE ---
  isActive      Boolean   @default(true)
  isPinned      Boolean   @default(false)  // sponsored / featured
  pinnedUntil   DateTime?
  currentCount  Int       @default(0)      // cached, updated by socket server

  // --- RELATIONS ---
  members       RoomMember[]
  stands        Stand[]
  conversations Conversation[]
  events        RoomEvent[]
  reports       RoomReport[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([latitude, longitude])
  @@index([category])
  @@index([city, country])
  @@index([isActive, currentCount(sort: Desc)])
}

enum RoomCategory {
  GENERAL
  TECH
  DESIGN
  BUSINESS
  HIRING
  GAMING
  MUSIC
  ART
  EDUCATION
  LOCAL
  SOCIAL
  CUSTOM
}

enum RoomTemplate {
  OPEN_FLOOR       // freeform space
  CONFERENCE       // stage + audience area
  TRADE_SHOW       // grid of stand slots
  LOUNGE           // scattered seating areas
  CLASSROOM        // rows facing a presenter
  CUSTOM           // fully user-defined tileMapData
}

enum RoomAccess {
  PUBLIC
  PRIVATE          // password required
  INVITE_ONLY      // whitelist
  EVENT_TICKET     // linked to RoomEvent with ticket
}

// ============================================================
// ROOM MEMBERSHIP (presence tracking)
// ============================================================
model RoomMember {
  id        String   @id @default(cuid())
  roomId    String
  userId    String
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // --- POSITION (updated frequently via socket, periodically persisted) ---
  posX      Float    @default(400)
  posY      Float    @default(300)
  facing    Direction @default(SOUTH)

  role      MemberRole @default(VISITOR)
  joinedAt  DateTime   @default(now())
  lastSeen  DateTime   @default(now())

  @@unique([roomId, userId])
  @@index([roomId])
}

enum MemberRole {
  VISITOR
  MODERATOR
  HOST
}

enum Direction {
  NORTH
  SOUTH
  EAST
  WEST
  NORTHEAST
  NORTHWEST
  SOUTHEAST
  SOUTHWEST
}

// ============================================================
// CONVERSATIONS (bubble groups within a room)
// ============================================================
model Conversation {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)

  topic       String?  @db.VarChar(100)  // visible tag on bubble
  isOpen      Boolean  @default(false)   // can people join without requesting?
  maxMembers  Int      @default(8)

  // Anchor position of the conversation bubble in the room
  anchorX     Float
  anchorY     Float

  members     ConversationMember[]
  messages    Message[]
  joinRequests ConversationJoinRequest[]

  startedAt   DateTime @default(now())
  endedAt     DateTime?  // null = active

  @@index([roomId, endedAt])
}

model ConversationMember {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  joinedAt       DateTime @default(now())
  leftAt         DateTime?

  @@unique([conversationId, userId])
}

model ConversationJoinRequest {
  id             String       @id @default(cuid())
  conversationId String
  requesterId    String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  requester      User         @relation("JoinRequester", fields: [requesterId], references: [id])

  status         JoinRequestStatus @default(PENDING)
  message        String?           @db.VarChar(200)  // "Hey, can I join?"

  createdAt      DateTime @default(now())
  respondedAt    DateTime?

  @@unique([conversationId, requesterId])
}

enum JoinRequestStatus {
  PENDING
  ACCEPTED
  DECLINED
}

// ============================================================
// MESSAGES
// ============================================================
model Message {
  id             String        @id @default(cuid())
  conversationId String?
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  senderId       String
  sender         User          @relation(fields: [senderId], references: [id])

  content        String        @db.VarChar(2000)
  type           MessageType   @default(TEXT)
  metadata       Json?         // { imageUrl, linkPreview, emoteId }

  // For proximity chat (no conversation bubble)
  isProximity    Boolean       @default(false)
  roomId         String?       // set for proximity messages

  createdAt      DateTime      @default(now())

  @@index([conversationId, createdAt])
  @@index([roomId, isProximity, createdAt])
}

enum MessageType {
  TEXT
  IMAGE
  LINK
  EMOTE
  SYSTEM   // "X joined the conversation"
}

// ============================================================
// STANDS
// ============================================================
model Stand {
  id          String    @id @default(cuid())
  ownerId     String
  owner       User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  roomId      String
  room        Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)

  // --- POSITION in room canvas ---
  posX        Float
  posY        Float
  width       Int       @default(200)  // canvas pixels
  height      Int       @default(150)

  // --- CONTENT ---
  title       String    @db.VarChar(100)
  tagline     String?   @db.VarChar(200)
  description String?   @db.VarChar(2000)
  category    String?
  logoUrl     String?
  websiteUrl  String?

  // --- MEDIA SLOTS ---
  media       StandMedia[]

  // --- CONFIGURATION ---
  tier        StandTier  @default(BASIC)
  style       Json?      // { bgColor, borderColor, fontFamily, layoutVariant }
  isActive    Boolean    @default(true)

  // --- LEAD CAPTURE (premium feature) ---
  leadCaptureEnabled Boolean @default(false)
  leadCaptureFields  Json?   // [{ field: "email", required: true }, ...]
  leads              StandLead[]

  // --- ANALYTICS (premium feature) ---
  totalViews     Int @default(0)
  uniqueVisitors Int @default(0)

  // --- QUEUE ---
  queueEnabled   Boolean @default(false)
  queueEntries   StandQueueEntry[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([roomId])
  @@index([ownerId])
}

enum StandTier {
  BASIC       // text + logo + 1 link
  STANDARD    // + images/video
  PREMIUM     // + iframe demos, lead capture, analytics
}

model StandMedia {
  id       String        @id @default(cuid())
  standId  String
  stand    Stand         @relation(fields: [standId], references: [id], onDelete: Cascade)

  type     StandMediaType
  url      String
  caption  String?       @db.VarChar(200)
  sortOrder Int          @default(0)

  @@index([standId])
}

enum StandMediaType {
  IMAGE
  VIDEO
  IFRAME       // embedded demo
  PDF
  LINK
}

model StandLead {
  id        String   @id @default(cuid())
  standId   String
  stand     Stand    @relation(fields: [standId], references: [id], onDelete: Cascade)
  data      Json     // { email, name, company, ... } based on configured fields
  collectedAt DateTime @default(now())

  @@index([standId])
}

model StandQueueEntry {
  id        String   @id @default(cuid())
  standId   String
  stand     Stand    @relation(fields: [standId], references: [id], onDelete: Cascade)
  userId    String
  position  Int
  status    QueueStatus @default(WAITING)
  joinedAt  DateTime    @default(now())

  @@index([standId, status])
}

enum QueueStatus {
  WAITING
  ACTIVE    // currently at the stand talking to owner
  COMPLETED
  LEFT
}

// ============================================================
// ROOM EVENTS (scheduled gatherings)
// ============================================================
model RoomEvent {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)

  title       String   @db.VarChar(200)
  description String?  @db.Text
  imageUrl    String?

  startsAt    DateTime
  endsAt      DateTime
  timezone    String   @default("UTC")

  isTicketed  Boolean  @default(false)
  ticketPrice Int?     // cents
  maxAttendees Int?

  createdAt   DateTime @default(now())

  @@index([roomId, startsAt])
  @@index([startsAt])
}

// ============================================================
// MODERATION
// ============================================================
model RoomReport {
  id          String      @id @default(cuid())
  roomId      String
  room        Room        @relation(fields: [roomId], references: [id], onDelete: Cascade)
  reporterId  String
  targetId    String?     // userId being reported, null if room-level
  reason      ReportReason
  details     String?     @db.VarChar(1000)
  status      ReportStatus @default(OPEN)
  resolvedAt  DateTime?

  createdAt   DateTime @default(now())

  @@index([roomId, status])
}

enum ReportReason {
  HARASSMENT
  SPAM
  INAPPROPRIATE_CONTENT
  IMPERSONATION
  SCAM
  OTHER
}

enum ReportStatus {
  OPEN
  REVIEWING
  RESOLVED
  DISMISSED
}
```

### 2.3 PostGIS Migration

After `npx prisma migrate dev`, run a manual SQL migration to add the geography column and spatial index:

```sql
-- migration: add_postgis_room_location

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS
  location geography(Point, 4326);

-- Populate from existing lat/lng
UPDATE "Room"
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL;

-- Spatial index
CREATE INDEX IF NOT EXISTS room_location_gist_idx
  ON "Room" USING GIST(location);

-- Trigger to keep location in sync with lat/lng on INSERT/UPDATE
CREATE OR REPLACE FUNCTION sync_room_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER room_location_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Room"
  FOR EACH ROW
  EXECUTE FUNCTION sync_room_location();
```

---

## 3. Real-Time Infrastructure

### 3.1 Socket.IO Server Setup

Since Next.js App Router doesn't natively support persistent WebSocket connections, use a **custom server** or a **sidecar process**.

**Option A: Custom `server.ts`** (recommended for simplicity)

```typescript
// server/socket-server.ts

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { verifySocketToken } from "./middleware/socketAuth";
import { registerRoomHandlers } from "./handlers/roomHandler";
import { registerChatHandlers } from "./handlers/chatHandler";
import { registerConversationHandlers } from "./handlers/conversationHandler";
import { registerStandHandlers } from "./handlers/standHandler";

const PORT = parseInt(process.env.SOCKET_PORT || "3001");

async function startSocketServer() {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // --- Redis Adapter (enables horizontal scaling) ---
  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO Redis adapter connected");
  }

  // --- Auth Middleware ---
  io.use(async (socket, next) => {
    try {
      const user = await verifySocketToken(socket.handshake.auth.token);
      socket.data.user = user; // { id, name, profileImageUrl }
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  // --- Connection Handler ---
  io.on("connection", (socket) => {
    console.log(`Connected: ${socket.data.user.name} (${socket.id})`);

    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerConversationHandlers(io, socket);
    registerStandHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log(`Disconnected: ${socket.data.user.name}`);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Socket.IO server running on port ${PORT}`);
  });
}

startSocketServer();
```

### 3.2 Socket Event Protocol

All events follow a namespace convention: `category:action`.

```typescript
// types/socket-events.ts

// ==================== CLIENT → SERVER ====================

interface ClientToServerEvents {
  // --- ROOM ---
  "room:join":        (data: { roomId: string }) => void;
  "room:leave":       (data: { roomId: string }) => void;
  "room:move":        (data: { roomId: string; x: number; y: number; facing: Direction }) => void;
  "room:status":      (data: { availability: Availability }) => void;

  // --- CHAT ---
  "chat:proximity":   (data: { roomId: string; content: string }) => void;
  "chat:conversation":(data: { conversationId: string; content: string; type?: MessageType }) => void;
  "chat:typing":      (data: { conversationId?: string; roomId?: string }) => void;

  // --- CONVERSATION BUBBLES ---
  "conversation:create":  (data: { roomId: string; topic?: string; isOpen?: boolean; targetUserId?: string }) => void;
  "conversation:invite":  (data: { conversationId: string; userId: string }) => void;
  "conversation:request": (data: { conversationId: string; message?: string }) => void;
  "conversation:respond": (data: { requestId: string; accept: boolean }) => void;
  "conversation:leave":   (data: { conversationId: string }) => void;

  // --- STANDS ---
  "stand:visit":      (data: { standId: string }) => void;
  "stand:leave":      (data: { standId: string }) => void;
  "stand:queue:join":  (data: { standId: string }) => void;
  "stand:queue:leave": (data: { standId: string }) => void;
}

// ==================== SERVER → CLIENT ====================

interface ServerToClientEvents {
  // --- ROOM ---
  "room:user_joined":   (data: RoomUserPayload) => void;
  "room:user_left":     (data: { userId: string }) => void;
  "room:user_moved":    (data: { userId: string; x: number; y: number; facing: Direction }) => void;
  "room:user_status":   (data: { userId: string; availability: Availability }) => void;
  "room:state":         (data: RoomStatePayload) => void;  // full state on join

  // --- CHAT ---
  "chat:proximity_msg": (data: ProximityMsgPayload) => void;
  "chat:conversation_msg": (data: ConversationMsgPayload) => void;
  "chat:typing":        (data: { userId: string; conversationId?: string }) => void;

  // --- CONVERSATION BUBBLES ---
  "conversation:created":    (data: ConversationPayload) => void;
  "conversation:user_joined":(data: { conversationId: string; user: UserBrief }) => void;
  "conversation:user_left":  (data: { conversationId: string; userId: string }) => void;
  "conversation:request_received": (data: JoinRequestPayload) => void;
  "conversation:request_response": (data: { requestId: string; accepted: boolean }) => void;
  "conversation:ended":      (data: { conversationId: string }) => void;

  // --- STANDS ---
  "stand:visitor_count": (data: { standId: string; count: number }) => void;
  "stand:queue_update":  (data: { standId: string; queue: QueueEntry[] }) => void;

  // --- ERRORS ---
  "error": (data: { code: string; message: string }) => void;
}
```

### 3.3 Room Handler Implementation

```typescript
// server/handlers/roomHandler.ts

import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Redis keys
const roomUsersKey   = (roomId: string) => `room:${roomId}:users`;
const roomStateKey   = (roomId: string) => `room:${roomId}:state`;
const userRoomKey    = (userId: string) => `user:${userId}:room`;

export function registerRoomHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  // ---- JOIN ROOM ----
  socket.on("room:join", async ({ roomId }) => {
    try {
      // 1. Verify room exists and has capacity
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { stands: true },
      });
      if (!room || !room.isActive) {
        return socket.emit("error", { code: "ROOM_NOT_FOUND", message: "Room does not exist" });
      }

      const currentCount = await redis.scard(roomUsersKey(roomId));
      if (currentCount >= room.capacity) {
        return socket.emit("error", { code: "ROOM_FULL", message: "Room is at capacity" });
      }

      // 2. Leave any previous room
      const prevRoom = await redis.get(userRoomKey(user.id));
      if (prevRoom) {
        await leaveRoom(io, socket, prevRoom);
      }

      // 3. Determine spawn position (entry point or random open area)
      const spawnX = 400 + Math.random() * 200;
      const spawnY = 600 + Math.random() * 100;

      // 4. Create/update membership record
      await prisma.roomMember.upsert({
        where: { roomId_userId: { roomId, userId: user.id } },
        create: { roomId, userId: user.id, posX: spawnX, posY: spawnY },
        update: { posX: spawnX, posY: spawnY, lastSeen: new Date() },
      });

      // 5. Track in Redis
      const userPayload = JSON.stringify({
        id: user.id,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
        avatarConfig: user.avatarConfig,
        x: spawnX,
        y: spawnY,
        facing: "SOUTH",
        availability: user.availability || "OPEN_TO_CHAT",
        interestTags: user.interestTags || [],
      });
      await redis.sadd(roomUsersKey(roomId), userPayload);
      await redis.set(userRoomKey(user.id), roomId);

      // 6. Join Socket.IO room
      socket.join(`room:${roomId}`);

      // 7. Get all current users in room for state sync
      const usersRaw = await redis.smembers(roomUsersKey(roomId));
      const users = usersRaw.map((u) => JSON.parse(u));

      // 8. Get active conversations
      const conversations = await prisma.conversation.findMany({
        where: { roomId, endedAt: null },
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, name: true, profileImageUrl: true } } },
          },
        },
      });

      // 9. Send full room state to joining user
      socket.emit("room:state", {
        room: {
          id: room.id,
          name: room.name,
          mapWidth: room.mapWidth,
          mapHeight: room.mapHeight,
          template: room.template,
          tileMapData: room.tileMapData,
          backgroundUrl: room.backgroundUrl,
        },
        users,
        stands: room.stands,
        conversations: conversations.map((c) => ({
          id: c.id,
          topic: c.topic,
          isOpen: c.isOpen,
          anchorX: c.anchorX,
          anchorY: c.anchorY,
          members: c.members.map((m) => m.user),
        })),
        myPosition: { x: spawnX, y: spawnY },
      });

      // 10. Notify others in room
      socket.to(`room:${roomId}`).emit("room:user_joined", {
        id: user.id,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
        avatarConfig: user.avatarConfig,
        x: spawnX,
        y: spawnY,
        facing: "SOUTH",
        availability: user.availability || "OPEN_TO_CHAT",
        interestTags: user.interestTags || [],
      });

      // 11. Update room count
      await prisma.room.update({
        where: { id: roomId },
        data: { currentCount: { increment: 1 } },
      });

      // 12. Increment passport
      await prisma.user.update({
        where: { id: user.id },
        data: { passportVisits: { increment: 1 } },
      });
    } catch (err) {
      console.error("room:join error", err);
      socket.emit("error", { code: "JOIN_FAILED", message: "Failed to join room" });
    }
  });

  // ---- MOVE ----
  socket.on("room:move", async ({ roomId, x, y, facing }) => {
    // Broadcast immediately (don't await DB write)
    socket.to(`room:${roomId}`).emit("room:user_moved", {
      userId: user.id, x, y, facing,
    });

    // Debounced DB persist (every ~2 seconds via a separate flush mechanism)
    // For now, update Redis state for reconnection
    // Production: use a position buffer that flushes periodically
  });

  // ---- LEAVE ----
  socket.on("room:leave", ({ roomId }) => leaveRoom(io, socket, roomId));
  socket.on("disconnect", async () => {
    const roomId = await redis.get(userRoomKey(user.id));
    if (roomId) await leaveRoom(io, socket, roomId);
  });
}

async function leaveRoom(io: Server, socket: Socket, roomId: string) {
  const user = socket.data.user;
  socket.leave(`room:${roomId}`);

  // Remove from Redis
  const usersRaw = await redis.smembers(roomUsersKey(roomId));
  for (const raw of usersRaw) {
    const parsed = JSON.parse(raw);
    if (parsed.id === user.id) {
      await redis.srem(roomUsersKey(roomId), raw);
      break;
    }
  }
  await redis.del(userRoomKey(user.id));

  // Notify others
  io.to(`room:${roomId}`).emit("room:user_left", { userId: user.id });

  // Update DB
  await prisma.room.update({
    where: { id: roomId },
    data: { currentCount: { decrement: 1 } },
  }).catch(() => {});

  await prisma.roomMember.updateMany({
    where: { roomId, userId: user.id },
    data: { lastSeen: new Date() },
  });
}
```

### 3.4 Position Batching Strategy

Moving avatars generate high-frequency events. Rather than writing every movement to the DB, use a **position buffer**:

```typescript
// server/positionBuffer.ts

// In-memory buffer: Map<`${roomId}:${userId}`, { x, y, facing, dirty }>
const positionBuffer = new Map<string, PositionEntry>();

// Flush to DB every 3 seconds
setInterval(async () => {
  const dirtyEntries = [...positionBuffer.entries()]
    .filter(([, v]) => v.dirty);

  if (dirtyEntries.length === 0) return;

  // Batch update using Prisma transaction
  await prisma.$transaction(
    dirtyEntries.map(([key, pos]) => {
      const [roomId, userId] = key.split(":");
      positionBuffer.set(key, { ...pos, dirty: false });
      return prisma.roomMember.updateMany({
        where: { roomId, userId },
        data: { posX: pos.x, posY: pos.y, facing: pos.facing, lastSeen: new Date() },
      });
    })
  );
}, 3000);
```

---

## 4. World Map Layer

### 4.1 Component: `WorldMap.tsx`

```tsx
// components/map/WorldMap.tsx

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RoomMarker } from "./RoomMarker";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { MapFilters } from "./MapFilters";
import type { RoomCategory } from "@prisma/client";

interface MapRoom {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  category: RoomCategory;
  currentCount: number;
  capacity: number;
  isPinned: boolean;
  owner: { name: string; profileImageUrl: string | null };
}

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default function WorldMap() {
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [filters, setFilters] = useState<{
    categories: RoomCategory[];
    minPeople: number;
    showEmpty: boolean;
  }>({
    categories: [],
    minPeople: 0,
    showEmpty: true,
  });
  const [showHeatmap, setShowHeatmap] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchRooms = useCallback(async (bounds: ViewportBounds, zoom: number) => {
    const params = new URLSearchParams({
      north: bounds.north.toString(),
      south: bounds.south.toString(),
      east: bounds.east.toString(),
      west: bounds.west.toString(),
      zoom: zoom.toString(),
      ...(filters.categories.length > 0 && {
        categories: filters.categories.join(","),
      }),
      ...(filters.minPeople > 0 && { minPeople: filters.minPeople.toString() }),
      ...(!filters.showEmpty && { hideEmpty: "true" }),
    });

    const res = await fetch(`/api/map/rooms?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRooms(data.rooms);
    }
  }, [filters]);

  return (
    <div className="relative h-screen w-full">
      {/* Filter bar */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        showHeatmap={showHeatmap}
        onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
        className="absolute top-4 left-4 z-[1000]"
      />

      {/* Create room button */}
      <button
        className="absolute bottom-6 right-6 z-[1000] rounded-full bg-indigo-600
                   px-6 py-3 text-white shadow-lg hover:bg-indigo-700
                   transition-colors font-medium"
      >
        + Create Room
      </button>

      <MapContainer
        center={[39.2904, -76.6122]} // Baltimore default (user's locale)
        zoom={4}
        className="h-full w-full"
        zoomControl={false}
        minZoom={2}
        maxZoom={18}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Room markers */}
        <MapEventHandler onViewportChange={fetchRooms} debounceRef={debounceRef} />

        {rooms.map((room) => (
          <RoomMarker key={room.id} room={room} />
        ))}

        {/* Optional heatmap layer */}
        {showHeatmap && <HeatmapOverlay />}
      </MapContainer>
    </div>
  );
}

// Hook component to listen for map viewport changes
function MapEventHandler({
  onViewportChange,
  debounceRef,
}: {
  onViewportChange: (bounds: ViewportBounds, zoom: number) => void;
  debounceRef: React.MutableRefObject<NodeJS.Timeout | undefined>;
}) {
  const map = useMapEvents({
    moveend: () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const bounds = map.getBounds();
        onViewportChange(
          {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          },
          map.getZoom()
        );
      }, 300);
    },
    zoomend: () => {
      // Same debounced fetch
      map.fire("moveend");
    },
  });

  // Fetch on initial mount
  useEffect(() => {
    const bounds = map.getBounds();
    onViewportChange(
      {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
      map.getZoom()
    );
  }, []);

  return null;
}
```

### 4.2 Room Marker Component

```tsx
// components/map/RoomMarker.tsx

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";

export function RoomMarker({ room }: { room: MapRoom }) {
  // Dynamic icon: size and color based on activity
  const intensity = Math.min(room.currentCount / room.capacity, 1);
  const size = 12 + intensity * 20; // 12px to 32px
  const color = room.isPinned
    ? "#f59e0b"   // amber for sponsored
    : intensity > 0.7
      ? "#ef4444"  // red (busy)
      : intensity > 0.3
        ? "#22c55e" // green (active)
        : "#6b7280"; // gray (quiet)

  const icon = L.divIcon({
    className: "custom-room-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 0 ${intensity * 15}px ${color}80;
        animation: ${room.currentCount > 0 ? "pulse 2s infinite" : "none"};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${size * 0.4}px;
        color: white;
        font-weight: bold;
      ">
        ${room.currentCount > 0 ? room.currentCount : ""}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  return (
    <Marker position={[room.latitude, room.longitude]} icon={icon}>
      <Popup className="room-popup">
        <div className="w-64 p-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg">{room.name}</h3>
            {room.isPinned && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                Featured
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }} />
            {room.currentCount}/{room.capacity} people
          </div>
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
            {room.category}
          </span>
          <Link
            href={`/room/${room.slug}`}
            className="mt-3 block w-full text-center bg-indigo-600 text-white
                       rounded-lg py-2 text-sm font-medium hover:bg-indigo-700
                       transition-colors"
          >
            Enter Room
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}
```

### 4.3 Map API Route (Geo Query)

```typescript
// app/api/map/rooms/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const north = parseFloat(params.get("north") || "90");
  const south = parseFloat(params.get("south") || "-90");
  const east  = parseFloat(params.get("east") || "180");
  const west  = parseFloat(params.get("west") || "-180");
  const zoom  = parseInt(params.get("zoom") || "4");
  const categories = params.get("categories")?.split(",") || [];
  const hideEmpty = params.get("hideEmpty") === "true";
  const minPeople = parseInt(params.get("minPeople") || "0");

  // At low zoom, cluster rooms by city; at high zoom, show individual rooms
  if (zoom < 8) {
    // Aggregated clusters
    const clusters = await prisma.$queryRaw`
      SELECT
        city,
        country,
        AVG(latitude) as lat,
        AVG(longitude) as lng,
        COUNT(*)::int as "roomCount",
        SUM("currentCount")::int as "totalPeople"
      FROM "Room"
      WHERE "isActive" = true
        AND latitude BETWEEN ${south} AND ${north}
        AND longitude BETWEEN ${west} AND ${east}
        ${hideEmpty ? prisma.$queryRaw`AND "currentCount" > 0` : prisma.$queryRaw``}
      GROUP BY city, country
      HAVING COUNT(*) > 0
      ORDER BY SUM("currentCount") DESC
      LIMIT 200
    `;
    return NextResponse.json({ type: "clusters", clusters });
  }

  // Individual rooms at higher zoom
  const where: any = {
    isActive: true,
    latitude: { gte: south, lte: north },
    longitude: { gte: west, lte: east },
    ...(categories.length > 0 && { category: { in: categories } }),
    ...(hideEmpty && { currentCount: { gt: 0 } }),
    ...(minPeople > 0 && { currentCount: { gte: minPeople } }),
  };

  const rooms = await prisma.room.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      latitude: true,
      longitude: true,
      category: true,
      currentCount: true,
      capacity: true,
      isPinned: true,
      owner: {
        select: { name: true, profileImageUrl: true },
      },
    },
    orderBy: [
      { isPinned: "desc" },
      { currentCount: "desc" },
    ],
    take: 500,
  });

  return NextResponse.json({ type: "rooms", rooms });
}
```

---

## 5. Room Engine (2.5D Canvas)

### 5.1 Isometric Coordinate System

The room uses a **2.5D isometric** projection: world coordinates (wx, wy) are flat grid positions; screen coordinates (sx, sy) are what gets rendered.

```
             N
            /|\
           / | \
          /  |  \
     NW  /   |   \  NE
        /    |    \
       /     |     \
   W  /------+------\  E     ← flat ground plane tilted ~30°
       \     |     /
        \    |    /
     SW  \   |   /  SE
          \  |  /
           \ | /
            \|/
             S
```

```typescript
// lib/room-engine/IsometricUtils.ts

export const ISO_TILE_WIDTH  = 64;
export const ISO_TILE_HEIGHT = 32;

/**
 * Convert world grid coords → screen pixel coords
 */
export function worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
  return {
    sx: (wx - wy) * (ISO_TILE_WIDTH / 2),
    sy: (wx + wy) * (ISO_TILE_HEIGHT / 2),
  };
}

/**
 * Convert screen pixel coords → world grid coords
 */
export function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  return {
    wx: (sx / (ISO_TILE_WIDTH / 2) + sy / (ISO_TILE_HEIGHT / 2)) / 2,
    wy: (sy / (ISO_TILE_HEIGHT / 2) - sx / (ISO_TILE_WIDTH / 2)) / 2,
  };
}

/**
 * Get depth sort value for rendering order (higher Y = rendered later = in front)
 */
export function getDepth(wx: number, wy: number): number {
  return wx + wy;
}

/**
 * Distance between two world positions
 */
export function worldDistance(
  ax: number, ay: number,
  bx: number, by: number
): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}
```

### 5.2 Engine Core (PixiJS)

```typescript
// lib/room-engine/Engine.ts

import * as PIXI from "pixi.js";
import { worldToScreen, screenToWorld, getDepth } from "./IsometricUtils";
import { AvatarSprite } from "@/components/room/AvatarSprite";
import { StandObject } from "@/components/room/StandObject";
import { ConversationBubble } from "@/components/room/ConversationBubble";
import { CollisionGrid } from "./CollisionGrid";
import type { Socket } from "socket.io-client";

interface EngineConfig {
  canvas: HTMLCanvasElement;
  mapWidth: number;
  mapHeight: number;
  socket: Socket;
  currentUser: CurrentUser;
  onAvatarClick: (userId: string) => void;
  onStandClick: (standId: string) => void;
  onEmptyClick: (worldX: number, worldY: number) => void;
}

export class RoomEngine {
  private app: PIXI.Application;
  private worldContainer: PIXI.Container; // everything scrolls inside this
  private avatars: Map<string, AvatarSprite> = new Map();
  private stands: Map<string, StandObject> = new Map();
  private conversations: Map<string, ConversationBubble> = new Map();
  private collisionGrid: CollisionGrid;
  private socket: Socket;
  private currentUser: CurrentUser;
  private myAvatar: AvatarSprite | null = null;
  private camera: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 };
  private moveTarget: { x: number; y: number } | null = null;
  private keysDown: Set<string> = new Set();

  // Movement
  private readonly MOVE_SPEED = 3; // pixels per frame
  private readonly PROXIMITY_RADIUS = 150; // pixels for proximity chat range

  constructor(config: EngineConfig) {
    this.socket = config.socket;
    this.currentUser = config.currentUser;

    // Initialize PixiJS
    this.app = new PIXI.Application({
      view: config.canvas,
      width: config.canvas.parentElement!.clientWidth,
      height: config.canvas.parentElement!.clientHeight,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // World container (we pan/zoom this)
    this.worldContainer = new PIXI.Container();
    this.worldContainer.sortableChildren = true; // enables zIndex-based sorting
    this.app.stage.addChild(this.worldContainer);

    // Collision grid
    this.collisionGrid = new CollisionGrid(config.mapWidth, config.mapHeight, 32);

    // Input handlers
    this.setupInput(config.canvas, config);

    // Game loop
    this.app.ticker.add(this.update.bind(this));
  }

  // ---- INITIALIZATION ----

  loadRoomState(state: RoomStatePayload) {
    // Draw floor tiles / background
    this.drawFloor(state.room);

    // Spawn stands
    for (const stand of state.stands) {
      this.addStand(stand);
    }

    // Spawn existing users
    for (const user of state.users) {
      this.addAvatar(user);
    }

    // Draw conversation bubbles
    for (const conv of state.conversations) {
      this.addConversationBubble(conv);
    }

    // Set my position and camera
    this.myAvatar = this.avatars.get(this.currentUser.id) || null;
    if (this.myAvatar) {
      this.centerCameraOn(this.myAvatar.worldX, this.myAvatar.worldY);
    }
  }

  // ---- FLOOR RENDERING ----

  private drawFloor(room: RoomConfig) {
    const floor = new PIXI.Container();
    floor.zIndex = -1000;

    if (room.backgroundUrl) {
      // Custom background image
      const bg = PIXI.Sprite.from(room.backgroundUrl);
      bg.width = room.mapWidth;
      bg.height = room.mapHeight;
      floor.addChild(bg);
    } else {
      // Default isometric grid
      const gridCols = Math.ceil(room.mapWidth / 64);
      const gridRows = Math.ceil(room.mapHeight / 64);

      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const { sx, sy } = worldToScreen(col, row);
          const tile = new PIXI.Graphics();
          tile.beginFill((row + col) % 2 === 0 ? 0x2a2a4a : 0x252545);
          tile.moveTo(0, -16);
          tile.lineTo(32, 0);
          tile.lineTo(0, 16);
          tile.lineTo(-32, 0);
          tile.closePath();
          tile.endFill();
          tile.lineStyle(1, 0x3a3a5a, 0.3);
          tile.moveTo(0, -16);
          tile.lineTo(32, 0);
          tile.lineTo(0, 16);
          tile.lineTo(-32, 0);
          tile.closePath();
          tile.x = sx + room.mapWidth / 2;
          tile.y = sy + 100;
          floor.addChild(tile);
        }
      }
    }

    this.worldContainer.addChild(floor);
  }

  // ---- AVATAR MANAGEMENT ----

  addAvatar(userData: RoomUserPayload) {
    const avatar = new AvatarSprite({
      userId: userData.id,
      name: userData.name,
      profileImageUrl: userData.profileImageUrl,
      avatarConfig: userData.avatarConfig,
      x: userData.x,
      y: userData.y,
      facing: userData.facing,
      availability: userData.availability,
      interestTags: userData.interestTags,
      isCurrentUser: userData.id === this.currentUser.id,
    });

    avatar.container.zIndex = getDepth(userData.x, userData.y);
    this.worldContainer.addChild(avatar.container);
    this.avatars.set(userData.id, avatar);
    return avatar;
  }

  removeAvatar(userId: string) {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      this.worldContainer.removeChild(avatar.container);
      avatar.destroy();
      this.avatars.delete(userId);
    }
  }

  moveRemoteAvatar(userId: string, x: number, y: number, facing: string) {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      avatar.setTargetPosition(x, y, facing);
    }
  }

  // ---- STAND MANAGEMENT ----

  addStand(standData: StandPayload) {
    const stand = new StandObject(standData);
    stand.container.zIndex = getDepth(standData.posX, standData.posY);
    this.worldContainer.addChild(stand.container);
    this.stands.set(standData.id, stand);
  }

  // ---- CONVERSATION BUBBLES ----

  addConversationBubble(convData: ConversationPayload) {
    const bubble = new ConversationBubble(convData);
    bubble.container.zIndex = getDepth(convData.anchorX, convData.anchorY) - 0.5;
    this.worldContainer.addChild(bubble.container);
    this.conversations.set(convData.id, bubble);
  }

  // ---- INPUT ----

  private setupInput(canvas: HTMLCanvasElement, config: EngineConfig) {
    // Click to move
    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Convert screen → world accounting for camera
      const worldX = (screenX - this.camera.x) / this.camera.zoom;
      const worldY = (screenY - this.camera.y) / this.camera.zoom;

      // Check if clicking on an avatar
      for (const [uid, avatar] of this.avatars) {
        if (uid !== this.currentUser.id && avatar.hitTest(worldX, worldY)) {
          config.onAvatarClick(uid);
          return;
        }
      }

      // Check if clicking on a stand
      for (const [sid, stand] of this.stands) {
        if (stand.hitTest(worldX, worldY)) {
          config.onStandClick(sid);
          return;
        }
      }

      // Click to move
      if (!this.collisionGrid.isBlocked(worldX, worldY)) {
        this.moveTarget = { x: worldX, y: worldY };
      }
    });

    // WASD / Arrow keys
    window.addEventListener("keydown", (e) => this.keysDown.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keysDown.delete(e.key.toLowerCase()));

    // Mouse wheel zoom
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      this.camera.zoom = Math.max(0.5, Math.min(2, this.camera.zoom + zoomDelta));
      this.applyCamera();
    });
  }

  // ---- GAME LOOP ----

  private update(delta: number) {
    if (!this.myAvatar) return;

    let dx = 0;
    let dy = 0;

    // Keyboard movement
    if (this.keysDown.has("w") || this.keysDown.has("arrowup"))    dy -= this.MOVE_SPEED;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown"))  dy += this.MOVE_SPEED;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft"))  dx -= this.MOVE_SPEED;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) dx += this.MOVE_SPEED;

    // Click-to-move
    if (this.moveTarget && dx === 0 && dy === 0) {
      const tdx = this.moveTarget.x - this.myAvatar.worldX;
      const tdy = this.moveTarget.y - this.myAvatar.worldY;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);

      if (dist < 5) {
        this.moveTarget = null;
      } else {
        dx = (tdx / dist) * this.MOVE_SPEED;
        dy = (tdy / dist) * this.MOVE_SPEED;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const newX = this.myAvatar.worldX + dx;
      const newY = this.myAvatar.worldY + dy;

      // Collision check
      if (!this.collisionGrid.isBlocked(newX, newY)) {
        // Determine facing direction
        const facing = this.getFacing(dx, dy);
        this.myAvatar.worldX = newX;
        this.myAvatar.worldY = newY;
        this.myAvatar.setFacing(facing);
        this.myAvatar.playWalkAnimation();
        this.myAvatar.container.zIndex = getDepth(newX, newY);

        // Emit to server (throttled)
        this.emitMovement(newX, newY, facing);

        // Update camera
        this.centerCameraOn(newX, newY);
      }
    } else {
      this.myAvatar.playIdleAnimation();
    }

    // Update remote avatar interpolation
    for (const [uid, avatar] of this.avatars) {
      if (uid !== this.currentUser.id) {
        avatar.interpolate(delta);
      }
    }

    // Update conversation bubble positions and animations
    for (const [, bubble] of this.conversations) {
      bubble.update(delta);
    }
  }

  // Throttled movement emission (max 15 updates/sec)
  private lastEmit = 0;
  private emitMovement(x: number, y: number, facing: string) {
    const now = Date.now();
    if (now - this.lastEmit < 66) return; // ~15fps
    this.lastEmit = now;

    this.socket.emit("room:move", {
      roomId: this.currentUser.currentRoomId,
      x, y, facing,
    });
  }

  private getFacing(dx: number, dy: number): string {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? "EAST" : "WEST";
    }
    return dy > 0 ? "SOUTH" : "NORTH";
  }

  private centerCameraOn(wx: number, wy: number) {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    this.camera.x = screenW / 2 - wx * this.camera.zoom;
    this.camera.y = screenH / 2 - wy * this.camera.zoom;
    this.applyCamera();
  }

  private applyCamera() {
    this.worldContainer.x = this.camera.x;
    this.worldContainer.y = this.camera.y;
    this.worldContainer.scale.set(this.camera.zoom);
  }

  // ---- PROXIMITY DETECTION ----

  getNearbyUsers(): string[] {
    if (!this.myAvatar) return [];
    const nearby: string[] = [];
    for (const [uid, avatar] of this.avatars) {
      if (uid === this.currentUser.id) continue;
      const dist = Math.sqrt(
        (this.myAvatar.worldX - avatar.worldX) ** 2 +
        (this.myAvatar.worldY - avatar.worldY) ** 2
      );
      if (dist <= this.PROXIMITY_RADIUS) {
        nearby.push(uid);
      }
    }
    return nearby;
  }

  // ---- CLEANUP ----

  destroy() {
    this.app.ticker.remove(this.update.bind(this));
    this.app.destroy(true);
    this.avatars.forEach((a) => a.destroy());
    this.stands.forEach((s) => s.destroy());
  }
}
```

### 5.3 Collision Grid

```typescript
// lib/room-engine/CollisionGrid.ts

export class CollisionGrid {
  private grid: boolean[][];
  private cellSize: number;
  private cols: number;
  private rows: number;

  constructor(mapWidth: number, mapHeight: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapWidth / cellSize);
    this.rows = Math.ceil(mapHeight / cellSize);
    this.grid = Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(false)
    );
  }

  /** Mark a rectangular region as blocked (for stands, walls, etc.) */
  blockRect(x: number, y: number, w: number, h: number) {
    const startCol = Math.floor(x / this.cellSize);
    const startRow = Math.floor(y / this.cellSize);
    const endCol = Math.ceil((x + w) / this.cellSize);
    const endRow = Math.ceil((y + h) / this.cellSize);

    for (let r = startRow; r < endRow && r < this.rows; r++) {
      for (let c = startCol; c < endCol && c < this.cols; c++) {
        if (r >= 0 && c >= 0) this.grid[r][c] = true;
      }
    }
  }

  isBlocked(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / this.cellSize);
    const row = Math.floor(worldY / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
    return this.grid[row][col];
  }
}
```

---

## 6. Avatar System (Sprite + Profile Face)

This is the most distinctive visual element. Each avatar is a **pre-built walking sprite body** with the user's **profile picture composited as the face**.

### 6.1 Sprite Sheet Structure

```
Each avatar has an 8-direction × 4-frame walk cycle + 1 idle frame per direction.
Total: 8 directions × 5 frames = 40 frames

Sprite sheet layout (each cell = 64×96 px):
┌────┬────┬────┬────┬────┐
│ S0 │ S1 │ S2 │ S3 │S_id│  ← South (facing camera)
├────┼────┼────┼────┼────┤
│ SW │ SW │ SW │ SW │SW_i│
├────┼────┼────┼────┼────┤
│ W0 │ W1 │ W2 │ W3 │W_id│
├────┼────┼────┼────┼────┤
│ NW │ NW │ NW │ NW │NW_i│
├────┼────┼────┼────┼────┤
│ N0 │ N1 │ N2 │ N3 │N_id│  ← North (facing away)
├────┼────┼────┼────┼────┤
│ NE │ NE │ NE │ NE │NE_i│
├────┼────┼────┼────┼────┤
│ E0 │ E1 │ E2 │ E3 │E_id│
├────┼────┼────┼────┼────┤
│ SE │ SE │ SE │ SE │SE_i│
└────┴────┴────┴────┴────┘

Total sheet size: 320 × 768 px
```

### 6.2 Avatar Sprite Compositor

This runs **client-side** on first load (or server-side at avatar creation) to bake the profile pic into the sprite body.

```typescript
// lib/room-engine/SpriteCompositor.ts

/**
 * Composites a user's profile picture onto a base sprite body to create
 * a personalized walking sprite sheet.
 *
 * Base body sprites have a transparent "face slot" (pink mask #FF00FF)
 * that gets replaced with the circular-cropped profile picture.
 */

interface CompositorConfig {
  profileImageUrl: string;
  bodyVariant: string;       // "default", "suit", "casual", "hoodie"
  bodyColor?: string;        // tint for the body
  accessoryIds?: string[];   // hat, glasses, etc. layered on top
}

// Face region definitions per direction (pixel coords within each 64×96 frame)
// These define where the profile picture should be placed for each facing direction
const FACE_REGIONS: Record<string, FaceRegion> = {
  SOUTH:     { x: 20, y: 8,  w: 24, h: 24, scale: 1.0, visible: true  },
  SOUTHWEST: { x: 16, y: 8,  w: 22, h: 24, scale: 0.95, visible: true  },
  WEST:      { x: 12, y: 10, w: 18, h: 22, scale: 0.8,  visible: true  },
  NORTHWEST: { x: 16, y: 10, w: 18, h: 22, scale: 0.75, visible: true  },
  NORTH:     { x: 20, y: 10, w: 24, h: 24, scale: 0.0,  visible: false }, // back of head
  NORTHEAST: { x: 30, y: 10, w: 18, h: 22, scale: 0.75, visible: true  },
  EAST:      { x: 34, y: 10, w: 18, h: 22, scale: 0.8,  visible: true  },
  SOUTHEAST: { x: 26, y: 8,  w: 22, h: 24, scale: 0.95, visible: true  },
};

interface FaceRegion {
  x: number; y: number; w: number; h: number; scale: number; visible: boolean;
}

const DIRECTIONS = ["SOUTH", "SOUTHWEST", "WEST", "NORTHWEST", "NORTH", "NORTHEAST", "EAST", "SOUTHEAST"];
const FRAMES_PER_DIR = 5; // 4 walk + 1 idle
const FRAME_W = 64;
const FRAME_H = 96;

export async function compositeAvatarSpriteSheet(
  config: CompositorConfig
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W * FRAMES_PER_DIR;  // 320
  canvas.height = FRAME_H * DIRECTIONS.length; // 768
  const ctx = canvas.getContext("2d")!;

  // 1. Load base body sprite sheet
  const bodySheet = await loadImage(`/assets/avatars/bodies/${config.bodyVariant}.png`);

  // 2. Load profile picture
  const profileImg = await loadImage(config.profileImageUrl);

  // 3. Create circular face texture
  const faceCanvas = createCircularFace(profileImg, 48); // 48px circle

  // 4. Optionally tint the body
  let bodyCanvas: HTMLCanvasElement | HTMLImageElement = bodySheet;
  if (config.bodyColor) {
    bodyCanvas = tintImage(bodySheet, config.bodyColor);
  }

  // 5. Draw body sheet
  ctx.drawImage(bodyCanvas, 0, 0);

  // 6. Overlay face onto each frame
  for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
    const dir = DIRECTIONS[dirIdx];
    const region = FACE_REGIONS[dir];

    if (!region.visible) continue; // skip NORTH (back of head)

    for (let frame = 0; frame < FRAMES_PER_DIR; frame++) {
      const frameX = frame * FRAME_W;
      const frameY = dirIdx * FRAME_H;

      // Walking frames have slight vertical bob
      const bobOffset = frame < 4 ? [0, -1, 0, 1][frame] : 0;

      // Draw face scaled and positioned
      const faceW = region.w * region.scale;
      const faceH = region.h * region.scale;
      const faceX = frameX + region.x + (region.w - faceW) / 2;
      const faceY = frameY + region.y + (region.h - faceH) / 2 + bobOffset;

      ctx.drawImage(faceCanvas, faceX, faceY, faceW, faceH);
    }
  }

  // 7. Layer accessories (hats, glasses)
  if (config.accessoryIds?.length) {
    for (const accId of config.accessoryIds) {
      const accSheet = await loadImage(`/assets/avatars/accessories/${accId}.png`);
      ctx.drawImage(accSheet, 0, 0); // accessories sheets align with body sheet
    }
  }

  return canvas;
}

/** Crops an image into a circle */
function createCircularFace(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  // Circular clip
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Draw image centered and cropped to square
  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

  return c;
}

/** Apply a color tint to an image */
function tintImage(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-atop";
  ctx.drawImage(img, 0, 0);
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

### 6.3 Avatar PixiJS Sprite Class

```typescript
// components/room/AvatarSprite.ts

import * as PIXI from "pixi.js";
import { compositeAvatarSpriteSheet } from "@/lib/room-engine/SpriteCompositor";

const FRAME_W = 64;
const FRAME_H = 96;
const FRAMES_PER_DIR = 5;
const WALK_ANIM_SPEED = 0.15;
const INTERPOLATION_SPEED = 0.2;

const DIR_INDEX: Record<string, number> = {
  SOUTH: 0, SOUTHWEST: 1, WEST: 2, NORTHWEST: 3,
  NORTH: 4, NORTHEAST: 5, EAST: 6, SOUTHEAST: 7,
};

interface AvatarConfig {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  avatarConfig: any; // { bodyVariant, bodyColor, accessoryIds }
  x: number;
  y: number;
  facing: string;
  availability: string;
  interestTags: string[];
  isCurrentUser: boolean;
}

export class AvatarSprite {
  public container: PIXI.Container;
  public worldX: number;
  public worldY: number;

  private sprite: PIXI.AnimatedSprite | null = null;
  private nameTag: PIXI.Text;
  private statusDot: PIXI.Graphics;
  private tagsBubble: PIXI.Container;
  private shadowGraphic: PIXI.Graphics;

  private currentDir: number = 0;
  private isWalking: boolean = false;
  private textures: Map<string, PIXI.Texture[]> = new Map();

  // Interpolation targets (for remote avatars)
  private targetX: number;
  private targetY: number;
  private targetFacing: string;

  private config: AvatarConfig;

  constructor(config: AvatarConfig) {
    this.config = config;
    this.worldX = config.x;
    this.worldY = config.y;
    this.targetX = config.x;
    this.targetY = config.y;
    this.targetFacing = config.facing;

    this.container = new PIXI.Container();
    this.container.x = config.x;
    this.container.y = config.y;

    // Shadow
    this.shadowGraphic = new PIXI.Graphics();
    this.shadowGraphic.beginFill(0x000000, 0.3);
    this.shadowGraphic.drawEllipse(0, 40, 20, 8);
    this.shadowGraphic.endFill();
    this.container.addChild(this.shadowGraphic);

    // Name tag
    this.nameTag = new PIXI.Text(config.name, {
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: 11,
      fill: config.isCurrentUser ? 0x818cf8 : 0xffffff,
      align: "center",
      dropShadow: true,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
    });
    this.nameTag.anchor.set(0.5, 0);
    this.nameTag.y = 46;
    this.container.addChild(this.nameTag);

    // Status dot (availability indicator)
    this.statusDot = new PIXI.Graphics();
    this.updateStatusDot(config.availability);
    this.container.addChild(this.statusDot);

    // Interest tags (shown on hover)
    this.tagsBubble = this.createTagsBubble(config.interestTags);
    this.tagsBubble.visible = false;
    this.container.addChild(this.tagsBubble);

    // Hover interaction
    this.container.interactive = true;
    this.container.cursor = config.isCurrentUser ? "default" : "pointer";
    this.container.on("pointerover", () => { this.tagsBubble.visible = true; });
    this.container.on("pointerout", () => { this.tagsBubble.visible = false; });

    // Highlight own avatar
    if (config.isCurrentUser) {
      const highlight = new PIXI.Graphics();
      highlight.lineStyle(2, 0x818cf8, 0.6);
      highlight.drawEllipse(0, 40, 22, 10);
      this.container.addChildAt(highlight, 0);
    }

    // Load and build spritesheet asynchronously
    this.loadSpriteSheet();
  }

  private async loadSpriteSheet() {
    try {
      const sheetCanvas = await compositeAvatarSpriteSheet({
        profileImageUrl: this.config.profileImageUrl || "/assets/avatars/default-face.png",
        bodyVariant: this.config.avatarConfig?.bodyVariant || "default",
        bodyColor: this.config.avatarConfig?.bodyColor,
        accessoryIds: this.config.avatarConfig?.accessoryIds,
      });

      const baseTexture = PIXI.BaseTexture.from(sheetCanvas);

      // Extract frames per direction
      const directions = ["SOUTH","SOUTHWEST","WEST","NORTHWEST","NORTH","NORTHEAST","EAST","SOUTHEAST"];
      for (let d = 0; d < directions.length; d++) {
        const walkFrames: PIXI.Texture[] = [];
        for (let f = 0; f < 4; f++) {
          walkFrames.push(
            new PIXI.Texture(baseTexture, new PIXI.Rectangle(
              f * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H
            ))
          );
        }
        this.textures.set(`${directions[d]}_walk`, walkFrames);

        // Idle frame
        this.textures.set(`${directions[d]}_idle`, [
          new PIXI.Texture(baseTexture, new PIXI.Rectangle(
            4 * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H
          ))
        ]);
      }

      // Create animated sprite starting with south idle
      const initialFrames = this.textures.get("SOUTH_idle") || [];
      this.sprite = new PIXI.AnimatedSprite(initialFrames);
      this.sprite.anchor.set(0.5, 0.5);
      this.sprite.animationSpeed = WALK_ANIM_SPEED;
      this.sprite.y = -8; // offset so feet align with shadow
      this.container.addChildAt(this.sprite, 1); // above shadow, below name

      this.setFacing(this.config.facing);
    } catch (err) {
      console.error("Failed to load avatar sprite:", err);
      // Fallback: simple colored circle with initial
      const fallback = new PIXI.Graphics();
      fallback.beginFill(0x6366f1);
      fallback.drawCircle(0, 0, 20);
      fallback.endFill();
      const initial = new PIXI.Text(this.config.name[0]?.toUpperCase() || "?", {
        fontSize: 16, fill: 0xffffff, fontWeight: "bold",
      });
      initial.anchor.set(0.5);
      this.container.addChildAt(fallback, 1);
      this.container.addChildAt(initial, 2);
    }
  }

  setFacing(direction: string) {
    this.targetFacing = direction;
    if (!this.sprite) return;

    const key = this.isWalking ? `${direction}_walk` : `${direction}_idle`;
    const frames = this.textures.get(key);
    if (frames) {
      this.sprite.textures = frames;
      if (this.isWalking) this.sprite.play();
      else this.sprite.gotoAndStop(0);
    }
  }

  playWalkAnimation() {
    if (this.isWalking || !this.sprite) return;
    this.isWalking = true;
    const key = `${this.targetFacing}_walk`;
    const frames = this.textures.get(key);
    if (frames) {
      this.sprite.textures = frames;
      this.sprite.play();
    }
  }

  playIdleAnimation() {
    if (!this.isWalking || !this.sprite) return;
    this.isWalking = false;
    const key = `${this.targetFacing}_idle`;
    const frames = this.textures.get(key);
    if (frames) {
      this.sprite.textures = frames;
      this.sprite.gotoAndStop(0);
    }
  }

  /** For remote avatars: set interpolation target */
  setTargetPosition(x: number, y: number, facing: string) {
    this.targetX = x;
    this.targetY = y;
    this.targetFacing = facing;
    this.setFacing(facing);
  }

  /** Called each frame for remote avatars to smoothly interpolate */
  interpolate(delta: number) {
    const dx = this.targetX - this.worldX;
    const dy = this.targetY - this.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      this.worldX += dx * INTERPOLATION_SPEED;
      this.worldY += dy * INTERPOLATION_SPEED;
      this.container.x = this.worldX;
      this.container.y = this.worldY;
      this.playWalkAnimation();
    } else {
      this.playIdleAnimation();
    }
  }

  hitTest(worldX: number, worldY: number): boolean {
    const dx = worldX - this.worldX;
    const dy = worldY - this.worldY;
    return Math.abs(dx) < 24 && Math.abs(dy) < 48;
  }

  private updateStatusDot(availability: string) {
    this.statusDot.clear();
    const colors: Record<string, number> = {
      OPEN_TO_CHAT: 0x22c55e,  // green
      BROWSING: 0x3b82f6,      // blue
      IN_MEETING: 0xef4444,    // red
      PITCHING: 0xf59e0b,      // amber
      DO_NOT_DISTURB: 0xef4444,
      AFK: 0x6b7280,           // gray
    };
    this.statusDot.beginFill(colors[availability] || 0x6b7280);
    this.statusDot.drawCircle(24, -36, 4);
    this.statusDot.endFill();
    // White border
    this.statusDot.lineStyle(1.5, 0xffffff);
    this.statusDot.drawCircle(24, -36, 4);
  }

  private createTagsBubble(tags: string[]): PIXI.Container {
    const bubble = new PIXI.Container();
    if (!tags.length) return bubble;

    const maxDisplay = 3;
    const displayTags = tags.slice(0, maxDisplay);
    const text = displayTags.join(" · ") + (tags.length > maxDisplay ? " ..." : "");

    const label = new PIXI.Text(text, {
      fontSize: 9,
      fill: 0xd1d5db,
      fontFamily: "Inter, Arial, sans-serif",
    });
    label.anchor.set(0.5);

    const bg = new PIXI.Graphics();
    const pad = 6;
    bg.beginFill(0x1f2937, 0.9);
    bg.drawRoundedRect(
      -label.width / 2 - pad,
      -label.height / 2 - pad / 2 - 52,
      label.width + pad * 2,
      label.height + pad,
      4
    );
    bg.endFill();
    label.y = -52;

    bubble.addChild(bg, label);
    return bubble;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
```

---

## 7. Chat & Conversation System

### 7.1 Proximity Chat

Messages from nearby users float above their avatars and also appear in a side panel.

```typescript
// server/handlers/chatHandler.ts

export function registerChatHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  socket.on("chat:proximity", async ({ roomId, content }) => {
    if (!content.trim() || content.length > 500) return;

    // Save to DB
    const message = await prisma.message.create({
      data: {
        senderId: user.id,
        content: content.trim(),
        type: "TEXT",
        isProximity: true,
        roomId,
      },
    });

    // Broadcast to entire room — clients filter by proximity distance
    io.to(`room:${roomId}`).emit("chat:proximity_msg", {
      id: message.id,
      senderId: user.id,
      senderName: user.name,
      senderProfileImage: user.profileImageUrl,
      content: content.trim(),
      timestamp: message.createdAt.toISOString(),
    });
  });

  socket.on("chat:conversation", async ({ conversationId, content, type }) => {
    if (!content.trim()) return;

    // Verify sender is a member of the conversation
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: user.id },
      },
    });
    if (!membership || membership.leftAt) return;

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        content: content.trim(),
        type: type || "TEXT",
      },
    });

    // Broadcast only to conversation members (they're in a sub-room)
    io.to(`conversation:${conversationId}`).emit("chat:conversation_msg", {
      id: message.id,
      conversationId,
      senderId: user.id,
      senderName: user.name,
      senderProfileImage: user.profileImageUrl,
      content: content.trim(),
      type: type || "TEXT",
      timestamp: message.createdAt.toISOString(),
    });
  });

  // Typing indicator
  socket.on("chat:typing", ({ conversationId, roomId }) => {
    if (conversationId) {
      socket.to(`conversation:${conversationId}`).emit("chat:typing", {
        userId: user.id, conversationId,
      });
    } else if (roomId) {
      socket.to(`room:${roomId}`).emit("chat:typing", {
        userId: user.id,
      });
    }
  });
}
```

### 7.2 Conversation Bubbles Handler

```typescript
// server/handlers/conversationHandler.ts

export function registerConversationHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  // CREATE a new conversation (start chatting with someone)
  socket.on("conversation:create", async ({ roomId, topic, isOpen, targetUserId }) => {
    // Get user's current position for anchor
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    });
    if (!member) return;

    const conversation = await prisma.conversation.create({
      data: {
        roomId,
        topic,
        isOpen: isOpen ?? false,
        anchorX: member.posX,
        anchorY: member.posY,
        members: {
          create: { userId: user.id },
        },
      },
    });

    // Join socket sub-room
    socket.join(`conversation:${conversation.id}`);

    // If initiating with a specific user, auto-invite them
    if (targetUserId) {
      await prisma.conversationJoinRequest.create({
        data: {
          conversationId: conversation.id,
          requesterId: user.id,
          status: "PENDING",
          message: `${user.name} wants to chat with you`,
        },
      });

      // Find target's socket and send invite
      const targetSockets = await io.in(`room:${roomId}`).fetchSockets();
      for (const s of targetSockets) {
        if (s.data.user.id === targetUserId) {
          s.emit("conversation:request_received", {
            conversationId: conversation.id,
            requester: { id: user.id, name: user.name, profileImageUrl: user.profileImageUrl },
            topic,
            message: `${user.name} wants to chat`,
          });
        }
      }
    }

    // Broadcast bubble creation to room
    io.to(`room:${roomId}`).emit("conversation:created", {
      id: conversation.id,
      topic,
      isOpen: isOpen ?? false,
      anchorX: member.posX,
      anchorY: member.posY,
      members: [{ id: user.id, name: user.name, profileImageUrl: user.profileImageUrl }],
    });
  });

  // REQUEST to join an existing conversation
  socket.on("conversation:request", async ({ conversationId, message }) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { where: { leftAt: null } } },
    });
    if (!conversation || conversation.endedAt) return;

    if (conversation.isOpen) {
      // Open conversations: auto-join
      await joinConversation(io, socket, conversationId, user);
    } else {
      // Closed: create join request, notify members
      const request = await prisma.conversationJoinRequest.create({
        data: { conversationId, requesterId: user.id, message },
      });

      io.to(`conversation:${conversationId}`).emit("conversation:request_received", {
        requestId: request.id,
        conversationId,
        requester: { id: user.id, name: user.name, profileImageUrl: user.profileImageUrl },
        message,
      });
    }
  });

  // RESPOND to a join request
  socket.on("conversation:respond", async ({ requestId, accept }) => {
    const request = await prisma.conversationJoinRequest.update({
      where: { id: requestId },
      data: {
        status: accept ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
      include: { requester: true },
    });

    if (accept) {
      // Find requester's socket and add them
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if (s.data.user.id === request.requesterId) {
          await joinConversation(io, s as any, request.conversationId, request.requester);
          break;
        }
      }
    }

    // Notify requester of response
    const requesterSockets = await io.fetchSockets();
    for (const s of requesterSockets) {
      if (s.data.user.id === request.requesterId) {
        s.emit("conversation:request_response", {
          requestId, accepted: accept,
        });
      }
    }
  });

  // LEAVE conversation
  socket.on("conversation:leave", async ({ conversationId }) => {
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId: user.id, leftAt: null },
      data: { leftAt: new Date() },
    });

    socket.leave(`conversation:${conversationId}`);

    io.to(`conversation:${conversationId}`).emit("conversation:user_left", {
      conversationId, userId: user.id,
    });

    // Check if conversation is now empty → end it
    const remaining = await prisma.conversationMember.count({
      where: { conversationId, leftAt: null },
    });
    if (remaining === 0) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { endedAt: new Date() },
      });
      // Get roomId for broadcast
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (conv) {
        io.to(`room:${conv.roomId}`).emit("conversation:ended", { conversationId });
      }
    }
  });
}

async function joinConversation(io: Server, socket: any, conversationId: string, user: any) {
  await prisma.conversationMember.create({
    data: { conversationId, userId: user.id },
  });

  socket.join(`conversation:${conversationId}`);

  io.to(`conversation:${conversationId}`).emit("conversation:user_joined", {
    conversationId,
    user: { id: user.id, name: user.name, profileImageUrl: user.profileImageUrl },
  });

  // Also update the room-level bubble
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conv) {
    io.to(`room:${conv.roomId}`).emit("conversation:user_joined", {
      conversationId,
      user: { id: user.id, name: user.name, profileImageUrl: user.profileImageUrl },
    });
  }
}
```

### 7.3 Conversation Bubble (Visual)

```typescript
// components/room/ConversationBubble.ts

import * as PIXI from "pixi.js";

export class ConversationBubble {
  public container: PIXI.Container;
  private bubbleGraphic: PIXI.Graphics;
  private topicLabel: PIXI.Text | null = null;
  private memberAvatars: PIXI.Container;
  private pulsePhase: number = 0;
  private data: ConversationPayload;

  constructor(data: ConversationPayload) {
    this.data = data;
    this.container = new PIXI.Container();
    this.container.x = data.anchorX;
    this.container.y = data.anchorY;

    // Semi-transparent bubble
    this.bubbleGraphic = new PIXI.Graphics();
    this.drawBubble(data.members.length);
    this.container.addChild(this.bubbleGraphic);

    // Topic label
    if (data.topic) {
      this.topicLabel = new PIXI.Text(data.topic, {
        fontSize: 10,
        fill: 0xc4b5fd,
        fontFamily: "Inter, Arial, sans-serif",
        fontWeight: "600",
      });
      this.topicLabel.anchor.set(0.5);
      this.topicLabel.y = -60;
      this.container.addChild(this.topicLabel);
    }

    // Join indicator
    if (data.isOpen) {
      const joinHint = new PIXI.Text("▶ Open — click to join", {
        fontSize: 8,
        fill: 0x86efac,
      });
      joinHint.anchor.set(0.5);
      joinHint.y = -48;
      this.container.addChild(joinHint);
    }

    // Member count indicator
    this.memberAvatars = new PIXI.Container();
    this.updateMemberDisplay(data.members);
    this.container.addChild(this.memberAvatars);

    // Interactive
    this.container.interactive = true;
    this.container.cursor = "pointer";
  }

  private drawBubble(memberCount: number) {
    const radius = 40 + memberCount * 15;
    this.bubbleGraphic.clear();
    this.bubbleGraphic.beginFill(0x7c3aed, 0.08);
    this.bubbleGraphic.lineStyle(2, 0x7c3aed, 0.3);
    this.bubbleGraphic.drawEllipse(0, 0, radius, radius * 0.6);
    this.bubbleGraphic.endFill();
  }

  private updateMemberDisplay(members: UserBrief[]) {
    this.memberAvatars.removeChildren();
    const count = new PIXI.Text(`${members.length} 👤`, {
      fontSize: 10,
      fill: 0xa78bfa,
    });
    count.anchor.set(0.5);
    count.y = 50;
    this.memberAvatars.addChild(count);
  }

  update(delta: number) {
    // Gentle pulse animation
    this.pulsePhase += 0.02;
    const scale = 1 + Math.sin(this.pulsePhase) * 0.02;
    this.bubbleGraphic.scale.set(scale);
  }

  addMember(user: UserBrief) {
    this.data.members.push(user);
    this.drawBubble(this.data.members.length);
    this.updateMemberDisplay(this.data.members);
  }

  removeMember(userId: string) {
    this.data.members = this.data.members.filter(m => m.id !== userId);
    this.drawBubble(this.data.members.length);
    this.updateMemberDisplay(this.data.members);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
```

---

## 8. Stands System

### 8.1 Stand Object (PixiJS)

```typescript
// components/room/StandObject.ts

import * as PIXI from "pixi.js";

export class StandObject {
  public container: PIXI.Container;
  private data: StandPayload;
  private booth: PIXI.Graphics;
  private logo: PIXI.Sprite | null = null;
  private titleText: PIXI.Text;
  private visitorCount: PIXI.Text;

  constructor(data: StandPayload) {
    this.data = data;
    this.container = new PIXI.Container();
    this.container.x = data.posX;
    this.container.y = data.posY;

    // Booth base (isometric rectangle)
    this.booth = new PIXI.Graphics();
    this.drawBooth(data.width, data.height, data.style);
    this.container.addChild(this.booth);

    // Logo
    if (data.logoUrl) {
      const logoTexture = PIXI.Texture.from(data.logoUrl);
      this.logo = new PIXI.Sprite(logoTexture);
      this.logo.width = 40;
      this.logo.height = 40;
      this.logo.anchor.set(0.5);
      this.logo.y = -50;
      this.container.addChild(this.logo);
    }

    // Title
    this.titleText = new PIXI.Text(data.title, {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: "bold",
      wordWrap: true,
      wordWrapWidth: data.width - 20,
      align: "center",
    });
    this.titleText.anchor.set(0.5);
    this.titleText.y = data.logoUrl ? -20 : -40;
    this.container.addChild(this.titleText);

    // Tagline
    if (data.tagline) {
      const tagline = new PIXI.Text(data.tagline, {
        fontSize: 9,
        fill: 0xd1d5db,
        wordWrap: true,
        wordWrapWidth: data.width - 20,
        align: "center",
      });
      tagline.anchor.set(0.5);
      tagline.y = this.titleText.y + 16;
      this.container.addChild(tagline);
    }

    // Visitor count badge
    this.visitorCount = new PIXI.Text("0 viewing", {
      fontSize: 8,
      fill: 0x9ca3af,
    });
    this.visitorCount.anchor.set(0.5);
    this.visitorCount.y = data.height / 2 + 8;
    this.container.addChild(this.visitorCount);

    // Interactivity
    this.container.interactive = true;
    this.container.cursor = "pointer";
    this.container.hitArea = new PIXI.Rectangle(
      -data.width / 2, -data.height / 2, data.width, data.height
    );
  }

  private drawBooth(w: number, h: number, style: any) {
    const bgColor = style?.bgColor ? parseInt(style.bgColor.replace("#", ""), 16) : 0x1e1b4b;
    const borderColor = style?.borderColor ? parseInt(style.borderColor.replace("#", ""), 16) : 0x6366f1;

    // Back panel (slightly taller)
    this.booth.beginFill(bgColor, 0.85);
    this.booth.lineStyle(2, borderColor, 0.8);
    this.booth.drawRoundedRect(-w / 2, -h / 2, w, h, 8);
    this.booth.endFill();

    // Table surface
    this.booth.beginFill(borderColor, 0.2);
    this.booth.drawRoundedRect(-w / 2 + 4, h / 2 - 20, w - 8, 16, 4);
    this.booth.endFill();
  }

  hitTest(worldX: number, worldY: number): boolean {
    const dx = worldX - this.data.posX;
    const dy = worldY - this.data.posY;
    return Math.abs(dx) < this.data.width / 2 && Math.abs(dy) < this.data.height / 2;
  }

  updateVisitorCount(count: number) {
    this.visitorCount.text = `${count} viewing`;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
```

### 8.2 Stand Viewer Panel (React)

```tsx
// components/stands/StandViewer.tsx

"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/lib/socket";

interface StandViewerProps {
  standId: string;
  onClose: () => void;
}

export function StandViewer({ standId, onClose }: StandViewerProps) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const socket = useSocket();

  useEffect(() => {
    // Fetch stand details
    fetch(`/api/stands/${standId}`).then(r => r.json()).then(setStand);

    // Notify socket server that user is viewing this stand
    socket?.emit("stand:visit", { standId });

    return () => {
      socket?.emit("stand:leave", { standId });
    };
  }, [standId]);

  if (!stand) return <StandSkeleton />;

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-gray-900 border-l
                    border-gray-700 z-50 flex flex-col overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {stand.logoUrl && (
            <img src={stand.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
          )}
          <div>
            <h2 className="text-white font-bold text-lg">{stand.title}</h2>
            {stand.tagline && (
              <p className="text-gray-400 text-sm">{stand.tagline}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
          ✕
        </button>
      </div>

      {/* Media Carousel */}
      {stand.media.length > 0 && (
        <div className="relative bg-black aspect-video">
          <StandMediaRenderer media={stand.media[activeMediaIdx]} />
          {stand.media.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {stand.media.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMediaIdx(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === activeMediaIdx ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div className="p-4 flex-1 overflow-y-auto">
        {stand.description && (
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            {stand.description}
          </p>
        )}

        {/* Links */}
        {stand.websiteUrl && (
          <a
            href={stand.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300
                       text-sm font-medium mb-4"
          >
            🔗 Visit Website →
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        {stand.queueEnabled && (
          <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white
                             rounded-lg text-sm font-medium transition-colors">
            🎫 Join Queue ({queue.length} waiting)
          </button>
        )}
        {stand.leadCaptureEnabled && (
          <button
            onClick={() => setShowLeadForm(true)}
            className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white
                       rounded-lg text-sm font-medium transition-colors"
          >
            📇 Leave Your Info
          </button>
        )}
        <button className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300
                           rounded-lg text-sm font-medium transition-colors">
          💬 Message Stand Owner
        </button>
      </div>
    </div>
  );
}

function StandMediaRenderer({ media }: { media: StandMedia }) {
  switch (media.type) {
    case "IMAGE":
      return <img src={media.url} alt={media.caption || ""} className="w-full h-full object-contain" />;
    case "VIDEO":
      return <video src={media.url} controls className="w-full h-full" />;
    case "IFRAME":
      return <iframe src={media.url} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" />;
    default:
      return <div className="flex items-center justify-center h-full text-gray-500">Unsupported media</div>;
  }
}

function StandSkeleton() {
  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-gray-900 border-l border-gray-700 z-50 p-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-2/3" />
        <div className="aspect-video bg-gray-800 rounded" />
        <div className="h-4 bg-gray-800 rounded w-full" />
        <div className="h-4 bg-gray-800 rounded w-5/6" />
      </div>
    </div>
  );
}
```

### 8.3 Stand CRUD API

```typescript
// app/api/stands/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth"; // or your auth
import { prisma } from "@/lib/prisma";

// GET: List stands in a room
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

  const stands = await prisma.stand.findMany({
    where: { roomId, isActive: true },
    include: {
      owner: { select: { id: true, name: true, profileImageUrl: true } },
      media: { orderBy: { sortOrder: "asc" } },
      _count: { select: { leads: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(stands);
}

// POST: Create a stand
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { roomId, title, tagline, description, posX, posY, websiteUrl, logoUrl, media } = body;

  // Check user's stand limit based on subscription tier
  const existingStands = await prisma.stand.count({
    where: { ownerId: session.user.id, isActive: true },
  });
  const MAX_FREE_STANDS = 1;
  // TODO: Check user's subscription tier for higher limits

  if (existingStands >= MAX_FREE_STANDS) {
    return NextResponse.json(
      { error: "Stand limit reached. Upgrade to create more." },
      { status: 403 }
    );
  }

  const stand = await prisma.stand.create({
    data: {
      ownerId: session.user.id,
      roomId,
      title,
      tagline,
      description,
      posX,
      posY,
      websiteUrl,
      logoUrl,
      media: media?.length
        ? {
            create: media.map((m: any, i: number) => ({
              type: m.type,
              url: m.url,
              caption: m.caption,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: { media: true },
  });

  return NextResponse.json(stand, { status: 201 });
}
```

---

## 9. API Routes

### 9.1 Complete API Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/map/rooms?north&south&east&west&zoom` | Geo-query rooms for viewport | No |
| `GET` | `/api/map/heatmap?bounds` | Activity heatmap tile data | No |
| `GET` | `/api/rooms` | List rooms (filterable) | No |
| `POST` | `/api/rooms` | Create room | Yes |
| `GET` | `/api/rooms/[roomId]` | Room details + stands + events | No |
| `PATCH` | `/api/rooms/[roomId]` | Update room settings | Owner |
| `DELETE` | `/api/rooms/[roomId]` | Deactivate room | Owner |
| `POST` | `/api/rooms/[roomId]/join` | Join room (validates access) | Yes |
| `POST` | `/api/rooms/[roomId]/leave` | Leave room | Yes |
| `GET` | `/api/stands?roomId` | List stands in room | No |
| `POST` | `/api/stands` | Create stand | Yes |
| `GET` | `/api/stands/[standId]` | Stand details with media | No |
| `PATCH` | `/api/stands/[standId]` | Update stand | Owner |
| `DELETE` | `/api/stands/[standId]` | Remove stand | Owner |
| `POST` | `/api/stands/[standId]/leads` | Submit lead capture form | Yes |
| `GET` | `/api/stands/[standId]/analytics` | Stand analytics | Owner |
| `POST` | `/api/conversations` | Create conversation | Yes |
| `GET` | `/api/conversations/[convId]/messages` | Paginated message history | Member |
| `POST` | `/api/conversations/[convId]/invite` | Invite user to conversation | Member |
| `POST` | `/api/connections` | Send connection request | Yes |
| `PATCH` | `/api/connections/[connId]` | Accept/decline connection | Yes |
| `GET` | `/api/connections` | List user's connections | Yes |
| `GET` | `/api/users/[userId]/card` | Get business card | No |
| `PATCH` | `/api/users/me/card` | Update business card | Yes |
| `PATCH` | `/api/users/me/avatar` | Update avatar config | Yes |
| `POST` | `/api/rooms/[roomId]/report` | Report user or room | Yes |
| `GET` | `/api/events?roomId&upcoming` | List room events | No |
| `POST` | `/api/events` | Create room event | Room owner |

---

## 10. Frontend Component Tree

```
<App>
├── <WorldMapPage>                     // /map
│   ├── <WorldMap>                     // Leaflet map
│   │   ├── <MapEventHandler>         // Viewport change listener
│   │   ├── <RoomMarker> (×N)         // Individual room pins
│   │   ├── <RoomCluster> (×N)        // Aggregated city clusters
│   │   └── <HeatmapOverlay>          // Canvas heatmap layer
│   ├── <MapFilters>                   // Category, activity filters
│   ├── <CreateRoomModal>              // Form to create new room
│   └── <UserProfileSidebar>          // Quick profile / business card
│
├── <RoomPage>                         // /room/[roomId]
│   ├── <RoomCanvas>                   // PixiJS canvas wrapper
│   │   ├── Engine.ts (imperatively)
│   │   ├── AvatarSprite.ts (×N)
│   │   ├── StandObject.ts (×N)
│   │   └── ConversationBubble.ts (×N)
│   │
│   ├── <RoomHUD>                      // React overlay on canvas
│   │   ├── <Minimap>                 // Corner minimap
│   │   ├── <RoomInfo>                // Room name, count, category
│   │   ├── <AvailabilityPicker>      // Status dropdown
│   │   └── <LeaveRoomButton>
│   │
│   ├── <ChatPanel>                    // Right sidebar
│   │   ├── <ChatTabs>               // Proximity | Conversation
│   │   ├── <ChatMessage> (×N)
│   │   └── <ChatInput>
│   │
│   ├── <ProximityChatOverlay>         // Floating messages near avatars
│   │
│   ├── <StandViewer>                  // Slide-out panel
│   │   ├── <StandMediaRenderer>
│   │   ├── <LeadCaptureForm>
│   │   └── <StandQueue>
│   │
│   ├── <ConversationRequestModal>     // Join request popup
│   ├── <BusinessCardPopup>            // On avatar click
│   └── <StandEditor>                  // Create/edit stand (modal)
│
├── <AvatarCustomizerPage>             // /settings/avatar
│   ├── <SpritePreview>               // Live preview of composited avatar
│   ├── <BodySelector>                // Body variant picker
│   ├── <ColorPicker>                 // Body tint
│   └── <AccessoryGrid>              // Hats, glasses, etc.
│
└── <ProfilePage>                      // /profile
    ├── <BusinessCardEditor>
    ├── <ConnectionsList>
    ├── <PassportView>                 // Rooms visited log
    └── <StandAnalyticsDashboard>
```

---

## 11. State Management

### 11.1 Zustand Stores

```typescript
// stores/roomStore.ts

import { create } from "zustand";

interface RoomUser {
  id: string;
  name: string;
  profileImageUrl: string | null;
  x: number;
  y: number;
  facing: string;
  availability: string;
  interestTags: string[];
}

interface RoomState {
  // Room info
  currentRoom: RoomConfig | null;
  users: Map<string, RoomUser>;
  stands: StandPayload[];
  conversations: ConversationPayload[];

  // My state
  myPosition: { x: number; y: number };
  myAvailability: string;
  activeConversationId: string | null;
  viewingStandId: string | null;

  // Actions
  setRoom: (room: RoomConfig) => void;
  addUser: (user: RoomUser) => void;
  removeUser: (userId: string) => void;
  updateUserPosition: (userId: string, x: number, y: number, facing: string) => void;
  setMyPosition: (x: number, y: number) => void;
  setActiveConversation: (id: string | null) => void;
  setViewingStand: (id: string | null) => void;
  addConversation: (conv: ConversationPayload) => void;
  removeConversation: (convId: string) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  currentRoom: null,
  users: new Map(),
  stands: [],
  conversations: [],
  myPosition: { x: 0, y: 0 },
  myAvailability: "OPEN_TO_CHAT",
  activeConversationId: null,
  viewingStandId: null,

  setRoom: (room) => set({ currentRoom: room }),

  addUser: (user) => set((state) => {
    const users = new Map(state.users);
    users.set(user.id, user);
    return { users };
  }),

  removeUser: (userId) => set((state) => {
    const users = new Map(state.users);
    users.delete(userId);
    return { users };
  }),

  updateUserPosition: (userId, x, y, facing) => set((state) => {
    const users = new Map(state.users);
    const user = users.get(userId);
    if (user) {
      users.set(userId, { ...user, x, y, facing });
    }
    return { users };
  }),

  setMyPosition: (x, y) => set({ myPosition: { x, y } }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setViewingStand: (id) => set({ viewingStandId: id }),

  addConversation: (conv) => set((state) => ({
    conversations: [...state.conversations, conv],
  })),

  removeConversation: (convId) => set((state) => ({
    conversations: state.conversations.filter(c => c.id !== convId),
  })),

  reset: () => set({
    currentRoom: null,
    users: new Map(),
    stands: [],
    conversations: [],
    activeConversationId: null,
    viewingStandId: null,
  }),
}));
```

### 11.2 Socket Hook

```typescript
// lib/socket.ts

"use client";

import { io, Socket } from "socket.io-client";
import { useEffect, useRef } from "react";
import { useRoomStore } from "@/stores/roomStore";

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001", {
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function useSocket() {
  return socket;
}

/**
 * Hook that connects socket events to the Zustand room store
 */
export function useRoomSocketSync(roomId: string, token: string) {
  const store = useRoomStore();
  const engineRef = useRef<RoomEngine | null>(null);

  useEffect(() => {
    const s = getSocket(token);

    s.on("room:state", (data) => {
      store.setRoom(data.room);
      for (const user of data.users) {
        store.addUser(user);
      }
      store.setMyPosition(data.myPosition.x, data.myPosition.y);
      // Initialize engine with state
      engineRef.current?.loadRoomState(data);
    });

    s.on("room:user_joined", (data) => {
      store.addUser(data);
      engineRef.current?.addAvatar(data);
    });

    s.on("room:user_left", ({ userId }) => {
      store.removeUser(userId);
      engineRef.current?.removeAvatar(userId);
    });

    s.on("room:user_moved", ({ userId, x, y, facing }) => {
      store.updateUserPosition(userId, x, y, facing);
      engineRef.current?.moveRemoteAvatar(userId, x, y, facing);
    });

    s.on("conversation:created", (data) => {
      store.addConversation(data);
      engineRef.current?.addConversationBubble(data);
    });

    s.on("conversation:ended", ({ conversationId }) => {
      store.removeConversation(conversationId);
      // Engine removes bubble
    });

    // Join the room
    s.emit("room:join", { roomId });

    return () => {
      s.emit("room:leave", { roomId });
      s.off("room:state");
      s.off("room:user_joined");
      s.off("room:user_left");
      s.off("room:user_moved");
      s.off("conversation:created");
      s.off("conversation:ended");
      store.reset();
    };
  }, [roomId, token]);

  return { engineRef };
}
```

---

## 12. Moderation & Safety

### 12.1 Rate Limiting

```typescript
// server/middleware/rateLimiter.ts

const rateLimits = new Map<string, { count: number; resetAt: number }>();

const LIMITS: Record<string, { maxPerWindow: number; windowMs: number }> = {
  "chat:proximity":       { maxPerWindow: 30, windowMs: 60_000 },  // 30 msgs/min
  "chat:conversation":    { maxPerWindow: 60, windowMs: 60_000 },
  "room:move":            { maxPerWindow: 900, windowMs: 60_000 }, // 15/sec
  "conversation:create":  { maxPerWindow: 5, windowMs: 60_000 },
  "stand:queue:join":     { maxPerWindow: 10, windowMs: 60_000 },
};

export function checkRateLimit(userId: string, event: string): boolean {
  const limit = LIMITS[event];
  if (!limit) return true;

  const key = `${userId}:${event}`;
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  if (entry.count >= limit.maxPerWindow) {
    return false;
  }

  entry.count++;
  return true;
}
```

### 12.2 Content Filtering

```typescript
// lib/moderation.ts

// Basic profanity filter — replace with a real service (Perspective API, OpenAI Moderation)
// in production
const BLOCKED_PATTERNS = [
  // add patterns here
];

export async function moderateContent(text: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  // Level 1: Basic regex filter
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: "Content policy violation" };
    }
  }

  // Level 2: External moderation API (production)
  // const result = await fetch("https://api.openai.com/v1/moderations", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` },
  //   body: JSON.stringify({ input: text }),
  // }).then(r => r.json());
  // if (result.results[0].flagged) return { allowed: false, reason: "Flagged by AI" };

  return { allowed: true };
}
```

### 12.3 Reporting Flow

- Users click avatar → "Report" button → select reason → submitted via `POST /api/rooms/[roomId]/report`
- Reports stored in `RoomReport` table
- Room hosts see reports in their dashboard and can take action (mute/kick)
- System-level moderators see all OPEN reports in admin panel
- Automated: If a user accumulates 3+ upheld reports, temporary suspension

---

## 13. Performance & Scaling

### 13.1 Optimization Strategies

| Concern | Strategy |
|---|---|
| **Map loading** | Cluster rooms at low zoom. Only fetch rooms within viewport. Use `react-window` for room lists. Debounce viewport queries (300ms). |
| **Canvas rendering** | PixiJS GPU acceleration. Object pooling for avatars. Cull off-screen sprites. Limit max visible avatars to 100 (fade distant ones). |
| **Socket traffic** | Throttle movement to 15 updates/sec. Batch position updates server-side. Use Socket.IO rooms to scope broadcasts. Binary protocol for position data (optional: use `msgpack`). |
| **Database** | PostGIS spatial index for geo queries. Redis for hot data (room counts, online users, positions). Paginate message history. Connection pooling via PgBouncer in production. |
| **Avatar sprites** | Generate composite spritesheet once, cache in IndexedDB. Pre-generate common body variants as base64 in a CDN. Profile pic loading via `<img loading="lazy">`. |
| **Horizontal scaling** | Socket.IO Redis adapter for multi-server pub/sub. Stateless Next.js API behind load balancer. Redis cluster for high-volume rooms. |

### 13.2 Room Size Tiers

| Tier | Max Users | Strategy |
|---|---|---|
| Small | ≤ 20 | Full state sync, all avatars rendered |
| Medium | 21–100 | Proximity-based rendering (only show nearby 50) |
| Large | 101–500 | Area-of-interest filtering, simplified distant avatars (dots) |
| Massive | 500+ | Multiple "shards" of the same room, overflow into copies |

### 13.3 Environment Variables

```bash
# .env.local

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/spatialnet?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Socket
SOCKET_PORT=3001

# Storage (S3-compatible)
S3_BUCKET=spatialnet-assets
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_ENDPOINT=... # for R2/MinIO

# Auth (existing)
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Moderation (optional)
OPENAI_MODERATION_KEY=...
```

---

## 14. Deployment Checklist

### Phase 1: Foundation
- [ ] Enable PostGIS on database; run spatial migration
- [ ] Add Prisma models and run `prisma migrate dev`
- [ ] Set up Redis instance (Upstash / ElastiCache / local)
- [ ] Create Socket.IO sidecar server with auth middleware
- [ ] Implement `room:join`, `room:leave`, `room:move` socket events
- [ ] Build world map page with Leaflet + room geo-query API
- [ ] Build basic room page with PixiJS canvas, avatar rendering

### Phase 2: Social
- [ ] Implement avatar sprite compositor (profile pic + body)
- [ ] Build chat system (proximity + conversation bubbles)
- [ ] Conversation lifecycle: create, join/request, leave, end
- [ ] Business card model and popup UI
- [ ] Connection request system

### Phase 3: Commerce
- [ ] Stand CRUD (create, edit, position in room)
- [ ] Stand viewer panel with media carousel
- [ ] Stand queue system
- [ ] Lead capture forms (premium)
- [ ] Stand analytics (view count, unique visitors, dwell time)

### Phase 4: Scale & Polish
- [ ] Position batching / buffer flush
- [ ] Redis-backed room state for fast reconnection
- [ ] Rate limiting on all socket events
- [ ] Content moderation pipeline
- [ ] Report system + admin dashboard
- [ ] Room event scheduling
- [ ] Avatar accessory shop (cosmetics store)
- [ ] Room templates (Conference, Trade Show, etc.)
- [ ] Load testing (Artillery or k6 against socket server)
- [ ] Monitoring (Prometheus metrics for: connected users, rooms active, messages/sec)

### Phase 5: Monetization
- [ ] Subscription tiers (Stripe integration)
- [ ] Stand tier gating (Basic free → Premium paid)
- [ ] Sponsored room pins (featured placement on map)
- [ ] Avatar cosmetics store
- [ ] Event ticketing (Stripe Connect for room hosts)
- [ ] API / white-label licensing portal

---

## Appendix A: Type Definitions

```typescript
// types/index.ts

// Shared across client and server

interface UserBrief {
  id: string;
  name: string;
  profileImageUrl: string | null;
}

interface RoomConfig {
  id: string;
  name: string;
  mapWidth: number;
  mapHeight: number;
  template: string;
  tileMapData: any;
  backgroundUrl: string | null;
}

interface RoomUserPayload extends UserBrief {
  avatarConfig: any;
  x: number;
  y: number;
  facing: string;
  availability: string;
  interestTags: string[];
}

interface RoomStatePayload {
  room: RoomConfig;
  users: RoomUserPayload[];
  stands: StandPayload[];
  conversations: ConversationPayload[];
  myPosition: { x: number; y: number };
}

interface StandPayload {
  id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  posX: number;
  posY: number;
  width: number;
  height: number;
  tier: string;
  style: any;
  media: StandMediaPayload[];
  leadCaptureEnabled: boolean;
  queueEnabled: boolean;
}

interface StandMediaPayload {
  id: string;
  type: string;
  url: string;
  caption: string | null;
}

interface ConversationPayload {
  id: string;
  topic: string | null;
  isOpen: boolean;
  anchorX: number;
  anchorY: number;
  members: UserBrief[];
}

interface ProximityMsgPayload {
  id: string;
  senderId: string;
  senderName: string;
  senderProfileImage: string | null;
  content: string;
  timestamp: string;
}

interface ConversationMsgPayload extends ProximityMsgPayload {
  conversationId: string;
  type: string;
}

interface JoinRequestPayload {
  requestId: string;
  conversationId: string;
  requester: UserBrief;
  topic: string | null;
  message: string | null;
}

interface QueueEntry {
  userId: string;
  name: string;
  position: number;
  status: string;
}
```

---

## Appendix B: Required Dependencies

```bash
# Core
npm install socket.io socket.io-client
npm install @socket.io/redis-adapter redis
npm install react-leaflet leaflet
npm install pixi.js
npm install zustand

# Types
npm install -D @types/leaflet

# Optional (production enhancements)
npm install msgpack-lite    # binary socket encoding
npm install sharp           # server-side avatar compositing
npm install bullmq          # job queues for async tasks
npm install stripe          # payments / subscriptions
```
