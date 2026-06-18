package realtime

import (
	"context"
	"errors"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rmhstudios/rmh-go/pkg/auth"
	"github.com/rmhstudios/rmh-go/pkg/events"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Handler processes one inbound envelope for a connection.
type Handler func(c *Conn, e Envelope)

// Hub is the per-service websocket runtime: it upgrades connections,
// authenticates them, dispatches inbound events to registered handlers, and
// manages rooms + cross-instance broadcast. One Hub backs one service
// (realtime games, rmhbox, rmhtube, rmhmusic each construct their own).
type Hub struct {
	origin    string
	logger    *log.Logger
	metrics   *telemetry.Metrics
	validator *auth.Validator
	bus       events.Bus

	upgrader websocket.Upgrader

	mu       sync.RWMutex
	conns    map[string]*Conn
	rooms    map[string]*Room
	handlers map[string]Handler

	onConnect    func(*Conn)
	onDisconnect func(*Conn)

	// RequireAuth rejects anonymous connections at handshake when true
	// (rmhmusic requires auth; the legacy games do not).
	RequireAuth bool

	ctx context.Context
}

// Options configures a Hub.
type Options struct {
	Origin       string
	Logger       *log.Logger
	Metrics      *telemetry.Metrics
	Validator    *auth.Validator
	Bus          events.Bus
	AllowOrigins []string // CORS allow-list; empty => allow all (dev)
	RequireAuth  bool
}

// NewHub constructs a Hub.
func NewHub(ctx context.Context, o Options) *Hub {
	allow := o.AllowOrigins
	return &Hub{
		origin:      o.Origin,
		logger:      o.Logger,
		metrics:     o.Metrics,
		validator:   o.Validator,
		bus:         o.Bus,
		conns:       make(map[string]*Conn),
		rooms:       make(map[string]*Room),
		handlers:    make(map[string]Handler),
		RequireAuth: o.RequireAuth,
		ctx:         ctx,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     originChecker(allow),
		},
	}
}

func originChecker(allow []string) func(*http.Request) bool {
	if len(allow) == 0 {
		return func(*http.Request) bool { return true }
	}
	set := make(map[string]struct{}, len(allow))
	for _, a := range allow {
		set[a] = struct{}{}
	}
	return func(r *http.Request) bool {
		_, ok := set[r.Header.Get("Origin")]
		return ok
	}
}

// On registers a handler for an inbound event name.
//
// On/OnConnect/OnDisconnect MUST be called during service setup, before ServeWS
// is mounted and starts accepting connections. The handler map is treated as
// immutable once serving begins, so no lock guards dispatch reads — registering
// after start would be a data race.
func (h *Hub) On(event string, handler Handler) { h.handlers[event] = handler }

// OnConnect registers a callback fired after a connection authenticates.
func (h *Hub) OnConnect(fn func(*Conn)) { h.onConnect = fn }

// OnDisconnect registers a callback fired when a connection closes.
func (h *Hub) OnDisconnect(fn func(*Conn)) { h.onDisconnect = fn }

// ServeWS is the http.HandlerFunc that upgrades and runs a connection. Mount it
// at the service's websocket path (e.g. /rmhbox-ws/).
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Resolve identity from token (query ?token=, Authorization, or cookie).
	token := r.URL.Query().Get("token")
	if token == "" {
		token = httpx.SessionToken(r)
	}
	var (
		id   auth.Identity
		anon = true
	)
	if token != "" && h.validator != nil {
		resolved, err := h.validator.ValidateSession(r.Context(), token)
		switch {
		case err == nil:
			id, anon = resolved, false
		case errors.Is(err, auth.ErrUnauthenticated):
			// Expired/unknown token — legitimately anonymous, no log.
		default:
			// A real DB/transport error must be observable: otherwise an auth
			// outage silently downgrades every user to anonymous.
			h.logger.Warn("session validation error", "error", err.Error())
		}
	}
	if h.RequireAuth && anon {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // upgrader already wrote the error
	}
	c := newConn(h, ws, id, anon)

	h.mu.Lock()
	h.conns[c.ID] = c
	h.mu.Unlock()
	if h.metrics != nil {
		h.metrics.ActiveConnections.Inc()
	}

	if h.onConnect != nil {
		h.onConnect(c)
	}
	go c.writePump()
	go c.readPump()
}

func (h *Hub) dispatch(c *Conn, e Envelope) {
	if h.metrics != nil {
		h.metrics.MessagesTotal.WithLabelValues(e.Event).Inc()
	}
	handler, ok := h.handlers[e.Event]
	if !ok {
		return
	}
	// Fault isolation: a panic in one handler must not take down the service
	// (ports the try/catch-around-every-handler discipline from rmhbox).
	defer func() {
		if rec := recover(); rec != nil {
			h.logger.Error("handler panic", "event", e.Event, "panic", rec)
		}
	}()
	handler(c, e)
}

// Join adds a connection to a room, creating it (and its bus subscription) on
// first use.
func (h *Hub) Join(c *Conn, roomID string) *Room {
	h.mu.Lock()
	room := h.rooms[roomID]
	if room == nil {
		room = newRoom(roomID)
		h.rooms[roomID] = room
		room.subscribeBus(h.ctx, h)
	}
	h.mu.Unlock()

	room.add(c)
	c.addRoom(roomID)
	return room
}

// Leave removes a connection from a room, tearing the room down when empty.
func (h *Hub) Leave(c *Conn, roomID string) {
	h.mu.RLock()
	room := h.rooms[roomID]
	h.mu.RUnlock()
	if room == nil {
		return
	}
	empty := room.remove(c.ID)
	c.removeRoom(roomID)
	if empty {
		h.mu.Lock()
		// Re-check under the write lock to avoid racing a concurrent Join.
		if r := h.rooms[roomID]; r != nil && r.Size() == 0 {
			if r.busCancel != nil {
				r.busCancel()
			}
			delete(h.rooms, roomID)
		}
		h.mu.Unlock()
	}
}

// Room returns a room by id if it exists on this replica.
func (h *Hub) Room(roomID string) (*Room, bool) {
	h.mu.RLock()
	r, ok := h.rooms[roomID]
	h.mu.RUnlock()
	return r, ok
}

// Broadcast delivers an envelope to every member of a room across all replicas.
// It delivers to local members immediately and publishes to the bus for remote
// replicas (which skip the echo via the origin check).
func (h *Hub) Broadcast(roomID string, e Envelope) {
	raw := e.Encode()
	h.mu.RLock()
	room := h.rooms[roomID]
	h.mu.RUnlock()
	if room != nil {
		room.deliverLocal(raw)
	}
	_ = h.bus.Publish(h.ctx, busTopic(roomID), raw)
}

// BroadcastSeq stamps the envelope with the room's next sequence number, then
// broadcasts — the ordered mutation path (S2C.ROOM_ACTION / GAME_ACTION).
func (h *Hub) BroadcastSeq(roomID string, e Envelope) {
	h.mu.RLock()
	room := h.rooms[roomID]
	h.mu.RUnlock()
	if room != nil {
		e.Seq = room.NextSeq()
	}
	h.Broadcast(roomID, e)
}

// remove tears down a closed connection: leaves all rooms, fires onDisconnect.
func (h *Hub) remove(c *Conn) {
	for _, roomID := range c.Rooms() {
		h.Leave(c, roomID)
	}
	h.mu.Lock()
	delete(h.conns, c.ID)
	h.mu.Unlock()
	if h.metrics != nil {
		h.metrics.ActiveConnections.Dec()
	}
	if h.onDisconnect != nil {
		h.onDisconnect(c)
	}
}

// Count returns the number of live local connections.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.conns)
}
