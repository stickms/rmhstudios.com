package rmhtube

import (
	"context"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/events"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// newTestManager builds a Manager backed by a local (in-process) bus and the
// no-op repo, so the room core can be exercised without a websocket or DB.
func newTestManager(t *testing.T) *Manager {
	t.Helper()
	ctx := context.Background()
	bus := events.NewLocal("test")
	hub := realtime.NewHub(ctx, realtime.Options{Origin: "test", Logger: log.New("test", "error"), Bus: bus})
	return NewManager(ctx, hub, NopRepo{}, log.New("test", "error"), nil)
}

func newQueue(ids ...string) []*queueItem {
	q := make([]*queueItem, len(ids))
	for i, id := range ids {
		q[i] = &queueItem{ID: id, Position: i, URL: "u", MediaType: "youtube", Title: id}
	}
	return q
}

func ids(q []*queueItem) []string {
	out := make([]string, len(q))
	for i, it := range q {
		out[i] = it.ID
	}
	return out
}

func eq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ─── Leader-authoritative videoState projection ──────────────────────────────

// TestProjectedStateAdvancesWhilePlaying verifies the core leader-authoritative
// rule: a playing video's reported position is projected forward by the
// wall-clock elapsed since updatedAt, scaled by playbackRate.
func TestProjectedStateAdvancesWhilePlaying(t *testing.T) {
	base := int64(1_000_000)
	v := videoState{Playing: true, CurrentTime: 10, PlaybackRate: 1, UpdatedAt: base}

	// 5 seconds later at 1x => 10 + 5 = 15.
	got := projectedState(v, base+5_000)
	if got.CurrentTime != 15 {
		t.Errorf("1x projection: currentTime = %v, want 15", got.CurrentTime)
	}
	if got.UpdatedAt != base+5_000 {
		t.Errorf("updatedAt should advance to now, got %d", got.UpdatedAt)
	}

	// 4 seconds at 2x => 10 + 8 = 18.
	v2 := videoState{Playing: true, CurrentTime: 10, PlaybackRate: 2, UpdatedAt: base}
	if got := projectedState(v2, base+4_000); got.CurrentTime != 18 {
		t.Errorf("2x projection: currentTime = %v, want 18", got.CurrentTime)
	}
}

// TestProjectedStatePausedIsFrozen verifies a paused video does not advance.
func TestProjectedStatePausedIsFrozen(t *testing.T) {
	base := int64(1_000_000)
	v := videoState{Playing: false, CurrentTime: 42, PlaybackRate: 1, UpdatedAt: base}
	got := projectedState(v, base+10_000)
	if got.CurrentTime != 42 {
		t.Errorf("paused projection should freeze position, got %v want 42", got.CurrentTime)
	}
	if got.UpdatedAt != base {
		t.Errorf("paused updatedAt should not change, got %d", got.UpdatedAt)
	}
}

// TestProjectedStateNoNegativeElapsed guards against a clock-skew report from the
// future producing a backwards jump.
func TestProjectedStateNoNegativeElapsed(t *testing.T) {
	base := int64(1_000_000)
	v := videoState{Playing: true, CurrentTime: 10, PlaybackRate: 1, UpdatedAt: base}
	if got := projectedState(v, base-5_000); got.CurrentTime != 10 {
		t.Errorf("negative elapsed should not rewind, got %v want 10", got.CurrentTime)
	}
}

// ─── seq monotonicity ────────────────────────────────────────────────────────

// TestBroadcastActionSeqMonotonic verifies every mutation stamps a strictly
// increasing per-room seq (the ordering guarantee the delta protocol relies on).
func TestBroadcastActionSeqMonotonic(t *testing.T) {
	m := newTestManager(t)
	r := &room{ID: "ROOM01", Members: map[string]*member{}}

	const n = 200
	for i := 0; i < n; i++ {
		m.broadcastAction(r, "TEST", map[string]any{"i": i})
	}
	if r.Seq != n {
		t.Fatalf("seq after %d actions = %d, want %d", n, r.Seq, n)
	}
}

// ─── queue reorder ───────────────────────────────────────────────────────────

func TestQueueReorderMovesAndReindexes(t *testing.T) {
	q := newQueue("a", "b", "c", "d")

	// Move "a" (index 0) to position 2 => b, c, a, d.
	if !moveItem(&q, "a", 2) {
		t.Fatal("moveItem returned false for present item")
	}
	if want := []string{"b", "c", "a", "d"}; !eq(ids(q), want) {
		t.Fatalf("order = %v, want %v", ids(q), want)
	}
	// Positions must be reindexed 0..n-1 in order.
	for i, it := range q {
		if it.Position != i {
			t.Errorf("item %s position = %d, want %d", it.ID, it.Position, i)
		}
	}
}

func TestQueueReorderClampsAndRejectsMissing(t *testing.T) {
	q := newQueue("a", "b", "c")

	// newPosition beyond the end clamps to the last slot.
	if !moveItem(&q, "a", 99) {
		t.Fatal("expected move to succeed")
	}
	if want := []string{"b", "c", "a"}; !eq(ids(q), want) {
		t.Fatalf("clamp-high order = %v, want %v", ids(q), want)
	}

	// Negative clamps to 0.
	if !moveItem(&q, "a", -5) {
		t.Fatal("expected move to succeed")
	}
	if want := []string{"a", "b", "c"}; !eq(ids(q), want) {
		t.Fatalf("clamp-low order = %v, want %v", ids(q), want)
	}

	// Unknown item is a no-op returning false.
	before := ids(q)
	if moveItem(&q, "zzz", 0) {
		t.Fatal("moveItem should report false for unknown item")
	}
	if !eq(ids(q), before) {
		t.Fatalf("queue mutated on missing item: %v", ids(q))
	}
}

// TestAdvanceQueueProgressesAndCapsHistory exercises the advance path: playing,
// pushing history, and stopping when the queue is exhausted.
func TestAdvanceQueueProgressesAndCapsHistory(t *testing.T) {
	m := newTestManager(t)
	r := &room{
		ID: "ROOM02", Members: map[string]*member{"u": {UserID: "u", IsConnected: true}},
		Queue: newQueue("a", "b"), CurrentIndex: -1,
		SkipVotes:     map[string]struct{}{},
		QueueVotes:    map[string]map[string]struct{}{},
		ChatReactions: map[string]map[string]map[string]struct{}{},
		Settings:      roomSettings{AutoPlay: true},
	}

	m.playAtIndex(r, 0)
	if r.CurrentIndex != 0 || r.CurrentItem.ID != "a" {
		t.Fatalf("playAtIndex(0): index=%d item=%v", r.CurrentIndex, r.CurrentItem)
	}

	m.advanceQueue(r) // a -> b, a goes to history
	if r.CurrentItem == nil || r.CurrentItem.ID != "b" {
		t.Fatalf("advance: current = %v, want b", r.CurrentItem)
	}
	if len(r.PlayedItems) != 1 || r.PlayedItems[0].ID != "a" {
		t.Fatalf("history = %v, want [a]", ids(r.PlayedItems))
	}

	m.advanceQueue(r) // b -> exhausted
	if r.CurrentItem != nil || r.CurrentIndex != -1 {
		t.Fatalf("expected exhausted state, got item=%v index=%d", r.CurrentItem, r.CurrentIndex)
	}
	if len(r.PlayedItems) != 2 {
		t.Fatalf("history len = %d, want 2", len(r.PlayedItems))
	}
}

// TestVideoStateResetOnMediaChange verifies media changes reset playback to a
// clean paused state at t=0 (the source of truth for newly-loaded videos).
func TestVideoStateResetOnMediaChange(t *testing.T) {
	m := newTestManager(t)
	r := &room{
		ID: "ROOM03", Members: map[string]*member{},
		VideoState: videoState{Playing: true, CurrentTime: 99, PlaybackRate: 2, UpdatedAt: 1},
	}
	m.onMediaChanged(r)
	if r.VideoState.Playing || r.VideoState.CurrentTime != 0 || r.VideoState.PlaybackRate != 1 {
		t.Fatalf("video state not reset: %+v", r.VideoState)
	}
	if r.VideoState.UpdatedAt == 1 {
		t.Fatal("updatedAt should be refreshed on media change")
	}
}

// Sanity: ensure the heartbeat tick path is safe to call against an empty
// registry (no panic, no broadcast).
func TestHeartbeatTickEmpty(t *testing.T) {
	m := newTestManager(t)
	done := make(chan struct{})
	go func() { m.tickHeartbeat(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("tickHeartbeat hung on empty registry")
	}
}
