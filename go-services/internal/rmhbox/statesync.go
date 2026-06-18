package rmhbox

import (
	"sync"
	"time"
)

// ─── State synchronization (state-sync.ts) ───────────────────────────────────
//
// Two responsibilities, faithfully ported:
//   - a 10s heartbeat that pushes per-player scoped full snapshots to all
//     members of every PLAYING lobby;
//   - per-lobby, pausable 1s TIMER_TICK broadcasts driving the phase rings.

// TimerHandle controls a running lifecycle timer broadcast.
type TimerHandle struct {
	mu        sync.Mutex
	cancelled bool
	paused    bool
	remaining int
	stop      chan struct{}
	lm        *LobbyManager
	lobbyID   string
	infinite  bool
}

// IsPaused reports the paused state.
func (t *TimerHandle) IsPaused() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.paused
}

// Cancel stops the timer broadcast.
func (t *TimerHandle) Cancel() {
	t.mu.Lock()
	if t.cancelled {
		t.mu.Unlock()
		return
	}
	t.cancelled = true
	// Closing the channel is the signal; the `cancelled` guard above makes this
	// close-once. We deliberately do NOT nil t.stop — the broadcast goroutine
	// reads it without the lock, so mutating it here would be a data race.
	if t.stop != nil {
		close(t.stop)
	}
	t.mu.Unlock()
}

// Pause suspends ticking and emits TIMER_PAUSED.
func (t *TimerHandle) Pause() {
	t.mu.Lock()
	if t.paused || t.cancelled {
		t.mu.Unlock()
		return
	}
	t.paused = true
	rem := t.remaining
	t.mu.Unlock()
	if t.infinite {
		rem = -1
	} else if rem < 0 {
		rem = 0
	}
	t.lm.broadcastAction(t.lobbyID, "TIMER_PAUSED", map[string]any{"timeRemaining": rem})
}

// Resume restarts ticking and emits TIMER_RESUMED.
func (t *TimerHandle) Resume() {
	t.mu.Lock()
	if !t.paused || t.cancelled {
		t.mu.Unlock()
		return
	}
	t.paused = false
	rem := t.remaining
	t.mu.Unlock()
	if t.infinite {
		rem = -1
	} else if rem < 0 {
		rem = 0
	}
	t.lm.broadcastAction(t.lobbyID, "TIMER_RESUMED", map[string]any{"timeRemaining": rem})
}

// StateSync drives heartbeats and lifecycle timer broadcasts.
type StateSync struct {
	lm     *LobbyManager
	hbStop chan struct{}
}

// NewStateSync constructs the state-sync service.
func NewStateSync(lm *LobbyManager) *StateSync { return &StateSync{lm: lm} }

func (s *StateSync) startHeartbeat() {
	s.hbStop = make(chan struct{})
	go func() {
		t := time.NewTicker(heartbeatInterval)
		defer t.Stop()
		for {
			select {
			case <-s.hbStop:
				return
			case <-t.C:
				s.tick()
			}
		}
	}()
}

func (s *StateSync) stopHeartbeat() {
	if s.hbStop != nil {
		close(s.hbStop)
	}
}

func (s *StateSync) tick() {
	for _, l := range s.lm.Lobbies() {
		l.mu.Lock()
		playing := l.State == StatePlaying
		l.mu.Unlock()
		if playing {
			s.sendFullSyncToAll(l)
		}
	}
}

// broadcastFullSync pushes per-recipient snapshots on phase boundaries.
func (s *StateSync) broadcastFullSync(lobbyID string) {
	l := s.lm.GetLobby(lobbyID)
	if l == nil {
		return
	}
	s.sendFullSyncToAll(l)
}

func (s *StateSync) sendFullSyncToAll(l *Lobby) {
	l.mu.Lock()
	playerIDs := make([]string, 0, len(l.Players))
	for id, p := range l.Players {
		if p.IsConnected && p.ConnID != "" {
			playerIDs = append(playerIDs, id)
		}
	}
	specIDs := make([]string, 0, len(l.Spectators))
	for id, sp := range l.Spectators {
		if sp.IsConnected && sp.ConnID != "" {
			specIDs = append(specIDs, id)
		}
	}
	l.mu.Unlock()

	for _, id := range playerIDs {
		s.lm.sendToUser(id, "rmhbox:lobby:state_snapshot", s.lm.buildClientState(l, id))
	}
	for _, id := range specIDs {
		s.lm.sendToUser(id, "rmhbox:lobby:state_snapshot", s.lm.buildClientState(l, id))
	}
}

// startTimerBroadcast emits TIMER_START then a TIMER_TICK every second; onComplete
// fires when the countdown crosses below zero. Pausable.
func (s *StateSync) startTimerBroadcast(lobbyID string, durationSeconds int, onComplete func()) *TimerHandle {
	h := &TimerHandle{remaining: durationSeconds, stop: make(chan struct{}), lm: s.lm, lobbyID: lobbyID}
	s.lm.broadcastAction(lobbyID, "TIMER_START", map[string]any{"totalDuration": durationSeconds, "timeRemaining": durationSeconds})

	// Capture the stop channel once: it is set above before this goroutine
	// starts (happens-before via goroutine creation) and never reassigned, so
	// reading it here needs no lock.
	stop := h.stop
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				h.mu.Lock()
				if h.cancelled || h.paused {
					h.mu.Unlock()
					continue
				}
				h.remaining--
				rem := h.remaining
				cancelled := h.cancelled
				h.mu.Unlock()
				if rem < 0 {
					if !cancelled && onComplete != nil {
						onComplete()
					}
					return
				}
				s.lm.broadcastAction(lobbyID, "TIMER_TICK", map[string]any{"timeRemaining": rem})
			}
		}
	}()
	return h
}

// broadcastInfiniteTimer shows a full ring with no ticking (host advances).
func (s *StateSync) broadcastInfiniteTimer(lobbyID string) *TimerHandle {
	h := &TimerHandle{remaining: -1, stop: make(chan struct{}), lm: s.lm, lobbyID: lobbyID, infinite: true}
	s.lm.broadcastAction(lobbyID, "TIMER_START", map[string]any{"totalDuration": -1, "timeRemaining": -1, "showSkip": true})
	return h
}
