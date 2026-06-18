// Package rmhmusic is the Go port of the Node rmhmusic service (synchronized
// group music-listening rooms). In Node it lived inside the unified socket-server
// behind the "rmhmusic:" event prefix; here it is its own standalone service. It
// is a faithful port of server/rmhmusic/* (RoomManager, SyncEngine, QueueManager,
// ChatHandler) onto the shared realtime.Hub.
//
// State model: rooms (and everything inside them — members, queue, playback,
// chat) are held in memory by the Manager. Only the room row is persisted, on
// create, fire-and-forget (see repo.go). This matches the Node service exactly.
//
// Concurrency: the Manager holds a top-level RWMutex over its index maps
// (rooms / connToRoom / userToConn). Each ServerRoom additionally has its own
// mutex; all mutation of a room's fields happens under room.mu, so concurrent
// events on different rooms never contend and events on the same room serialize.
package rmhmusic

import (
	"context"
	"sync"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Timer/sync intervals, ported from server/rmhmusic/config.ts +
// lib/rmhmusic/constants.ts. Overridable via env to mirror the Node config.
const (
	disconnectGrace  = 30 * time.Second
	emptyRoomTimeout = 300 * time.Second
	gcInterval       = 60 * time.Second
	syncHeartbeat    = 5 * time.Second
)

// Manager owns all rooms and the connection<->room<->user indexes. It is the
// composite of the four Node managers (room/sync/queue/chat) which there shared
// one RoomManager instance; here that shared state lives on Manager directly.
type Manager struct {
	hub    *realtime.Hub
	logger *log.Logger
	repo   Repo
	timers *realtime.GraceTimers

	mu         sync.RWMutex
	rooms      map[string]*ServerRoom // roomId -> room
	connToRoom map[string]string      // connId -> roomId (analog of socketToRoom)
	userToConn map[string]string      // userId -> current connId

	stopCh chan struct{}
	now    func() int64 // injectable clock for tests; defaults to time.Now
}

// NewManager constructs the service manager.
func NewManager(hub *realtime.Hub, logger *log.Logger, repo Repo) *Manager {
	return &Manager{
		hub:        hub,
		logger:     logger,
		repo:       repo,
		timers:     realtime.NewGraceTimers(),
		rooms:      make(map[string]*ServerRoom),
		connToRoom: make(map[string]string),
		userToConn: make(map[string]string),
		stopCh:     make(chan struct{}),
		now:        func() int64 { return time.Now().UnixMilli() },
	}
}

// Register wires every inbound handler and the disconnect lifecycle onto the hub,
// then starts the background tickers. Mirrors handlers/rmhmusic.ts ensureInit +
// the per-manager handleConnection registrations.
func (m *Manager) Register() {
	m.hub.OnConnect(func(c *realtime.Conn) {
		// rmhmusic requires auth (hub RequireAuth: true), so c is always
		// authenticated here. Track the latest connection for this user.
		m.mu.Lock()
		m.userToConn[c.UserID()] = c.ID
		m.mu.Unlock()
	})
	m.hub.OnDisconnect(m.onDisconnect)

	// Room lifecycle.
	m.hub.On(c2sRoomCreate, m.onCreate)
	m.hub.On(c2sRoomJoin, m.onJoin)
	m.hub.On(c2sRoomLeave, m.onLeave)
	m.hub.On(c2sRoomTransferHost, m.onTransferHost)
	m.hub.On(c2sRoomBrowse, m.onBrowse)

	// Playback (host-only).
	m.hub.On(c2sMusicPlay, m.onPlay)
	m.hub.On(c2sMusicPause, m.onPause)
	m.hub.On(c2sMusicSeek, m.onSeek)
	m.hub.On(c2sMusicSkip, m.onSkip)

	// Queue.
	m.hub.On(c2sQueueAdd, m.onQueueAdd)
	m.hub.On(c2sQueueRemove, m.onQueueRemove)
	m.hub.On(c2sQueueReorder, m.onQueueReorder)

	// Chat.
	m.hub.On(c2sRoomChat, m.onChat)
}

// Start launches the GC reaper and the playback sync heartbeat tickers.
func (m *Manager) Start(ctx context.Context) {
	go m.runGC(ctx)
	go m.runHeartbeat(ctx)
}

// Stop tears down background work and pending grace timers.
func (m *Manager) Stop() {
	close(m.stopCh)
	m.timers.CancelAll()
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (m *Manager) sendErr(c *realtime.Conn, code, message string) {
	c.Send(realtime.MustEnvelope(s2cError, map[string]any{"code": code, "message": message}))
}

// roomForConn returns the room a connection is currently in, or nil.
func (m *Manager) roomForConn(connID string) *ServerRoom {
	m.mu.RLock()
	roomID := m.connToRoom[connID]
	room := m.rooms[roomID]
	m.mu.RUnlock()
	return room
}

// broadcastAction is the seq-numbered mutation delta path (ports
// RoomManager.broadcastAction). It increments the room's monotonic Seq and
// broadcasts a room:action envelope whose payload is {type,payload,seq,timestamp}
// — byte-compatible with the Node shape. The inner payload seq (the room's own
// counter, what the Node delta carried and what snapshots report) is the single
// authoritative sequence, so this goes out via hub.Broadcast (NOT BroadcastSeq):
// matching rmhtube and avoiding a redundant second envelope-level seq stamp.
// Callers MUST hold room.mu.
func (m *Manager) broadcastAction(room *ServerRoom, typ string, payload any) {
	room.Seq++
	room.LastActivityAt = m.now()
	m.hub.Broadcast(room.ID, realtime.MustEnvelope(s2cRoomAction, map[string]any{
		"type":      typ,
		"payload":   payload,
		"seq":       room.Seq,
		"timestamp": m.now(),
	}))
}

// broadcast sends a plain (non-seq) named event to every member of a room.
func (m *Manager) broadcast(roomID, event string, payload any) {
	m.hub.Broadcast(roomID, realtime.MustEnvelope(event, payload))
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
