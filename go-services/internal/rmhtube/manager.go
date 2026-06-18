package rmhtube

import (
	"context"
	"sync"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Manager is the Go port of server/rmhtube/room-manager.ts plus the sync, queue
// and chat handlers, all coordinated over the shared realtime.Hub.
//
// Concurrency model (per the brief — "per-room mutex; many goroutines"):
//   - registryMu guards the global maps (rooms / userRoomIndex / userConns).
//   - each roomEntry owns its own mutex; every read/write of a room's state is
//     done while holding that per-room lock. Handlers acquire the room lock,
//     mutate, collect the envelopes to send, release, then broadcast — so the
//     websocket writes never happen under the lock.
//   - grace + GC timers run on their own goroutines and re-acquire locks.
type Manager struct {
	hub     *realtime.Hub
	repo    Repo
	logger  *log.Logger
	metrics *telemetry.Metrics
	ctx     context.Context

	grace *realtime.GraceTimers

	mu            sync.Mutex
	rooms         map[string]*roomEntry
	userRoomIndex map[string]string         // userId -> roomId
	userConns     map[string]*realtime.Conn // userId -> current conn

	syncHB *time.Ticker
	gcTick *time.Ticker
	stopCh chan struct{}
}

// roomEntry pairs a room with the mutex that guards it.
type roomEntry struct {
	mu sync.Mutex
	r  *room
}

// NewManager constructs the coordinator. Pass NopRepo{} to run purely in-memory.
func NewManager(ctx context.Context, hub *realtime.Hub, repo Repo, logger *log.Logger, metrics *telemetry.Metrics) *Manager {
	return &Manager{
		hub:           hub,
		repo:          repo,
		logger:        logger,
		metrics:       metrics,
		ctx:           ctx,
		grace:         realtime.NewGraceTimers(),
		rooms:         make(map[string]*roomEntry),
		userRoomIndex: make(map[string]string),
		userConns:     make(map[string]*realtime.Conn),
		stopCh:        make(chan struct{}),
	}
}

// Register wires every inbound handler and the connection lifecycle onto the hub,
// then starts the sync heartbeat and the room garbage collector.
func (m *Manager) Register() {
	m.hub.OnConnect(func(c *realtime.Conn) {
		if uid := c.UserID(); uid != "" {
			m.mu.Lock()
			m.userConns[uid] = c
			m.mu.Unlock()
		}
	})
	m.hub.OnDisconnect(func(c *realtime.Conn) {
		m.handleDisconnect(c)
	})

	// Room lifecycle.
	m.hub.On(c2sRoomCreate, m.wrap(m.onRoomCreate))
	m.hub.On(c2sRoomJoin, m.wrap(m.onRoomJoin))
	m.hub.On(c2sRoomLeave, m.wrap(m.onRoomLeave))
	m.hub.On(c2sRoomKick, m.wrap(m.onRoomKick))
	m.hub.On(c2sRoomTransferHost, m.wrap(m.onTransferHost))
	m.hub.On(c2sRoomUpdateSettings, m.wrap(m.onUpdateSettings))
	m.hub.On(c2sRoomBrowse, m.wrap(m.onBrowse))
	m.hub.On(c2sRoomSetLeader, m.wrap(m.onSetLeader))
	m.hub.On(c2sRoomBan, m.wrap(m.onBan))
	m.hub.On(c2sRoomUnban, m.wrap(m.onUnban))
	m.hub.On(c2sRoomCreateInvite, m.wrap(m.onCreateInvite))
	m.hub.On(c2sRoomSetStatus, m.wrap(m.onSetStatus))
	m.hub.On(c2sRoomCheckHistory, m.wrap(m.onCheckHistory))

	// Sync.
	m.hub.On(c2sSyncHostState, m.wrap(m.onHostState))
	m.hub.On(c2sSyncPlay, m.wrap(m.onPlay))
	m.hub.On(c2sSyncPause, m.wrap(m.onPause))
	m.hub.On(c2sSyncSeek, m.wrap(m.onSeek))
	m.hub.On(c2sSyncSetSpeed, m.wrap(m.onSetSpeed))

	// Queue.
	m.hub.On(c2sQueueAdd, m.wrap(m.onQueueAdd))
	m.hub.On(c2sQueueRemove, m.wrap(m.onQueueRemove))
	m.hub.On(c2sQueueReorder, m.wrap(m.onQueueReorder))
	m.hub.On(c2sQueuePlayItem, m.wrap(m.onQueuePlayItem))
	m.hub.On(c2sQueueSkip, m.wrap(m.onQueueSkip))
	m.hub.On(c2sQueueVoteSkip, m.wrap(m.onQueueVoteSkip))
	m.hub.On(c2sQueueVote, m.wrap(m.onQueueVote))
	m.hub.On(c2sQueueShuffle, m.wrap(m.onQueueShuffle))
	m.hub.On(c2sReactionSend, m.wrap(m.onReaction))

	// Chat.
	m.hub.On(c2sRoomChat, m.wrap(m.onChat))
	m.hub.On(c2sChatTyping, m.wrap(m.onTyping))
	m.hub.On(c2sChatReact, m.wrap(m.onChatReact))
	m.hub.On(c2sChatPin, m.wrap(m.onChatPin))

	m.startSyncHeartbeat()
	m.startGC()
}

// Stop tears down the background tickers and grace timers (call on shutdown).
func (m *Manager) Stop() {
	close(m.stopCh)
	if m.syncHB != nil {
		m.syncHB.Stop()
	}
	if m.gcTick != nil {
		m.gcTick.Stop()
	}
	m.grace.CancelAll()
}

// wrap adapts a (Manager method on *realtime.Conn + Envelope) into a hub Handler,
// recording the message metric. (The hub already recovers handler panics.)
func (m *Manager) wrap(fn func(*realtime.Conn, realtime.Envelope)) realtime.Handler {
	return func(c *realtime.Conn, e realtime.Envelope) { fn(c, e) }
}

// ─── identity helpers ────────────────────────────────────────────────────────

// userOf resolves the stable user id for a connection. Authenticated users use
// their account id (matching socket.data.userId); anonymous connections fall
// back to the per-connection id so the room machinery still functions.
func userOf(c *realtime.Conn) string {
	if uid := c.UserID(); uid != "" {
		return uid
	}
	return c.ID
}

func nameOf(c *realtime.Conn) string {
	if c.Identity.Name != "" {
		return c.Identity.Name
	}
	return "Guest"
}

func avatarOf(c *realtime.Conn) string { return c.Identity.Image }

// ─── room registry access ────────────────────────────────────────────────────

func (m *Manager) entry(roomID string) (*roomEntry, bool) {
	m.mu.Lock()
	e, ok := m.rooms[roomID]
	m.mu.Unlock()
	return e, ok
}

// entryForUser returns the room entry the user is currently indexed to.
func (m *Manager) entryForUser(userID string) (*roomEntry, bool) {
	m.mu.Lock()
	roomID, ok := m.userRoomIndex[userID]
	var e *roomEntry
	if ok {
		e, ok = m.rooms[roomID]
	}
	m.mu.Unlock()
	return e, ok
}

func (m *Manager) connOf(userID string) (*realtime.Conn, bool) {
	m.mu.Lock()
	c, ok := m.userConns[userID]
	m.mu.Unlock()
	return c, ok
}

// sendErr emits S2C.ERROR to a single connection (the TS socket.emit(ERROR,...)).
func sendErr(c *realtime.Conn, code, msg string) {
	c.Send(realtime.MustEnvelope(s2cError, map[string]any{"code": code, "message": msg}))
}

// nowMs is the millisecond clock used throughout (matches JS Date.now()).
func nowMs() int64 { return time.Now().UnixMilli() }

// ─── broadcasting ────────────────────────────────────────────────────────────

// broadcastAction ports room-manager.ts broadcastAction: bumps the room seq and
// fans S2C.ROOM_ACTION {type,payload,seq,timestamp} to the whole room. The
// caller must hold the room lock (so seq stays consistent with snapshots).
func (m *Manager) broadcastAction(r *room, actionType string, payload any) {
	r.Seq++
	m.hub.Broadcast(r.ID, realtime.MustEnvelope(s2cRoomAction, map[string]any{
		"type":      actionType,
		"payload":   payload,
		"seq":       r.Seq,
		"timestamp": nowMs(),
	}))
}

// broadcastEnvelope fans a raw S2C event to the room (sync play/pause/etc).
func (m *Manager) broadcastEnvelope(roomID, event string, payload any) {
	m.hub.Broadcast(roomID, realtime.MustEnvelope(event, payload))
}

// broadcastExcept fans an event to everyone in the room except one connection
// (ports socket.to(room).emit, used for typing / reactions / play-pause-seek
// which the leader applies locally).
func (m *Manager) broadcastExcept(roomID, exceptConnID, event string, payload any) {
	r, ok := m.hub.Room(roomID)
	if !ok {
		return
	}
	env := realtime.MustEnvelope(event, payload)
	for _, c := range r.Members() {
		if c.ID == exceptConnID {
			continue
		}
		c.Send(env)
	}
}
