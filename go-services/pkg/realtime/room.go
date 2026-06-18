package realtime

import (
	"context"
	"sync"
	"sync/atomic"
)

// Room is a broadcast group (a lobby / watch-party / music room / game room).
// It owns the set of locally-connected members and a monotonic sequence
// counter. When a cross-instance Bus is configured, each room also holds one
// subscription so broadcasts from other replicas reach local members.
type Room struct {
	ID string

	mu      sync.RWMutex
	members map[string]*Conn // connID -> conn (this replica only)

	seq uint64

	// busCancel tears down the room's bus subscription when it empties.
	busCancel func()
}

func newRoom(id string) *Room {
	return &Room{ID: id, members: make(map[string]*Conn)}
}

// NextSeq returns the next monotonic sequence number for ordered mutation
// broadcasts (the seq field of S2C.ROOM_ACTION / GAME_ACTION).
func (r *Room) NextSeq() uint64 { return atomic.AddUint64(&r.seq, 1) }

// Size returns the local member count.
func (r *Room) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.members)
}

// Members returns a snapshot of local member connections.
func (r *Room) Members() []*Conn {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Conn, 0, len(r.members))
	for _, c := range r.members {
		out = append(out, c)
	}
	return out
}

func (r *Room) add(c *Conn) {
	r.mu.Lock()
	r.members[c.ID] = c
	r.mu.Unlock()
}

func (r *Room) remove(connID string) (empty bool) {
	r.mu.Lock()
	delete(r.members, connID)
	empty = len(r.members) == 0
	r.mu.Unlock()
	return empty
}

// deliverLocal writes raw bytes to every local member of the room.
func (r *Room) deliverLocal(raw []byte) {
	r.mu.RLock()
	members := make([]*Conn, 0, len(r.members))
	for _, c := range r.members {
		members = append(members, c)
	}
	r.mu.RUnlock()
	for _, c := range members {
		c.trySend(raw)
	}
}

// subscribeBus wires this room to the cross-instance bus. Messages that did not
// originate from this replica are fanned out to local members.
func (r *Room) subscribeBus(ctx context.Context, h *Hub) {
	ch, cancel, err := h.bus.Subscribe(ctx, busTopic(r.ID))
	if err != nil {
		h.logger.Warn("bus subscribe failed", "room", r.ID, "error", err.Error())
		return
	}
	r.busCancel = cancel
	go func() {
		for msg := range ch {
			if msg.Origin == h.origin {
				continue // already delivered locally by Broadcast
			}
			r.deliverLocal(msg.Payload)
		}
	}()
}

func busTopic(roomID string) string { return "rt:room:" + roomID }
