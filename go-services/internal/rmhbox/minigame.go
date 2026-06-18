package rmhbox

import (
	"sync"
	"time"
)

// ─── Minigame framework ──────────────────────────────────────────────────────
//
// Faithful port of server/rmhbox/minigames/base-minigame.ts. The Node abstract
// class becomes a Go interface (Minigame) plus an embeddable helper (BaseGame)
// that supplies the shared lifecycle plumbing: tracked/pausable timers, the
// pausable phase-timer broadcast, and error isolation.

// PlayerRanking is one entry in a minigame's final results.
type PlayerRanking struct {
	UserID   string         `json:"userId"`
	UserName string         `json:"userName"`
	Score    int            `json:"score"`
	Rank     int            `json:"rank"`
	Deltas   map[string]int `json:"deltas,omitempty"`
}

// Award is a fun end-of-game superlative.
type Award struct {
	UserID      string `json:"userId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

// MinigameResults is what computeResults() returns when a game ends.
type MinigameResults struct {
	Rankings         []PlayerRanking
	Awards           []Award
	GameSpecificData map[string]any
	Duration         int64 // ms
}

// SpectatorMode declares how spectators view a game.
type SpectatorMode string

const (
	// SpectatorShared: omniscient privileged view (e.g. spymaster grid).
	SpectatorShared SpectatorMode = "shared-privileged"
	// SpectatorCompetitive: spectators pick a player to follow.
	SpectatorCompetitive SpectatorMode = "competitive-individual"
)

// MinigameContext is the communication surface handed to every game instance by
// the GameCoordinator (mirrors MinigameContext in base-minigame.ts).
type MinigameContext struct {
	LobbyID      string
	Players      map[string]*Player // snapshot taken at PLAYING start
	Settings     LobbySettings
	GameSettings map[string]any

	GetHostID func() string

	BroadcastToLobby   func(event string, data any)
	BroadcastToPlayers func(event string, data any)
	// BroadcastAction emits a sequenced GAME_ACTION (seq+timestamp stamped).
	BroadcastAction          func(actionType string, payload any)
	SendToPlayer             func(userID, event string, data any)
	SendToSpectators         func(event string, data any)
	SendToSpectatorFollowers func(targetPlayerID, event string, data any)

	OnComplete func(results MinigameResults)
	OnError    func(err error)
}

// GetSetting reads a host-configured game setting, falling back to def.
func (c *MinigameContext) GetSettingInt(key string, def int) int {
	if v, ok := c.GameSettings[key]; ok {
		switch n := v.(type) {
		case int:
			return n
		case int64:
			return int(n)
		case float64:
			return int(n)
		}
	}
	return def
}

// GetSettingBool reads a host-configured boolean game setting.
func (c *MinigameContext) GetSettingBool(key string, def bool) bool {
	if v, ok := c.GameSettings[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return def
}

// Minigame is the lifecycle contract every game handler implements. It is the
// Go analog of the abstract BaseMinigame class. All methods are invoked by the
// coordinator under recover() for fault isolation.
type Minigame interface {
	// Start begins game logic (PLAYING phase entered).
	Start()
	// HandleInput routes a player action into the game.
	HandleInput(userID, action string, data map[string]any)
	// Tick is an optional per-second hook (most games drive themselves with
	// their own timers; provided for parity with the base Tick lifecycle hook).
	Tick()
	// GetStateForPlayer returns the per-player scoped state (reconnect/heartbeat).
	GetStateForPlayer(userID string) any
	// GetStateForSpectator returns the spectator-visible state.
	GetStateForSpectator() any
	// SpectatorMode declares how spectators view this game.
	SpectatorMode() SpectatorMode
	// ComputeResults produces final rankings/awards.
	ComputeResults() MinigameResults
	// Lifecycle side-effect hooks (default no-ops via BaseGame).
	HandlePlayerJoin(userID string)
	HandlePlayerDisconnect(userID string)
	HandlePlayerReconnect(userID string)
	// ForceEnd ends the game early and delivers partial results.
	ForceEnd(reason string)
	// Cleanup releases all timers/intervals.
	Cleanup()
	// ViewablePlayers lists players a spectator may follow.
	ViewablePlayers() []map[string]string
	// GetSpectatorSnapshot dispatches on spectator mode.
	GetSpectatorSnapshot(targetPlayerID string) any
	// baseGame exposes the embedded *BaseGame so the coordinator can drive the
	// pausable phase timer generically. Every handler embeds BaseGame, which
	// implements this; the compiler therefore enforces phase pause/resume works
	// for every game (no concrete type-switch to keep in sync).
	baseGame() *BaseGame
}

// pausableTimer mirrors the Node PausableTimer: a one-shot timer that snapshots
// its remaining delay when the phase is paused and re-arms on resume.
type pausableTimer struct {
	timer       *time.Timer
	callback    func()
	scheduledAt int64
	delayMS     int64
	fired       bool
}

// BaseGame supplies shared minigame plumbing. Concrete games embed it and call
// its helpers. It is concurrency-safe: the coordinator may pause/resume from a
// host action goroutine while game timers fire on their own goroutines.
type BaseGame struct {
	ctx       *MinigameContext
	isRunning bool

	mu             sync.Mutex
	pausable       []*pausableTimer
	phaseTicker    *time.Ticker
	phaseStop      chan struct{}
	phasePaused    bool
	phaseRemaining int
}

func (b *BaseGame) init(ctx *MinigameContext) { b.ctx = ctx }

// baseGame returns the embedded BaseGame, satisfying the Minigame interface for
// every game that embeds it (used by the coordinator's pause/resume path).
func (b *BaseGame) baseGame() *BaseGame { return b }

// Default lifecycle hooks (subclasses override as needed).
func (b *BaseGame) HandlePlayerJoin(string)       {}
func (b *BaseGame) HandlePlayerDisconnect(string) {}
func (b *BaseGame) HandlePlayerReconnect(string)  {}
func (b *BaseGame) Tick()                         {}

// ViewablePlayers lists every current player as {userId,userName}.
func (b *BaseGame) ViewablePlayers() []map[string]string {
	out := make([]map[string]string, 0, len(b.ctx.Players))
	for _, p := range b.ctx.Players {
		out = append(out, map[string]string{"userId": p.UserID, "userName": p.UserName})
	}
	return out
}

// startPhaseTimer emits TIMER_START then a TIMER_TICK every second. Any previous
// phase timer is cancelled first. Faithful port of startPhaseTimer().
func (b *BaseGame) startPhaseTimer(durationSeconds int) {
	b.clearPhaseTimer()
	b.mu.Lock()
	b.phasePaused = false
	b.phaseRemaining = durationSeconds
	stop := make(chan struct{})
	ticker := time.NewTicker(time.Second)
	b.phaseTicker = ticker
	b.phaseStop = stop
	b.mu.Unlock()

	b.ctx.BroadcastAction("TIMER_START", map[string]any{
		"totalDuration": durationSeconds, "timeRemaining": durationSeconds,
	})

	go func() {
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				b.mu.Lock()
				if b.phasePaused {
					b.mu.Unlock()
					continue
				}
				b.phaseRemaining--
				rem := b.phaseRemaining
				b.mu.Unlock()
				if rem >= 0 {
					b.ctx.BroadcastAction("TIMER_TICK", map[string]any{"timeRemaining": rem})
				}
			}
		}
	}()
}

func (b *BaseGame) clearPhaseTimer() {
	b.mu.Lock()
	if b.phaseTicker != nil {
		b.phaseTicker.Stop()
		close(b.phaseStop)
		b.phaseTicker = nil
		b.phaseStop = nil
	}
	b.phasePaused = false
	b.mu.Unlock()
}

// isPhaseTimerPaused reports whether the phase timer is paused.
func (b *BaseGame) isPhaseTimerPaused() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.phasePaused
}

// pausePhaseTimer suspends the phase timer and all tracked one-shot timers,
// snapshotting their remaining delay (faithful port of pausePhaseTimer()).
func (b *BaseGame) pausePhaseTimer() {
	b.mu.Lock()
	if b.phaseTicker == nil || b.phasePaused {
		b.mu.Unlock()
		return
	}
	b.phasePaused = true
	now := nowMS()
	for _, pt := range b.pausable {
		if pt.timer == nil || pt.fired {
			continue
		}
		elapsed := now - pt.scheduledAt
		remaining := pt.delayMS - elapsed
		if remaining < 0 {
			remaining = 0
		}
		pt.delayMS = remaining
		pt.timer.Stop()
		pt.timer = nil
	}
	rem := b.phaseRemaining
	b.mu.Unlock()
	if rem < 0 {
		rem = 0
	}
	b.ctx.BroadcastAction("TIMER_PAUSED", map[string]any{"timeRemaining": rem})
}

// resumePhaseTimer re-arms suspended one-shot timers (port of resumePhaseTimer()).
func (b *BaseGame) resumePhaseTimer() {
	b.mu.Lock()
	if b.phaseTicker == nil || !b.phasePaused {
		b.mu.Unlock()
		return
	}
	b.phasePaused = false
	now := nowMS()
	for _, pt := range b.pausable {
		if pt.timer != nil || pt.fired {
			continue
		}
		pt.scheduledAt = now
		ptCopy := pt
		pt.timer = time.AfterFunc(time.Duration(pt.delayMS)*time.Millisecond, func() {
			b.fire(ptCopy)
		})
	}
	rem := b.phaseRemaining
	b.mu.Unlock()
	if rem < 0 {
		rem = 0
	}
	b.ctx.BroadcastAction("TIMER_RESUMED", map[string]any{"timeRemaining": rem})
}

// setTimeout creates a tracked, pausable one-shot timer whose callback is
// wrapped so a panic surfaces via ctx.OnError (ports the try/catch wrap).
func (b *BaseGame) setTimeout(fn func(), ms int64) {
	pt := &pausableTimer{callback: fn, scheduledAt: nowMS(), delayMS: ms}
	b.mu.Lock()
	b.pausable = append(b.pausable, pt)
	b.mu.Unlock()
	pt.timer = time.AfterFunc(time.Duration(ms)*time.Millisecond, func() { b.fire(pt) })
}

func (b *BaseGame) fire(pt *pausableTimer) {
	b.mu.Lock()
	if pt.fired {
		b.mu.Unlock()
		return
	}
	pt.fired = true
	b.mu.Unlock()
	defer func() {
		if r := recover(); r != nil && b.ctx.OnError != nil {
			b.ctx.OnError(errFromRecover(r))
		}
	}()
	fn := pt.callback
	if fn != nil {
		fn()
	}
}

// broadcastRound updates the footer "Round X/Y" counter.
func (b *BaseGame) broadcastRound(current, total int) {
	b.ctx.BroadcastAction("MINIGAME_ROUND", map[string]any{"current": current, "total": total})
}

// broadcastGameAction is a convenience wrapper for the legacy game-action event.
func (b *BaseGame) broadcastGameAction(data map[string]any) {
	b.ctx.BroadcastToLobby("rmhbox:game:action", data)
}

// Cleanup stops every tracked timer and interval.
func (b *BaseGame) Cleanup() {
	b.clearPhaseTimer()
	b.mu.Lock()
	b.isRunning = false
	for _, pt := range b.pausable {
		if pt.timer != nil {
			pt.timer.Stop()
		}
	}
	b.pausable = nil
	b.mu.Unlock()
}
