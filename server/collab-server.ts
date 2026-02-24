import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Awareness } from 'y-protocols/awareness';

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

// ─── Message Types (matching y-protocols) ───

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// ─── Room Management ───
interface Room {
  yDoc: Y.Doc;
  awareness: Awareness;
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
  const awareness = new Awareness(yDoc);

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
    awareness,
    clients: new Map(),
    saveTimeout: null,
    lastSaved: Date.now(),
  };

  // Save to DB and broadcast updates
  yDoc.on('update', (update: Uint8Array, origin: unknown) => {
    // Debounced save to DB
    if (room.saveTimeout) clearTimeout(room.saveTimeout);
    room.saveTimeout = setTimeout(() => saveRoom(roomName, room), SAVE_DEBOUNCE_MS);

    // Broadcast to all clients except the one that originated the update
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);
    room.clients.forEach((_, client) => {
      if (client !== origin && client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  });

  // Broadcast awareness changes to all clients
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const changedClients = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    const msg = encoding.toUint8Array(encoder);
    room.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
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
    room.awareness.destroy();
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

// ─── Message Handling ───

function handleMessage(room: Room, ws: WebSocket, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MSG_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      // Pass ws as origin so the update handler can avoid echoing back to sender
      syncProtocol.readSyncMessage(decoder, encoder, room.yDoc, ws);

      // If the sync response has content, send it back
      if (encoding.length(encoder) > 1) {
        ws.send(encoding.toUint8Array(encoder));
      }
      break;
    }
    case MSG_AWARENESS: {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
      break;
    }
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

  // Send sync step 1 (server state vector) so client can respond with missing updates
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.yDoc);
    ws.send(encoding.toUint8Array(encoder));
  }

  // Send sync step 2 (full document state) so client has the complete document
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep2(encoder, room.yDoc);
    ws.send(encoding.toUint8Array(encoder));
  }

  // Send current awareness states
  {
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
      ws.send(encoding.toUint8Array(encoder));
    }
  }

  ws.on('message', (rawData) => {
    try {
      const message = new Uint8Array(rawData as ArrayBuffer);
      handleMessage(room, ws, message);
    } catch (err) {
      console.error(`[collab] Error handling message in ${roomName}:`, err);
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    // Remove client from awareness
    awarenessProtocol.removeAwarenessStates(room.awareness, [room.yDoc.clientID], null);
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
