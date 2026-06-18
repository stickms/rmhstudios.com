package rmhbox

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// hubRoom returns the single realtime room id backing a lobby. The Node sub-rooms
// (:players, :spectators, :player:{id}) are modelled as logical sets on the Lobby
// and resolved per-recipient via the userID->conn index.
func hubRoom(lobbyID string) string { return "rmhbox:" + lobbyID }

// LobbyManager owns all lobbies plus the indices the Node manager kept:
// userToLobby, channelToLobby (Discord), grace + disband timers, and the
// pending join-in-progress list. Faithful port of lobby-manager.ts.
type LobbyManager struct {
	hub    *realtime.Hub
	logger *log.Logger

	mu             sync.RWMutex
	lobbies        map[string]*Lobby
	userToLobby    map[string]string
	channelToLobby map[string]string
	// userConn indexes the live connection per authenticated userID, so we can
	// target a specific player (the :player:{userId} sub-room) and so we can map
	// a disconnecting conn back to its user.
	userConn    map[string]*realtime.Conn
	connUser    map[string]string // connID -> userID
	pendingJoin map[string][]string

	graceTimers   *realtime.GraceTimers
	disbandTimers *realtime.GraceTimers

	// onSpectatorJoinedMidGame is set by the coordinator.
	onSpectatorJoinedMidGame func(lobbyID, spectatorUserID string, c *realtime.Conn)

	gcStop chan struct{}

	// Test seams. When nil, production paths use the hub. Tests inject these to
	// capture broadcasts/sends without a live WebSocket. roomEnvSeq mirrors the
	// hub's per-room seq stamping so the seq-ordering behaviour is verifiable.
	broadcastSeqFn func(room string, e realtime.Envelope)
	broadcastFn    func(room string, e realtime.Envelope)
	sendFn         func(userID string, e realtime.Envelope)
	testSeqMu      sync.Mutex
	testSeq        map[string]uint64
}

// NewLobbyManager constructs the lobby manager.
func NewLobbyManager(hub *realtime.Hub, logger *log.Logger) *LobbyManager {
	return &LobbyManager{
		hub:            hub,
		logger:         logger,
		lobbies:        map[string]*Lobby{},
		userToLobby:    map[string]string{},
		channelToLobby: map[string]string{},
		userConn:       map[string]*realtime.Conn{},
		connUser:       map[string]string{},
		pendingJoin:    map[string][]string{},
		graceTimers:    realtime.NewGraceTimers(),
		disbandTimers:  realtime.NewGraceTimers(),
	}
}

// ─── Accessors ───────────────────────────────────────────────────────────────

// GetLobby returns a lobby by id.
func (m *LobbyManager) GetLobby(id string) *Lobby {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lobbies[id]
}

// GetLobbyByUserID resolves the lobby a user is in.
func (m *LobbyManager) GetLobbyByUserID(userID string) *Lobby {
	m.mu.RLock()
	lid, ok := m.userToLobby[userID]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return m.GetLobby(lid)
}

// Lobbies returns a snapshot slice of all lobbies (for GC / heartbeat).
func (m *LobbyManager) Lobbies() []*Lobby {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Lobby, 0, len(m.lobbies))
	for _, l := range m.lobbies {
		out = append(out, l)
	}
	return out
}

func (m *LobbyManager) pendingJoinPlayers(lobbyID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]string(nil), m.pendingJoin[lobbyID]...)
}

func (m *LobbyManager) clearPendingJoin(lobbyID string) {
	m.mu.Lock()
	delete(m.pendingJoin, lobbyID)
	m.mu.Unlock()
}

// ─── Connection lifecycle (called by Manager) ────────────────────────────────

func (m *LobbyManager) onConnect(c *realtime.Conn) {
	if c.UserID() == "" {
		return
	}
	m.mu.Lock()
	m.userConn[c.UserID()] = c
	m.connUser[c.ID] = c.UserID()
	m.mu.Unlock()
}

func (m *LobbyManager) onDisconnect(c *realtime.Conn) {
	m.mu.Lock()
	userID := m.connUser[c.ID]
	delete(m.connUser, c.ID)
	if userID != "" && m.userConn[userID] == c {
		delete(m.userConn, userID)
	}
	m.mu.Unlock()
	if userID != "" {
		m.handleDisconnect(userID)
	}
}

func (m *LobbyManager) connFor(userID string) *realtime.Conn {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.userConn[userID]
}

// ─── Broadcast helpers (lobby-manager.ts §12.2) ──────────────────────────────

// broadcastAction emits a sequenced GAME_ACTION via hub.BroadcastSeq. The hub
// stamps seq monotonically per room — the seq-ordered mutation path.
func (m *LobbyManager) broadcastAction(lobbyID, actionType string, payload any) {
	env := realtime.MustEnvelope("rmhbox:game:action", map[string]any{
		"type":      actionType,
		"payload":   payload,
		"timestamp": nowMS(),
	})
	m.broadcastSeq(hubRoom(lobbyID), env)
}

// broadcastSeq routes through the test seam if set, else the hub.
func (m *LobbyManager) broadcastSeq(room string, e realtime.Envelope) {
	if m.broadcastSeqFn != nil {
		if m.testSeq != nil {
			// Mirror the hub's atomic per-room seq stamping so the ordering is
			// stable under concurrency (the production path uses room.NextSeq).
			m.testSeqMu.Lock()
			m.testSeq[room]++
			e.Seq = m.testSeq[room]
			m.testSeqMu.Unlock()
		}
		m.broadcastSeqFn(room, e)
		return
	}
	m.hub.BroadcastSeq(room, e)
}

// broadcastRaw routes a non-sequenced broadcast through the test seam if set.
func (m *LobbyManager) broadcastRaw(room string, e realtime.Envelope) {
	if m.broadcastFn != nil {
		m.broadcastFn(room, e)
		return
	}
	m.hub.Broadcast(room, e)
}

// sendToUser sends a named event to one user's connection.
func (m *LobbyManager) sendToUser(userID, event string, data any) {
	if m.sendFn != nil {
		m.sendFn(userID, realtime.MustEnvelope(event, data))
		return
	}
	if c := m.connFor(userID); c != nil {
		c.Send(realtime.MustEnvelope(event, data))
	}
}

// sendToPlayer mirrors sendToPlayer() — targets the :player:{userId} sub-room.
func (m *LobbyManager) sendToPlayer(_lobbyID, userID, event string, data any) {
	m.sendToUser(userID, event, data)
}

// broadcastToPlayers / broadcastToSpectators iterate the logical member set.
// Caller must NOT hold lobby.mu (we take it here).
func (m *LobbyManager) broadcastToPlayers(l *Lobby, event string, data any) {
	l.mu.Lock()
	ids := make([]string, 0, len(l.Players))
	for id := range l.Players {
		ids = append(ids, id)
	}
	l.mu.Unlock()
	for _, id := range ids {
		m.sendToUser(id, event, data)
	}
}

func (m *LobbyManager) broadcastToSpectators(l *Lobby, event string, data any) {
	l.mu.Lock()
	ids := make([]string, 0, len(l.Spectators))
	for id := range l.Spectators {
		ids = append(ids, id)
	}
	l.mu.Unlock()
	for _, id := range ids {
		m.sendToUser(id, event, data)
	}
}

// addSystemChat appends a system message (ring-buffered) and broadcasts it.
func (m *LobbyManager) addSystemChat(lobbyID, message string) {
	l := m.GetLobby(lobbyID)
	if l == nil {
		return
	}
	msg := ChatMessage{ID: uuid.NewString(), UserID: "system", UserName: "System", Content: message, Timestamp: nowMS(), Type: "system"}
	l.mu.Lock()
	l.Chat = append(l.Chat, msg)
	if len(l.Chat) > chatHistoryLength {
		l.Chat = l.Chat[len(l.Chat)-chatHistoryLength:]
	}
	l.mu.Unlock()
	m.broadcastAction(lobbyID, "CHAT_MESSAGE", msg)
}

// ─── Lobby creation (§2.1) ───────────────────────────────────────────────────

func generateRoomCode() string {
	// Invariant: the index comes from randIntn (unbiased), so every code char is
	// uniform over the 32-char alphabet regardless of alphabet length. (The
	// alphabet also has 32 chars, which divides 256, so a byte-modulo scheme
	// would be unbiased too — but we rely on randIntn, not modulo.)
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 4)
	for i := range b {
		b[i] = alphabet[randIntn(len(alphabet))]
	}
	return string(b)
}

func (m *LobbyManager) generateUniqueLobbyID() (string, bool) {
	for i := 0; i < maxCodeAttempts; i++ {
		code := generateRoomCode()
		m.mu.RLock()
		_, exists := m.lobbies[code]
		m.mu.RUnlock()
		if !exists {
			return code, true
		}
	}
	return "", false
}

// CreateLobby creates a lobby for c and returns its id (or "" + error code).
func (m *LobbyManager) CreateLobby(c *realtime.Conn, partial *LobbySettings, channelKey string) (string, string) {
	userID := c.UserID()
	userName := identityName(c)
	avatar := c.Identity.Image

	m.mu.RLock()
	_, already := m.userToLobby[userID]
	m.mu.RUnlock()
	if already {
		return "", "ALREADY_IN_LOBBY"
	}

	lobbyID, ok := m.generateUniqueLobbyID()
	if !ok {
		return "", "INTERNAL"
	}

	settings := defaultSettings()
	if partial != nil {
		mergeSettings(&settings, partial)
	}
	settings.MaxPlayers = clampInt(settings.MaxPlayers, 2, absoluteMaxPlayers)
	settings.MaxSpectators = clampInt(settings.MaxSpectators, 0, maxSpectators)

	now := nowMS()
	host := &Player{
		UserID: userID, UserName: userName, AvatarURL: avatar, ConnID: c.ID,
		IsConnected: true, IsReady: true, JoinedAt: now, LastSeenAt: now,
	}
	l := &Lobby{
		ID: lobbyID, HostUserID: userID, Settings: settings,
		Players: map[string]*Player{userID: host}, Spectators: map[string]*Spectator{},
		State: StateWaiting, Chat: []ChatMessage{}, CreatedAt: now, LastActiveAt: now,
		MatchHistory: []ServerMatchSummary{}, DiscordChannelKey: channelKey,
	}

	m.mu.Lock()
	m.lobbies[lobbyID] = l
	m.userToLobby[userID] = lobbyID
	if channelKey != "" {
		m.channelToLobby[channelKey] = lobbyID
	}
	m.mu.Unlock()

	m.hub.Join(c, hubRoom(lobbyID))
	m.logger.Info("lobby_created", "lobbyId", lobbyID, "userId", userID, "channelKey", channelKey)
	return lobbyID, ""
}

// ─── Join (§3.1) ─────────────────────────────────────────────────────────────

// JoinLobby places c into lobbyID as a player or spectator, honoring the
// join-in-progress policy and capacity limits.
func (m *LobbyManager) JoinLobby(c *realtime.Conn, lobbyID string, asSpectator bool) {
	userID := c.UserID()
	userName := identityName(c)
	avatar := c.Identity.Image

	l := m.GetLobby(lobbyID)
	if l == nil {
		m.sendErr(c, "LOBBY_NOT_FOUND", "Lobby not found.")
		return
	}

	l.mu.Lock()
	if l.State == StateDisbanded {
		l.mu.Unlock()
		m.sendErr(c, "LOBBY_NOT_FOUND", "Lobby has been disbanded.")
		return
	}

	m.mu.RLock()
	existingLobby, inLobby := m.userToLobby[userID]
	m.mu.RUnlock()
	if inLobby {
		if existingLobby == lobbyID {
			// Re-join same lobby: refresh conn + resend snapshot.
			if p, ok := l.Players[userID]; ok {
				p.ConnID = c.ID
				p.IsConnected = true
				p.LastSeenAt = nowMS()
			}
			if s, ok := l.Spectators[userID]; ok {
				s.ConnID = c.ID
				s.IsConnected = true
			}
			l.mu.Unlock()
			m.hub.Join(c, hubRoom(lobbyID))
			m.sendToUser(userID, "rmhbox:lobby:state_snapshot", m.buildClientState(l, userID))
			return
		}
		l.mu.Unlock()
		m.sendErr(c, "ALREADY_IN_LOBBY", "You are already in a lobby.")
		return
	}

	now := nowMS()
	joinAsSpectator := asSpectator
	jipPolicy := ""
	if !joinAsSpectator {
		if l.State == StatePlaying {
			if l.CurrentGame != nil {
				if def, ok := getMinigameDef(l.CurrentGame.MinigameID); ok {
					jipPolicy = def.JoinInProgressPolicy
				} else {
					jipPolicy = "spectate_only"
				}
				if jipPolicy == "spectate_only" || jipPolicy == "join_next_subround" {
					joinAsSpectator = true
				}
			} else {
				joinAsSpectator = true
			}
		}
		if len(l.Players) >= l.Settings.MaxPlayers {
			joinAsSpectator = true
		}
	}

	if joinAsSpectator {
		if len(l.Spectators) >= l.Settings.MaxSpectators {
			l.mu.Unlock()
			m.sendErr(c, "LOBBY_FULL", "Spectator slots are full.")
			return
		}
		l.Spectators[userID] = &Spectator{UserID: userID, UserName: userName, AvatarURL: avatar, ConnID: c.ID, IsConnected: true, JoinedAt: now}
		l.LastActiveAt = now
		l.mu.Unlock()

		m.mu.Lock()
		m.userToLobby[userID] = lobbyID
		if jipPolicy == "join_next_subround" {
			m.pendingJoin[lobbyID] = append(m.pendingJoin[lobbyID], userID)
		}
		m.mu.Unlock()

		m.hub.Join(c, hubRoom(lobbyID))
		m.broadcastAction(lobbyID, "SPECTATOR_JOINED", map[string]any{"userId": userID, "userName": userName, "avatarUrl": avatar})
		m.sendToUser(userID, "rmhbox:lobby:state_snapshot", m.buildClientState(l, userID))
		m.addSystemChat(lobbyID, userName+" joined")

		if l.State == StatePlaying && m.onSpectatorJoinedMidGame != nil {
			m.onSpectatorJoinedMidGame(lobbyID, userID, c)
		}
		m.logger.Info("spectator_joined", "lobbyId", lobbyID, "userId", userID)
		return
	}

	// Join as player.
	if len(l.Players) >= l.Settings.MaxPlayers {
		l.mu.Unlock()
		m.sendErr(c, "LOBBY_FULL", "Player slots are full.")
		return
	}
	l.Players[userID] = &Player{UserID: userID, UserName: userName, AvatarURL: avatar, ConnID: c.ID, IsConnected: true, JoinedAt: now, LastSeenAt: now}
	l.LastActiveAt = now
	l.mu.Unlock()

	m.mu.Lock()
	m.userToLobby[userID] = lobbyID
	m.mu.Unlock()

	m.hub.Join(c, hubRoom(lobbyID))
	m.broadcastAction(lobbyID, "PLAYER_JOINED", map[string]any{"userId": userID, "userName": userName, "avatarUrl": avatar})
	m.sendToUser(userID, "rmhbox:lobby:state_snapshot", m.buildClientState(l, userID))
	m.addSystemChat(lobbyID, userName+" joined")
	m.logger.Info("player_joined", "lobbyId", lobbyID, "userId", userID)
}

// ─── Leave (§4.1) ────────────────────────────────────────────────────────────

// LeaveLobby removes the user from their lobby (player or spectator).
func (m *LobbyManager) LeaveLobby(userID, lobbyID string) {
	l := m.GetLobbyByUserID(userID)
	if l == nil || l.ID != lobbyID {
		m.sendErrUser(userID, "NOT_IN_LOBBY", "You are not in a lobby.")
		return
	}
	m.graceTimers.Cancel(userID)

	l.mu.Lock()
	_, isPlayer := l.Players[userID]
	spec, isSpectator := l.Spectators[userID]
	l.mu.Unlock()

	if isPlayer {
		m.removePlayer(l, userID)
		return
	}
	if isSpectator {
		l.mu.Lock()
		delete(l.Spectators, userID)
		l.LastActiveAt = nowMS()
		l.mu.Unlock()
		m.mu.Lock()
		delete(m.userToLobby, userID)
		m.mu.Unlock()
		if c := m.connFor(userID); c != nil {
			m.hub.Leave(c, hubRoom(lobbyID))
		}
		m.broadcastAction(lobbyID, "SPECTATOR_LEFT", map[string]any{"userId": userID, "userName": spec.UserName})
		m.addSystemChat(lobbyID, spec.UserName+" left")
	}
}

// removePlayer removes a player, handling host succession + disband. Shared by
// leave, kick and grace expiry (faithful port of removePlayer()).
func (m *LobbyManager) removePlayer(l *Lobby, userID string) {
	l.mu.Lock()
	p, ok := l.Players[userID]
	if !ok {
		l.mu.Unlock()
		return
	}
	userName := p.UserName
	wasHost := l.HostUserID == userID
	delete(l.Players, userID)
	l.LastActiveAt = nowMS()
	l.mu.Unlock()

	m.mu.Lock()
	// Only clear the index if it still points at THIS lobby — a delayed grace
	// expiry must not evict a user who has since rejoined a different lobby.
	if m.userToLobby[userID] == l.ID {
		delete(m.userToLobby, userID)
	}
	m.mu.Unlock()
	if c := m.connFor(userID); c != nil {
		m.hub.Leave(c, hubRoom(l.ID))
	}

	if wasHost {
		if m.succeedHost(l) {
			// host succession handled (events broadcast inside)
		} else {
			m.disband(l.ID, "All players left")
			return
		}
	}

	l.mu.Lock()
	empty := len(l.Players) == 0 && len(l.Spectators) == 0
	l.mu.Unlock()
	if empty {
		m.disband(l.ID, "All players left")
		return
	}

	m.broadcastAction(l.ID, "PLAYER_LEFT", map[string]any{"userId": userID, "userName": userName})
	m.addSystemChat(l.ID, userName+" left")
}

// succeedHost promotes the earliest-joined remaining player (or spectator) to
// host. Returns false if nobody remains to take over.
func (m *LobbyManager) succeedHost(l *Lobby) bool {
	l.mu.Lock()
	if len(l.Players) > 0 {
		var newHostID string
		earliest := int64(1<<62 - 1)
		for id, p := range l.Players {
			if p.JoinedAt < earliest {
				earliest = p.JoinedAt
				newHostID = id
			}
		}
		l.HostUserID = newHostID
		nh := l.Players[newHostID]
		readyChanged := false
		if !nh.IsReady {
			nh.IsReady = true
			readyChanged = true
		}
		name := nh.UserName
		l.mu.Unlock()
		if readyChanged {
			m.broadcastAction(l.ID, "PLAYER_READY_CHANGED", map[string]any{"userId": newHostID, "isReady": true})
		}
		m.broadcastAction(l.ID, "HOST_TRANSFERRED", map[string]any{"newHostUserId": newHostID, "newHostUserName": name})
		m.addSystemChat(l.ID, "Host transferred to "+name)
		return true
	}
	if len(l.Spectators) > 0 {
		var newHostID string
		earliest := int64(1<<62 - 1)
		for id, s := range l.Spectators {
			if s.JoinedAt < earliest {
				earliest = s.JoinedAt
				newHostID = id
			}
		}
		s := l.Spectators[newHostID]
		delete(l.Spectators, newHostID)
		l.Players[newHostID] = &Player{
			UserID: s.UserID, UserName: s.UserName, AvatarURL: s.AvatarURL, ConnID: s.ConnID,
			IsConnected: s.IsConnected, IsReady: true, JoinedAt: s.JoinedAt, LastSeenAt: nowMS(),
		}
		l.HostUserID = newHostID
		name := s.UserName
		l.mu.Unlock()
		m.broadcastAction(l.ID, "HOST_TRANSFERRED", map[string]any{"newHostUserId": newHostID, "newHostUserName": name})
		m.addSystemChat(l.ID, "Host transferred to "+name)
		return true
	}
	l.mu.Unlock()
	return false
}

// handleDisconnect applies the disconnect grace logic for a player; spectators
// are removed immediately (faithful port of handleDisconnect()).
func (m *LobbyManager) handleDisconnect(userID string) {
	l := m.GetLobbyByUserID(userID)
	if l == nil {
		return
	}
	l.mu.Lock()
	if p, ok := l.Players[userID]; ok {
		p.IsConnected = false
		p.IsReady = false
		p.ConnID = ""
		p.LastSeenAt = nowMS()
		l.LastActiveAt = nowMS()
		name := p.UserName
		l.mu.Unlock()

		m.broadcastAction(l.ID, "PLAYER_READY_CHANGED", map[string]any{"userId": userID, "isReady": false})
		m.broadcastAction(l.ID, "PLAYER_DISCONNECTED", map[string]any{"userId": userID, "userName": name})

		m.graceTimers.Schedule(userID, disconnectGracePeriod, func() {
			// Re-resolve by id and bail if the lobby was disbanded/replaced — the
			// captured *Lobby may be stale by the time this grace timer fires.
			cur := m.GetLobby(l.ID)
			if cur == nil || cur != l {
				return
			}
			m.logger.Info("grace_period_expired", "userId", userID, "lobbyId", l.ID)
			m.removePlayer(l, userID)
		})
		return
	}
	if s, ok := l.Spectators[userID]; ok {
		delete(l.Spectators, userID)
		l.LastActiveAt = nowMS()
		name := s.UserName
		l.mu.Unlock()
		m.mu.Lock()
		delete(m.userToLobby, userID)
		m.mu.Unlock()
		m.broadcastAction(l.ID, "SPECTATOR_LEFT", map[string]any{"userId": userID, "userName": name})
		m.addSystemChat(l.ID, name+" left")
		return
	}
	l.mu.Unlock()
}

// cancelGraceTimer cancels a pending disconnect grace timer (reconnection path).
func (m *LobbyManager) cancelGraceTimer(userID string) { m.graceTimers.Cancel(userID) }

// ─── Disband ─────────────────────────────────────────────────────────────────

func (m *LobbyManager) disband(lobbyID, reason string) {
	l := m.GetLobby(lobbyID)
	if l == nil {
		return
	}
	l.mu.Lock()
	l.State = StateDisbanded
	players := keysPlayers(l.Players)
	specs := keysSpectators(l.Spectators)
	channelKey := l.DiscordChannelKey
	l.mu.Unlock()

	m.logger.Info("lobby_disbanded", "lobbyId", lobbyID, "reason", reason)
	m.broadcastRaw(hubRoom(lobbyID), realtime.MustEnvelope("rmhbox:lobby:disbanded", map[string]any{"reason": reason}))

	for _, uid := range players {
		if c := m.connFor(uid); c != nil {
			m.hub.Leave(c, hubRoom(lobbyID))
		}
		m.graceTimers.Cancel(uid)
	}
	for _, uid := range specs {
		if c := m.connFor(uid); c != nil {
			m.hub.Leave(c, hubRoom(lobbyID))
		}
	}

	m.mu.Lock()
	for _, uid := range players {
		delete(m.userToLobby, uid)
	}
	for _, uid := range specs {
		delete(m.userToLobby, uid)
	}
	if channelKey != "" && m.channelToLobby[channelKey] == lobbyID {
		delete(m.channelToLobby, channelKey)
	}
	delete(m.lobbies, lobbyID)
	delete(m.pendingJoin, lobbyID)
	m.mu.Unlock()
	m.disbandTimers.Cancel(lobbyID)
}

// ─── Garbage collector (§11) ─────────────────────────────────────────────────

func (m *LobbyManager) startGC() {
	m.gcStop = make(chan struct{})
	go func() {
		t := time.NewTicker(lobbyGCInterval)
		defer t.Stop()
		for {
			select {
			case <-m.gcStop:
				return
			case <-t.C:
				m.runGC()
			}
		}
	}()
}

func (m *LobbyManager) stopGC() {
	if m.gcStop != nil {
		close(m.gcStop)
	}
}

func (m *LobbyManager) runGC() {
	now := nowMS()
	for _, l := range m.Lobbies() {
		l.mu.Lock()
		if l.State == StateDisbanded {
			l.mu.Unlock()
			continue
		}
		allDisc := allDisconnected(l)
		isEmpty := len(l.Players) == 0 && len(l.Spectators) == 0
		idleAge := now - l.LastActiveAt
		state := l.State
		l.mu.Unlock()

		isIdle := state == StateWaiting && idleAge > lobbyIdleTimeout.Milliseconds()
		isExpired := allDisc && idleAge > lobbyAbsoluteTimeout.Milliseconds()
		isEmptyTooLong := (isEmpty || allDisc) && idleAge > lobbyEmptyTimeout.Milliseconds()
		if isExpired || isIdle || isEmptyTooLong {
			reason := "empty"
			if isExpired {
				reason = "expired"
			} else if isIdle {
				reason = "idle"
			}
			m.logger.Info("lobby_gc", "lobbyId", l.ID, "reason", reason)
			m.disband(l.ID, "Inactive lobby")
		}
	}
}

func allDisconnected(l *Lobby) bool {
	if len(l.Players) == 0 && len(l.Spectators) == 0 {
		return true
	}
	for _, p := range l.Players {
		if p.IsConnected {
			return false
		}
	}
	for _, s := range l.Spectators {
		if s.IsConnected {
			return false
		}
	}
	return true
}

// ─── small helpers ───────────────────────────────────────────────────────────

func (m *LobbyManager) sendErr(c *realtime.Conn, code, msg string) {
	c.Send(realtime.MustEnvelope("rmhbox:error", map[string]any{"code": code, "message": msg}))
}

func (m *LobbyManager) sendErrUser(userID, code, msg string) {
	if c := m.connFor(userID); c != nil {
		m.sendErr(c, code, msg)
	}
}

func keysPlayers(m map[string]*Player) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func keysSpectators(m map[string]*Spectator) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func identityName(c *realtime.Conn) string {
	if c.Identity.Name != "" {
		return c.Identity.Name
	}
	return "Player"
}

func mergeSettings(dst, src *LobbySettings) {
	dst.IsPublic = src.IsPublic
	if src.MaxPlayers != 0 {
		dst.MaxPlayers = src.MaxPlayers
	}
	if src.MaxSpectators != 0 {
		dst.MaxSpectators = src.MaxSpectators
	}
	dst.AllowMidGameJoin = src.AllowMidGameJoin
	dst.AllowSpectatorPromotion = src.AllowSpectatorPromotion
	dst.AutoStartThreshold = src.AutoStartThreshold
	dst.GameDurationOverride = src.GameDurationOverride
}
