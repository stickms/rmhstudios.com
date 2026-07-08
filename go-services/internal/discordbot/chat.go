// chat.go is the /chat AI persona: talking to Alex, backed by the
// "discord_chat_session" table.
//
//   - The "Alex" system persona, augmented at request time with Alex's live
//     tamagotchi state (injectStatus) so his replies reflect how he's doing.
//   - buildChatEmbed packs the reply across embed fields within Discord's
//     6000-char total budget.
//   - Session persistence to discord_chat_session via raw pgx (upsert by
//     discordUserId) + an in-memory cache keyed by discord userId.
//
// A single blocking DeepSeek call renders the final embed once (no streaming).
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

// Discord embed limits.
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

// alexSystemPrompt is Alex's core personality (augmented per-request with his
// live tamagotchi state via injectStatus).
const alexSystemPrompt = `You are Alex Wu, a 21-year-old CS student at the University of Minnesota Twin Cities (UMN-TC), spending your summer as a software engineer intern at Wells Fargo.

Personality:
- Absolutely obsessed with boba — you mention it whenever you can and treat it like a personality trait
- LinkedIn is your second home; you're always posting about your internship wins, connecting with recruiters, writing thought-leader posts ironically
- You love vibe coding — building stuff by vibing, no overplanning, just shipping
- You talk naturally in AAVE with a blaccent. Organically use phrases like "no cap", "fr fr", "lowkey", "on god", "finna", "sheesh", "bet", "bussin", "it's giving", "deadass", "real talk", "ima", "tryna", "slay", "no shot", "that slaps", "bro what" — woven in naturally, not forced
- You gas people up, you're hype and positive
- Self-aware about being a tech bro intern but fully embrace it

Keep replies conversational, punchy, and real. Don't over-explain. Sound like you'd text this, not write it.`

// chatSession is one user's in-memory /chat conversation.
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

	// pet, when set, lets /chat reflect Alex's live tamagotchi state in his
	// replies and record chat activity (last channel + caretaker credit). Optional
	// so ChatService stays usable without the pet system.
	pet *PetService

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

	// Inject Alex's live tamagotchi state (ephemerally — not persisted into the
	// stored history) so his reply reflects how he's actually doing right now.
	sendMessages := session.history
	if s.pet != nil && i.GuildID != "" {
		if statusLine := s.pet.StatusLineForChat(ctx, i.GuildID); statusLine != "" {
			sendMessages = injectStatus(session.history, statusLine)
		}
	}

	reply, err := s.deepseek.Chat(ctx, sendMessages)
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

	// Record the chat as caretaking: stamps the last channel used (so Alex's care
	// loop knows where to talk), credits the caretaker, and cheers Alex up a touch.
	if s.pet != nil {
		s.pet.RecordChat(ctx, i.GuildID, i.ChannelID, userID, username, interactionAvatar(i))
	}
	return nil
}

// ─── Mention / reply handling ──────────────────────────────────────────────

// mentionContextSize is how many recent channel messages to pull in for context.
const mentionContextSize = 8

// HandleMention replies when Alex is @mentioned or replied to, using recent
// channel context so the reply is coherent. Best-effort and throttled per channel;
// stays silent if DeepSeek isn't configured.
func (s *ChatService) HandleMention(ctx context.Context, sess *discordgo.Session, m *discordgo.MessageCreate, botID string) error {
	if s.deepseek == nil || !s.deepseek.configured() {
		return nil
	}
	// Throttle per channel to avoid spam and any back-and-forth loops.
	if s.pet != nil && s.pet.onCooldown(m.ChannelID, "mention", 4*time.Second, time.Now().UTC()) {
		return nil
	}

	_ = sess.ChannelTyping(m.ChannelID) // "Alex is typing…"

	// Build the model conversation: persona + live state, then the recent channel
	// transcript (older → newer), ending with the message that pinged him.
	system := alexSystemPrompt
	if s.pet != nil {
		system += s.pet.StatusLineForChat(ctx, m.GuildID)
	}
	system += "\n\nYou're in a Discord channel and someone just mentioned or replied to you. " +
		"Reply naturally and briefly (usually 1–2 sentences) to the most recent message, using the conversation " +
		"context above. Don't prefix your reply with your name and don't use markdown headers."

	msgs := []ChatMessage{{Role: roleSystem, Content: system}}
	msgs = append(msgs, mentionTranscript(sess, m, botID)...)

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	reply, err := s.deepseek.Chat(reqCtx, msgs)
	if err != nil {
		return err
	}
	if reply = boundMessage(reply); reply == "" {
		return nil
	}

	if _, err := sess.ChannelMessageSendReply(m.ChannelID, reply, m.Reference()); err != nil {
		return err
	}
	// Remember the channel (so the care loop talks here too) and cheer Alex up a
	// touch — but no leaderboard credit, so mentions can't be farmed for points.
	if s.pet != nil {
		s.pet.NoteMentioned(reqCtx, m.GuildID, m.ChannelID)
	}
	return nil
}

// mentionTranscript builds the chat-message context for a mention: the recent
// channel history (best-effort) followed by the triggering message. Alex's own
// messages become assistant turns; everyone else's become user turns prefixed
// with their name.
func mentionTranscript(sess *discordgo.Session, m *discordgo.MessageCreate, botID string) []ChatMessage {
	var out []ChatMessage

	// Recent messages before this one, oldest → newest.
	if history, err := sess.ChannelMessages(m.ChannelID, mentionContextSize, m.ID, "", ""); err == nil {
		for i := len(history) - 1; i >= 0; i-- {
			out = append(out, transcriptTurn(history[i], botID)...)
		}
	}
	// The message that mentioned Alex.
	out = append(out, transcriptTurn(m.Message, botID)...)

	if len(out) == 0 {
		// Nothing readable (e.g. no message content) — still prompt for a reply.
		out = append(out, ChatMessage{Role: roleUser, Content: "(someone pinged you) say hi!"})
	}
	return out
}

// transcriptTurn converts one Discord message into a chat turn, or nothing when
// it has no readable content.
func transcriptTurn(msg *discordgo.Message, botID string) []ChatMessage {
	if msg == nil {
		return nil
	}
	content := cleanDiscordContent(msg.Content, botID)
	if content == "" {
		return nil
	}
	if msg.Author != nil && msg.Author.ID == botID {
		return []ChatMessage{{Role: roleAssistant, Content: content}}
	}
	name := "someone"
	if msg.Author != nil && msg.Author.Username != "" {
		name = msg.Author.Username
	}
	return []ChatMessage{{Role: roleUser, Content: name + ": " + content}}
}

// cleanDiscordContent turns the bot's mention token into "Alex" and trims.
func cleanDiscordContent(content, botID string) string {
	content = strings.ReplaceAll(content, "<@"+botID+">", "Alex")
	content = strings.ReplaceAll(content, "<@!"+botID+">", "Alex")
	return strings.TrimSpace(content)
}

// injectStatus returns a copy of history with an ephemeral system message
// carrying Alex's live state inserted right after the base persona prompt. The
// original slice (the persisted history) is left untouched.
func injectStatus(history []ChatMessage, statusLine string) []ChatMessage {
	if len(history) == 0 {
		return history
	}
	out := make([]ChatMessage, 0, len(history)+1)
	out = append(out, history[0]) // base persona system prompt
	out = append(out, ChatMessage{Role: roleSystem, Content: statusLine})
	out = append(out, history[1:]...)
	return out
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
