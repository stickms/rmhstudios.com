
import { io, Socket } from "socket.io-client";
import { useGameStore } from "../store/useGameStore";

// const SOCKET_URL = "http://localhost:7001";
// In production, this might be the same as window.location.origin if served together,
// or a specific env variable.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:7001";

export type GameEvent = 'lobby_update' | 'game_starting' | 'game_started' | 'player_update' | 'player_finished' | 'song_selected' | 'init_loading' | 'start_countdown';

class MultiplayerFactory {
    private static instance: MultiplayerFactory;
    private socket: Socket | null = null;
    
    // Listeners
    private listeners: Map<string, Function[]> = new Map();

    private constructor() {}

    public static getInstance(): MultiplayerFactory {
        if (!MultiplayerFactory.instance) {
            MultiplayerFactory.instance = new MultiplayerFactory();
        }
        return MultiplayerFactory.instance;
    }

    public connect() {
        if (this.socket?.connected) return;
        
        this.socket = io(SOCKET_URL, {
            path: "/socket/",
            transports: ["websocket"],
            reconnectionAttempts: 5
        });

        this.socket.on("connect", () => {
            console.log("Connected to WebSocket Server:", this.socket?.id);
        });
        
        this.socket.on("connect_error", (err) => {
            console.error("Socket Connection Error:", err);
        });

        // Global Event Handling
        const events = ['lobby_update', 'game_starting', 'game_started', 'player_update', 'player_finished', 'song_selected', 'match_results', 'init_loading', 'start_countdown'];
        events.forEach(evt => {
            this.socket?.on(evt, (data: any) => {
                this.emitLocal(evt, data);
                
                // DATA SYNC
                if (evt === 'lobby_update') {
                    // Update all players in store
                    data.players.forEach((p: any) => {
                        if (p.id !== this.socket?.id) {
                            useGameStore.getState().setOpponent(p.id, { name: p.name, score: p.score ?? 0 });
                        }
                    });
                }
                
                if (evt === 'player_update') {
                    if (data.id !== this.socket?.id) {
                        useGameStore.getState().setOpponent(data.id, data);
                    }
                }
            });
        });
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // Actions
    public joinLobby(lobbyId: string, userName: string, userId: string) {
        this.socket?.emit("join_lobby", { lobbyId, userName, userId });
    }

    public selectSong(lobbyId: string, song: any) {
        this.socket?.emit("select_song", { lobbyId, song });
    }

    public startGame(lobbyId: string) {
        this.socket?.emit("start_game", { lobbyId });
    }

    public updateScore(lobbyId: string, stats: { score: number, combo: number, health: number, isDead?: boolean }) {
        this.socket?.emit("score_update", { lobbyId, ...stats });
    }

    public playerLoaded(lobbyId: string) {
        this.socket?.emit("player_loaded", { lobbyId });
    }
    
    public finishGame(lobbyId: string, finalScore: number) {
        this.socket?.emit("player_finished", { lobbyId, finalScore });
    }

    // Event System (Pub/Sub)
    public on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
    }
    
    public off(event: string, callback: Function) {
        const list = this.listeners.get(event);
        if (list) {
            this.listeners.set(event, list.filter(cb => cb !== callback));
        }
    }
    
    private emitLocal(event: string, data: any) {
        const list = this.listeners.get(event);
        if (list) {
            list.forEach(cb => cb(data)); // Unsafe?
        }
    }
    
    public getSocketId() {
        return this.socket?.id;
    }
}

export { MultiplayerFactory };
