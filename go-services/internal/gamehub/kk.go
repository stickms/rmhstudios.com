package gamehub

import (
	"crypto/rand"
	"strings"
	"sync"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Kowloon Knockout — faithful Go port of
// server/socket-server/handlers/kowloon-knockout.ts.
//
// A simple 1v1 host-authoritative relay: the host creates a room, a guest joins,
// then "input" (guest->host) and "game_state" (host->guest) frames are relayed.
// A rematch handshake ("fighter_ready" from both seats) re-arms the match. This
// is ported standalone (rather than via RelayGroup) because of the rematch
// handshake and fighter-class bookkeeping, which are worth keeping verbatim
// against the source of truth.

// Event constants — kept 1:1 with the legacy C2S/S2C maps.
const (
	kkCreateRoom   = "kk:create_room"
	kkJoinRoom     = "kk:join_room"
	kkInput        = "kk:input"
	kkGameState    = "kk:game_state"
	kkFighterReady = "kk:fighter_ready"
	kkLeave        = "kk:leave"

	kkRoomCreated          = "kk:room_created"
	kkRoomJoined           = "kk:room_joined"
	kkOpponentReady        = "kk:opponent_ready"
	kkOpponentDisconnected = "kk:opponent_disconnected"
	kkError                = "kk:error"

	kkDefaultFighter = "stone_tiger"
)

// KKRoom mirrors the TS KKRoom interface: host/guest connection ids, their
// fighter classes, and the pending rematch handshake state.
type KKRoom struct {
	Code        string
	HostConnID  string
	GuestConnID string // "" until a guest joins
	HostClass   string
	GuestClass  string

	HostReady         bool
	GuestReady        bool
	PendingHostClass  string
	PendingGuestClass string
}

// KKManager owns Kowloon Knockout state. Its core methods operate on connection
// id strings plus a send registry, so they are exercisable in unit tests without
// a live websocket (see kk_test.go).
type KKManager struct {
	reg    *connRegistry
	logger *log.Logger

	mu         sync.Mutex
	rooms      map[string]*KKRoom // code -> room
	connToRoom map[string]string  // connID -> code
}

// NewKKManager builds the manager around a shared connection registry.
func NewKKManager(reg *connRegistry, logger *log.Logger) *KKManager {
	return &KKManager{
		reg:        reg,
		logger:     logger,
		rooms:      make(map[string]*KKRoom),
		connToRoom: make(map[string]string),
	}
}

// Register wires KK's inbound handlers onto the hub. Disconnect cleanup is
// invoked centrally by the Manager via Cleanup.
func (m *KKManager) Register(hub *realtime.Hub) {
	hub.On(kkCreateRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.CreateRoom(c.ID, p.FighterClass)
	})
	hub.On(kkJoinRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Code         string `json:"code"`
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.JoinRoom(c.ID, p.Code, p.FighterClass)
	})
	hub.On(kkInput, func(c *realtime.Conn, e realtime.Envelope) {
		m.Input(c.ID, e.Payload)
	})
	hub.On(kkGameState, func(c *realtime.Conn, e realtime.Envelope) {
		m.GameState(c.ID, e.Payload)
	})
	hub.On(kkFighterReady, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.FighterReady(c.ID, p.FighterClass)
	})
	hub.On(kkLeave, func(c *realtime.Conn, _ realtime.Envelope) {
		m.Cleanup(c.ID)
	})
}

// CreateRoom corresponds to onCreateRoom. Cleans up any previous room, generates
// a unique code, and emits kk:room_created.
func (m *KKManager) CreateRoom(connID, fighterClass string) {
	m.Cleanup(connID)
	if fighterClass == "" {
		fighterClass = kkDefaultFighter
	}
	code := uniqueCode(func(c string) bool {
		m.mu.Lock()
		_, exists := m.rooms[c]
		m.mu.Unlock()
		return exists
	})

	m.mu.Lock()
	m.rooms[code] = &KKRoom{
		Code:       code,
		HostConnID: connID,
		HostClass:  fighterClass,
	}
	m.connToRoom[connID] = code
	m.mu.Unlock()

	m.reg.send(connID, realtime.MustEnvelope(kkRoomCreated, map[string]any{"code": code}))
}

// JoinRoom corresponds to onJoinRoom. Validates the room, seats the guest, and
// emits kk:room_joined to both players.
func (m *KKManager) JoinRoom(connID, code, fighterClass string) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if fighterClass == "" {
		fighterClass = kkDefaultFighter
	}

	m.mu.Lock()
	room, ok := m.rooms[code]
	if !ok {
		m.mu.Unlock()
		m.reg.send(connID, errEnvelope(kkError, "Room not found"))
		return
	}
	if room.GuestConnID != "" {
		m.mu.Unlock()
		m.reg.send(connID, errEnvelope(kkError, "Room is full"))
		return
	}
	room.GuestConnID = connID
	room.GuestClass = fighterClass
	m.connToRoom[connID] = code
	host, hostClass, guestClass := room.HostConnID, room.HostClass, room.GuestClass
	m.mu.Unlock()

	m.reg.send(host, realtime.MustEnvelope(kkRoomJoined, map[string]any{
		"hostClass":  hostClass,
		"guestClass": guestClass,
		"isHost":     true,
	}))
	m.reg.send(connID, realtime.MustEnvelope(kkRoomJoined, map[string]any{
		"hostClass":  hostClass,
		"guestClass": guestClass,
		"isHost":     false,
	}))
}

// Input corresponds to onInput: guest -> host relay.
func (m *KKManager) Input(connID string, payload []byte) {
	m.mu.Lock()
	code, ok := m.connToRoom[connID]
	room := m.rooms[code]
	m.mu.Unlock()
	if !ok || room == nil || room.GuestConnID != connID {
		return
	}
	m.reg.send(room.HostConnID, realtime.Envelope{Event: kkInput, Payload: payload})
}

// GameState corresponds to onGameState: host -> guest relay.
func (m *KKManager) GameState(connID string, payload []byte) {
	m.mu.Lock()
	code, ok := m.connToRoom[connID]
	room := m.rooms[code]
	m.mu.Unlock()
	if !ok || room == nil || room.HostConnID != connID || room.GuestConnID == "" {
		return
	}
	m.reg.send(room.GuestConnID, realtime.Envelope{Event: kkGameState, Payload: payload})
}

// FighterReady corresponds to onFighterReady: the rematch handshake. Records the
// caller's pending fighter selection, notifies the opponent, and when both seats
// are ready re-arms the match by emitting kk:room_joined to both.
func (m *KKManager) FighterReady(connID, fighterClass string) {
	if fighterClass == "" {
		fighterClass = kkDefaultFighter
	}

	m.mu.Lock()
	code, ok := m.connToRoom[connID]
	room := m.rooms[code]
	if !ok || room == nil || room.GuestConnID == "" {
		m.mu.Unlock()
		return
	}

	var notify string
	switch connID {
	case room.HostConnID:
		room.PendingHostClass = fighterClass
		room.HostReady = true
		notify = room.GuestConnID
	case room.GuestConnID:
		room.PendingGuestClass = fighterClass
		room.GuestReady = true
		notify = room.HostConnID
	default:
		m.mu.Unlock()
		return
	}

	// Both ready → commit pending classes and re-arm.
	var rematch bool
	var host, guest, hostClass, guestClass string
	if room.HostReady && room.GuestReady {
		room.HostClass = room.PendingHostClass
		room.GuestClass = room.PendingGuestClass
		room.HostReady = false
		room.GuestReady = false
		room.PendingHostClass = ""
		room.PendingGuestClass = ""
		rematch = true
		host, guest = room.HostConnID, room.GuestConnID
		hostClass, guestClass = room.HostClass, room.GuestClass
	}
	m.mu.Unlock()

	// Notify the opponent the caller is ready.
	m.reg.send(notify, realtime.MustEnvelope(kkOpponentReady, map[string]any{}))

	if rematch {
		m.reg.send(host, realtime.MustEnvelope(kkRoomJoined, map[string]any{
			"hostClass":  hostClass,
			"guestClass": guestClass,
			"isHost":     true,
		}))
		m.reg.send(guest, realtime.MustEnvelope(kkRoomJoined, map[string]any{
			"hostClass":  hostClass,
			"guestClass": guestClass,
			"isHost":     false,
		}))
	}
}

// Cleanup corresponds to cleanupSocket: tears down the room the connection
// belonged to and notifies the opponent with kk:opponent_disconnected. Invoked
// on kk:leave and on hub disconnect.
func (m *KKManager) Cleanup(connID string) {
	m.mu.Lock()
	code, ok := m.connToRoom[connID]
	if !ok {
		m.mu.Unlock()
		return
	}
	room := m.rooms[code]
	if room == nil {
		delete(m.connToRoom, connID)
		m.mu.Unlock()
		return
	}

	var notify string
	if room.HostConnID == connID && room.GuestConnID != "" {
		notify = room.GuestConnID
		delete(m.connToRoom, room.GuestConnID)
	} else if room.GuestConnID == connID {
		notify = room.HostConnID
		delete(m.connToRoom, room.HostConnID)
	}
	delete(m.rooms, code)
	delete(m.connToRoom, connID)
	m.mu.Unlock()

	if notify != "" {
		m.reg.send(notify, realtime.MustEnvelope(kkOpponentDisconnected, map[string]any{}))
	}
}

// ── Shared helpers ──────────────────────────────────────────────────

const (
	roomCodeLength   = 6
	roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // matches socket-server config
)

// generateRoomCode ports utils.ts generateRoomCode (crypto/rand instead of
// Math.random).
func generateRoomCode() string {
	b := make([]byte, roomCodeLength)
	_, _ = rand.Read(b)
	out := make([]byte, roomCodeLength)
	for i := range out {
		out[i] = roomCodeAlphabet[int(b[i])%len(roomCodeAlphabet)]
	}
	return string(out)
}

// uniqueCode ports generateUniqueCode: up to 20 attempts, falling back to the
// last candidate (the legacy code throws after 20; collisions are astronomically
// unlikely with a 32^6 space, so we degrade gracefully rather than panic).
func uniqueCode(taken func(string) bool) string {
	var code string
	for i := 0; i < 20; i++ {
		code = generateRoomCode()
		if !taken(code) {
			return code
		}
	}
	return code
}

func errEnvelope(event, msg string) realtime.Envelope {
	return realtime.MustEnvelope(event, map[string]any{"message": msg})
}
