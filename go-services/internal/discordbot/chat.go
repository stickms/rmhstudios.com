// chat.go is the FAITHFUL port of server/discord-bot/chat-handler.ts +
// conversation persistence against the "discord_chat_session" table.
//
// What's faithful here:
//   - The "Alex Wu" system persona (verbatim).
//   - buildChatEmbed's 6000-char-budget field-packing logic (ported 1:1).
//   - Session persistence to discord_chat_session via raw pgx (upsert by
//     discordUserId) + an in-memory cache keyed by discord userId.
//
// Intentional simplification vs TS: the TS handler streamed tokens and threw
// throttled live embed edits at Discord. We make a single blocking DeepSeek
// call and render the final embed once. The packing logic — the part the task
// asked to preserve — is identical.
package discordbot

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Discord embed limits — see chat-handler.ts.
const (
	fieldValueMax = 1024
	titleMax      = 256
	footerMax     = 2048
	maxFields     = 25
	embedTotalMax = 6000
)

const (
	embedTitle            = "Alex Wu 💬"
	youFieldName          = "💬 You"
	alexFieldName         = "🤙 Alex"
	continuationFieldName = "​" // zero-width space
	chatEmbedColor        = 0xa855f7
	chatErrEmbedColor     = 0xef4444
)

// alexSystemPrompt is copied verbatim from chat-handler.ts.
const alexSystemPrompt = `You are Alex Wu, a 21-year-old CS student at the University of Minnesota Twin Cities (UMN-TC), spending your summer as a software engineer intern at Wells Fargo.

Personality:
- Absolutely obsessed with boba — you mention it whenever you can and treat it like a personality trait
- LinkedIn is your second home; you're always posting about your internship wins, connecting with recruiters, writing thought-leader posts ironically
- You love vibe coding — building stuff by vibing, no overplanning, just shipping
- You talk naturally in AAVE with a blaccent. Organically use phrases like "no cap", "fr fr", "lowkey", "on god", "finna", "sheesh", "bet", "bussin", "it's giving", "deadass", "real talk", "ima", "tryna", "slay", "no shot", "that slaps", "bro what" — woven in naturally, not forced
- You gas people up, you're hype and positive
- Self-aware about being a tech bro intern but fully embrace it

Keep replies conversational, punchy, and real. Don't over-explain. Sound like you'd text this, not write it.`

// chatSession mirrors the TS ChatSession.
type chatSession struct {
	userID        string
	username      string
	history       []ChatMessage
	lastMessageID string
}

// ChatService owns the /chat persona: the DeepSeek client, the DB-backed
// session store, and the in-memory cache.
type ChatService struct {
	deepseek *DeepSeekClient
	db       *db.DB
	logger   *log.Logger

	mu    sync.Mutex
	cache map[string]*chatSession // keyed by discord userId
}

// NewChatService wires the /chat handler.
func NewChatService(deepseek *DeepSeekClient, database *db.DB, logger *log.Logger) *ChatService {
	return &ChatService{
		deepseek: deepseek,
		db:       database,
		logger:   logger,
		cache:    make(map[string]*chatSession),
	}
}

// embedField is a small helper struct so the packing logic reads like the TS.
type embedField struct {
	Name   string
	Value  string
	Inline bool
}

// truncate cuts text to at most max chars, appending an ellipsis on overflow.
// Ported from chat-handler.ts truncate(). Operates on runes so multi-byte
// characters (the emoji-heavy persona) are never split mid-rune.
func truncate(text string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(text)
	if len(r) <= max {
		return text
	}
	if max <= 1 {
		return string(r[:max])
	}
	return string(r[:max-1]) + "…"
}

// buildChatEmbed renders the "You / Alex" conversation embed, packing the reply
// across as many fields as fit within Discord's embed limits. This is a 1:1 port
// of chat-handler.ts buildChatEmbed (always non-streaming here).
//
// Lengths are measured in runes (matching JS string .length semantics closely
// enough for budgeting; both count the emoji field names consistently).
func buildChatEmbed(message, username, replyText string) *discordgo.MessageEmbed {
	title := truncateHard(embedTitle, titleMax)
	footer := truncateHard(username, footerMax)

	// Running budget against Discord's 6000-char total across the whole embed.
	budget := embedTotalMax - runeLen(title) - runeLen(footer)

	var fields []embedField

	// The user's prompt, echoed back, gets first claim on the budget.
	youValue := truncate(message, min(fieldValueMax, budget-runeLen(youFieldName)))
	if runeLen(youValue) > 0 {
		fields = append(fields, embedField{Name: youFieldName, Value: youValue})
		budget -= runeLen(youFieldName) + runeLen(youValue)
	}

	// Split the reply across as many fields as fit within the field-count and
	// total-character caps; cut it off (with an ellipsis) when we run out.
	remaining := []rune(replyText)
	if len(remaining) == 0 {
		remaining = []rune("(no response)")
	}
	replyFieldCount := 0
	truncated := false
	for len(remaining) > 0 {
		if len(fields) >= maxFields {
			truncated = true
			break
		}
		name := alexFieldName
		if replyFieldCount > 0 {
			name = continuationFieldName
		}
		valueBudget := min(fieldValueMax, budget-runeLen(name))
		if valueBudget <= 0 {
			truncated = true
			break
		}
		take := valueBudget
		if take > len(remaining) {
			take = len(remaining)
		}
		value := string(remaining[:take])
		fields = append(fields, embedField{Name: name, Value: value})
		budget -= runeLen(name) + runeLen(value)
		remaining = remaining[take:]
		replyFieldCount++
	}

	// If we couldn't fit everything, mark the last field so it's obvious.
	if truncated && len(fields) > 0 {
		last := &fields[len(fields)-1]
		lr := []rune(last.Value)
		if len(lr) > 0 {
			lr = lr[:len(lr)-1]
		}
		last.Value = string(lr) + "…"
	}

	out := make([]*discordgo.MessageEmbedField, 0, len(fields))
	for _, f := range fields {
		out = append(out, &discordgo.MessageEmbedField{Name: f.Name, Value: f.Value, Inline: f.Inline})
	}

	return &discordgo.MessageEmbed{
		Color:  chatEmbedColor,
		Title:  title,
		Fields: out,
		Footer: &discordgo.MessageEmbedFooter{Text: footer},
	}
}

// runeLen counts characters (runes) — the unit the budget arithmetic uses.
func runeLen(s string) int { return len([]rune(s)) }

// truncateHard is JS String.slice(0, max): hard cut, no ellipsis.
func truncateHard(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// HandleChat is the entrypoint for both the /chat command and the chat_continue
// modal. isNew resets the conversation to just the system persona.
func (s *ChatService) HandleChat(ctx context.Context, sess *discordgo.Session, i *discordgo.InteractionCreate, message string, isNew bool) error {
	userID, username := interactionUser(i)

	var session *chatSession
	if isNew {
		session = &chatSession{
			userID:   userID,
			username: username,
			history:  []ChatMessage{{Role: roleSystem, Content: alexSystemPrompt}},
		}
		s.setCached(session)
	} else {
		var err error
		session, err = s.loadSession(ctx, userID, username)
		if err != nil {
			return err
		}
	}

	session.history = append(session.history, ChatMessage{Role: roleUser, Content: message})

	// Defer the reply — model calls can take several seconds.
	if err := sess.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		return fmt.Errorf("defer reply: %w", err)
	}

	reply, err := s.deepseek.Chat(ctx, session.history)
	if err != nil {
		s.logger.Error("chat deepseek", "userId", userID, "error", err)
		embed := &discordgo.MessageEmbed{
			Color:       chatErrEmbedColor,
			Title:       "❌ bruh something broke no cap",
			Description: truncateHard(err.Error(), 3900),
			Footer:      &discordgo.MessageEmbedFooter{Text: username},
		}
		_, editErr := sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
			Embeds: &[]*discordgo.MessageEmbed{embed},
		})
		return editErr
	}

	finalReply := strings.TrimSpace(reply)
	if finalReply == "" {
		finalReply = "(no response)"
	}
	session.history = append(session.history, ChatMessage{Role: roleAssistant, Content: finalReply})

	embed := buildChatEmbed(message, username, finalReply)
	components := []discordgo.MessageComponent{
		discordgo.ActionsRow{Components: []discordgo.MessageComponent{
			discordgo.Button{
				CustomID: "chat_continue:" + userID,
				Label:    "Keep talking",
				Style:    discordgo.SecondaryButton,
				Emoji:    &discordgo.ComponentEmoji{Name: "💬"},
			},
		}},
	}

	edited, err := sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
		Embeds:     &[]*discordgo.MessageEmbed{embed},
		Components: &components,
	})
	if err != nil {
		return fmt.Errorf("edit reply: %w", err)
	}
	if edited != nil {
		session.lastMessageID = edited.ID
	}

	if err := s.saveSession(ctx, session); err != nil {
		// Persistence is best-effort (matches the TS .catch(() => {})).
		s.logger.Warn("chat save session", "userId", userID, "error", err)
	}
	return nil
}

// ─── Session store (in-memory cache + discord_chat_session table) ──────────

func (s *ChatService) getCached(userID string) (*chatSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cache[userID]
	return c, ok
}

func (s *ChatService) setCached(session *chatSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[session.userID] = session
}

// loadSession returns the cached session, falling back to the DB, falling back
// to a fresh session seeded with the persona. Mirrors chat-handler.ts loadSession.
func (s *ChatService) loadSession(ctx context.Context, userID, username string) (*chatSession, error) {
	if c, ok := s.getCached(userID); ok {
		return c, nil
	}

	session := &chatSession{
		userID:   userID,
		username: username,
		history:  []ChatMessage{{Role: roleSystem, Content: alexSystemPrompt}},
	}

	if s.db != nil {
		var historyJSON []byte
		var lastMessageID *string
		// Columns from migration 20260612000000_add_discord_chat_session:
		// discordUserId, username, history (JSONB), lastMessageId, updatedAt.
		row := s.db.Pool.QueryRow(ctx,
			`SELECT "history", "lastMessageId" FROM "discord_chat_session" WHERE "discordUserId"=$1`,
			userID)
		if err := row.Scan(&historyJSON, &lastMessageID); err == nil {
			var hist []ChatMessage
			if jsonErr := json.Unmarshal(historyJSON, &hist); jsonErr == nil && len(hist) > 0 {
				session.history = hist
			}
			if lastMessageID != nil {
				session.lastMessageID = *lastMessageID
			}
		}
		// On any error (incl. no rows) we keep the fresh persona-seeded session,
		// matching the TS .catch(() => null) behaviour.
	}

	s.setCached(session)
	return session, nil
}

// saveSession upserts the session by discordUserId. Raw pgx, ON CONFLICT.
func (s *ChatService) saveSession(ctx context.Context, session *chatSession) error {
	if s.db == nil {
		return nil
	}
	historyJSON, err := json.Marshal(session.history)
	if err != nil {
		return fmt.Errorf("marshal history: %w", err)
	}
	var lastMessageID *string
	if session.lastMessageID != "" {
		lastMessageID = &session.lastMessageID
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO "discord_chat_session" ("discordUserId", "username", "history", "lastMessageId", "updatedAt")
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT ("discordUserId") DO UPDATE SET
		   "username" = EXCLUDED."username",
		   "history" = EXCLUDED."history",
		   "lastMessageId" = EXCLUDED."lastMessageId",
		   "updatedAt" = EXCLUDED."updatedAt"`,
		session.userID, session.username, historyJSON, lastMessageID, time.Now().UTC())
	return err
}
