// Package realtime is the shared WebSocket framework that replaces the Node
// services' Socket.IO layer (socket-server, rmhbox, rmhtube, rmhmusic).
//
// IMPORTANT compatibility note (called out honestly throughout the design):
// the legacy clients speak the Socket.IO v4 wire protocol. This package speaks
// a clean, explicit JSON-envelope protocol over a raw WebSocket. The envelope
// deliberately mirrors the *semantics* the Node servers already exposed to
// clients — named events plus the sequence-numbered "{type,payload,seq,
// timestamp}" mutation broadcasts (S2C.ROOM_ACTION / GAME_ACTION) — so a thin
// TypeScript client adapter can map the existing event names onto this
// transport without changing game logic. Socket.IO wire-compatibility is the
// one explicit gap, with a documented migration path.
package realtime

import (
	"encoding/json"
	"time"
)

// Envelope is the single frame shape exchanged in both directions.
//
//	{ "event": "room:join", "payload": {...}, "seq": 42, "ts": 1718700000000 }
//
// Seq is server-assigned and monotonic per room for mutation broadcasts,
// reproducing the ordering guarantee the Node delta protocol relied on.
type Envelope struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Seq     uint64          `json:"seq,omitempty"`
	TS      int64           `json:"ts,omitempty"`
}

// NewEnvelope builds an envelope, marshaling payload to JSON. A nil payload is
// allowed (e.g. heartbeats).
func NewEnvelope(event string, payload any) (Envelope, error) {
	e := Envelope{Event: event, TS: time.Now().UnixMilli()}
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return Envelope{}, err
		}
		e.Payload = b
	}
	return e, nil
}

// MustEnvelope is NewEnvelope that panics on marshal error. Use only with
// payloads known to be JSON-safe (structs, maps of primitives).
func MustEnvelope(event string, payload any) Envelope {
	e, err := NewEnvelope(event, payload)
	if err != nil {
		panic(err)
	}
	return e
}

// Encode marshals the envelope to bytes for the wire.
func (e Envelope) Encode() []byte {
	b, _ := json.Marshal(e)
	return b
}

// Decode parses an inbound frame.
func Decode(b []byte) (Envelope, error) {
	var e Envelope
	err := json.Unmarshal(b, &e)
	return e, err
}

// Bind unmarshals the envelope payload into v.
func (e Envelope) Bind(v any) error {
	if len(e.Payload) == 0 {
		return nil
	}
	return json.Unmarshal(e.Payload, v)
}
