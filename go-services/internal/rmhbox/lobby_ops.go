package rmhbox

import (
	"math/rand"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// randIntn returns a uniformly random int in [0,n). rand.Intn is unbiased (it
// uses rejection sampling internally), so callers like generateRoomCode get an
// even distribution over the alphabet — no modulo bias.
func randIntn(n int) int { return rand.Intn(n) }

// ─── Host controls (lobby-manager.ts §5) ─────────────────────────────────────

// KickPlayer removes a target player/spectator (host only).
func (m *LobbyManager) KickPlayer(hostID, lobbyID, targetID string) {
	l := m.GetLobby(lobbyID)
	if l == nil {
		m.sendErrUser(hostID, "LOBBY_NOT_FOUND", "Lobby not found.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_HOST", "Only the host can kick players.")
		return
	}
	if targetID == hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "INVALID_PAYLOAD", "You cannot kick yourself.")
		return
	}
	p, isP := l.Players[targetID]
	s, isS := l.Spectators[targetID]
	if !isP && !isS {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_IN_LOBBY", "Target user is not in this lobby.")
		return
	}
	name := ""
	if isP {
		name = p.UserName
		delete(l.Players, targetID)
	} else {
		name = s.UserName
		delete(l.Spectators, targetID)
	}
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	if c := m.connFor(targetID); c != nil {
		c.Send(realtime.MustEnvelope("rmhbox:lobby:kicked", map[string]any{"reason": "Kicked by host"}))
		m.hub.Leave(c, hubRoom(lobbyID))
	}
	m.mu.Lock()
	delete(m.userToLobby, targetID)
	m.mu.Unlock()
	m.graceTimers.Cancel(targetID)

	m.broadcastAction(lobbyID, "PLAYER_KICKED", map[string]any{"userId": targetID, "userName": name})
	m.addSystemChat(lobbyID, name+" was kicked by the host")
}

// TransferHost reassigns host to a target player (host only).
func (m *LobbyManager) TransferHost(hostID, lobbyID, targetID string) {
	l := m.GetLobby(lobbyID)
	if l == nil {
		m.sendErrUser(hostID, "LOBBY_NOT_FOUND", "Lobby not found.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_HOST", "Only the host can transfer host.")
		return
	}
	tp, ok := l.Players[targetID]
	if !ok {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_IN_LOBBY", "Target user is not a player in this lobby.")
		return
	}
	l.HostUserID = targetID
	l.LastActiveAt = nowMS()
	readyChanged := false
	if !tp.IsReady {
		tp.IsReady = true
		readyChanged = true
	}
	name := tp.UserName
	l.mu.Unlock()

	if readyChanged {
		m.broadcastAction(lobbyID, "PLAYER_READY_CHANGED", map[string]any{"userId": targetID, "isReady": true})
	}
	m.broadcastAction(lobbyID, "HOST_TRANSFERRED", map[string]any{"newHostUserId": targetID, "newHostUserName": name})
	m.addSystemChat(lobbyID, "Host transferred to "+name)
}

// UpdateSettings merges new settings (host only, WAITING only).
func (m *LobbyManager) UpdateSettings(hostID, lobbyID string, in *LobbySettings) {
	l := m.GetLobby(lobbyID)
	if l == nil {
		m.sendErrUser(hostID, "LOBBY_NOT_FOUND", "Lobby not found.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_HOST", "Only the host can update settings.")
		return
	}
	if l.State != StateWaiting {
		l.mu.Unlock()
		m.sendErrUser(hostID, "LOBBY_IN_GAME", "Settings can only be changed in the waiting state.")
		return
	}
	ns := l.Settings
	mergeSettings(&ns, in)
	ns.MaxPlayers = clampInt(ns.MaxPlayers, 2, absoluteMaxPlayers)
	ns.MaxSpectators = clampInt(ns.MaxSpectators, 0, maxSpectators)
	l.Settings = ns
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	m.broadcastAction(lobbyID, "SETTINGS_UPDATED", ns)
}

// EndSession transitions to SESSION_RESULTS and schedules disband (host only).
func (m *LobbyManager) EndSession(hostID, lobbyID string) {
	l := m.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		m.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in a lobby.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_HOST", "Only the host can end the session.")
		return
	}
	l.State = StateSessionResults
	l.LastActiveAt = nowMS()
	standings := buildSessionStandings(l)
	l.mu.Unlock()

	m.broadcastRaw(hubRoom(lobbyID), realtime.MustEnvelope("rmhbox:game:session_results", map[string]any{"standings": standings}))
	m.disbandTimers.Schedule(lobbyID, sessionResultsDisbandMS, func() { m.disband(lobbyID, "Session ended") })
}

func buildSessionStandings(l *Lobby) []map[string]any {
	type row struct {
		userID, userName string
		total, wins      int
	}
	rows := []row{}
	for _, p := range l.Players {
		wins := 0
		for _, mh := range l.MatchHistory {
			if len(mh.Standings) > 0 && mh.Standings[0].UserID == p.UserID {
				wins++
			}
		}
		rows = append(rows, row{p.UserID, p.UserName, p.Score, wins})
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].total > rows[i].total {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	out := make([]map[string]any, len(rows))
	for i, r := range rows {
		out[i] = map[string]any{"userId": r.userID, "userName": r.userName, "totalScore": r.total, "wins": r.wins, "rank": i + 1}
	}
	return out
}

// ─── Ready-up (§7) ───────────────────────────────────────────────────────────

// ToggleReady flips a non-host player's ready state.
func (m *LobbyManager) ToggleReady(userID, lobbyID string) {
	l := m.GetLobbyByUserID(userID)
	if l == nil || l.ID != lobbyID {
		m.sendErrUser(userID, "NOT_IN_LOBBY", "You are not in a lobby.")
		return
	}
	l.mu.Lock()
	p, ok := l.Players[userID]
	if !ok {
		l.mu.Unlock()
		m.sendErrUser(userID, "NOT_IN_LOBBY", "You are not a player in this lobby.")
		return
	}
	if userID == l.HostUserID {
		l.mu.Unlock()
		m.sendErrUser(userID, "INVALID_PAYLOAD", "Host cannot toggle ready state.")
		return
	}
	if !p.IsReady && l.SelectedGame == nil {
		l.mu.Unlock()
		m.sendErrUser(userID, "INVALID_PAYLOAD", "Wait for the host to pick a game first.")
		return
	}
	p.IsReady = !p.IsReady
	l.LastActiveAt = nowMS()
	ready := p.IsReady
	// auto-start check
	var autoStart *int
	readyCount := 0
	if l.Settings.AutoStartThreshold != nil {
		for _, pp := range l.Players {
			if pp.IsReady {
				readyCount++
			}
		}
		autoStart = l.Settings.AutoStartThreshold
	}
	l.mu.Unlock()

	m.broadcastAction(lobbyID, "PLAYER_READY_CHANGED", map[string]any{"userId": userID, "isReady": ready})
	if autoStart != nil && readyCount >= *autoStart {
		m.broadcastAction(lobbyID, "AUTO_START_TRIGGERED", map[string]any{"readyCount": readyCount, "threshold": *autoStart})
	}
}

// ─── Game pick (host picks without starting) ─────────────────────────────────

// PickGame sets the selected game; "__vote__" enables vote mode.
func (m *LobbyManager) PickGame(hostID, lobbyID, minigameID string) {
	l := m.GetLobbyByUserID(hostID)
	if l == nil || l.ID != lobbyID {
		m.sendErrUser(hostID, "NOT_IN_LOBBY", "You are not in this lobby.")
		return
	}
	l.mu.Lock()
	if l.HostUserID != hostID {
		l.mu.Unlock()
		m.sendErrUser(hostID, "NOT_HOST", "Only the host can pick a game.")
		return
	}
	if l.State != StateWaiting {
		l.mu.Unlock()
		m.sendErrUser(hostID, "INVALID_STATE", "Lobby must be in WAITING state.")
		return
	}
	isVote := minigameID == "__vote__"
	displayName := "Player Vote"
	if !isVote {
		def, ok := getMinigameDef(minigameID)
		if !ok {
			l.mu.Unlock()
			m.sendErrUser(hostID, "INVALID_GAME", "Unknown minigame.")
			return
		}
		displayName = def.DisplayName
	}
	var prev string
	if l.SelectedGame != nil {
		prev = l.SelectedGame.MinigameID
	}
	l.SelectedGame = &SelectedGame{MinigameID: minigameID, DisplayName: displayName}
	l.LastActiveAt = nowMS()
	l.PendingGameSettings = nil

	hostReadyChanged := false
	if hp, ok := l.Players[hostID]; ok && !hp.IsReady {
		hp.IsReady = true
		hostReadyChanged = true
	}
	var unready []string
	if prev != "" && prev != minigameID {
		for id, pp := range l.Players {
			if id != l.HostUserID && pp.IsReady {
				pp.IsReady = false
				unready = append(unready, id)
			}
		}
	}
	l.mu.Unlock()

	if hostReadyChanged {
		m.broadcastAction(lobbyID, "PLAYER_READY_CHANGED", map[string]any{"userId": hostID, "isReady": true})
	}
	for _, id := range unready {
		m.broadcastAction(lobbyID, "PLAYER_READY_CHANGED", map[string]any{"userId": id, "isReady": false})
	}
	m.broadcastAction(lobbyID, "GAME_PICKED", map[string]any{"minigameId": minigameID, "displayName": displayName})
}

// ─── Spectator promotion (§8) ────────────────────────────────────────────────

// PromoteSpectator promotes a spectator to player. If byHost, the requester must
// be the host and promotes the named target; otherwise the requester promotes
// themself.
func (m *LobbyManager) PromoteSpectator(requesterID, lobbyID, targetID string, byHost bool) {
	l := m.GetLobbyByUserID(requesterID)
	if l == nil || l.ID != lobbyID {
		m.sendErrUser(requesterID, "NOT_IN_LOBBY", "You are not in a lobby.")
		return
	}
	l.mu.Lock()
	if byHost {
		if l.HostUserID != requesterID {
			l.mu.Unlock()
			m.sendErrUser(requesterID, "NOT_HOST", "Only the host can promote spectators.")
			return
		}
	} else {
		targetID = requesterID
	}
	if l.State != StateWaiting && l.State != StateRoundResults {
		l.mu.Unlock()
		m.sendErrUser(requesterID, "LOBBY_IN_GAME", "Promotion is only allowed between rounds.")
		return
	}
	if !byHost && !l.Settings.AllowSpectatorPromotion {
		l.mu.Unlock()
		m.sendErrUser(requesterID, "INVALID_PAYLOAD", "Spectator promotion is disabled.")
		return
	}
	s, ok := l.Spectators[targetID]
	if !ok {
		l.mu.Unlock()
		m.sendErrUser(requesterID, "INVALID_PAYLOAD", "That user is not a spectator.")
		return
	}
	if len(l.Players) >= l.Settings.MaxPlayers {
		l.mu.Unlock()
		m.sendErrUser(requesterID, "LOBBY_FULL", "Player slots are full.")
		return
	}
	delete(l.Spectators, targetID)
	l.Players[targetID] = &Player{
		UserID: s.UserID, UserName: s.UserName, AvatarURL: s.AvatarURL, ConnID: s.ConnID,
		IsConnected: s.IsConnected, IsReady: false, JoinedAt: s.JoinedAt, LastSeenAt: nowMS(),
	}
	l.LastActiveAt = nowMS()
	name := s.UserName
	l.mu.Unlock()

	m.broadcastAction(lobbyID, "SPECTATOR_PROMOTED", map[string]any{"userId": targetID, "userName": name})
	if byHost {
		m.addSystemChat(lobbyID, name+" was promoted by the host")
	} else {
		m.addSystemChat(lobbyID, name+" joined as a player")
	}
}

// ─── Away state ──────────────────────────────────────────────────────────────

// SetPlayerAway toggles a player's away flag (Discord Activity PiP).
func (m *LobbyManager) SetPlayerAway(userID string, away bool) {
	l := m.GetLobbyByUserID(userID)
	if l == nil {
		return
	}
	l.mu.Lock()
	p, ok := l.Players[userID]
	if !ok || p.IsAway == away {
		l.mu.Unlock()
		return
	}
	p.IsAway = away
	l.mu.Unlock()
	m.broadcastAction(l.ID, "PLAYER_AWAY_CHANGED", map[string]any{"userId": userID, "isAway": away})
}

// ─── Lobby browser (§9) ──────────────────────────────────────────────────────

// BrowseLobbies returns public lobbies sorted by player count, paginated.
func (m *LobbyManager) BrowseLobbies(requesterID, cursor string, limit int) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	type entry struct {
		id  string
		l   *Lobby
		cnt int
	}
	var pubs []entry
	for _, l := range m.Lobbies() {
		l.mu.Lock()
		if l.Settings.IsPublic && l.State != StateDisbanded {
			pubs = append(pubs, entry{l.ID, l, len(l.Players)})
		}
		l.mu.Unlock()
	}
	for i := 0; i < len(pubs); i++ {
		for j := i + 1; j < len(pubs); j++ {
			if pubs[j].cnt > pubs[i].cnt {
				pubs[i], pubs[j] = pubs[j], pubs[i]
			}
		}
	}
	start := 0
	if cursor != "" {
		for i, e := range pubs {
			if e.id == cursor {
				start = i + 1
				break
			}
		}
	}
	end := start + limit
	if end > len(pubs) {
		end = len(pubs)
	}
	page := pubs[start:end]
	var nextCursor any
	if len(page) == limit && start+limit < len(pubs) {
		nextCursor = page[len(page)-1].id
	}
	out := make([]map[string]any, 0, len(page))
	for _, e := range page {
		l := e.l
		l.mu.Lock()
		hostName := "Unknown"
		if hp, ok := l.Players[l.HostUserID]; ok {
			hostName = hp.UserName
		}
		var curGame any
		if l.CurrentGame != nil {
			curGame = l.CurrentGame.MinigameID
		}
		var selGame any
		if l.SelectedGame != nil {
			selGame = l.SelectedGame.DisplayName
		}
		out = append(out, map[string]any{
			"lobbyId": l.ID, "hostName": hostName, "playerCount": len(l.Players),
			"maxPlayers": l.Settings.MaxPlayers, "spectatorCount": len(l.Spectators),
			"state": l.State, "currentGame": curGame, "selectedGame": selGame, "roundNumber": l.RoundNumber,
		})
		l.mu.Unlock()
	}
	m.sendToUser(requesterID, "rmhbox:lobby:browse_result", map[string]any{"lobbies": out, "nextCursor": nextCursor})
}

// ─── Client state snapshot (§10) ─────────────────────────────────────────────

// buildClientState is the ONLY exit point for lobby state. It strips internal
// fields and scopes minigame state per player/spectator role (getStateForPlayer
// vs getStateForSpectator). Takes l.mu internally — caller must not hold it.
func (m *LobbyManager) buildClientState(l *Lobby, userID string) map[string]any {
	l.mu.Lock()
	defer l.mu.Unlock()

	players := make([]map[string]any, 0, len(l.Players))
	for _, p := range l.Players {
		players = append(players, map[string]any{
			"userId": p.UserID, "userName": p.UserName, "avatarUrl": p.AvatarURL,
			"isConnected": p.IsConnected, "isReady": p.IsReady, "isAway": p.IsAway,
			"score": p.Score, "roundScore": p.RoundScore, "isHost": p.UserID == l.HostUserID,
		})
	}
	spectators := make([]map[string]any, 0, len(l.Spectators))
	for _, s := range l.Spectators {
		spectators = append(spectators, map[string]any{
			"userId": s.UserID, "userName": s.UserName, "avatarUrl": s.AvatarURL, "isConnected": s.IsConnected,
		})
	}

	myRole := "spectator"
	if _, ok := l.Players[userID]; ok {
		myRole = "player"
	}

	var currentGame any
	if l.CurrentGame != nil {
		var gameState any = map[string]any{}
		if l.CurrentGame.Handler != nil {
			// Per-player scoped state filtering — the load-bearing distinction.
			if myRole == "player" {
				gameState = safeStateForPlayer(l.CurrentGame.Handler, userID)
			} else {
				gameState = safeStateForSpectator(l.CurrentGame.Handler)
			}
		}
		phase := "playing"
		switch l.State {
		case StateInstructions:
			phase = "instructions"
		case StatePreloading:
			phase = "preloading"
		case StateCountdown:
			phase = "countdown"
		case StateRoundResults:
			phase = "results"
		}
		displayName := l.CurrentGame.MinigameID
		if def, ok := getMinigameDef(l.CurrentGame.MinigameID); ok {
			displayName = def.DisplayName
		}
		var specMode any
		if l.CurrentGame.Handler != nil {
			specMode = l.CurrentGame.Handler.SpectatorMode()
		}
		currentGame = map[string]any{
			"minigameId": l.CurrentGame.MinigameID, "displayName": displayName,
			"phase": phase, "timeRemaining": nil, "publicState": gameState,
			"privateState": map[string]any{}, "spectatorMode": specMode,
		}
	}

	var selectedGame any
	if l.SelectedGame != nil {
		selectedGame = l.SelectedGame
	}

	return map[string]any{
		"lobbyId": l.ID, "hostUserId": l.HostUserID, "state": l.State,
		"settings": l.Settings, "players": players, "spectators": spectators,
		"currentGame": currentGame, "selectedGame": selectedGame, "roundNumber": l.RoundNumber,
		"chat": append([]ChatMessage(nil), l.Chat...), "myRole": myRole, "myUserId": userID,
		"matchHistory": l.MatchHistory,
	}
}

// safeStateForPlayer/Spectator wrap handler calls in recover() (fault isolation).
func safeStateForPlayer(h Minigame, userID string) (out any) {
	out = map[string]any{}
	defer func() { _ = recover() }()
	out = h.GetStateForPlayer(userID)
	return
}

func safeStateForSpectator(h Minigame) (out any) {
	out = map[string]any{}
	defer func() { _ = recover() }()
	out = h.GetStateForSpectator()
	return
}
