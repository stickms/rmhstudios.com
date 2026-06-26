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

func seatsOf(t *testing.T, e realtime.Envelope) []any {
	t.Helper()
	s, _ := payloadField(t, e, "seats").([]any)
	return s
}

func codeFromCreate(t *testing.T, cap *capture) string {
	t.Helper()
	created, ok := cap.last(kkRoomCreated)
	if !ok {
		t.Fatal("host did not receive kk:room_created")
	}
	code, _ := payloadField(t, created, "code").(string)
	if code == "" {
		t.Fatal("empty room code")
	}
	return code
}

func TestKKCreateAndLobby(t *testing.T) {
	m, hostID, hostCap, _, _ := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "iron_bull")

	created, _ := hostCap.last(kkRoomCreated)
	if payloadField(t, created, "seat") != float64(0) {
		t.Errorf("host seat = %v, want 0", payloadField(t, created, "seat"))
	}

	lobby, ok := hostCap.last(kkLobbyUpdate)
	if !ok {
		t.Fatal("host did not receive kk:lobby_update")
	}
	if payloadField(t, lobby, "you") != float64(0) {
		t.Error("host should be seat 0 in lobby")
	}
	seats := seatsOf(t, lobby)
	if len(seats) != 2 {
		t.Fatalf("default arena size should be 2, got %d seats", len(seats))
	}
	s0 := seats[0].(map[string]any)
	if s0["human"] != true || s0["className"] != "iron_bull" {
		t.Errorf("seat 0 should be the human host with iron_bull, got %v", s0)
	}
	if seats[1].(map[string]any)["human"] != false {
		t.Error("seat 1 should default to CPU")
	}
}

func TestKKJoinAssignsSeat(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "stone_tiger")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "silver_viper")

	gl, ok := guestCap.last(kkLobbyUpdate)
	if !ok {
		t.Fatal("guest did not receive kk:lobby_update")
	}
	if payloadField(t, gl, "you") != float64(1) {
		t.Errorf("guest should be seat 1, got %v", payloadField(t, gl, "you"))
	}
	seats := seatsOf(t, gl)
	if seats[1].(map[string]any)["human"] != true || seats[1].(map[string]any)["className"] != "silver_viper" {
		t.Errorf("seat 1 should be the joined human, got %v", seats[1])
	}
}

func TestKKJoinErrors(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)

	m.JoinRoom(guestID, "ZZZZZZ", "")
	if e, ok := guestCap.last(kkError); !ok || payloadField(t, e, "message") != "Room not found" {
		t.Fatalf("expected 'Room not found', got %+v ok=%v", e, ok)
	}

	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	// Fill seats 1..3, then a 5th connection must be rejected.
	for i, id := range []string{guestID, "g2", "g3"} {
		c := &capture{}
		if id != guestID {
			m.reg.add(id, c.send)
		}
		m.JoinRoom(id, code, "")
		_ = i
	}
	fifthCap := &capture{}
	m.reg.add("g4", fifthCap.send)
	m.JoinRoom("g4", code, "")
	if e, ok := fifthCap.last(kkError); !ok || payloadField(t, e, "message") != "Room is full" {
		t.Fatalf("expected 'Room is full', got %+v ok=%v", e, ok)
	}
}

func TestKKSetConfig(t *testing.T) {
	m, hostID, hostCap, guestID, _ := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "")

	size := 4
	m.SetConfig(hostID, nil, &size, nil)
	lobby, _ := hostCap.last(kkLobbyUpdate)
	if len(seatsOf(t, lobby)) != 4 {
		t.Fatalf("arena size should be 4 after SetConfig, got %d", len(seatsOf(t, lobby)))
	}

	// Guest cannot change config.
	before := hostCap.count(kkLobbyUpdate)
	two := 2
	m.SetConfig(guestID, nil, &two, nil)
	if hostCap.count(kkLobbyUpdate) != before {
		t.Error("non-host SetConfig should be a no-op")
	}

	// Teams with an odd arena size is coerced back to FFA.
	teams := "teams"
	three := 3
	m.SetConfig(hostID, &teams, &three, nil)
	lobby2, _ := hostCap.last(kkLobbyUpdate)
	if payloadField(t, lobby2, "mode") != "ffa" {
		t.Errorf("teams with odd size should fall back to ffa, got %v", payloadField(t, lobby2, "mode"))
	}
}

func TestKKStart(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "iron_bull")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "silver_viper")

	m.Start(hostID)
	hs, ok := hostCap.last(kkMatchStart)
	if !ok {
		t.Fatal("host did not receive kk:match_start")
	}
	if payloadField(t, hs, "you") != float64(0) {
		t.Error("host match_start you should be 0")
	}
	seats := seatsOf(t, hs)
	if len(seats) != 2 || seats[0].(map[string]any)["kind"] != "human" {
		t.Errorf("expected 2 human seats, got %v", seats)
	}
	if _, ok := guestCap.last(kkMatchStart); !ok {
		t.Fatal("guest did not receive kk:match_start")
	}

	// Joining a playing room is rejected.
	lateCap := &capture{}
	m.reg.add("late", lateCap.send)
	m.JoinRoom("late", code, "")
	if e, ok := lateCap.last(kkError); !ok || payloadField(t, e, "message") != "Match already in progress" {
		t.Fatalf("expected 'Match already in progress', got %+v ok=%v", e, ok)
	}
}

func TestKKInputRelay(t *testing.T) {
	m, hostID, hostCap, guestID, _ := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "")

	m.Input(guestID, json.RawMessage(`[1,0,0,2]`))
	in, ok := hostCap.last(kkInput)
	if !ok || payloadField(t, in, "seat") != float64(1) {
		t.Fatalf("host should receive guest input stamped seat 1, got %+v", in)
	}

	// Host input must not relay anywhere.
	before := hostCap.count(kkInput)
	m.Input(hostID, json.RawMessage(`[0,0,0,0]`))
	if hostCap.count(kkInput) != before {
		t.Error("host input should not relay")
	}
}

func TestKKSnapshotRelay(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "")

	m.Snapshot(hostID, []byte(`{"f":5}`))
	if guestCap.count(kkSnapshot) != 1 {
		t.Fatalf("guest should receive 1 snapshot, got %d", guestCap.count(kkSnapshot))
	}

	// Guest snapshot must not relay.
	before := guestCap.count(kkSnapshot)
	m.Snapshot(guestID, []byte(`{"f":6}`))
	if guestCap.count(kkSnapshot) != before {
		t.Error("guest snapshot should not relay")
	}
}

func TestKKHostLeaveDisbands(t *testing.T) {
	m, hostID, hostCap, guestID, guestCap := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "")

	m.Cleanup(hostID)
	if guestCap.count(kkError) != 1 {
		t.Fatalf("guest should be told the host left, got %d errors", guestCap.count(kkError))
	}
	m.mu.Lock()
	nRooms, nConns := len(m.rooms), len(m.connToRoom)
	m.mu.Unlock()
	if nRooms != 0 || nConns != 0 {
		t.Errorf("state not cleaned: rooms=%d conns=%d", nRooms, nConns)
	}
}

func TestKKGuestLeaveFreesSeat(t *testing.T) {
	m, hostID, hostCap, guestID, _ := newKKHarness(t)
	m.CreateRoom(hostID, "ffa", "")
	code := codeFromCreate(t, hostCap)
	m.JoinRoom(guestID, code, "")

	m.Cleanup(guestID)
	pl, ok := hostCap.last(kkPlayerLeft)
	if !ok || payloadField(t, pl, "seat") != float64(1) {
		t.Fatalf("host should be told seat 1 left, got %+v ok=%v", pl, ok)
	}
	// Room survives; stale guest input is a no-op.
	m.mu.Lock()
	_, exists := m.rooms[code]
	m.mu.Unlock()
	if !exists {
		t.Error("room should survive a guest leaving")
	}
	before := hostCap.count(kkInput)
	m.Input(guestID, json.RawMessage(`[0,0,0,0]`))
	if hostCap.count(kkInput) != before {
		t.Error("stale guest input should not relay")
	}
}
