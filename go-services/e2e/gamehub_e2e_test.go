//go:build e2e

package e2e

import (
	"testing"
	"time"
)

// Kowloon Knockout event/payload contract (from internal/gamehub/kk.go):
//
//   C2S kk:create_room  { "fighterClass": "<class>" }   (optional; default "stone_tiger")
//   S2C kk:room_created { "code": "<ROOMCODE>" }
//   C2S kk:join_room    { "code": "<ROOMCODE>", "fighterClass": "<class>" }
//   S2C kk:room_joined  { "hostClass": "...", "guestClass": "...", "isHost": <bool> }
//   C2S/S2C kk:input      <opaque payload, guest -> host relay>
//   C2S/S2C kk:game_state <opaque payload, host -> guest relay>
//   S2C kk:opponent_disconnected {}
//
// gamehub runs with RequireAuth=false (soft-auth), so no token is needed.

// TestKKRelayFlow exercises the full host-authoritative relay: create, join,
// input (guest->host), game_state (host->guest), and disconnect notification.
func TestKKRelayFlow(t *testing.T) {
	url := gamehubURL()

	// ── Host (client A) creates a room ──
	a := dial(t, url, "")
	a.send("kk:create_room", map[string]any{"fighterClass": "stone_tiger"})
	created := a.readUntil("kk:room_created", defaultReadTimeout)
	code := str(t, created, "code")
	if code == "" {
		t.Fatalf("kk:room_created returned empty code")
	}
	t.Logf("room created: code=%s", code)

	// ── Guest (client B) joins the room ──
	b := dial(t, url, "")
	b.send("kk:join_room", map[string]any{"code": code, "fighterClass": "iron_crane"})

	// Both A (host) and B (guest) must receive kk:room_joined.
	aJoined := a.readUntil("kk:room_joined", defaultReadTimeout)
	bJoined := b.readUntil("kk:room_joined", defaultReadTimeout)

	if host, ok := aJoined["isHost"].(bool); !ok || !host {
		t.Fatalf("host A: expected isHost=true, got %v", aJoined["isHost"])
	}
	if host, ok := bJoined["isHost"].(bool); !ok || host {
		t.Fatalf("guest B: expected isHost=false, got %v", bJoined["isHost"])
	}
	// The fighter classes seen by both seats must agree.
	if str(t, aJoined, "hostClass") != "stone_tiger" {
		t.Fatalf("host A: expected hostClass=stone_tiger, got %v", aJoined["hostClass"])
	}
	if str(t, aJoined, "guestClass") != "iron_crane" {
		t.Fatalf("host A: expected guestClass=iron_crane, got %v", aJoined["guestClass"])
	}
	if str(t, bJoined, "guestClass") != "iron_crane" {
		t.Fatalf("guest B: expected guestClass=iron_crane, got %v", bJoined["guestClass"])
	}

	// ── Guest -> Host: kk:input is relayed to the host only ──
	b.send("kk:input", map[string]any{"frame": 1, "buttons": []string{"punch"}})
	input := a.readUntil("kk:input", defaultReadTimeout)
	if got, want := numField(input, "frame"), 1.0; got != want {
		t.Fatalf("host A: expected relayed input frame=%v, got %v (payload %v)", want, got, input)
	}

	// ── Host -> Guest: kk:game_state is relayed to the guest only ──
	a.send("kk:game_state", map[string]any{"tick": 42, "p1hp": 100})
	state := b.readUntil("kk:game_state", defaultReadTimeout)
	if got, want := numField(state, "tick"), 42.0; got != want {
		t.Fatalf("guest B: expected relayed game_state tick=%v, got %v (payload %v)", want, got, state)
	}

	// ── Guest disconnects: host receives kk:opponent_disconnected ──
	b.close()
	a.readUntil("kk:opponent_disconnected", defaultReadTimeout)
}

// numField reads a numeric field from a JSON-decoded payload (numbers decode to
// float64). Returns NaN-ish -1 sentinel via test failure if missing/non-numeric
// is not handled here; callers compare directly.
func numField(m map[string]any, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return -999999
}

// TestKKJoinUnknownRoom verifies the error path: joining a non-existent room
// yields kk:error rather than kk:room_joined.
func TestKKJoinUnknownRoom(t *testing.T) {
	url := gamehubURL()
	c := dial(t, url, "")
	c.send("kk:join_room", map[string]any{"code": "ZZZZZZ", "fighterClass": "stone_tiger"})
	errp := c.readUntil("kk:error", defaultReadTimeout)
	if str(t, errp, "message") == "" {
		t.Fatalf("expected non-empty error message, got %v", errp)
	}
	// And it must NOT have produced a room_joined.
	c.expectNoEvent("kk:room_joined", 500*time.Millisecond)
}
