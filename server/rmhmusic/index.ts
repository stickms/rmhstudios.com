import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { authenticateSocket } from './auth';
import { RoomManager } from './room-manager';
import { SyncEngine } from './sync-engine';
import { QueueManager } from './queue-manager';
import { ChatHandler } from './chat-handler';

const httpServer = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RMHMusic Socket Server');
});

const io = new Server(httpServer, {
  path: config.socketPath,
  cors: { origin: config.cors, credentials: true },
  maxHttpBufferSize: config.maxBuffer,
  pingInterval: config.pingInterval,
  pingTimeout: config.pingTimeout,
});

const roomManager = new RoomManager(io);
const syncEngine = new SyncEngine(io, roomManager);
const queueManager = new QueueManager(io, roomManager);
const chatHandler = new ChatHandler(io, roomManager);

// ─── Auth Middleware ─────────────────────────────────────────────

io.use(async (socket, next) => {
  try {
    const user = await authenticateSocket(socket);
    socket.data = { ...socket.data, ...user };
    next();
  } catch (err) {
    logger.warn('Auth failed', { error: err });
    next(new Error('unauthorized'));
  }
});

// ─── Connection ──────────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id, userId: socket.data.userId });

  roomManager.handleConnection(socket);
  syncEngine.handleConnection(socket);
  queueManager.handleConnection(socket);
  chatHandler.handleConnection(socket);
});

// ─── Start ───────────────────────────────────────────────────────

roomManager.startGC();
syncEngine.startHeartbeat();

httpServer.listen(config.port, () => {
  logger.info(`RMHMusic server listening on port ${config.port}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  syncEngine.stop();
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), config.shutdownTimeoutMs);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
