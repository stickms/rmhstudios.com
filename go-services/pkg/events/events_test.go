package events

import (
	"bytes"
	"testing"
)

// TestRedisWireCarriesPublisherOrigin locks in the cross-replica fan-out fix.
//
// Two replicas of a realtime hub share one Redis channel. When replica A
// broadcasts, Redis echoes the publish to every subscriber — including A. Each
// subscriber decides whether to deliver by comparing the message origin to its
// own (pkg/realtime/room.go: `if msg.Origin == h.origin { continue }`). For
// that check to work the received message must carry the TRUE publisher's
// origin, not the receiving replica's local one. Before the fix the subscriber
// stamped the local origin, so every replica saw its own origin and dropped all
// cross-replica broadcasts as self-echoes.
func TestRedisWireCarriesPublisherOrigin(t *testing.T) {
	const publisher = "replica-A"
	payload := []byte(`{"event":"room:action","payload":{"x":1}}`)

	framed, err := marshalWire(publisher, payload)
	if err != nil {
		t.Fatalf("marshalWire: %v", err)
	}

	origin, got, err := unmarshalWire(framed)
	if err != nil {
		t.Fatalf("unmarshalWire: %v", err)
	}
	if origin != publisher {
		t.Fatalf("origin = %q, want %q (a received message must carry the publisher's origin, not the receiver's)", origin, publisher)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("payload round-trip mismatch: got %q want %q", got, payload)
	}

	// Mirror room.go's delivery decision: deliver iff the framed origin differs
	// from the local replica's origin.
	suppressed := func(localOrigin string) bool { return origin == localOrigin }
	if !suppressed("replica-A") {
		t.Fatal("same-origin: replica-A must suppress its own echoed broadcast")
	}
	if suppressed("replica-B") {
		t.Fatal("cross-origin: replica-B must deliver a broadcast that originated on replica-A")
	}
}

// TestUnmarshalWireRejectsUnframed ensures a non-framed message is reported as
// an error (so Subscribe skips it) rather than silently decoding to a zero
// origin that could be mistaken for a self-echo.
func TestUnmarshalWireRejectsUnframed(t *testing.T) {
	if _, _, err := unmarshalWire([]byte("not-a-json-envelope")); err == nil {
		t.Fatal("expected an error decoding an unframed message")
	}
}
