//go:build e2e

package e2e

import (
	"testing"
	"time"
)

// Kowloon Knockout event/payload contract (from internal/gamehub/kk.go):
//
//   C2S kk:create_room  { "mode": "ffa"|"teams", "fighterClass": "<class>" }
//   S2C kk:room_created { "code": "<ROOMCODE>", "seat": 0 }
//   S2C kk:lobby_update { "you": <seat>, "seats": [...], "mode", "arenaSize", ... }
//   C2S kk:join_room    { "code": "<ROOMCODE>", "fighterClass": "<class>" }
//   C2S kk:start        {}                         (host only)
//   S2C kk:match_start  { "you": <seat>, "seats": [...], "mode", "maxRounds" }
//   C2S/S2C kk:input     { "seat": <guest>, "input": <opaque> } (guest -> host)
//   C2S/S2C kk:snapshot  <opaque> (host -> guests)
//   S2C kk:player_left   { "seat": <seat> }
//
// gamehub runs with RequireAuth=false (soft-auth), so no token is needed.

// TestKKRelayFlow exercises the lobby + host-authoritative relay: create, join,
// start, input (guest->host), snapshot (host->guest), and disconnect handling.
func TestKKRelayFlow(t *testing.T) {
	url := gamehubURL()

	// ── Host (client A) creates a room ──
	a := dial(t, url, "")
	a.send("kk:create_room", map[string]any{"mode": "ffa", "fighterClass": "stone_tiger"})
	created := a.readUntil("kk:room_created", defaultReadTimeout)
	code := str(t, created, "code")
	if code == "" {
		t.Fatalf("kk:room_created returned empty code")
	}
	a.readUntil("kk:lobby_update", defaultReadTimeout)
	t.Logf("room created: code=%s", code)

	// ── Guest (client B) joins ──
	b := dial(t, url, "")
	b.send("kk:join_room", map[string]any{"code": code, "fighterClass": "iron_bull"})
	bLobby := b.readUntil("kk:lobby_update", defaultReadTimeout)
	if got := numField(bLobby, "you"); got != 1 {
		t.Fatalf("guest B: expected seat 1, got %v", got)
	}

	// ── Host starts the match: both seats get kk:match_start ──
	a.send("kk:start", map[string]any{})
	aStart := a.readUntil("kk:match_start", defaultReadTimeout)
	bStart := b.readUntil("kk:match_start", defaultReadTimeout)
	if numField(aStart, "you") != 0 {
		t.Fatalf("host A: expected match_start you=0, got %v", aStart["you"])
	}
	if numField(bStart, "you") != 1 {
		t.Fatalf("guest B: expected match_start you=1, got %v", bStart["you"])
	}

	// ── Guest -> Host: kk:input is relayed to the host, stamped with the seat ──
	b.send("kk:input", map[string]any{"input": []any{1, 0, 0, 2}})
	input := a.readUntil("kk:input", defaultReadTimeout)
	if got := numField(input, "seat"); got != 1 {
		t.Fatalf("host A: expected relayed input seat=1, got %v (payload %v)", got, input)
	}

	// ── Host -> Guest: kk:snapshot is broadcast to guests ──
	a.send("kk:snapshot", map[string]any{"f": 42})
	snap := b.readUntil("kk:snapshot", defaultReadTimeout)
	if got := numField(snap, "f"); got != 42 {
		t.Fatalf("guest B: expected relayed snapshot f=42, got %v (payload %v)", got, snap)
	}

	// ── Guest disconnects: host is notified the seat left ──
	b.close()
	left := a.readUntil("kk:player_left", defaultReadTimeout)
	if got := numField(left, "seat"); got != 1 {
		t.Fatalf("host A: expected player_left seat=1, got %v", got)
	}
}

// numField reads a numeric field from a JSON-decoded payload (numbers decode to
// float64).
func numField(m map[string]any, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return -999999
}

// TestKKJoinUnknownRoom verifies the error path: joining a non-existent room
// yields kk:error rather than kk:lobby_update.
func TestKKJoinUnknownRoom(t *testing.T) {
	url := gamehubURL()
	c := dial(t, url, "")
	c.send("kk:join_room", map[string]any{"code": "ZZZZZZ", "fighterClass": "stone_tiger"})
	errp := c.readUntil("kk:error", defaultReadTimeout)
	if str(t, errp, "message") == "" {
		t.Fatalf("expected non-empty error message, got %v", errp)
	}
	c.expectNoEvent("kk:lobby_update", 500*time.Millisecond)
}
