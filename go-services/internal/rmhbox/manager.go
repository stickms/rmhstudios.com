package rmhbox

import (
	"context"

	"github.com/google/uuid"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Manager wires the rmhbox subsystems onto a realtime.Hub and registers every
// inbound event handler. One Manager backs the rmhbox service.
type Manager struct {
	hub    *realtime.Hub
	logger *log.Logger
	lobby  *LobbyManager
	sync   *StateSync
	coord  *GameCoordinator
	repo   Repo
}

// NewManager builds the rmhbox manager. database may be nil (persistence is then
// disabled and leaderboard reads return empty — matching the graceful-degrade
// posture of the other services).
func NewManager(hub *realtime.Hub, database *db.DB, logger *log.Logger) *Manager {
	var repo Repo
	if database != nil {
		repo = NewPGRepo(database.Pool)
	}
	lm := NewLobbyManager(hub, logger)
	ss := NewStateSync(lm)
	gc := NewGameCoordinator(lm, ss, repo, logger)
	return &Manager{hub: hub, logger: logger, lobby: lm, sync: ss, coord: gc, repo: repo}
}

// NewManagerWithRepo is the test-friendly constructor with an injectable Repo.
func NewManagerWithRepo(hub *realtime.Hub, repo Repo, logger *log.Logger) *Manager {
	lm := NewLobbyManager(hub, logger)
	ss := NewStateSync(lm)
	gc := NewGameCoordinator(lm, ss, repo, logger)
	return &Manager{hub: hub, logger: logger, lobby: lm, sync: ss, coord: gc, repo: repo}
}

// Start launches background goroutines (heartbeat + GC).
func (m *Manager) Start() {
	m.sync.startHeartbeat()
	m.lobby.startGC()
}

// Stop tears down background goroutines and timers.
func (m *Manager) Stop() {
	m.sync.stopHeartbeat()
	m.lobby.stopGC()
	m.lobby.graceTimers.CancelAll()
	m.lobby.disbandTimers.CancelAll()
}

// requireUser returns the conn's userID, sending an error and returning "" for
// anonymous connections (rmhbox requires an identity to participate).
func (m *Manager) requireUser(c *realtime.Conn) string {
	if c.UserID() == "" {
		m.lobby.sendErr(c, "UNAUTHENTICATED", "Sign in to play.")
		return ""
	}
	return c.UserID()
}

// Register binds connect/disconnect callbacks and all inbound event handlers.
func (m *Manager) Register() {
	m.hub.OnConnect(func(c *realtime.Conn) {
		m.lobby.onConnect(c)
		// Attempt to resume any prior lobby + cancel grace timers (reconnection).
		if c.UserID() != "" {
			m.lobby.cancelGraceTimer(c.UserID())
			m.coord.handleReconnect(c.UserID())
		}
	})
	m.hub.OnDisconnect(func(c *realtime.Conn) {
		if c.UserID() != "" {
			m.coord.handleGameDisconnect(c.UserID())
		}
		m.lobby.onDisconnect(c)
	})

	// ── Lobby ──────────────────────────────────────────────────────────────
	m.hub.On("rmhbox:lobby:create", func(c *realtime.Conn, e realtime.Envelope) {
		if m.requireUser(c) == "" {
			return
		}
		var p struct {
			Settings *LobbySettings `json:"settings"`
		}
		_ = e.Bind(&p)
		lobbyID, errCode := m.lobby.CreateLobby(c, p.Settings, "")
		if errCode != "" {
			m.lobby.sendErr(c, errCode, "Could not create lobby.")
			return
		}
		l := m.lobby.GetLobby(lobbyID)
		c.Send(realtime.MustEnvelope("rmhbox:lobby:created", map[string]any{
			"lobbyId": lobbyID, "lobby": m.lobby.buildClientState(l, c.UserID()),
		}))
	})

	m.hub.On("rmhbox:lobby:join", func(c *realtime.Conn, e realtime.Envelope) {
		if m.requireUser(c) == "" {
			return
		}
		var p struct {
			LobbyID     string `json:"lobbyId"`
			AsSpectator bool   `json:"asSpectator"`
		}
		if e.Bind(&p) != nil || p.LobbyID == "" {
			return
		}
		m.lobby.JoinLobby(c, p.LobbyID, p.AsSpectator)
	})

	m.hub.On("rmhbox:lobby:leave", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID string `json:"lobbyId"`
		}
		_ = e.Bind(&p)
		m.lobby.LeaveLobby(uid, p.LobbyID)
	})

	m.hub.On("rmhbox:lobby:kick", m.hostTarget(func(uid, lobbyID, target string) { m.lobby.KickPlayer(uid, lobbyID, target) }))
	m.hub.On("rmhbox:lobby:transfer_host", m.hostTarget(func(uid, lobbyID, target string) { m.lobby.TransferHost(uid, lobbyID, target) }))

	m.hub.On("rmhbox:lobby:update_settings", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID  string         `json:"lobbyId"`
			Settings *LobbySettings `json:"settings"`
		}
		if e.Bind(&p) != nil || p.Settings == nil {
			return
		}
		m.lobby.UpdateSettings(uid, p.LobbyID, p.Settings)
	})

	m.hub.On("rmhbox:lobby:end_session", m.lobbyOnly(func(uid, lobbyID string) { m.lobby.EndSession(uid, lobbyID) }))
	m.hub.On("rmhbox:lobby:toggle_ready", m.lobbyOnly(func(uid, lobbyID string) { m.lobby.ToggleReady(uid, lobbyID) }))
	m.hub.On("rmhbox:lobby:request_promotion", m.lobbyOnly(func(uid, lobbyID string) { m.lobby.PromoteSpectator(uid, lobbyID, "", false) }))

	m.hub.On("rmhbox:lobby:promote_spectator", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID string `json:"lobbyId"`
			UserID  string `json:"userId"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.lobby.PromoteSpectator(uid, p.LobbyID, p.UserID, true)
	})

	m.hub.On("rmhbox:lobby:browse", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			Cursor string `json:"cursor"`
			Limit  int    `json:"limit"`
		}
		_ = e.Bind(&p)
		m.lobby.BrowseLobbies(uid, p.Cursor, p.Limit)
	})

	m.hub.On("rmhbox:game:pick", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID    string `json:"lobbyId"`
			MinigameID string `json:"minigameId"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.lobby.PickGame(uid, p.LobbyID, p.MinigameID)
	})

	m.hub.On("rmhbox:player:away", m.away(true))
	m.hub.On("rmhbox:player:active", m.away(false))

	// ── Game coordinator ───────────────────────────────────────────────────
	m.hub.On("rmhbox:game:select", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID    string `json:"lobbyId"`
			MinigameID string `json:"minigameId"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.coord.OnSelect(uid, p.LobbyID, p.MinigameID)
	})

	m.hub.On("rmhbox:game:force_skip", m.lobbyOnly(func(uid, lobbyID string) { m.coord.OnForceSkip(uid, lobbyID) }))
	m.hub.On("rmhbox:game:force_end", m.lobbyOnly(func(uid, lobbyID string) { m.coord.OnForceEnd(uid, lobbyID) }))
	m.hub.On("rmhbox:game:pause_timer", m.lobbyOnly(func(uid, lobbyID string) { m.coord.OnPauseTimer(uid, lobbyID) }))
	m.hub.On("rmhbox:game:ready_to_render", m.lobbyOnly(func(uid, lobbyID string) { m.coord.OnReadyToRender(uid, lobbyID) }))
	m.hub.On("rmhbox:game:confirm_settings", m.lobbyOnly(func(uid, lobbyID string) { m.coord.ConfirmGameSettings(uid, lobbyID) }))

	m.hub.On("rmhbox:game:update_settings", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID  string         `json:"lobbyId"`
			Settings map[string]any `json:"settings"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.coord.UpdateGameSettings(uid, p.LobbyID, p.Settings)
	})

	m.hub.On("rmhbox:game:input", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID string         `json:"lobbyId"`
			Action  string         `json:"action"`
			Data    map[string]any `json:"data"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.coord.OnInput(uid, p.LobbyID, p.Action, p.Data)
	})

	m.hub.On("rmhbox:spectator:select_player", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID        string `json:"lobbyId"`
			TargetPlayerID string `json:"targetPlayerId"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.coord.OnSpectatorSelectPlayer(uid, p.LobbyID, p.TargetPlayerID)
	})

	// ── Chat ───────────────────────────────────────────────────────────────
	m.hub.On("rmhbox:lobby:chat", func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID string `json:"lobbyId"`
			Content string `json:"content"`
		}
		if e.Bind(&p) != nil {
			return
		}
		m.onChat(c, uid, p.Content)
	})

	// ── Leaderboard ────────────────────────────────────────────────────────
	m.hub.On("rmhbox:leaderboard:fetch", func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Metric string `json:"metric"`
			Limit  int    `json:"limit"`
		}
		_ = e.Bind(&p)
		m.onLeaderboardFetch(c, p.Metric, p.Limit)
	})
}

// onChat sanitizes and broadcasts a user chat message (chat.ts port).
func (m *Manager) onChat(c *realtime.Conn, userID, rawContent string) {
	l := m.lobby.GetLobbyByUserID(userID)
	if l == nil {
		m.lobby.sendErr(c, "NOT_IN_LOBBY", "You are not in a lobby.")
		return
	}
	content := sanitize(rawContent, chatMaxLength)
	if content == "" {
		return
	}
	msg := ChatMessage{ID: uuid.NewString(), UserID: userID, UserName: identityName(c), Content: content, Timestamp: nowMS(), Type: "user"}
	l.mu.Lock()
	l.Chat = append(l.Chat, msg)
	if len(l.Chat) > chatHistoryLength {
		l.Chat = l.Chat[len(l.Chat)-chatHistoryLength:]
	}
	l.LastActiveAt = nowMS()
	l.mu.Unlock()
	m.lobby.broadcastAction(l.ID, "CHAT_MESSAGE", msg)
}

func (m *Manager) onLeaderboardFetch(c *realtime.Conn, metric string, limit int) {
	if metric == "" {
		metric = "score"
	}
	limit = clampInt(limit, 1, 50)
	if limit == 0 {
		limit = 20
	}
	if m.repo == nil {
		c.Send(realtime.MustEnvelope("rmhbox:leaderboard:data", map[string]any{"entries": []any{}, "total": 0, "period": "all-time", "metric": metric}))
		return
	}
	entries, err := m.repo.ReadLeaderboard(context.Background(), metric, limit)
	if err != nil {
		m.logger.Error("leaderboard_fetch_error", "error", err)
		entries = nil
	}
	c.Send(realtime.MustEnvelope("rmhbox:leaderboard:data", map[string]any{
		"entries": entries, "total": len(entries), "period": "all-time", "metric": metric,
	}))
}

// ── small handler adapters ──────────────────────────────────────────────────

func (m *Manager) lobbyOnly(fn func(uid, lobbyID string)) realtime.Handler {
	return func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID string `json:"lobbyId"`
		}
		_ = e.Bind(&p)
		fn(uid, p.LobbyID)
	}
}

func (m *Manager) hostTarget(fn func(uid, lobbyID, target string)) realtime.Handler {
	return func(c *realtime.Conn, e realtime.Envelope) {
		uid := m.requireUser(c)
		if uid == "" {
			return
		}
		var p struct {
			LobbyID      string `json:"lobbyId"`
			TargetUserID string `json:"targetUserId"`
		}
		if e.Bind(&p) != nil {
			return
		}
		fn(uid, p.LobbyID, p.TargetUserID)
	}
}

func (m *Manager) away(away bool) realtime.Handler {
	return func(c *realtime.Conn, _ realtime.Envelope) {
		if c.UserID() == "" {
			return
		}
		m.lobby.SetPlayerAway(c.UserID(), away)
	}
}

// sanitize trims, caps length, and strips control characters (utils.sanitizeString).
func sanitize(s string, max int) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r == '\n' || r == '\t' || r >= 0x20 {
			out = append(out, r)
		}
	}
	trimmed := trimSpace(string(out))
	if len(trimmed) > max {
		trimmed = trimmed[:max]
	}
	return trimmed
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
