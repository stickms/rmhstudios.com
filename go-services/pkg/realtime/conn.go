package realtime

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rmhstudios/rmh-go/pkg/auth"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20 // 1 MiB, matching the Socket.IO maxHttpBufferSize
	sendBuffer     = 256
)

// Conn is a single client websocket connection. It owns one read goroutine and
// one write goroutine; all sends funnel through the buffered send channel so
// concurrent writers never touch the socket directly (gorilla forbids that).
type Conn struct {
	ID       string
	Identity auth.Identity
	// Anonymous is true when no valid session token was presented (legacy
	// games allow this; services that require auth reject in their handler).
	Anonymous bool

	ws   *websocket.Conn
	hub  *Hub
	send chan []byte
	// closed is closed exactly once when the connection is torn down. Producers
	// (Send / Room.deliverLocal, called from heartbeat/timer/broadcast
	// goroutines) select on it so they never write to a dead connection, and
	// writePump selects on it to exit cleanly. We deliberately NEVER close the
	// `send` channel — multiple goroutines write to it, and closing a channel
	// with concurrent senders panics. Closing `closed` + closing the socket is
	// the safe shutdown signal instead.
	closed chan struct{}

	mu    sync.RWMutex
	rooms map[string]struct{}
	// Data is per-connection scratch space for service-specific bookkeeping
	// (e.g. the current lobby id). Guarded by the connection mutex via Set/Get.
	data map[string]any

	closeOnce sync.Once
}

func newConn(hub *Hub, ws *websocket.Conn, id auth.Identity, anon bool) *Conn {
	return &Conn{
		ID:        uuid.NewString(),
		Identity:  id,
		Anonymous: anon,
		ws:        ws,
		hub:       hub,
		send:      make(chan []byte, sendBuffer),
		closed:    make(chan struct{}),
		rooms:     make(map[string]struct{}),
		data:      make(map[string]any),
	}
}

// UserID returns the authenticated user id, or "" when anonymous.
func (c *Conn) UserID() string { return c.Identity.UserID }

// Set stores per-connection scratch data.
func (c *Conn) Set(key string, v any) {
	c.mu.Lock()
	c.data[key] = v
	c.mu.Unlock()
}

// Get reads per-connection scratch data.
func (c *Conn) Get(key string) (any, bool) {
	c.mu.RLock()
	v, ok := c.data[key]
	c.mu.RUnlock()
	return v, ok
}

// Send queues an envelope for delivery. Non-blocking; if the client's buffer is
// full the connection is closed (a stuck slow consumer must not wedge a room).
func (c *Conn) Send(e Envelope) { c.trySend(e.Encode()) }

// trySend is the single safe path for handing bytes to the write pump. It never
// writes to a closed connection and never blocks: a full buffer means the
// consumer is too slow, so we tear the connection down rather than wedge the
// caller (which is often a shared room broadcast goroutine).
func (c *Conn) trySend(raw []byte) {
	select {
	case <-c.closed:
		return
	default:
	}
	select {
	case c.send <- raw:
	case <-c.closed:
	default:
		c.close()
	}
}

// Rooms returns a snapshot of the rooms this connection has joined.
func (c *Conn) Rooms() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]string, 0, len(c.rooms))
	for r := range c.rooms {
		out = append(out, r)
	}
	return out
}

func (c *Conn) addRoom(id string) {
	c.mu.Lock()
	c.rooms[id] = struct{}{}
	c.mu.Unlock()
}

func (c *Conn) removeRoom(id string) {
	c.mu.Lock()
	delete(c.rooms, id)
	c.mu.Unlock()
}

// readPump pumps inbound frames into the hub's dispatcher until the socket
// closes, then triggers cleanup.
func (c *Conn) readPump() {
	defer c.close()
	c.ws.SetReadLimit(maxMessageSize)
	_ = c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, raw, err := c.ws.ReadMessage()
		if err != nil {
			return
		}
		env, err := Decode(raw)
		if err != nil {
			continue // ignore malformed frames
		}
		c.hub.dispatch(c, env)
	}
}

// writePump drains the send channel to the socket and emits periodic pings,
// reproducing Socket.IO's heartbeat so dead peers are detected.
func (c *Conn) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.ws.Close()
	}()
	for {
		select {
		case <-c.closed:
			// Graceful teardown: tell the peer and stop. Buffered frames are
			// dropped — realtime favors a clean disconnect over backlog flush.
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			_ = c.ws.WriteMessage(websocket.CloseMessage, nil)
			return
		case msg := <-c.send:
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// close tears the connection down exactly once: it signals all producers and the
// write pump via `closed`, closes the socket to unblock the read pump, and
// deregisters from the hub. The `send` channel is intentionally never closed
// (it has many concurrent producers).
func (c *Conn) close() {
	c.closeOnce.Do(func() {
		close(c.closed)
		_ = c.ws.Close()
		c.hub.remove(c)
	})
}
