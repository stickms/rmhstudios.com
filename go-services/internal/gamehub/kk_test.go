package gamehub

import (
	"encoding/json"
	"sync"
	"testing"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// capture is an in-memory sink that records the envelopes a single fake
// connection receives. It stands in for a live websocket so the KK core logic
// can be tested directly on connID strings + a send callback.
type capture struct {
	mu  sync.Mutex
	got []realtime.Envelope
}

func (c *capture) send(e realtime.Envelope) {
	c.mu.Lock()
	c.got = append(c.got, e)
	c.mu.Unlock()
}

// last returns the most recent envelope with the given event name, if any.
func (c *capture) last(event string) (realtime.Envelope, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := len(c.got) - 1; i >= 0; i-- {
		if c.got[i].Event == event {
			return c.got[i], true
		}
	}
	return realtime.Envelope{}, false
}

func (c *capture) count(event string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	n := 0
	for _, e := range c.got {
		if e.Event == event {
			n++
		}
	}
	return n
}

// newKKHarness wires a KKManager around a registry with two fake connections.
func newKKHarness(t *testing.T) (*KKManager, string, *capture, string, *capture) {
	t.Helper()
	reg := newConnRegistry()
	m := NewKKManager(reg, log.New("test", "error"))

	hostID, guestID := "host-conn", "guest-conn"
	hostCap, guestCap := &capture{}, &capture{}
	reg.add(hostID, hostCap.send)
	reg.add(guestID, guestCap.send)
	return m, hostID, hostCap, guestID, guestCap
}

func payloadField(t *testing.T, e realtime.Envelope, key string) any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(e.Payload, &m); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	return m[key]
}

func TestKKCreateAndJoin(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)

	m.CreateRoom(hostID, "iron_crane")
	created, ok := hostCap.last(kkRoomCreated)
	if !ok {
		t.Fatal("host did not receive kk:room_created")
	}
	code, _ := payloadField(t, created, "code").(string)
	if code == "" {
		t.Fatal("empty room code")
	}

	m.JoinRoom(guestID, code, "jade_fox")

	hostJoined, ok := hostCap.last(kkRoomJoined)
	if !ok {
		t.Fatal("host did not receive kk:room_joined")
	}
	if payloadField(t, hostJoined, "isHost") != true {
		t.Error("host should be marked isHost=true")
	}
	if payloadField(t, hostJoined, "hostClass") != "iron_crane" {
		t.Errorf("hostClass = %v, want iron_crane", payloadField(t, hostJoined, "hostClass"))
	}
	if payloadField(t, hostJoined, "guestClass") != "jade_fox" {
		t.Errorf("guestClass = %v, want jade_fox", payloadField(t, hostJoined, "guestClass"))
	}

	guestJoined, ok := guestCap.last(kkRoomJoined)
	if !ok {
		t.Fatal("guest did not receive kk:room_joined")
	}
	if payloadField(t, guestJoined, "isHost") != false {
		t.Error("guest should be marked isHost=false")
	}
}

func TestKKJoinErrors(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)

	// Unknown room.
	m.JoinRoom(guestID, "ZZZZZZ", "")
	if e, ok := guestCap.last(kkError); !ok || payloadField(t, e, "message") != "Room not found" {
		t.Fatalf("expected 'Room not found' error, got %+v ok=%v", e, ok)
	}

	// Full room: third connection cannot join.
	m.CreateRoom(hostID, "")
	created, _ := hostCap.last(kkRoomCreated)
	code := payloadField(t, created, "code").(string)
	m.JoinRoom(guestID, code, "")

	thirdCap := &capture{}
	m.reg.add("third-conn", thirdCap.send)
	m.JoinRoom("third-conn", code, "")
	if e, ok := thirdCap.last(kkError); !ok || payloadField(t, e, "message") != "Room is full" {
		t.Fatalf("expected 'Room is full' error, got %+v ok=%v", e, ok)
	}
}

func TestKKRelay(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "")
	created, _ := hostCap.last(kkRoomCreated)
	code := payloadField(t, created, "code").(string)
	m.JoinRoom(guestID, code, "")

	// Guest input -> host.
	m.Input(guestID, json.RawMessage(`{"btn":"punch"}`))
	if hostCap.count(kkInput) != 1 {
		t.Errorf("host should have received 1 input, got %d", hostCap.count(kkInput))
	}
	// Host input must NOT relay (only guest->host).
	hostBefore := guestCap.count(kkInput)
	m.Input(hostID, json.RawMessage(`{"btn":"x"}`))
	if guestCap.count(kkInput) != hostBefore {
		t.Error("host input should not relay")
	}

	// Host game_state -> guest.
	m.GameState(hostID, json.RawMessage(`{"hp":100}`))
	if guestCap.count(kkGameState) != 1 {
		t.Errorf("guest should have received 1 game_state, got %d", guestCap.count(kkGameState))
	}
	// Guest game_state must NOT relay.
	guestBefore := hostCap.count(kkGameState)
	m.GameState(guestID, json.RawMessage(`{"hp":1}`))
	if hostCap.count(kkGameState) != guestBefore {
		t.Error("guest game_state should not relay")
	}
}

func TestKKRematchHandshake(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "a")
	created, _ := hostCap.last(kkRoomCreated)
	code := payloadField(t, created, "code").(string)
	m.JoinRoom(guestID, code, "b")

	joinedBefore := hostCap.count(kkRoomJoined)

	// Host ready first: guest is notified, no rematch yet.
	m.FighterReady(hostID, "new_host")
	if guestCap.count(kkOpponentReady) != 1 {
		t.Fatalf("guest should be notified host ready, got %d", guestCap.count(kkOpponentReady))
	}
	if hostCap.count(kkRoomJoined) != joinedBefore {
		t.Fatal("rematch should not start with only one side ready")
	}

	// Guest ready: rematch starts, both get a fresh kk:room_joined with the
	// pending classes committed.
	m.FighterReady(guestID, "new_guest")
	if hostCap.count(kkOpponentReady) != 1 {
		t.Fatalf("host should be notified guest ready, got %d", hostCap.count(kkOpponentReady))
	}
	hostJoined, _ := hostCap.last(kkRoomJoined)
	if payloadField(t, hostJoined, "hostClass") != "new_host" || payloadField(t, hostJoined, "guestClass") != "new_guest" {
		t.Errorf("rematch classes not committed: %s", hostJoined.Payload)
	}
	if guestCap.count(kkRoomJoined) < 2 {
		t.Error("guest should receive rematch kk:room_joined")
	}

	// Handshake flags reset: a fresh single-side ready must not re-trigger.
	joinedAfter := hostCap.count(kkRoomJoined)
	m.FighterReady(hostID, "x")
	if hostCap.count(kkRoomJoined) != joinedAfter {
		t.Error("handshake flags not reset after rematch")
	}
}

func TestKKDisconnectNotifiesOpponentAndCleansUp(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "")
	created, _ := hostCap.last(kkRoomCreated)
	code := payloadField(t, created, "code").(string)
	m.JoinRoom(guestID, code, "")

	// Host disconnects -> guest notified.
	m.Cleanup(hostID)
	if guestCap.count(kkOpponentDisconnected) != 1 {
		t.Fatalf("guest should receive opponent_disconnected, got %d", guestCap.count(kkOpponentDisconnected))
	}

	// Room is gone: state maps emptied.
	m.mu.Lock()
	nRooms := len(m.rooms)
	nConns := len(m.connToRoom)
	m.mu.Unlock()
	if nRooms != 0 || nConns != 0 {
		t.Errorf("state not cleaned: rooms=%d connToRoom=%d", nRooms, nConns)
	}

	// A subsequent input from the now-stale guest is a no-op.
	m.Input(guestID, json.RawMessage(`{}`))
	if hostCap.count(kkInput) != 0 {
		t.Error("stale input should not relay after cleanup")
	}
}
