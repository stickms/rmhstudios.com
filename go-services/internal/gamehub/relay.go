// Package gamehub is the Go port of the unified Socket.IO games server
// (server/socket-server). It hosts every mini-game relay behind one shared
// realtime.Hub on the WS path "/socket/".
//
// This file provides the *generic* host-authoritative room-relay framework that
// the per-game handlers build on. The legacy Node server hand-rolled the same
// 1v1 "host creates / guest joins / relay input+state" shape in several
// handlers (Kowloon Knockout, Slice It, Neon Driftway, ...). Rather than copy
// that boilerplate per game, RelayGroup captures it once and lets each game
// register onto the hub with its own event prefix and fighter/payload defaults.
//
// Kowloon Knockout is ported *faithfully and standalone* in kk.go because it
// carries game-specific rematch-handshake semantics worth porting verbatim from
// the source of truth. RelayGroup is the documented path for the remaining
// games (Slice It, Neon Driftway, Synapse Storm, Blackjack, ...), which are
// left as compiling // TODO(migration) registrations below.
package gamehub

import (
	"sync"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// connRegistry maps a hub connection id to a send callback. The realtime.Hub
// dispatches handlers per-Conn but does not expose a public "send to conn id"
// lookup, and host-authoritative relays must target a *specific* peer (host or
// guest) rather than broadcast to a room. Each relay therefore tracks the live
// connections it has seen (via OnConnect/OnDisconnect) and resolves a peer id
// to a sender through this registry.
//
// Keeping the sender behind a callback (rather than holding *realtime.Conn) is
// what makes the relay cores unit-testable: tests register plain string ids
// with an in-memory capture callback, no live websocket required.
type connRegistry struct {
	mu    sync.RWMutex
	conns map[string]func(realtime.Envelope)
}

func newConnRegistry() *connRegistry {
	return &connRegistry{conns: make(map[string]func(realtime.Envelope))}
}

func (r *connRegistry) add(id string, send func(realtime.Envelope)) {
	r.mu.Lock()
	r.conns[id] = send
	r.mu.Unlock()
}

func (r *connRegistry) remove(id string) {
	r.mu.Lock()
	delete(r.conns, id)
	r.mu.Unlock()
}

// send delivers env to the connection id if it is still present. Reports whether
// a live sender was found.
func (r *connRegistry) send(id string, env realtime.Envelope) bool {
	r.mu.RLock()
	fn, ok := r.conns[id]
	r.mu.RUnlock()
	if ok && fn != nil {
		fn(env)
	}
	return ok
}

// RelayConfig describes a host-authoritative relay game's wire surface. All
// event names are fully qualified (the prefix is already applied) to keep the
// mapping to the legacy Socket.IO event constants explicit and greppable.
type RelayConfig struct {
	// Prefix is a short id for the game, used only for logging/metrics.
	Prefix string

	// Inbound (client -> server) event names.
	CreateRoom string
	JoinRoom   string
	Input      string // guest -> host relay
	State      string // host -> guest relay
	Leave      string

	// Outbound (server -> client) event names.
	RoomCreated  string
	RoomJoined   string
	Disconnected string
	Errorf       string
}

// RelayRoom is the generic two-seat room: a host and an optional guest, keyed by
// hub connection id.
type RelayRoom struct {
	Code  string
	Host  string
	Guest string // "" until a guest joins
}

// RelayGroup is a reusable host-authoritative room relay. Multiple games can be
// driven by separate RelayGroup instances sharing one connRegistry and hub.
//
// It deliberately implements only the common create/join/input/state/leave
// flow. Games needing extra semantics (e.g. KK's rematch handshake) are ported
// standalone — see kk.go.
type RelayGroup struct {
	cfg    RelayConfig
	reg    *connRegistry
	logger *log.Logger

	mu         sync.Mutex
	rooms      map[string]*RelayRoom // code -> room
	connToRoom map[string]string     // connID -> code
}

// NewRelayGroup builds a relay for one game. The shared connRegistry is owned by
// the Manager so a single OnConnect/OnDisconnect feeds every game.
func NewRelayGroup(cfg RelayConfig, reg *connRegistry, logger *log.Logger) *RelayGroup {
	return &RelayGroup{
		cfg:        cfg,
		reg:        reg,
		logger:     logger,
		rooms:      make(map[string]*RelayRoom),
		connToRoom: make(map[string]string),
	}
}

// Register wires the group's handlers onto the hub. Disconnect cleanup is driven
// centrally by the Manager (which calls Cleanup), so this only registers the
// inbound event handlers.
func (g *RelayGroup) Register(hub *realtime.Hub) {
	hub.On(g.cfg.CreateRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Code string `json:"code"`
		}
		_ = e.Bind(&p)
		g.create(c.ID, p.Code)
	})
	hub.On(g.cfg.JoinRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Code string `json:"code"`
		}
		_ = e.Bind(&p)
		g.join(c.ID, p.Code)
	})
	hub.On(g.cfg.Input, func(c *realtime.Conn, e realtime.Envelope) {
		g.relayGuestToHost(c.ID, e.Payload)
	})
	hub.On(g.cfg.State, func(c *realtime.Conn, e realtime.Envelope) {
		g.relayHostToGuest(c.ID, e.Payload)
	})
	hub.On(g.cfg.Leave, func(c *realtime.Conn, _ realtime.Envelope) {
		g.Cleanup(c.ID)
	})
}

func (g *RelayGroup) create(connID, code string) {
	g.Cleanup(connID) // drop any previous room this conn owned/occupied
	if code == "" {
		code = uniqueCode(func(c string) bool {
			g.mu.Lock()
			_, exists := g.rooms[c]
			g.mu.Unlock()
			return exists
		})
	}
	g.mu.Lock()
	g.rooms[code] = &RelayRoom{Code: code, Host: connID}
	g.connToRoom[connID] = code
	g.mu.Unlock()
	g.reg.send(connID, realtime.MustEnvelope(g.cfg.RoomCreated, map[string]any{"code": code}))
}

func (g *RelayGroup) join(connID, code string) {
	g.mu.Lock()
	room, ok := g.rooms[code]
	if !ok {
		g.mu.Unlock()
		g.reg.send(connID, errEnvelope(g.cfg.Errorf, "Room not found"))
		return
	}
	if room.Guest != "" {
		g.mu.Unlock()
		g.reg.send(connID, errEnvelope(g.cfg.Errorf, "Room is full"))
		return
	}
	room.Guest = connID
	g.connToRoom[connID] = code
	host := room.Host
	g.mu.Unlock()

	g.reg.send(host, realtime.MustEnvelope(g.cfg.RoomJoined, map[string]any{"isHost": true}))
	g.reg.send(connID, realtime.MustEnvelope(g.cfg.RoomJoined, map[string]any{"isHost": false}))
}

func (g *RelayGroup) relayGuestToHost(connID string, payload []byte) {
	g.mu.Lock()
	code, ok := g.connToRoom[connID]
	room := g.rooms[code]
	g.mu.Unlock()
	if !ok || room == nil || room.Guest != connID {
		return
	}
	g.reg.send(room.Host, realtime.Envelope{Event: g.cfg.Input, Payload: payload})
}

func (g *RelayGroup) relayHostToGuest(connID string, payload []byte) {
	g.mu.Lock()
	code, ok := g.connToRoom[connID]
	room := g.rooms[code]
	g.mu.Unlock()
	if !ok || room == nil || room.Host != connID || room.Guest == "" {
		return
	}
	g.reg.send(room.Guest, realtime.Envelope{Event: g.cfg.State, Payload: payload})
}

// Cleanup tears down whatever room connID participated in, notifying the peer.
// Safe to call for connections not in any room.
func (g *RelayGroup) Cleanup(connID string) {
	g.mu.Lock()
	code, ok := g.connToRoom[connID]
	if !ok {
		g.mu.Unlock()
		return
	}
	room := g.rooms[code]
	if room == nil {
		delete(g.connToRoom, connID)
		g.mu.Unlock()
		return
	}
	var peer string
	if room.Host == connID && room.Guest != "" {
		peer = room.Guest
	} else if room.Guest == connID {
		peer = room.Host
	}
	delete(g.rooms, code)
	delete(g.connToRoom, connID)
	if peer != "" {
		delete(g.connToRoom, peer)
	}
	g.mu.Unlock()

	if peer != "" {
		g.reg.send(peer, realtime.MustEnvelope(g.cfg.Disconnected, map[string]any{}))
	}
}
