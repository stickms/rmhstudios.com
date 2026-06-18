package rmhbox

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// lifecycleState tracks per-lobby phase timers and preload readiness (the Node
// LifecycleState). phaseTimer is a generic cancel func for non-broadcast timers.
type lifecycleState struct {
	timerHandle  *TimerHandle
	readyPlayers map[string]bool
	phaseCancel  func() // optional preload/fallback timer cancel
}

// GameCoordinator drives the minigame lifecycle FSM, state-sync hooks, input
// routing, and game-complete persistence. Faithful port of game-coordinator.ts.
type GameCoordinator struct {
	lm     *LobbyManager
	sync   *StateSync
	repo   Repo
	logger *log.Logger

	mu               sync.Mutex
	lifecycles       map[string]*lifecycleState
	spectatorTargets map[string]map[string]string // lobbyId -> spectatorId -> targetPlayerId
}

// NewGameCoordinator constructs the coordinator and wires the mid-game spectator
// callback into the lobby manager.
func NewGameCoordinator(lm *LobbyManager, ss *StateSync, repo Repo, logger *log.Logger) *GameCoordinator {
	gc := &GameCoordinator{
		lm: lm, sync: ss, repo: repo, logger: logger,
		lifecycles:       map[string]*lifecycleState{},
		spectatorTargets: map[string]map[string]string{},
	}
	lm.onSpectatorJoinedMidGame = gc.handleSpectatorJoinedMidGame
	return gc
}

// ─── Host start game (§2.5) ──────────────────────────────────────────────────

// OnSelect handles the host's "Start Game" for the picked minigame.
func (gc *GameCoordinator) OnSelect(hostID, lobbyID, minigameID string) {
	l := gc.lm.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		gc.lm.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in this lobby.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		gc.lm.sendErrUser(hostID, "NOT_HOST", "Only the host can start the game.")
		return
	}
	if l.State != StateWaiting {
		l.mu.Unlock()
		gc.lm.sendErrUser(hostID, "INVALID_STATE", "Lobby must be in WAITING state.")
		return
	}
	def, ok := getMinigameDef(minigameID)
	if !ok {
		l.mu.Unlock()
		gc.lm.sendErrUser(hostID, "INVALID_GAME", "Unknown minigame.")
		return
	}
	pc := len(l.Players)
	l.mu.Unlock()
	if pc < def.MinPlayers || pc > def.MaxPlayers {
		gc.lm.sendErrUser(hostID, "INSUFFICIENT_PLAYERS", "This game requires the right player count.")
		return
	}
	gc.enterGameSettings(l, minigameID, "direct")
}

// enterGameSettings either skips straight to the game flow (direct mode) or opens
// the GAME_SETTINGS phase (post-vote). The Go minigames carry their own settings
// defaults, so resolvedGameSettings is just the host-edited overrides map.
func (gc *GameCoordinator) enterGameSettings(l *Lobby, minigameID, mode string) {
	l.mu.Lock()
	l.CurrentGame = &ActiveGame{MinigameID: minigameID, StartedAt: nowMS()}
	if mode == "direct" {
		if l.PendingGameSettings != nil {
			l.ResolvedGameSettings = l.PendingGameSettings
		} else {
			l.ResolvedGameSettings = map[string]any{}
		}
		l.PendingGameSettings = nil
		l.mu.Unlock()
		gc.startGameFlow(l.ID, minigameID)
		return
	}
	// post-vote: open settings phase
	l.PendingGameSettings = map[string]any{}
	l.State = StateGameSettings
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StateGameSettings})
	gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope("rmhbox:game:settings_opened", map[string]any{
		"minigameId": minigameID, "mode": mode, "currentValues": map[string]any{},
	}))
	gc.sync.broadcastFullSync(l.ID)

	th := gc.sync.startTimerBroadcast(l.ID, gameSettingsPostVoteTO, func() {
		cur := gc.lm.GetLobby(l.ID)
		if cur == nil {
			return
		}
		cur.mu.Lock()
		ok := cur.State == StateGameSettings
		cur.mu.Unlock()
		if ok {
			gc.resolveAndStartGame(cur, minigameID)
		}
	})
	gc.setLifecycleTimer(l.ID, th)
}

// ConfirmGameSettings resolves and starts the game (host only, GAME_SETTINGS).
func (gc *GameCoordinator) ConfirmGameSettings(hostID, lobbyID string) {
	l := gc.lm.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		gc.lm.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in this lobby.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID || l.State != StateGameSettings {
		mg := ""
		if l.CurrentGame != nil {
			mg = l.CurrentGame.MinigameID
		}
		l.mu.Unlock()
		if mg == "" {
			gc.lm.sendErrUser(hostID, "INVALID_PAYLOAD", "Not in GAME_SETTINGS state.")
			return
		}
		return
	}
	mg := l.CurrentGame.MinigameID
	l.mu.Unlock()
	gc.clearLifecycleTimers(lobbyID)
	gc.resolveAndStartGame(l, mg)
}

// UpdateGameSettings merges host setting edits (WAITING or GAME_SETTINGS).
func (gc *GameCoordinator) UpdateGameSettings(hostID, lobbyID string, settings map[string]any) {
	l := gc.lm.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		gc.lm.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in this lobby.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		gc.lm.sendErrUser(hostID, "NOT_HOST", "Only the host can update game settings.")
		return
	}
	if l.State != StateGameSettings && l.State != StateWaiting {
		l.mu.Unlock()
		gc.lm.sendErrUser(hostID, "INVALID_PAYLOAD", "Settings can only be changed in WAITING or GAME_SETTINGS.")
		return
	}
	if l.PendingGameSettings == nil {
		l.PendingGameSettings = map[string]any{}
	}
	for k, v := range settings {
		l.PendingGameSettings[k] = v
	}
	cur := l.PendingGameSettings
	l.mu.Unlock()
	gc.lm.broadcastRaw(hubRoom(lobbyID), realtime.MustEnvelope("rmhbox:game:settings_updated", map[string]any{"currentValues": cur}))
}

func (gc *GameCoordinator) resolveAndStartGame(l *Lobby, minigameID string) {
	l.mu.Lock()
	if l.PendingGameSettings != nil {
		l.ResolvedGameSettings = l.PendingGameSettings
	} else {
		l.ResolvedGameSettings = map[string]any{}
	}
	l.PendingGameSettings = nil
	l.mu.Unlock()
	gc.startGameFlow(l.ID, minigameID)
}

// ─── Game flow orchestration (§2.2) ──────────────────────────────────────────

func (gc *GameCoordinator) startGameFlow(lobbyID, minigameID string) {
	l := gc.lm.GetLobby(lobbyID)
	if l == nil {
		return
	}
	def, hasDef := getMinigameDef(minigameID)
	_, hasServer := serverRegistry[minigameID]
	if !hasDef && !hasServer {
		l.mu.Lock()
		l.State = StateWaiting
		l.mu.Unlock()
		gc.lm.broadcastAction(lobbyID, "STATE_CHANGED", map[string]any{"state": StateWaiting, "reason": "INVALID_GAME"})
		return
	}
	l.mu.Lock()
	if hasDef && (len(l.Players) < def.MinPlayers || len(l.Players) > def.MaxPlayers) {
		l.State = StateWaiting
		l.mu.Unlock()
		gc.lm.broadcastAction(lobbyID, "STATE_CHANGED", map[string]any{"state": StateWaiting, "reason": "INSUFFICIENT_PLAYERS"})
		return
	}
	l.CurrentGame = &ActiveGame{MinigameID: minigameID, StartedAt: nowMS()}
	l.RoundNumber = 0
	l.mu.Unlock()

	gc.lm.broadcastAction(lobbyID, "GAME_SELECTED", map[string]any{
		"game": map[string]any{"minigameId": minigameID, "phase": "instructions"},
	})
	gc.startInstructions(l, minigameID)
}

func (gc *GameCoordinator) startInstructions(l *Lobby, minigameID string) {
	dur := defaultInstructionSeconds
	if def, ok := getMinigameDef(minigameID); ok && def.InstructionSeconds > 0 {
		dur = def.InstructionSeconds
	}
	l.mu.Lock()
	l.State = StateInstructions
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StateInstructions})
	gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope("rmhbox:game:instructions", map[string]any{"minigameId": minigameID, "durationSeconds": dur}))
	gc.sync.broadcastFullSync(l.ID)

	th := gc.sync.startTimerBroadcast(l.ID, dur, func() { gc.startPreloading(l) })
	gc.replaceLifecycle(l.ID, &lifecycleState{timerHandle: th, readyPlayers: map[string]bool{}})
}

func (gc *GameCoordinator) startPreloading(l *Lobby) {
	l.mu.Lock()
	if l.CurrentGame == nil {
		l.mu.Unlock()
		return
	}
	l.State = StatePreloading
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StatePreloading})
	gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope("rmhbox:game:preload_start", map[string]any{"manifest": map[string]any{}}))
	gc.sync.broadcastFullSync(l.ID)

	gc.replaceLifecycle(l.ID, &lifecycleState{readyPlayers: map[string]bool{}})

	// preload timeout: force-proceed after 30s
	gc.sync.lm.graceTimers.Schedule("preload:"+l.ID, preloadTimeout, func() {
		// Re-resolve by id and bail if the lobby was disbanded/replaced — the
		// captured *Lobby may be stale by the time this fires.
		cur := gc.lm.GetLobby(l.ID)
		if cur == nil || cur != l {
			return
		}
		cur.mu.Lock()
		ok := cur.State == StatePreloading
		cur.mu.Unlock()
		if !ok {
			return
		}
		gc.lm.addSystemChat(l.ID, "Preloading timed out — starting game.")
		gc.startCountdown(cur)
	})
}

// OnReadyToRender records preload readiness; advances to countdown when all ready.
func (gc *GameCoordinator) OnReadyToRender(userID, lobbyID string) {
	l := gc.lm.GetLobbyByUserID(userID)
	if l == nil || l.ID != lobbyID {
		return
	}
	l.mu.Lock()
	if l.State != StatePreloading {
		l.mu.Unlock()
		return
	}
	playerIDs := keysPlayers(l.Players)
	l.mu.Unlock()

	gc.mu.Lock()
	lc := gc.lifecycles[lobbyID]
	if lc == nil {
		gc.mu.Unlock()
		return
	}
	lc.readyPlayers[userID] = true
	allReady := true
	progress := make([]map[string]any, 0, len(playerIDs))
	for _, id := range playerIDs {
		ready := lc.readyPlayers[id]
		if !ready {
			allReady = false
		}
		progress = append(progress, map[string]any{"userId": id, "ready": ready})
	}
	gc.mu.Unlock()

	gc.lm.broadcastRaw(hubRoom(lobbyID), realtime.MustEnvelope("rmhbox:game:preload_progress", map[string]any{"players": progress, "allReady": allReady}))
	if allReady {
		gc.lm.graceTimers.Cancel("preload:" + lobbyID)
		gc.startCountdown(l)
	}
}

func (gc *GameCoordinator) startCountdown(l *Lobby) {
	l.mu.Lock()
	l.State = StateCountdown
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StateCountdown})
	gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope("rmhbox:game:countdown", map[string]any{"seconds": countdownSeconds}))
	gc.sync.broadcastFullSync(l.ID)

	th := gc.sync.startTimerBroadcast(l.ID, countdownSeconds, func() {
		cur := gc.lm.GetLobby(l.ID)
		if cur == nil {
			return
		}
		cur.mu.Lock()
		ok := cur.State == StateCountdown
		cur.mu.Unlock()
		if ok {
			gc.startPlaying(cur)
		}
	})
	gc.replaceLifecycle(l.ID, &lifecycleState{timerHandle: th, readyPlayers: map[string]bool{}})
}

func (gc *GameCoordinator) startPlaying(l *Lobby) {
	l.mu.Lock()
	if l.CurrentGame == nil {
		l.mu.Unlock()
		return
	}
	minigameID := l.CurrentGame.MinigameID
	l.State = StatePlaying
	l.LastActiveAt = nowMS()
	l.RoundNumber++
	playersCopy := map[string]*Player{}
	for id, p := range l.Players {
		cp := *p
		playersCopy[id] = &cp
	}
	settings := l.Settings
	resolved := l.ResolvedGameSettings
	hostID := l.HostUserID
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StatePlaying})
	gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope("rmhbox:game:started", map[string]any{"minigameId": minigameID}))
	gc.sync.broadcastFullSync(l.ID)

	factory, ok := serverRegistry[minigameID]
	if !ok {
		gc.handleGameError(l.ID, errFromRecover("no server handler: "+minigameID))
		return
	}
	if resolved == nil {
		resolved = map[string]any{}
	}

	ctx := &MinigameContext{
		LobbyID: l.ID, Players: playersCopy, Settings: settings, GameSettings: resolved,
		GetHostID: func() string { return hostID },
		BroadcastToLobby: func(event string, data any) {
			gc.lm.broadcastRaw(hubRoom(l.ID), realtime.MustEnvelope(event, data))
		},
		BroadcastToPlayers: func(event string, data any) { gc.lm.broadcastToPlayers(l, event, data) },
		BroadcastAction:    func(t string, p any) { gc.lm.broadcastAction(l.ID, t, p) },
		SendToPlayer:       func(uid, event string, data any) { gc.lm.sendToPlayer(l.ID, uid, event, data) },
		SendToSpectators:   func(event string, data any) { gc.lm.broadcastToSpectators(l, event, data) },
		SendToSpectatorFollowers: func(target, event string, data any) {
			gc.mu.Lock()
			targets := gc.spectatorTargets[l.ID]
			var followers []string
			for sid, fid := range targets {
				if fid == target {
					followers = append(followers, sid)
				}
			}
			gc.mu.Unlock()
			for _, sid := range followers {
				gc.lm.sendToPlayer(l.ID, sid, event, data)
			}
		},
		OnComplete: func(r MinigameResults) { gc.handleGameComplete(l.ID, r) },
		OnError:    func(err error) { gc.handleGameError(l.ID, err) },
	}

	// Instantiate + start with fault isolation (ports the try/catch).
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				gc.handleGameError(l.ID, errFromRecover(rec))
			}
		}()
		handler := factory(ctx)
		l.mu.Lock()
		l.CurrentGame = &ActiveGame{MinigameID: minigameID, Handler: handler, StartedAt: nowMS()}
		l.mu.Unlock()
		handler.Start()
		// initial per-player snapshots
		for id := range playersCopy {
			snap := safeStateForPlayer(handler, id)
			gc.lm.sendToPlayer(l.ID, id, "rmhbox:game:state_snapshot", snap)
		}
	}()
}

// ─── Game complete (§2.3) — persistence is fire-and-forget ───────────────────

func (gc *GameCoordinator) handleGameComplete(lobbyID string, results MinigameResults) {
	l := gc.lm.GetLobby(lobbyID)
	if l == nil {
		return
	}
	l.mu.Lock()
	if l.CurrentGame != nil && l.CurrentGame.Handler != nil {
		safeCleanup(l.CurrentGame.Handler)
	}
	for _, r := range results.Rankings {
		if p, ok := l.Players[r.UserID]; ok {
			p.RoundScore = r.Score
			p.Score += r.Score
		}
	}
	l.State = StateRoundResults
	l.LastActiveAt = nowMS()
	mgID := ""
	startedAt := nowMS()
	if l.CurrentGame != nil {
		mgID = l.CurrentGame.MinigameID
		startedAt = l.CurrentGame.StartedAt
	}
	standings := make([]Standing, 0, len(results.Rankings))
	for _, r := range results.Rankings {
		standings = append(standings, Standing{UserID: r.UserID, UserName: r.UserName, Score: r.Score, Rank: r.Rank})
	}
	l.MatchHistory = append(l.MatchHistory, ServerMatchSummary{
		MinigameID: mgID, RoundNumber: l.RoundNumber, StartedAt: startedAt, EndedAt: nowMS(), Standings: standings,
	})
	roundNumber := l.RoundNumber
	// session standings
	type srow struct {
		uid, name   string
		total, wins int
	}
	rows := []srow{}
	for _, p := range l.Players {
		wins := 0
		for _, mh := range l.MatchHistory {
			if len(mh.Standings) > 0 && mh.Standings[0].UserID == p.UserID {
				wins++
			}
		}
		rows = append(rows, srow{p.UserID, p.UserName, p.Score, wins})
	}
	playersSnapshot := map[string]string{}
	for id, p := range l.Players {
		playersSnapshot[id] = p.UserName
	}
	l.mu.Unlock()

	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].total > rows[i].total {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	sessionStandings := make([]map[string]any, len(rows))
	for i, r := range rows {
		sessionStandings[i] = map[string]any{"userId": r.uid, "userName": r.name, "totalScore": r.total, "wins": r.wins, "rank": i + 1}
	}

	gc.lm.broadcastAction(lobbyID, "STATE_CHANGED", map[string]any{"state": StateRoundResults})
	gc.lm.broadcastRaw(hubRoom(lobbyID), realtime.MustEnvelope("rmhbox:game:round_results", map[string]any{
		"minigameId": mgID, "rankings": results.Rankings, "awards": results.Awards,
		"roundNumber": roundNumber, "sessionStandings": sessionStandings,
	}))

	// Fire-and-forget persistence — never blocks the game flow.
	gc.persistAsync(lobbyID, mgID, results, playersSnapshot)

	gc.sync.broadcastFullSync(lobbyID)
	th := gc.sync.broadcastInfiniteTimer(lobbyID)
	gc.replaceLifecycle(lobbyID, &lifecycleState{timerHandle: th, readyPlayers: map[string]bool{}})
}

func (gc *GameCoordinator) persistAsync(lobbyID, minigameID string, results MinigameResults, names map[string]string) {
	if gc.repo == nil {
		return
	}
	resultsJSON, _ := json.Marshal(results.Rankings)
	var gameLogJSON json.RawMessage
	if results.GameSpecificData != nil {
		if gl, ok := results.GameSpecificData["gameLog"]; ok {
			if b, err := json.Marshal(gl); err == nil {
				gameLogJSON = b
			}
		}
	}
	winner := ""
	for _, r := range results.Rankings {
		if r.Rank == 1 {
			winner = r.UserID
			break
		}
	}
	players := make([]MatchPlayerResult, 0, len(results.Rankings))
	for _, r := range results.Rankings {
		name := r.UserName
		if n, ok := names[r.UserID]; ok {
			name = n
		}
		players = append(players, MatchPlayerResult{UserID: r.UserID, UserName: name, Rank: r.Rank, Score: r.Score, Deltas: r.Deltas})
	}
	now := nowMSTime()
	rec := MatchRecord{
		MinigameID: minigameID, LobbyID: lobbyID, StartedAt: now, EndedAt: now,
		DurationMS: results.Duration, WinnerUserID: winner, PlayerCount: len(results.Rankings),
		GameLog: gameLogJSON, Results: resultsJSON, Players: players,
	}
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				gc.logger.Error("match_persist_panic", "lobbyId", lobbyID, "panic", rec)
			}
		}()
		if err := gc.repo.PersistMatch(context.Background(), rec); err != nil {
			gc.logger.Error("match_persist_error", "lobbyId", lobbyID, "error", err)
		}
	}()
}

// ─── Game error / return to waiting ──────────────────────────────────────────

func (gc *GameCoordinator) handleGameError(lobbyID string, err error) {
	l := gc.lm.GetLobby(lobbyID)
	if l == nil {
		return
	}
	gc.logger.Error("game_error", "lobbyId", lobbyID, "error", err)
	l.mu.Lock()
	if l.CurrentGame != nil && l.CurrentGame.Handler != nil {
		safeCleanup(l.CurrentGame.Handler)
	}
	l.CurrentGame = nil
	l.State = StateWaiting
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	gc.lm.broadcastAction(lobbyID, "STATE_CHANGED", map[string]any{"state": StateWaiting, "reason": "GAME_ERROR"})
	gc.lm.addSystemChat(lobbyID, "The game encountered an error and was ended.")
	gc.sync.broadcastFullSync(lobbyID)
	gc.clearLifecycleTimers(lobbyID)
	gc.mu.Lock()
	delete(gc.lifecycles, lobbyID)
	delete(gc.spectatorTargets, lobbyID)
	gc.mu.Unlock()
}

func (gc *GameCoordinator) returnToWaiting(l *Lobby) {
	l.mu.Lock()
	lastGameID := ""
	if l.CurrentGame != nil {
		lastGameID = l.CurrentGame.MinigameID
	}
	l.CurrentGame = nil
	if lastGameID != "" {
		if def, ok := getMinigameDef(lastGameID); ok {
			l.SelectedGame = &SelectedGame{MinigameID: lastGameID, DisplayName: def.DisplayName}
		}
	} else {
		l.SelectedGame = nil
	}
	l.State = StateWaiting
	l.LastActiveAt = nowMS()
	for _, p := range l.Players {
		p.IsReady = p.UserID == l.HostUserID
		p.RoundScore = 0
	}
	l.mu.Unlock()

	gc.lm.broadcastAction(l.ID, "STATE_CHANGED", map[string]any{"state": StateWaiting})
	gc.sync.broadcastFullSync(l.ID)
	gc.clearLifecycleTimers(l.ID)
	gc.mu.Lock()
	delete(gc.lifecycles, l.ID)
	delete(gc.spectatorTargets, l.ID)
	gc.mu.Unlock()
}

// ─── Host force-skip / force-end / pause ─────────────────────────────────────

// OnForceSkip advances the current non-playing phase (host only).
func (gc *GameCoordinator) OnForceSkip(hostID, lobbyID string) {
	l := gc.requireHost(hostID, lobbyID, "force-skip")
	if l == nil {
		return
	}
	l.mu.Lock()
	state := l.State
	mg := ""
	if l.CurrentGame != nil {
		mg = l.CurrentGame.MinigameID
	}
	l.mu.Unlock()
	switch state {
	case StateGameSettings:
		gc.clearLifecycleTimers(lobbyID)
		gc.startGameFlow(lobbyID, mg)
	case StateInstructions:
		gc.clearLifecycleTimers(lobbyID)
		gc.startPreloading(l)
	case StatePreloading:
		gc.lm.graceTimers.Cancel("preload:" + lobbyID)
		gc.clearLifecycleTimers(lobbyID)
		gc.startCountdown(l)
	case StateCountdown:
		gc.clearLifecycleTimers(lobbyID)
		gc.startPlaying(l)
	case StateRoundResults:
		gc.clearLifecycleTimers(lobbyID)
		gc.returnToWaiting(l)
	}
}

// OnForceEnd cancels/ends the game entirely (host only).
func (gc *GameCoordinator) OnForceEnd(hostID, lobbyID string) {
	l := gc.requireHost(hostID, lobbyID, "force-end")
	if l == nil {
		return
	}
	l.mu.Lock()
	state := l.State
	var handler Minigame
	if l.CurrentGame != nil {
		handler = l.CurrentGame.Handler
	}
	l.mu.Unlock()
	switch state {
	case StateGameSettings, StateInstructions, StatePreloading, StateCountdown:
		gc.clearLifecycleTimers(lobbyID)
		gc.lm.addSystemChat(lobbyID, "Host cancelled the game.")
		gc.returnToWaiting(l)
	case StatePlaying:
		gc.clearLifecycleTimers(lobbyID)
		if handler != nil {
			safeCleanup(handler)
		}
		gc.lm.addSystemChat(lobbyID, "Host force-ended the game.")
		gc.returnToWaiting(l)
	case StateRoundResults:
		gc.clearLifecycleTimers(lobbyID)
		gc.returnToWaiting(l)
	}
}

// OnPauseTimer toggles pause/resume of the active timer (host only).
func (gc *GameCoordinator) OnPauseTimer(hostID, lobbyID string) {
	l := gc.requireHost(hostID, lobbyID, "pause/resume")
	if l == nil {
		return
	}
	l.mu.Lock()
	state := l.State
	var handler Minigame
	if l.CurrentGame != nil {
		handler = l.CurrentGame.Handler
	}
	l.mu.Unlock()
	gc.mu.Lock()
	lc := gc.lifecycles[lobbyID]
	gc.mu.Unlock()

	switch state {
	case StateInstructions, StateCountdown, StateRoundResults:
		if lc == nil || lc.timerHandle == nil {
			return
		}
		if lc.timerHandle.IsPaused() {
			lc.timerHandle.Resume()
		} else {
			lc.timerHandle.Pause()
		}
	case StatePlaying:
		bg := asBaseGame(handler)
		if bg == nil {
			return
		}
		if bg.isPhaseTimerPaused() {
			bg.resumePhaseTimer()
		} else {
			bg.pausePhaseTimer()
		}
	}
}

// ─── Input routing (§2.2 step 4) ─────────────────────────────────────────────

// OnInput routes a player input into the active minigame handler (recover-wrapped).
func (gc *GameCoordinator) OnInput(userID, lobbyID, action string, data map[string]any) {
	l := gc.lm.GetLobbyByUserID(userID)
	if l == nil || l.ID != lobbyID {
		return
	}
	l.mu.Lock()
	if l.State != StatePlaying || l.CurrentGame == nil || l.CurrentGame.Handler == nil {
		l.mu.Unlock()
		return
	}
	_, isPlayer := l.Players[userID]
	handler := l.CurrentGame.Handler
	l.mu.Unlock()
	if !isPlayer {
		return // spectator input is silently dropped (§5.2)
	}
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				gc.logger.Error("game_input_error", "lobbyId", lobbyID, "userId", userID, "panic", rec)
			}
		}()
		handler.HandleInput(userID, action, data)
	}()
}

// ─── Disconnect / reconnect during play ──────────────────────────────────────

func (gc *GameCoordinator) handleGameDisconnect(userID string) {
	l := gc.lm.GetLobbyByUserID(userID)
	if l == nil {
		return
	}
	l.mu.Lock()
	if l.State != StatePlaying || l.CurrentGame == nil || l.CurrentGame.Handler == nil {
		l.mu.Unlock()
		return
	}
	handler := l.CurrentGame.Handler
	mgID := l.CurrentGame.MinigameID
	connected := 0
	for _, p := range l.Players {
		if p.IsConnected {
			connected++
		}
	}
	l.mu.Unlock()

	func() {
		defer func() { _ = recover() }()
		handler.HandlePlayerDisconnect(userID)
	}()

	if def, ok := getMinigameDef(mgID); ok && connected < def.MinPlayers {
		gc.lm.graceTimers.Schedule("ingame:"+l.ID, gameDisconnectGrace, func() {
			// Re-resolve by id and bail if the lobby was disbanded/replaced — the
			// captured *Lobby may be stale by the time this fires.
			cur := gc.lm.GetLobby(l.ID)
			if cur == nil || cur != l {
				return
			}
			cur.mu.Lock()
			ok := cur.State == StatePlaying && cur.CurrentGame != nil && cur.CurrentGame.Handler != nil
			cnt := 0
			for _, p := range cur.Players {
				if p.IsConnected {
					cnt++
				}
			}
			h := (Minigame)(nil)
			if ok {
				h = cur.CurrentGame.Handler
			}
			cur.mu.Unlock()
			if ok && cnt < def.MinPlayers && h != nil {
				func() {
					defer func() {
						if rec := recover(); rec != nil {
							gc.handleGameError(l.ID, errFromRecover(rec))
						}
					}()
					h.ForceEnd("insufficient_players")
				}()
			}
		})
	}
}

func (gc *GameCoordinator) handleReconnect(userID string) {
	l := gc.lm.GetLobbyByUserID(userID)
	if l == nil {
		return
	}
	l.mu.Lock()
	if l.State != StatePlaying || l.CurrentGame == nil {
		l.mu.Unlock()
		return
	}
	mgID := l.CurrentGame.MinigameID
	connected := 0
	for _, p := range l.Players {
		if p.IsConnected {
			connected++
		}
	}
	l.mu.Unlock()
	if def, ok := getMinigameDef(mgID); ok && connected >= def.MinPlayers {
		gc.lm.graceTimers.Cancel("ingame:" + l.ID)
	}
}

// ─── Spectator targeting ─────────────────────────────────────────────────────

func (gc *GameCoordinator) handleSpectatorJoinedMidGame(lobbyID, spectatorID string, c *realtime.Conn) {
	l := gc.lm.GetLobby(lobbyID)
	if l == nil {
		return
	}
	l.mu.Lock()
	if l.State != StatePlaying || l.CurrentGame == nil || l.CurrentGame.Handler == nil {
		l.mu.Unlock()
		return
	}
	handler := l.CurrentGame.Handler
	hostID := l.HostUserID
	var firstPlayer string
	for id := range l.Players {
		firstPlayer = id
		break
	}
	_, hostIsPlayer := l.Players[hostID]
	l.mu.Unlock()

	target := ""
	if handler.SpectatorMode() == SpectatorCompetitive {
		if hostIsPlayer {
			target = hostID
		} else {
			target = firstPlayer
		}
		if target != "" {
			gc.setSpectatorTarget(lobbyID, spectatorID, target)
		}
	}
	snap := func() any {
		defer func() { _ = recover() }()
		return handler.GetSpectatorSnapshot(target)
	}()
	gc.lm.sendToPlayer(lobbyID, spectatorID, "rmhbox:game:state_snapshot", snap)
}

// OnSpectatorSelectPlayer records the followed player and pushes their state.
func (gc *GameCoordinator) OnSpectatorSelectPlayer(userID, lobbyID, targetID string) {
	l := gc.lm.GetLobbyByUserID(userID)
	if l == nil || l.ID != lobbyID {
		return
	}
	l.mu.Lock()
	_, isSpec := l.Spectators[userID]
	_, isTargetPlayer := l.Players[targetID]
	var handler Minigame
	playing := l.State == StatePlaying
	if l.CurrentGame != nil {
		handler = l.CurrentGame.Handler
	}
	l.mu.Unlock()
	if !isSpec {
		gc.lm.sendErrUser(userID, "NOT_SPECTATOR", "Only spectators can select a player to follow.")
		return
	}
	if !isTargetPlayer {
		gc.lm.sendErrUser(userID, "INVALID_TARGET", "Target player not found.")
		return
	}
	gc.setSpectatorTarget(lobbyID, userID, targetID)
	if playing && handler != nil && handler.SpectatorMode() == SpectatorCompetitive {
		snap := func() any {
			defer func() { _ = recover() }()
			return handler.GetSpectatorSnapshot(targetID)
		}()
		gc.lm.sendToPlayer(lobbyID, userID, "rmhbox:game:state_snapshot", snap)
	}
}

func (gc *GameCoordinator) setSpectatorTarget(lobbyID, specID, targetID string) {
	gc.mu.Lock()
	if gc.spectatorTargets[lobbyID] == nil {
		gc.spectatorTargets[lobbyID] = map[string]string{}
	}
	gc.spectatorTargets[lobbyID][specID] = targetID
	gc.mu.Unlock()
}

// ─── lifecycle bookkeeping ───────────────────────────────────────────────────

func (gc *GameCoordinator) replaceLifecycle(lobbyID string, lc *lifecycleState) {
	gc.mu.Lock()
	if old := gc.lifecycles[lobbyID]; old != nil && old.timerHandle != nil {
		old.timerHandle.Cancel()
	}
	gc.lifecycles[lobbyID] = lc
	gc.mu.Unlock()
}

func (gc *GameCoordinator) setLifecycleTimer(lobbyID string, th *TimerHandle) {
	gc.mu.Lock()
	lc := gc.lifecycles[lobbyID]
	if lc == nil {
		lc = &lifecycleState{readyPlayers: map[string]bool{}}
		gc.lifecycles[lobbyID] = lc
	}
	lc.timerHandle = th
	gc.mu.Unlock()
}

func (gc *GameCoordinator) clearLifecycleTimers(lobbyID string) {
	gc.mu.Lock()
	lc := gc.lifecycles[lobbyID]
	if lc != nil {
		if lc.timerHandle != nil {
			lc.timerHandle.Cancel()
			lc.timerHandle = nil
		}
		if lc.phaseCancel != nil {
			lc.phaseCancel()
			lc.phaseCancel = nil
		}
	}
	gc.mu.Unlock()
	// Also cancel the grace-keyed preload/ingame timers (not tracked in lc) so a
	// stale preload/ingame grace closure can't fire after force-end/disband.
	gc.lm.graceTimers.Cancel("preload:" + lobbyID)
	gc.lm.graceTimers.Cancel("ingame:" + lobbyID)
}

func (gc *GameCoordinator) requireHost(hostID, lobbyID, _action string) *Lobby {
	l := gc.lm.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		gc.lm.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in this lobby.")
		return nil
	}
	l.mu.Lock()
	isHost := l.HostUserID == hostID
	l.mu.Unlock()
	if !isHost {
		gc.lm.sendErrUser(hostID, "NOT_HOST", "Only the host can do that.")
		return nil
	}
	return l
}

func safeCleanup(h Minigame) {
	defer func() { _ = recover() }()
	h.Cleanup()
}

// asBaseGame extracts the embedded *BaseGame from a handler for phase-timer
// pause/resume. Every Minigame embeds BaseGame and satisfies baseGame(), so the
// compiler guarantees this works for all games (no concrete type-switch to keep
// in sync). Returns nil only when the handler itself is nil.
func asBaseGame(h Minigame) *BaseGame {
	if h == nil {
		return nil
	}
	return h.baseGame()
}
