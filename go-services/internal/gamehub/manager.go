package gamehub

import (
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Manager is the top-level gamehub coordinator. It owns the shared connection
// registry (so a single OnConnect/OnDisconnect feeds every game), holds the
// faithful Kowloon Knockout port, and exposes the generic RelayGroup seam for
// the remaining games.
//
// It mirrors server/socket-server/index.ts: that file registered every game's
// handlers on connect and called every game's disconnect handler on disconnect.
// Here, Register() wires all games' inbound handlers, and a single OnDisconnect
// fans out cleanup to each game.
type Manager struct {
	hub    *realtime.Hub
	logger *log.Logger

	reg *connRegistry

	kk     *KKManager
	relays []*RelayGroup
}

// NewManager constructs the coordinator.
func NewManager(hub *realtime.Hub, logger *log.Logger) *Manager {
	reg := newConnRegistry()
	return &Manager{
		hub:    hub,
		logger: logger,
		reg:    reg,
		kk:     NewKKManager(reg, logger),
		relays: buildRelayRegistry(reg, logger),
	}
}

// Register wires connection lifecycle + every game's handlers onto the hub.
func (m *Manager) Register() {
	// Track live connections so relays can target a specific peer by id.
	m.hub.OnConnect(func(c *realtime.Conn) {
		conn := c
		m.reg.add(conn.ID, func(e realtime.Envelope) { conn.Send(e) })
	})

	// On disconnect: fan out cleanup to every game (mirrors index.ts), then
	// drop the connection from the registry.
	m.hub.OnDisconnect(func(c *realtime.Conn) {
		m.kk.Cleanup(c.ID)
		for _, g := range m.relays {
			g.Cleanup(c.ID)
		}
		m.reg.remove(c.ID)
	})

	// Faithful game.
	m.kk.Register(m.hub)

	// Generic-relay games (currently registry stubs — see buildRelayRegistry).
	for _, g := range m.relays {
		g.Register(m.hub)
	}
}

// buildRelayRegistry returns the host-authoritative relay games driven by the
// generic RelayGroup framework.
//
// TODO(migration): port the remaining socket-server handlers onto RelayGroup (or
// standalone managers where game semantics demand it). The configs below are the
// extensible seam: each is a compiling registration for a 1v1 / host-authoritative
// relay game whose detailed per-game logic still needs to be ported from
// server/socket-server/handlers/*. They are intentionally NOT wired with real
// game rules yet — only the generic create/join/input/state/leave relay is live.
//
//   - Slice It        (server/socket-server/handlers/slice-it.ts)
//   - Neon Driftway   (server/socket-server/handlers/neon-driftway.ts)
//   - Synapse Storm   (server/socket-server/handlers/synapse-storm.ts)
//   - Blackjack       (server/socket-server/handlers/blackjack.ts)  // multi-seat; needs a richer model
//   - Holdem, Baccarat, Roulette, Lights Out, Doctrine, RMH Type/Study, Altair, RMH Music
//
// Returning an empty registry today keeps the service compiling and behaving
// correctly (only KK is exposed) while documenting exactly where each remaining
// game plugs in. Uncomment / extend entries as each game is ported.
func buildRelayRegistry(reg *connRegistry, logger *log.Logger) []*RelayGroup {
	// Example of how a ported relay game registers (kept commented so no
	// half-ported game ships with real event names):
	//
	//   sliceIt := NewRelayGroup(RelayConfig{
	//       Prefix:       "slice",
	//       CreateRoom:   "slice:create_room",
	//       JoinRoom:     "slice:join_room",
	//       Input:        "slice:input",
	//       State:        "slice:game_state",
	//       Leave:        "slice:leave",
	//       RoomCreated:  "slice:room_created",
	//       RoomJoined:   "slice:room_joined",
	//       Disconnected: "slice:opponent_disconnected",
	//       Errorf:       "slice:error",
	//   }, reg, logger)
	//   return []*RelayGroup{sliceIt}

	_ = reg
	_ = logger
	return nil
}
