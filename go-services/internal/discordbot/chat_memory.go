// chat_memory.go gives Alex's @mention replies a persistent memory.
//
// A /chat session is per-user and lives in discord_chat_session; @mention replies
// used to be stateless — rebuilt every time from Discord's recent-message window
// and the reply chain, so anything that scrolled out of view (or happened before
// a bot restart) was gone. This file adds a rolling per-CHANNEL transcript,
// persisted in discord_alex_channel_memory, so Alex remembers the conversation he
// was pulled into even after it ages out of the live window, and can catch up on
// surrounding chatter that wasn't aimed at him.
//
// Everything here is best-effort: with no database (local/dev) or on any error,
// load returns no memory and save is a no-op, so mentions still work — just
// statelessly, exactly as before.
package discordbot

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/config"
)

const (
	// channelMemoryMaxTurns caps how many turns are stored per channel. Older/excess
	// turns are dropped so a busy channel's row can't grow without bound.
	channelMemoryMaxTurns = 80
	// channelMemoryInjectMax caps how many remembered turns (beyond the live window)
	// are fed back into a reply, bounding the token cost of a single mention.
	channelMemoryInjectMax = 40
)

// channelMemoryTTL is how far back a channel's memory is retained. Turns older
// than this are pruned on read and write. Tunable via ALEX_MEMORY_TTL.
func channelMemoryTTL() time.Duration {
	return config.GetDuration("ALEX_MEMORY_TTL", 72*time.Hour)
}

// storedTurn is one persisted message in a channel's rolling memory. It's kept
// deliberately small (it's stored as JSON): the message id doubles as both the
// dedup key against the live window and — being a Discord snowflake — the
// timestamp used for age-based pruning (see snowflakeTime).
type storedTurn struct {
	ID      string `json:"id"`
	Name    string `json:"name,omitempty"` // author display name ("" when it's Alex)
	Content string `json:"content"`
	IsAlex  bool   `json:"alex,omitempty"` // true when this was Alex's own message
}

// chatMessage renders a stored turn as a model chat turn: Alex's own messages
// become assistant turns; everyone else's become name-prefixed user turns (the
// same shape transcriptTurn produces for live messages).
func (t storedTurn) chatMessage() ChatMessage {
	if t.IsAlex {
		return ChatMessage{Role: roleAssistant, Content: t.Content}
	}
	name := t.Name
	if name == "" {
		name = "someone"
	}
	return ChatMessage{Role: roleUser, Content: name + ": " + t.Content}
}

// messageToTurn converts a Discord message into a stored turn, or (_, false) when
// it has no readable content.
func messageToTurn(msg *discordgo.Message, botID string) (storedTurn, bool) {
	if msg == nil {
		return storedTurn{}, false
	}
	content := cleanDiscordContent(msg.Content, botID)
	if content == "" {
		return storedTurn{}, false
	}
	t := storedTurn{ID: msg.ID, Content: content}
	switch {
	case msg.Author != nil && msg.Author.ID == botID:
		t.IsAlex = true
	case msg.Author != nil && msg.Author.Username != "":
		t.Name = msg.Author.Username
	default:
		t.Name = "someone"
	}
	return t, true
}

// turnsFromMessages converts a chronologically-ordered slice of Discord messages
// into stored turns, returning the turns plus the set of ids they cover (used to
// avoid re-injecting remembered turns that are already in the live window).
func turnsFromMessages(msgs []*discordgo.Message, botID string) ([]storedTurn, map[string]bool) {
	turns := make([]storedTurn, 0, len(msgs))
	ids := make(map[string]bool, len(msgs))
	for _, msg := range msgs {
		if t, ok := messageToTurn(msg, botID); ok {
			turns = append(turns, t)
			ids[t.ID] = true
		}
	}
	return turns, ids
}

// rememberedBeyond returns the remembered turns that are NOT in the live window
// (older than it, or from before a restart), keeping the newest `max` so the
// injected history stays bounded. Input is oldest → newest; output preserves that.
func rememberedBeyond(remembered []storedTurn, liveIDs map[string]bool, max int) []storedTurn {
	older := make([]storedTurn, 0, len(remembered))
	for _, t := range remembered {
		if !liveIDs[t.ID] {
			older = append(older, t)
		}
	}
	if max >= 0 && len(older) > max {
		older = older[len(older)-max:]
	}
	return older
}

// mergeTurns folds incoming turns into the existing memory: dedup by id, drop
// anything past the retention window, order oldest → newest, and cap to the most
// recent channelMemoryMaxTurns.
func mergeTurns(existing, incoming []storedTurn) []storedTurn {
	byID := make(map[string]storedTurn, len(existing)+len(incoming))
	add := func(t storedTurn) {
		if t.ID == "" || strings.TrimSpace(t.Content) == "" {
			return
		}
		byID[t.ID] = t
	}
	for _, t := range existing {
		add(t)
	}
	for _, t := range incoming {
		add(t)
	}

	cutoff := time.Now().Add(-channelMemoryTTL())
	ids := make([]string, 0, len(byID))
	for id := range byID {
		if snowflakeTime(id).After(cutoff) {
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(a, b int) bool { return snowflakeLess(ids[a], ids[b]) })
	if len(ids) > channelMemoryMaxTurns {
		ids = ids[len(ids)-channelMemoryMaxTurns:]
	}
	out := make([]storedTurn, 0, len(ids))
	for _, id := range ids {
		out = append(out, byID[id])
	}
	return out
}

// discordEpochMs is the Discord epoch (2015-01-01T00:00:00Z) in milliseconds; a
// snowflake's high bits are the ms since this epoch.
const discordEpochMs = 1420070400000

// snowflakeTime decodes the creation time from a Discord snowflake id. Returns
// the zero time for a non-numeric id (which then sorts/prunes as "very old").
func snowflakeTime(id string) time.Time {
	n, err := strconv.ParseUint(id, 10, 64)
	if err != nil {
		return time.Time{}
	}
	return time.UnixMilli(int64(n>>22) + discordEpochMs).UTC()
}

// loadChannelMemory returns a channel's remembered turns (oldest → newest),
// pruned to the retention window. Best-effort: nil on no DB, no row, or any error.
func (s *ChatService) loadChannelMemory(ctx context.Context, channelID string) []storedTurn {
	if s.db == nil || channelID == "" {
		return nil
	}
	var raw []byte
	err := s.db.Pool.QueryRow(ctx,
		`SELECT "messages" FROM "discord_alex_channel_memory" WHERE "channelId"=$1`, channelID).Scan(&raw)
	if err != nil {
		return nil
	}
	var turns []storedTurn
	if json.Unmarshal(raw, &turns) != nil {
		return nil
	}
	cutoff := time.Now().Add(-channelMemoryTTL())
	kept := turns[:0]
	for _, t := range turns {
		if t.ID != "" && snowflakeTime(t.ID).After(cutoff) {
			kept = append(kept, t)
		}
	}
	return kept
}

// saveChannelMemory upserts a channel's memory by channelId. Best-effort (a nil
// DB is a no-op); the caller logs on error but never fails the reply.
func (s *ChatService) saveChannelMemory(ctx context.Context, channelID, guildID string, turns []storedTurn) error {
	if s.db == nil || channelID == "" || len(turns) == 0 {
		return nil
	}
	raw, err := json.Marshal(turns)
	if err != nil {
		return fmt.Errorf("marshal channel memory: %w", err)
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_channel_memory" ("channelId","guildId","messages","updatedAt")
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT ("channelId") DO UPDATE SET
		   "guildId"=EXCLUDED."guildId",
		   "messages"=EXCLUDED."messages",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		channelID, guildID, raw, time.Now().UTC())
	return err
}
