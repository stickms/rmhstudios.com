package realtime

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestEnvelopeRoundTrip(t *testing.T) {
	type payload struct {
		Room string `json:"room"`
	}
	e := MustEnvelope("room:join", payload{Room: "abc"})
	if e.Event != "room:join" {
		t.Fatalf("event = %q", e.Event)
	}
	raw := e.Encode()
	got, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	var p payload
	if err := got.Bind(&p); err != nil {
		t.Fatal(err)
	}
	if p.Room != "abc" {
		t.Fatalf("room = %q", p.Room)
	}
}

func TestEnvelopeNilPayload(t *testing.T) {
	e := MustEnvelope("ping", nil)
	if len(e.Payload) != 0 {
		t.Fatalf("expected empty payload, got %s", e.Payload)
	}
	if !json.Valid(e.Encode()) {
		t.Fatal("encoded envelope is not valid JSON")
	}
}

func TestRoomSeqMonotonic(t *testing.T) {
	r := newRoom("r1")
	var wg sync.WaitGroup
	seen := make([]uint64, 1000)
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			seen[i] = r.NextSeq()
		}(i)
	}
	wg.Wait()
	uniq := make(map[uint64]struct{}, 1000)
	for _, s := range seen {
		if _, dup := uniq[s]; dup {
			t.Fatalf("duplicate seq %d", s)
		}
		uniq[s] = struct{}{}
	}
	if len(uniq) != 1000 {
		t.Fatalf("expected 1000 unique seqs, got %d", len(uniq))
	}
}

func TestGraceTimerCancel(t *testing.T) {
	g := NewGraceTimers()
	fired := make(chan struct{}, 1)
	g.Schedule("k", 30*time.Millisecond, func() { fired <- struct{}{} })
	if !g.Cancel("k") {
		t.Fatal("expected cancel to report a pending timer")
	}
	select {
	case <-fired:
		t.Fatal("timer fired after cancel")
	case <-time.After(60 * time.Millisecond):
	}
}

func TestGraceTimerReschedule(t *testing.T) {
	g := NewGraceTimers()
	fired := make(chan string, 2)
	g.Schedule("k", 20*time.Millisecond, func() { fired <- "first" })
	g.Schedule("k", 20*time.Millisecond, func() { fired <- "second" })
	select {
	case which := <-fired:
		if which != "second" {
			t.Fatalf("expected reschedule to win, got %q", which)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timer never fired")
	}
}
