// Package rmhbox is the Go port of the Node "server/rmhbox" Jackbox-style
// party-game platform. It runs on top of the shared realtime.Hub instead of
// Socket.IO. One Manager wires together the LobbyManager (lobby CRUD, host
// controls, GC), the GameCoordinator (the per-lobby minigame lifecycle FSM and
// state-sync), the chat handler, the minigame framework + registry, and the
// persistence Repo.
//
// Faithful-port notes vs. the TypeScript source:
//   - Socket.IO "rooms" (lobby:{id}, :players, :spectators, :player:{userId})
//     are modelled as logical member sets on the Lobby. We broadcast through the
//     hub's single "rmhbox:{id}" room and filter per-recipient where the Node
//     code targeted a sub-room. Sequenced GAME_ACTION mutations go through
//     hub.BroadcastSeq so seq numbering matches the legacy delta protocol.
//   - Every minigame handler call is wrapped in recover() for fault isolation,
//     porting the try/catch-around-every-handler discipline.
package rmhbox

import (
	"sync"
	"time"
)

// ─── Lobby FSM states (core.md §6/§7) ────────────────────────────────────────

// LobbyState is the lobby's lifecycle phase. The forward path the coordinator
// drives is:
//
//	WAITING -> GAME_SETTINGS -> INSTRUCTIONS -> PRELOADING -> COUNTDOWN
//	  -> PLAYING -> ROUND_RESULTS -> WAITING
//
// VOTING, SESSION_RESULTS and DISBANDED are terminal/branch states.
type LobbyState string

const (
	StateWaiting        LobbyState = "WAITING"
	StateGameSettings   LobbyState = "GAME_SETTINGS"
	StateVoting         LobbyState = "VOTING"
	StateInstructions   LobbyState = "INSTRUCTIONS"
	StatePreloading     LobbyState = "PRELOADING"
	StateCountdown      LobbyState = "COUNTDOWN"
	StatePlaying        LobbyState = "PLAYING"
	StateRoundResults   LobbyState = "ROUND_RESULTS"
	StateSessionResults LobbyState = "SESSION_RESULTS"
	StateDisbanded      LobbyState = "DISBANDED"
)

// ─── Tunables (config.ts / constants.ts) ─────────────────────────────────────

const (
	defaultMaxPlayers    = 8
	absoluteMaxPlayers   = 16
	defaultMaxSpectators = 20
	maxSpectators        = 50
	chatMaxLength        = 200
	chatHistoryLength    = 100

	heartbeatInterval     = 10 * time.Second
	disconnectGracePeriod = 120 * time.Second
	gameDisconnectGrace   = 15 * time.Second
	lobbyGCInterval       = 60 * time.Second
	lobbyIdleTimeout      = 15 * time.Minute
	lobbyAbsoluteTimeout  = 30 * time.Minute
	lobbyEmptyTimeout     = 2 * time.Minute

	countdownSeconds          = 3
	defaultInstructionSeconds = 15
	preloadTimeout            = 30 * time.Second
	gameSettingsPostVoteTO    = 30 // seconds
	sessionResultsDisbandMS   = 15 * time.Second

	maxCodeAttempts = 10
)

// ─── Settings ────────────────────────────────────────────────────────────────

// LobbySettings mirrors the Node LobbySettings shape. nil pointers represent
// the TS `null` for the optional numeric overrides.
type LobbySettings struct {
	IsPublic                bool `json:"isPublic"`
	MaxPlayers              int  `json:"maxPlayers"`
	MaxSpectators           int  `json:"maxSpectators"`
	AllowMidGameJoin        bool `json:"allowMidGameJoin"`
	AllowSpectatorPromotion bool `json:"allowSpectatorPromotion"`
	AutoStartThreshold      *int `json:"autoStartThreshold"`
	GameDurationOverride    *int `json:"gameDurationOverride"`
}

func defaultSettings() LobbySettings {
	return LobbySettings{
		IsPublic:                false,
		MaxPlayers:              defaultMaxPlayers,
		MaxSpectators:           defaultMaxSpectators,
		AllowMidGameJoin:        true,
		AllowSpectatorPromotion: true,
	}
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// ─── Player / Spectator ──────────────────────────────────────────────────────

// Player is an active participant. socketId in the Node code maps onto ConnID
// here (the realtime.Conn.ID). A nil/"" ConnID means disconnected.
type Player struct {
	UserID      string `json:"userId"`
	UserName    string `json:"userName"`
	AvatarURL   string `json:"avatarUrl"`
	ConnID      string `json:"-"`
	IsConnected bool   `json:"isConnected"`
	IsReady     bool   `json:"isReady"`
	IsAway      bool   `json:"isAway"`
	Score       int    `json:"score"`
	RoundScore  int    `json:"roundScore"`
	JoinedAt    int64  `json:"-"`
	LastSeenAt  int64  `json:"-"`
}

// Spectator is a non-participating observer. Spectators have no grace period.
type Spectator struct {
	UserID      string `json:"userId"`
	UserName    string `json:"userName"`
	AvatarURL   string `json:"avatarUrl"`
	ConnID      string `json:"-"`
	IsConnected bool   `json:"isConnected"`
	JoinedAt    int64  `json:"-"`
}

// ─── Chat ────────────────────────────────────────────────────────────────────

// ChatMessage is one entry in a lobby's ring-buffered chat history.
type ChatMessage struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"` // "user" | "system"
}

// ─── Match history (server-internal) ─────────────────────────────────────────

// Standing is a single ranking row stored in match history.
type Standing struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	Score    int    `json:"score"`
	Rank     int    `json:"rank"`
}

// ServerMatchSummary is the server-internal record of one completed game.
type ServerMatchSummary struct {
	MinigameID  string     `json:"minigameId"`
	RoundNumber int        `json:"roundNumber"`
	StartedAt   int64      `json:"startedAt"`
	EndedAt     int64      `json:"endedAt"`
	Standings   []Standing `json:"standings"`
}

// ─── Active game ─────────────────────────────────────────────────────────────

// ActiveGame holds the running minigame instance and metadata. handler is nil
// during the pre-game phases (INSTRUCTIONS/PRELOADING/COUNTDOWN), matching the
// Node code where currentGame.handler is set only at PLAYING start.
type ActiveGame struct {
	MinigameID string
	Handler    Minigame
	StartedAt  int64
}

// ─── Lobby ───────────────────────────────────────────────────────────────────

// SelectedGame is the host's pick before the game starts. "__vote__" = vote mode.
type SelectedGame struct {
	MinigameID  string `json:"minigameId"`
	DisplayName string `json:"displayName"`
}

// Lobby is the full server-side lobby state. All access is guarded by mu — the
// per-lobby mutex required by the spec. Many goroutines (timers, the GC, every
// connection's read pump) touch a Lobby concurrently, so callers must hold mu.
type Lobby struct {
	mu sync.Mutex

	ID           string
	HostUserID   string
	Settings     LobbySettings
	Players      map[string]*Player
	Spectators   map[string]*Spectator
	State        LobbyState
	Chat         []ChatMessage
	CreatedAt    int64
	LastActiveAt int64

	CurrentGame  *ActiveGame
	SelectedGame *SelectedGame
	MatchHistory []ServerMatchSummary
	RoundNumber  int

	PendingGameSettings  map[string]any
	ResolvedGameSettings map[string]any
	DiscordChannelKey    string
}

func nowMS() int64         { return time.Now().UnixMilli() }
func nowMSTime() time.Time { return time.Now() }
