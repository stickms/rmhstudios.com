package rmhmusic

import "sync"

// Server-side room model, ported from server/rmhmusic/types.ts. All of this is
// in-memory (only the room row itself is persisted — see repo.go); members,
// queue, playback and chat are ephemeral, exactly as in the Node service.

// ServerRoom is the authoritative in-memory state for one room. It is guarded by
// its own mutex (mu); the RoomManager never mutates a room's fields without
// holding it. The room's id doubles as the realtime hub room id so hub.Join /
// hub.Broadcast operate on the same logical group.
type ServerRoom struct {
	mu sync.Mutex

	ID         string
	Code       string
	Name       string
	HostUserID string
	IsPublic   bool
	Password   string // "" == no password
	MaxMembers int

	Members      map[string]*ServerMember // userId -> member
	memberOrder  []string                 // insertion order, for host reassignment
	Queue        []*ServerQueueItem
	CurrentTrack *TrackInfo
	Playback     Playback
	Chat         []ChatMessage // bounded ring (kept to chatHistoryLength)

	// Seq is the room's monotonic mutation counter. It is incremented under
	// mu in broadcastAction and reported in snapshots (faithful to the Node
	// `room.seq++` ordering used by the snapshot+delta protocol).
	Seq uint64

	CreatedAt      int64
	LastActivityAt int64
}

// ServerMember is one participant in a room.
type ServerMember struct {
	UserID         string
	UserName       string
	AvatarURL      string // "" == null
	ConnID         string // current hub connection id (analog of socketId)
	IsConnected    bool
	JoinedAt       int64
	DisconnectedAt int64 // 0 == null
}

// ServerQueueItem is a queued track with its position.
type ServerQueueItem struct {
	ID          string `json:"id"`
	SpotifyURI  string `json:"spotifyUri"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	AlbumArt    string `json:"albumArt"`
	DurationMs  int64  `json:"durationMs"`
	PreviewURL  string `json:"previewUrl"`
	AddedByID   string `json:"addedBy"`
	AddedByName string `json:"addedByName"`
	Position    int    `json:"position"`
	AddedAt     int64  `json:"addedAt"`
}

// TrackInfo mirrors lib/rmhmusic/types.ts TrackInfo.
type TrackInfo struct {
	SpotifyURI string `json:"spotifyUri"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	AlbumArt   string `json:"albumArt"`
	DurationMs int64  `json:"durationMs"`
	PreviewURL string `json:"previewUrl"`
}

// Playback is the ephemeral playback head. positionMs/updatedAt are the basis
// for the drift-corrected projection: projected = positionMs + (now-updatedAt).
type Playback struct {
	TrackURI   string `json:"trackUri"`
	PositionMs int64  `json:"positionMs"`
	IsPlaying  bool   `json:"isPlaying"`
	UpdatedAt  int64  `json:"updatedAt"`
}

// ChatMessage mirrors lib/rmhmusic/types.ts ChatMessage.
type ChatMessage struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"createdAt"`
}

// projectedPositionMs returns the drift-corrected playback position: when the
// room is playing, the stored position advanced by the time elapsed since it was
// last updated. This is the heartbeat correction from sync-engine.ts:
//
//	positionMs: room.playback.positionMs + (Date.now() - room.playback.updatedAt)
func projectedPositionMs(p Playback, nowMs int64) int64 {
	if !p.IsPlaying {
		return p.PositionMs
	}
	return p.PositionMs + (nowMs - p.UpdatedAt)
}
