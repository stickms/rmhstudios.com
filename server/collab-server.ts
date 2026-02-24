import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import * as Y from 'yjs';

const PORT = Number(process.env.COLLAB_PORT) || 7003;

// Lazy-load Prisma with PrismaPg adapter (same pattern as socket-server.ts)
let prisma: any = null;

async function getPrisma(): Promise<any> {
  if (prisma) return prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { console.warn('[collab] DATABASE_URL not set, DB persistence disabled'); return null; }
    const adapter = new PrismaPg({ connectionString: dbUrl });
    prisma = new PrismaClient({ adapter });
    console.log('[collab] Prisma initialized successfully');
    return prisma;
  } catch (err) {
    console.warn('[collab] Prisma not available:', (err as Error).message);
    return null;
  }
}

// ─── Room Management ───

interface Room {
  yDoc: Y.Doc;
  clients: Map<WebSocket, { userId: string; name: string }>;
  saveTimeout: ReturnType<typeof setTimeout> | null;
  lastSaved: number;
}

const rooms = new Map<string, Room>();

const SAVE_DEBOUNCE_MS = 3000;

async function getOrCreateRoom(roomName: string): Promise<Room> {
  const existing = rooms.get(roomName);
  if (existing) return existing;

  const yDoc = new Y.Doc();

  // Parse documentId from room name (format: "doc-{id}", "sheet-{id}", "slide-{id}")
  const documentId = roomName.replace(/^(doc|sheet|slide)-/, '');

  // Load persisted state from DB
  try {
    const db = await getPrisma();
    if (db) {
      const doc = await db.document.findUnique({
        where: { id: documentId },
        select: { yjsState: true },
      });
      if (doc?.yjsState) {
        Y.applyUpdate(yDoc, new Uint8Array(doc.yjsState));
      }
    }
  } catch (err) {
    console.error(`[collab] Failed to load room ${roomName}:`, err);
  }

  const room: Room = {
    yDoc,
    clients: new Map(),
    saveTimeout: null,
    lastSaved: Date.now(),
  };

  // Save to DB on document updates (debounced)
  yDoc.on('update', () => {
    if (room.saveTimeout) clearTimeout(room.saveTimeout);
    room.saveTimeout = setTimeout(() => saveRoom(roomName, room), SAVE_DEBOUNCE_MS);
  });

  rooms.set(roomName, room);
  return room;
}

async function saveRoom(roomName: string, room: Room) {
  const documentId = roomName.replace(/^(doc|sheet|slide)-/, '');
  try {
    const db = await getPrisma();
    if (!db) return;
    const state = Y.encodeStateAsUpdate(room.yDoc);
    await db.document.update({
      where: { id: documentId },
      data: { yjsState: Buffer.from(state) },
    });
    room.lastSaved = Date.now();
  } catch (err) {
    console.error(`[collab] Failed to save room ${roomName}:`, err);
  }
}

function cleanupRoom(roomName: string) {
  const room = rooms.get(roomName);
  if (!room) return;
  if (room.clients.size > 0) return;

  // Save before cleanup
  if (room.saveTimeout) clearTimeout(room.saveTimeout);
  saveRoom(roomName, room).then(() => {
    room.yDoc.destroy();
    rooms.delete(roomName);
    console.log(`[collab] Room ${roomName} cleaned up`);
  });
}

// ─── Auth ───

async function validateSession(token: string): Promise<{ userId: string; name: string } | null> {
  if (!token) return null;
  try {
    const db = await getPrisma();
    if (!db) return null;
    const session = await db.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!session || session.expiresAt < new Date()) return null;
    return { userId: session.user.id, name: session.user.name || 'Anonymous' };
  } catch {
    return null;
  }
}

async function checkDocumentAccess(documentId: string, userId: string): Promise<boolean> {
  try {
    const db = await getPrisma();
    if (!db) return false;
    const doc = await db.document.findUnique({
      where: { id: documentId },
      select: {
        userId: true,
        collaborators: { where: { userId }, select: { id: true } },
      },
    });
    if (!doc) return false;
    return doc.userId === userId || doc.collaborators.length > 0;
  } catch {
    return false;
  }
}

// ─── Y.js Sync Protocol (simplified) ───

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const MSG_SYNC_STEP1 = 0;
const MSG_SYNC_STEP2 = 1;
const MSG_SYNC_UPDATE = 2;

function writeSyncStep1(doc: Y.Doc): Uint8Array {
  const stateVector = Y.encodeStateVector(doc);
  const data = new Uint8Array(2 + stateVector.length);
  data[0] = MSG_SYNC;
  data[1] = MSG_SYNC_STEP1;
  data.set(stateVector, 2);
  return data;
}

function writeSyncStep2(doc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  const update = Y.encodeStateAsUpdate(doc, stateVector);
  const data = new Uint8Array(2 + update.length);
  data[0] = MSG_SYNC;
  data[1] = MSG_SYNC_STEP2;
  data.set(update, 2);
  return data;
}

function writeUpdate(update: Uint8Array): Uint8Array {
  const data = new Uint8Array(2 + update.length);
  data[0] = MSG_SYNC;
  data[1] = MSG_SYNC_UPDATE;
  data.set(update, 2);
  return data;
}

function handleSyncMessage(room: Room, ws: WebSocket, message: Uint8Array) {
  const msgType = message[0];
  const syncType = message[1];
  const payload = message.slice(2);

  if (msgType === MSG_SYNC) {
    if (syncType === MSG_SYNC_STEP1) {
      // Client sends state vector, server responds with missing updates
      const response = writeSyncStep2(room.yDoc, payload);
      ws.send(response);
      // Also send server's state vector so client sends missing updates
      ws.send(writeSyncStep1(room.yDoc));
    } else if (syncType === MSG_SYNC_STEP2 || syncType === MSG_SYNC_UPDATE) {
      Y.applyUpdate(room.yDoc, payload);
      // Broadcast to all other clients
      const updateMsg = writeUpdate(payload);
      room.clients.forEach((_, client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(updateMsg);
        }
      });
    }
  } else if (msgType === MSG_AWARENESS) {
    // Broadcast awareness to all other clients
    room.clients.forEach((_, client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// ─── WebSocket Server ───

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const roomName = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  const token = url.searchParams.get('token') || '';

  if (!roomName) {
    ws.close(4000, 'Missing room name');
    return;
  }

  // Auth
  const userInfo = await validateSession(token);
  if (!userInfo) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Check document access
  const documentId = roomName.replace(/^(doc|sheet|slide)-/, '');
  const hasAccess = await checkDocumentAccess(documentId, userInfo.userId);
  if (!hasAccess) {
    ws.close(4003, 'Forbidden');
    return;
  }

  // Join room
  const room = await getOrCreateRoom(roomName);
  room.clients.set(ws, userInfo);
  console.log(`[collab] ${userInfo.name} joined ${roomName} (${room.clients.size} clients)`);

  // Send initial sync
  ws.send(writeSyncStep1(room.yDoc));

  ws.on('message', (data) => {
    try {
      const message = new Uint8Array(data as ArrayBuffer);
      handleSyncMessage(room, ws, message);
    } catch (err) {
      console.error(`[collab] Error handling message in ${roomName}:`, err);
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    console.log(`[collab] User left ${roomName} (${room.clients.size} clients)`);
    if (room.clients.size === 0) {
      // Delay cleanup so reconnects don't lose state
      setTimeout(() => cleanupRoom(roomName), 30000);
    }
  });

  ws.on('error', (err) => {
    console.error(`[collab] WebSocket error in ${roomName}:`, err);
    room.clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[collab] Y.js collaboration server running on port ${PORT}`);
});
