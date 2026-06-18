// Package db — typed models for the subset of the Prisma schema that the Go
// services actually read or write. The full schema has 98 models; the Go
// fleet only owns the tables backing the extracted services (auth, realtime
// rooms, rmhbox matches, doctrine, vibe pages, discord activity). The React
// SSR tier and Better Auth continue to own everything else through Prisma.
//
// Column names and casing are taken verbatim from prisma/migrations so the SQL
// in the repositories below binds correctly against the live database.
package db

import (
	"encoding/json"
	"time"
)

// User mirrors the "user" table (Better Auth identity + platform flags).
type User struct {
	ID         string
	Name       *string
	Username   *string
	Handle     *string
	Email      *string
	Image      *string
	IsAdmin    bool
	IsVerified bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
	// Doctrine columns added by 20260322200000_add_doctrine_engine.
	DoctrineTier     string
	DoctrineTimezone string
}

// Session mirrors the "session" table written by Better Auth and validated by
// every Go service (see pkg/auth).
type Session struct {
	ID        string
	UserID    string
	Token     string
	ExpiresAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Account mirrors the "account" table — used to map a Discord OAuth identity
// to a platform user (providerId = 'discord').
type Account struct {
	ID          string
	UserID      string
	AccountID   string
	ProviderID  string
	AccessToken *string
	ExpiresAt   *time.Time
}

// DoctrinePuzzle mirrors "doctrine_puzzle" (generated daily by doctrine-worker).
type DoctrinePuzzle struct {
	ID         string
	Mode       string // DoctrinePuzzleMode enum value
	Date       time.Time
	Seed       int32
	Data       json.RawMessage
	Difficulty int16
	ResetsAt   time.Time
	IsSahur    bool
	CreatedAt  time.Time
}

// DoctrineReputation mirrors "doctrine_reputation".
type DoctrineReputation struct {
	ID             string
	UserID         string
	TotalXP        int32
	CurrentStreak  int32
	LongestStreak  int32
	LastActiveAt   time.Time
	CoalitionScore float64
	SahurCount     int32
}

// DoctrineSahurSession mirrors "doctrine_sahur_session".
type DoctrineSahurSession struct {
	ID               string
	DateKey          string
	Timezone         string
	ActivatedAt      time.Time
	DeactivatedAt    *time.Time
	ParticipantCount int32
}

// VibePage mirrors "vibe_page" (the AI page builder output the vibe-worker
// renders thumbnails for).
type VibePage struct {
	ID             string
	Slug           string
	Prompt         string
	HTML           string
	Title          *string
	Description    *string
	ThumbnailURL   *string
	ThumbnailStale bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// DiscordActivityChannel mirrors "discord_activity_channel" (recap scheduling).
type DiscordActivityChannel struct {
	ID           string
	GuildID      string
	ChannelID    string
	Activity     string
	UpdatedAt    time.Time
	RecapDateKey *string
	RecapDueAt   *time.Time
}

// DiscordDailyParticipant mirrors "discord_daily_participant".
type DiscordDailyParticipant struct {
	ID          string
	DiscordID   string
	GuildID     string
	DateKey     string
	Username    string
	Status      string
	Moves       *int32
	RatingEmoji *string
	RatingLabel *string
}

// RMHboxProfile mirrors "rmhbox_profile" (per-user aggregate game stats).
type RMHboxProfile struct {
	ID               string
	UserID           string
	TotalGamesPlayed int32
	TotalWins        int32
	TotalScore       int32
	MinigameStats    json.RawMessage
	CurrentWinStreak int32
	BestWinStreak    int32
}

// RmhTubeRoom mirrors "rmhtube_room".
type RmhTubeRoom struct {
	ID         string
	Name       *string
	HostID     string
	IsPublic   bool
	MaxMembers int32
	CreatedAt  time.Time
	UpdatedAt  time.Time
	ClosedAt   *time.Time
}

// RmhMusicRoom mirrors "rmh_music_room".
type RmhMusicRoom struct {
	ID         string
	Code       string
	Name       string
	HostID     string
	IsPublic   bool
	MaxMembers int32
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
