package rmhmusic

import (
	"context"
	"testing"

	"github.com/rmhstudios/rmh-go/pkg/events"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// newTestManager builds a Manager backed by an in-process Local bus (no DB, no
// network) so the room/seq/host logic can be exercised in isolation.
func newTestManager(t *testing.T) *Manager {
	t.Helper()
	logger := log.New("rmhmusic-test", "error")
	bus := events.NewLocal("test")
	hub := realtime.NewHub(context.Background(), realtime.Options{
		Origin: "test", Logger: logger, Bus: bus,
	})
	return NewManager(hub, logger, NopRepo{})
}

// TestProjectedPositionMs covers the playback drift projection used by the sync
// heartbeat: while playing, projected = stored + elapsed-since-updatedAt; while
// paused, the stored position is reported unchanged.
func TestProjectedPositionMs(t *testing.T) {
	cases := []struct {
		name string
		pb   Playback
		now  int64
		want int64
	}{
		{
			name: "playing advances by elapsed",
			pb:   Playback{PositionMs: 1000, IsPlaying: true, UpdatedAt: 10_000},
			now:  13_500,
			want: 1000 + 3500,
		},
		{
			name: "playing with zero elapsed",
			pb:   Playback{PositionMs: 4200, IsPlaying: true, UpdatedAt: 50_000},
			now:  50_000,
			want: 4200,
		},
		{
			name: "paused returns stored position",
			pb:   Playback{PositionMs: 7777, IsPlaying: false, UpdatedAt: 10_000},
			now:  99_999,
			want: 7777,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := projectedPositionMs(tc.pb, tc.now); got != tc.want {
				t.Fatalf("projectedPositionMs = %d, want %d", got, tc.want)
			}
		})
	}
}

// TestSeqOrderedDeltaNumbering verifies that successive mutation deltas advance
// the room's monotonic Seq by exactly one each, starting at 1, and that the
// snapshot reports the current value.
func TestSeqOrderedDeltaNumbering(t *testing.T) {
	m := newTestManager(t)
	room := &ServerRoom{ID: "room1", Members: map[string]*ServerMember{}}

	if room.Seq != 0 {
		t.Fatalf("initial seq = %d, want 0", room.Seq)
	}

	room.mu.Lock()
	m.broadcastAction(room, actionMemberJoined, map[string]any{"userId": "u1"})
	m.broadcastAction(room, actionChatMessage, map[string]any{"id": "c1"})
	m.broadcastAction(room, actionQueueItemAdded, map[string]any{"id": "q1"})
	seqAfter := room.Seq
	snap := m.toClientState(room, "u1")
	room.mu.Unlock()

	if seqAfter != 3 {
		t.Fatalf("seq after 3 actions = %d, want 3", seqAfter)
	}
	if snap["seq"].(uint64) != 3 {
		t.Fatalf("snapshot seq = %v, want 3", snap["seq"])
	}
}

// TestHostAutoReassignOnHostLeave verifies that when the host leaves a room with
// other members, the host is reassigned to the first remaining member (insertion
// order) and the room survives.
func TestHostAutoReassignOnHostLeave(t *testing.T) {
	m := newTestManager(t)

	room := &ServerRoom{
		ID:         "room1",
		Code:       "ABC123",
		HostUserID: "host",
		MaxMembers: defaultMaxMembers,
		Members: map[string]*ServerMember{
			"host": {UserID: "host", UserName: "Host", IsConnected: true},
			"bob":  {UserID: "bob", UserName: "Bob", IsConnected: true},
			"amy":  {UserID: "amy", UserName: "Amy", IsConnected: true},
		},
		memberOrder: []string{"host", "bob", "amy"},
	}
	m.mu.Lock()
	m.rooms[room.ID] = room
	m.mu.Unlock()

	// Host leaves via the grace/leave path (conn == nil).
	m.removeMember(nil, room.ID, "host")

	room.mu.Lock()
	defer room.mu.Unlock()

	if _, ok := room.Members["host"]; ok {
		t.Fatal("host should have been removed")
	}
	if len(room.Members) != 2 {
		t.Fatalf("member count = %d, want 2", len(room.Members))
	}
	if room.HostUserID != "bob" {
		t.Fatalf("new host = %q, want %q (first remaining member)", room.HostUserID, "bob")
	}
}

// TestRoomDeletedWhenLastMemberLeaves verifies an empty room is reaped
// immediately on last-member removal.
func TestRoomDeletedWhenLastMemberLeaves(t *testing.T) {
	m := newTestManager(t)
	room := &ServerRoom{
		ID:          "solo",
		HostUserID:  "u1",
		Members:     map[string]*ServerMember{"u1": {UserID: "u1"}},
		memberOrder: []string{"u1"},
	}
	m.mu.Lock()
	m.rooms[room.ID] = room
	m.mu.Unlock()

	m.removeMember(nil, room.ID, "u1")

	m.mu.RLock()
	_, exists := m.rooms[room.ID]
	m.mu.RUnlock()
	if exists {
		t.Fatal("empty room should have been deleted")
	}
}
