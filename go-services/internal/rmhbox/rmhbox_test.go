package rmhbox

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// ─── test harness ────────────────────────────────────────────────────────────

type captured struct {
	room  string
	event string
	seq   uint64
	body  map[string]any
}

// testRig wires a LobbyManager + coordinator with capturing seams (no sockets).
type testRig struct {
	lm *LobbyManager
	gc *GameCoordinator
	ss *StateSync

	mu      sync.Mutex
	actions []captured // sequenced GAME_ACTION broadcasts
	raws    []captured // non-sequenced broadcasts
	sent    []captured // per-user sends
}

func newTestRig(t *testing.T, repo Repo) *testRig {
	t.Helper()
	logger := log.New("rmhbox-test", "error")
	lm := NewLobbyManager(nil, logger)
	r := &testRig{}
	lm.testSeq = map[string]uint64{}
	lm.broadcastSeqFn = func(room string, e realtime.Envelope) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.actions = append(r.actions, decode(room, e))
	}
	lm.broadcastFn = func(room string, e realtime.Envelope) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.raws = append(r.raws, decode(room, e))
	}
	lm.sendFn = func(userID string, e realtime.Envelope) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.sent = append(r.sent, decode(userID, e))
	}
	ss := NewStateSync(lm)
	gc := NewGameCoordinator(lm, ss, repo, logger)
	r.lm, r.gc, r.ss = lm, gc, ss
	return r
}

func decode(room string, e realtime.Envelope) captured {
	var body map[string]any
	_ = json.Unmarshal(e.Payload, &body)
	return captured{room: room, event: e.Event, seq: e.Seq, body: body}
}

// makeLobby inserts a WAITING lobby with the given host + extra players.
func (r *testRig) makeLobby(host string, others ...string) *Lobby {
	now := nowMS()
	l := &Lobby{
		ID: "L1", HostUserID: host, Settings: defaultSettings(),
		Players:    map[string]*Player{host: {UserID: host, UserName: host, ConnID: "c-" + host, IsConnected: true, IsReady: true, JoinedAt: now}},
		Spectators: map[string]*Spectator{},
		State:      StateWaiting, Chat: []ChatMessage{}, CreatedAt: now, LastActiveAt: now,
		MatchHistory: []ServerMatchSummary{},
	}
	for i, o := range others {
		l.Players[o] = &Player{UserID: o, UserName: o, ConnID: "c-" + o, IsConnected: true, JoinedAt: now + int64(i+1)}
	}
	r.lm.mu.Lock()
	r.lm.lobbies[l.ID] = l
	r.lm.userToLobby[host] = l.ID
	for _, o := range others {
		r.lm.userToLobby[o] = l.ID
	}
	r.lm.mu.Unlock()
	return l
}

func (r *testRig) stateActions() []captured {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []captured
	for _, a := range r.actions {
		if t, _ := a.body["type"].(string); t == "STATE_CHANGED" {
			out = append(out, a)
		}
	}
	return out
}

// ─── 1. Lobby FSM transitions ────────────────────────────────────────────────

func TestFSMTransitions(t *testing.T) {
	r := newTestRig(t, nil)
	l := r.makeLobby("host", "p2") // rhyme-time needs 2..16

	// WAITING -> (direct select) -> INSTRUCTIONS
	r.gc.OnSelect("host", "L1", "rhyme-time")
	if got := lobbyState(l); got != StateInstructions {
		t.Fatalf("after OnSelect want INSTRUCTIONS, got %s", got)
	}

	// INSTRUCTIONS -> PRELOADING (force-skip)
	r.gc.OnForceSkip("host", "L1")
	if got := lobbyState(l); got != StatePreloading {
		t.Fatalf("after skip instructions want PRELOADING, got %s", got)
	}

	// PRELOADING -> COUNTDOWN (all ready_to_render)
	r.gc.OnReadyToRender("host", "L1")
	r.gc.OnReadyToRender("p2", "L1")
	if got := lobbyState(l); got != StateCountdown {
		t.Fatalf("after ready_to_render want COUNTDOWN, got %s", got)
	}

	// COUNTDOWN -> PLAYING (force-skip)
	r.gc.OnForceSkip("host", "L1")
	if got := lobbyState(l); got != StatePlaying {
		t.Fatalf("after skip countdown want PLAYING, got %s", got)
	}

	// PLAYING -> ROUND_RESULTS (game completes via ForceEnd on handler)
	r.gc.OnForceEnd("host", "L1") // PLAYING force-end returns to WAITING
	if got := lobbyState(l); got != StateWaiting {
		t.Fatalf("after force-end want WAITING, got %s", got)
	}

	// Verify the STATE_CHANGED sequence covered the forward path.
	wantPrefix := []LobbyState{StateInstructions, StatePreloading, StateCountdown, StatePlaying, StateWaiting}
	got := r.stateActions()
	if len(got) < len(wantPrefix) {
		t.Fatalf("want >= %d STATE_CHANGED actions, got %d", len(wantPrefix), len(got))
	}
	for i, want := range wantPrefix {
		gs, _ := got[i].body["payload"].(map[string]any)
		if gs == nil || gs["state"] != string(want) {
			t.Fatalf("STATE_CHANGED[%d] = %v, want %s", i, got[i].body["payload"], want)
		}
	}
}

func TestRoundResultsTransitionOnComplete(t *testing.T) {
	r := newTestRig(t, nil)
	l := r.makeLobby("host", "p2")
	// Drive to PLAYING then deliver results directly.
	l.mu.Lock()
	l.State = StatePlaying
	l.CurrentGame = &ActiveGame{MinigameID: "rhyme-time", Handler: nil, StartedAt: nowMS()}
	l.mu.Unlock()

	r.gc.handleGameComplete("L1", MinigameResults{
		Rankings: []PlayerRanking{
			{UserID: "host", UserName: "host", Score: 30, Rank: 1},
			{UserID: "p2", UserName: "p2", Score: 10, Rank: 2},
		},
		Duration: 1234,
	})
	if got := lobbyState(l); got != StateRoundResults {
		t.Fatalf("after handleGameComplete want ROUND_RESULTS, got %s", got)
	}
	// Cumulative score applied + match history recorded.
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.Players["host"].Score != 30 {
		t.Fatalf("host score = %d, want 30", l.Players["host"].Score)
	}
	if len(l.MatchHistory) != 1 || l.MatchHistory[0].Standings[0].UserID != "host" {
		t.Fatalf("match history not recorded correctly: %+v", l.MatchHistory)
	}
}

func lobbyState(l *Lobby) LobbyState {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.State
}

// ─── 2. seq-ordered GAME_ACTION numbering ────────────────────────────────────

func TestSeqOrderedGameActions(t *testing.T) {
	r := newTestRig(t, nil)
	r.makeLobby("host")

	for i := 0; i < 5; i++ {
		r.lm.broadcastAction("L1", "PING", map[string]any{"n": i})
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.actions) != 5 {
		t.Fatalf("want 5 actions, got %d", len(r.actions))
	}
	for i, a := range r.actions {
		if a.event != "rmhbox:game:action" {
			t.Fatalf("action[%d] event = %s", i, a.event)
		}
		if a.seq != uint64(i+1) {
			t.Fatalf("action[%d] seq = %d, want %d (must be monotonic from 1)", i, a.seq, i+1)
		}
	}
}

func TestSeqMonotonicUnderConcurrency(t *testing.T) {
	r := newTestRig(t, nil)
	r.makeLobby("host")
	var wg sync.WaitGroup
	// The hub serialises seq per room; broadcastSeq increments under no extra
	// lock here, so serialise writes to prove ordering of the numbering itself.
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); r.lm.broadcastAction("L1", "X", nil) }()
	}
	wg.Wait()
	r.mu.Lock()
	defer r.mu.Unlock()
	seen := map[uint64]bool{}
	for _, a := range r.actions {
		if seen[a.seq] {
			t.Fatalf("duplicate seq %d", a.seq)
		}
		seen[a.seq] = true
	}
	if len(seen) != 100 {
		t.Fatalf("want 100 unique seqs, got %d", len(seen))
	}
}

// ─── 3. Per-player scoped state filtering ─────────────────────────────────────

func TestScopedStateFiltering(t *testing.T) {
	// Build a rhyme-time game in INPUT with a private submission for p2.
	ctx := &MinigameContext{
		LobbyID:                  "L1",
		Players:                  map[string]*Player{"p1": {UserID: "p1", UserName: "P1"}, "p2": {UserID: "p2", UserName: "P2"}},
		GameSettings:             map[string]any{},
		BroadcastAction:          func(string, any) {},
		BroadcastToLobby:         func(string, any) {},
		SendToPlayer:             func(string, string, any) {},
		SendToSpectatorFollowers: func(string, string, any) {},
		OnComplete:               func(MinigameResults) {}, OnError: func(error) {},
	}
	g := newRhymeTimeGame(ctx)
	g.initializeState()
	g.mu.Lock()
	g.state.Phase = rtInput
	rw := rtRootWord{Word: "cat", SyllableCount: 1}
	g.state.RootWord = &rw
	g.state.Submissions["p1"] = []rtSubmission{{Word: "hat", IsValid: true}}
	g.state.Submissions["p2"] = []rtSubmission{{Word: "bat", IsValid: true}}
	g.mu.Unlock()

	p1State := g.GetStateForPlayer("p1").(map[string]any)
	p2State := g.GetStateForPlayer("p2").(map[string]any)
	specState := g.GetStateForSpectator().(map[string]any)

	// Each player sees ONLY their own submissions.
	if subs := p1State["mySubmissions"].([]rtSubmission); len(subs) != 1 || subs[0].Word != "hat" {
		t.Fatalf("p1 mySubmissions = %+v, want [hat]", subs)
	}
	if subs := p2State["mySubmissions"].([]rtSubmission); len(subs) != 1 || subs[0].Word != "bat" {
		t.Fatalf("p2 mySubmissions = %+v, want [bat]", subs)
	}
	// Spectator sees no private submissions during INPUT.
	if subs := specState["mySubmissions"].([]rtSubmission); len(subs) != 0 {
		t.Fatalf("spectator mySubmissions = %+v, want empty", subs)
	}
	// Competitive-individual spectator following p1 sees p1's scoped state.
	snap := g.GetSpectatorSnapshot("p1").(map[string]any)
	if subs := snap["mySubmissions"].([]rtSubmission); len(subs) != 1 || subs[0].Word != "hat" {
		t.Fatalf("spectator-following-p1 mySubmissions = %+v, want [hat]", subs)
	}
}

func TestBuildClientStateScopesByRole(t *testing.T) {
	r := newTestRig(t, nil)
	l := r.makeLobby("host", "p2")
	// add a spectator
	l.mu.Lock()
	l.Spectators["spec"] = &Spectator{UserID: "spec", UserName: "spec", IsConnected: true}
	ctx := &MinigameContext{
		LobbyID: "L1", Players: map[string]*Player{"host": {UserID: "host"}, "p2": {UserID: "p2"}},
		GameSettings: map[string]any{}, BroadcastAction: func(string, any) {},
		BroadcastToLobby: func(string, any) {}, SendToPlayer: func(string, string, any) {},
		SendToSpectatorFollowers: func(string, string, any) {}, OnComplete: func(MinigameResults) {}, OnError: func(error) {},
	}
	g := newRhymeTimeGame(ctx)
	g.initializeState()
	g.state.Phase = rtInput
	rw := rtRootWord{Word: "cat", SyllableCount: 1}
	g.state.RootWord = &rw
	g.state.Submissions["host"] = []rtSubmission{{Word: "hat", IsValid: true}}
	l.State = StatePlaying
	l.CurrentGame = &ActiveGame{MinigameID: "rhyme-time", Handler: g, StartedAt: nowMS()}
	l.mu.Unlock()

	playerView := r.lm.buildClientState(l, "host")
	specView := r.lm.buildClientState(l, "spec")
	if playerView["myRole"] != "player" {
		t.Fatalf("host myRole = %v, want player", playerView["myRole"])
	}
	if specView["myRole"] != "spectator" {
		t.Fatalf("spec myRole = %v, want spectator", specView["myRole"])
	}
	pg := playerView["currentGame"].(map[string]any)["publicState"].(map[string]any)
	sg := specView["currentGame"].(map[string]any)["publicState"].(map[string]any)
	if subs := pg["mySubmissions"].([]rtSubmission); len(subs) != 1 {
		t.Fatalf("player publicState should contain own submissions, got %+v", subs)
	}
	if subs := sg["mySubmissions"].([]rtSubmission); len(subs) != 0 {
		t.Fatalf("spectator publicState must not leak submissions, got %+v", subs)
	}
}

// ─── 4. Atomic minigameStats merge ───────────────────────────────────────────

func TestMinigameStatsMerge(t *testing.T) {
	// Existing entry merges correctly (read-modify-write math).
	cur := map[string]minigameStatEntry{
		"rhyme-time": {GamesPlayed: 2, Wins: 1, BestScore: 50, TotalScore: 80, TotalRank: 3, AverageRank: 1.5},
	}
	got := mergeMinigameStats(cur, "rhyme-time", 90 /*score*/, 1 /*rank*/, true /*winner*/)
	e := got["rhyme-time"]
	if e.GamesPlayed != 3 || e.Wins != 2 || e.BestScore != 90 || e.TotalScore != 170 || e.TotalRank != 4 {
		t.Fatalf("merged entry wrong: %+v", e)
	}
	if e.AverageRank != 4.0/3.0 {
		t.Fatalf("averageRank = %v, want %v", e.AverageRank, 4.0/3.0)
	}

	// Fresh entry for a new game id.
	got2 := mergeMinigameStats(got, "wiki-race", 10, 2, false)
	if got2["wiki-race"].GamesPlayed != 1 || got2["wiki-race"].Wins != 0 || got2["wiki-race"].BestScore != 10 {
		t.Fatalf("new entry wrong: %+v", got2["wiki-race"])
	}
	// Existing entry untouched.
	if got2["rhyme-time"].GamesPlayed != 3 {
		t.Fatalf("rhyme-time entry mutated: %+v", got2["rhyme-time"])
	}
}

// fakeRepo verifies the coordinator fires persistence on game complete.
type fakeRepo struct {
	mu      sync.Mutex
	matches []MatchRecord
}

func (f *fakeRepo) PersistMatch(_ context.Context, m MatchRecord) error {
	f.mu.Lock()
	f.matches = append(f.matches, m)
	f.mu.Unlock()
	return nil
}
func (f *fakeRepo) ReadLeaderboard(context.Context, string, int) ([]LeaderboardEntry, error) {
	return nil, nil
}

func TestGameCompleteFiresPersistence(t *testing.T) {
	repo := &fakeRepo{}
	r := newTestRig(t, repo)
	l := r.makeLobby("host", "p2")
	l.mu.Lock()
	l.State = StatePlaying
	l.CurrentGame = &ActiveGame{MinigameID: "rhyme-time", StartedAt: nowMS()}
	l.mu.Unlock()

	r.gc.handleGameComplete("L1", MinigameResults{
		Rankings: []PlayerRanking{
			{UserID: "host", UserName: "host", Score: 30, Rank: 1},
			{UserID: "p2", UserName: "p2", Score: 10, Rank: 2},
		},
		Duration: 999,
	})

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		repo.mu.Lock()
		n := len(repo.matches)
		repo.mu.Unlock()
		if n == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if len(repo.matches) != 1 {
		t.Fatalf("want 1 persisted match, got %d", len(repo.matches))
	}
	rec := repo.matches[0]
	if rec.MinigameID != "rhyme-time" || rec.WinnerUserID != "host" || rec.PlayerCount != 2 {
		t.Fatalf("persisted record wrong: %+v", rec)
	}
}
