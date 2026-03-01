// ============================================================
// Kowloon Knockout — WebSocket Relay Server
// ============================================================

// @ts-expect-error -- ws types are not installed; this file is bundled by esbuild, not Next.js
import { WebSocketServer, WebSocket } from 'ws';

type FighterClass = 'power' | 'speed' | 'resistance';

interface Room {
    code: string;
    host: WebSocket;
    guest: WebSocket | null;
    hostClass: FighterClass;
    guestClass: FighterClass | null;
}

const PORT = Number(process.env.PORT) || 8080;
const rooms = new Map<string, Room>();
const clientRooms = new Map<WebSocket, string>();

function generateRoomCode(): string {
    let code: string;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (rooms.has(code));
    return code;
}

function sendJSON(ws: WebSocket, data: object): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function cleanupClient(ws: WebSocket): void {
    const roomCode = clientRooms.get(ws);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) {
        clientRooms.delete(ws);
        return;
    }

    // Notify the other player
    if (room.host === ws && room.guest) {
        sendJSON(room.guest, { type: 'opponent_disconnected' });
        clientRooms.delete(room.guest);
    } else if (room.guest === ws) {
        sendJSON(room.host, { type: 'opponent_disconnected' });
        clientRooms.delete(room.host);
    }

    rooms.delete(roomCode);
    clientRooms.delete(ws);
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (raw: Buffer) => {
        let msg: any;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }

        switch (msg.type) {
            case 'create_room': {
                // Clean up any previous room
                cleanupClient(ws);

                const code = generateRoomCode();
                const room: Room = {
                    code,
                    host: ws,
                    guest: null,
                    hostClass: msg.fighterClass,
                    guestClass: null,
                };
                rooms.set(code, room);
                clientRooms.set(ws, code);
                sendJSON(ws, { type: 'room_created', code });
                console.log(`Room ${code} created`);
                break;
            }

            case 'join_room': {
                const code = (msg.code as string).toUpperCase();
                const room = rooms.get(code);

                if (!room) {
                    sendJSON(ws, { type: 'error', message: 'Room not found' });
                    return;
                }
                if (room.guest) {
                    sendJSON(ws, { type: 'error', message: 'Room is full' });
                    return;
                }

                room.guest = ws;
                room.guestClass = msg.fighterClass;
                clientRooms.set(ws, code);

                // Notify both players
                sendJSON(room.host, {
                    type: 'room_joined',
                    hostClass: room.hostClass,
                    guestClass: room.guestClass,
                    isHost: true,
                });
                sendJSON(room.guest, {
                    type: 'room_joined',
                    hostClass: room.hostClass,
                    guestClass: room.guestClass,
                    isHost: false,
                });
                console.log(`Room ${code} — opponent joined`);
                break;
            }

            case 'input': {
                // Guest → host relay
                const roomCode = clientRooms.get(ws);
                if (!roomCode) return;
                const room = rooms.get(roomCode);
                if (!room || room.guest !== ws) return;
                sendJSON(room.host, msg);
                break;
            }

            case 'game_state': {
                // Host → guest relay
                const roomCode = clientRooms.get(ws);
                if (!roomCode) return;
                const room = rooms.get(roomCode);
                if (!room || room.host !== ws || !room.guest) return;
                sendJSON(room.guest, msg);
                break;
            }

            case 'leave': {
                cleanupClient(ws);
                break;
            }
        }
    });

    ws.on('close', () => {
        cleanupClient(ws);
    });
});

console.log(`Kowloon Knockout relay server running on ws://localhost:${PORT}`);
