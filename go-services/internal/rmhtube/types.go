package rmhtube

import "time"

// In-memory representations, ported from server/rmhtube/types.ts. These hold the
// authoritative runtime state for a watch-party room. The DB (see repo.go) is the
// durable source of truth for the persisted subset.

// Tuning constants — ported from server/rmhtube/config.ts and
// lib/rmhtube/constants.ts. Network-tunable values are read from env in main.go.
const (
	defaultMaxMembers  = 20
	absoluteMaxMembers = 50
	maxQueueSize       = 100
	chatMaxLength      = 300
	chatHistoryLength  = 200
	playedHistoryCap   = 50
	maxInviteLinks     = 10

	syncHeartbeatInterval = 2 * time.Second
	hostStateInterval     = 1 * time.Second
	roomIdleTimeout       = 30 * time.Minute
	roomEmptyTimeout      = 5 * time.Minute
	disconnectGrace       = 120 * time.Second
	roomGCInterval        = 60 * time.Second
	typingTimeout         = 3 * time.Second
)

type member struct {
	UserID      string
	UserName    string
	AvatarURL   string // "" == null
	ConnID      string // hub connection id; "" when disconnected
	IsConnected bool
	JoinedAt    int64
	LastSeenAt  int64
	Role        string // "host" | "member"
	Status      string // "watching" | "afk" | "brb"
}

type queueItem struct {
	ID          string
	URL         string
	MediaType   string
	Title       string
	Duration    *int // null-able
	Thumbnail   string
	AddedBy     string
	AddedByName string
	AddedAt     int64
	Position    int
}

type videoState struct {
	Playing      bool
	CurrentTime  float64
	PlaybackRate float64
	UpdatedAt    int64
}

type roomSettings struct {
	IsPublic         bool
	MaxMembers       int
	AllowMemberQueue bool
	AllowMemberSkip  bool
	AutoPlay         bool
	Password         string // "" == null
	QueueVoting      bool
	AutoSortByVotes  bool
	LoopQueue        bool
	CustomReactions  []string
}

type bannedUser struct {
	UserID   string
	UserName string
	BannedAt int64
	BannedBy string
	Reason   string
}

type inviteLink struct {
	Code      string
	RoomID    string
	CreatedBy string
	ExpiresAt int64 // 0 == never
	MaxUses   int
	UseCount  int
}

type chatMessage struct {
	ID              string
	UserID          string
	UserName        string
	Content         string
	CreatedAt       int64
	ReplyToID       string
	ReplyToContent  string
	ReplyToUserName string
	Mentions        []string
	Timestamp       *float64 // shared video timestamp; null-able
}

// room is the in-memory watch-party. Every read/write goes through the owning
// RoomManager which guards it with the per-room mutex (see manager.go), so room
// itself carries no lock — the lock lives in the registry keyed by id.
type room struct {
	ID           string
	Name         string // "" == null
	HostUserID   string
	LeaderUserID string
	Settings     roomSettings
	Members      map[string]*member
	Queue        []*queueItem
	CurrentItem  *queueItem
	CurrentIndex int
	VideoState   videoState
	Chat         []*chatMessage
	SkipVotes    map[string]struct{}
	CreatedAt    int64
	LastActivity int64
	Seq          uint64

	PinnedMessage *chatMessage
	TypingTimers  map[string]*time.Timer
	ChatReactions map[string]map[string]map[string]struct{} // msgID -> emoji -> set(userId)
	QueueVotes    map[string]map[string]struct{}            // itemID -> set(userId)
	PlayedItems   []*queueItem
	BannedUsers   []*bannedUser
	InviteLinks   []*inviteLink
}
