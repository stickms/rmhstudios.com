// bot.go is the Go port of server/discord-bot/index.ts: the gateway bootstrap.
// It opens a discordgo session (Guilds intent), bulk-registers the slash
// commands on ready (guild-scoped if DISCORD_DEV_GUILD_ID is set, else global,
// preserving Entry Point commands), routes interactions (slash commands +
// buttons + modals) with owner-gating, and shuts down gracefully.
package discordbot

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// interactionTimeout bounds a single interaction's work (the agent loop /
// DeepSeek calls). It is generous because the rmhbot agent loop can run many
// tool rounds, but it guarantees the per-interaction context is eventually
// cancelled even if the gateway connection lingers.
const interactionTimeout = 10 * time.Minute

// Config holds the bot's runtime configuration (resolved from env by main()).
type Config struct {
	Token        string // DISCORD_BOT_TOKEN || DISCORD_ACTIVITY_BOT_TOKEN
	DevGuildID   string // DISCORD_DEV_GUILD_ID (empty => global registration)
	OwnerID      string // OWNER_ID — gates button/modal interactions
	DeepSeekKey  string // DEEPSEEK_API_KEY
	DeepSeekMod  string // DEEPSEEK_MODEL (default "deepseek-chat")
	WorktreesDir string // RMHBOT_WORKTREES_DIR
	GithubToken  string // GITHUB_TOKEN
}

// Bot is the long-running gateway bot.
type Bot struct {
	cfg     Config
	logger  *log.Logger
	session *discordgo.Session
	chat    *ChatService
	rmhbot  *RmhbotService

	// lifecycleCtx is set when Run starts; per-interaction contexts are derived
	// from it (with interactionTimeout) so in-flight agent loops / DeepSeek calls
	// are bounded and cancelled on shutdown rather than detached via
	// context.Background(). ctxMu guards the read/write across goroutines.
	ctxMu        sync.RWMutex
	lifecycleCtx context.Context
}

// slashCommands defines the bot's slash commands. Mirrors the SlashCommandBuilder
// definitions in commands/*.ts.
func slashCommands() []*discordgo.ApplicationCommand {
	return []*discordgo.ApplicationCommand{
		{
			Name:        "chat",
			Description: "Chat with Alex Wu 💬",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "message",
					Description: "What do you wanna say?", Required: true},
			},
		},
		{
			Name:        "rmhbot",
			Description: "Request a website change via AI",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "request",
					Description: "What to change on the website", Required: true},
				// NOTE: the TS command also took an attachment option; attachment
				// ingestion is not ported (see rmhbot.go header), so it is omitted.
			},
		},
		{
			Name:        "rmhbot-continue",
			Description: "Continue editing on your active RMHBot branch",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "request",
					Description: "Follow-up change or refinement", Required: true},
			},
		},
		{
			Name:        "rmhbot-push",
			Description: "Open a GitHub PR from your active RMHBot branch",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "title",
					Description: "PR title (defaults to last commit message)", Required: false},
			},
		},
	}
}

// New builds the bot from its already-constructed services.
func New(cfg Config, chat *ChatService, rmhbot *RmhbotService, logger *log.Logger) (*Bot, error) {
	if cfg.Token == "" {
		return nil, fmt.Errorf("discord bot token is required")
	}
	session, err := discordgo.New("Bot " + cfg.Token)
	if err != nil {
		return nil, fmt.Errorf("create discord session: %w", err)
	}
	session.Identify.Intents = discordgo.IntentsGuilds

	b := &Bot{cfg: cfg, logger: logger, session: session, chat: chat, rmhbot: rmhbot}
	session.AddHandler(b.onReady)
	session.AddHandler(b.onInteraction)
	return b, nil
}

// Run opens the gateway session and blocks until ctx is cancelled, then closes
// the session cleanly. Driven by the discordgo session lifecycle (the FOUNDATION
// "worker" shape: open, register on ready, block on signal, close).
func (b *Bot) Run(ctx context.Context) error {
	// Record the lifecycle context so onInteraction can derive bounded,
	// shutdown-aware per-interaction contexts from it.
	b.ctxMu.Lock()
	b.lifecycleCtx = ctx
	b.ctxMu.Unlock()

	if err := b.session.Open(); err != nil {
		return fmt.Errorf("open gateway: %w", err)
	}
	b.logger.Info("discord gateway opened")

	<-ctx.Done()

	b.logger.Info("shutdown_start")
	if err := b.session.Close(); err != nil {
		b.logger.Warn("session close", "error", err)
	}
	b.logger.Info("shutdown_complete")
	return nil
}

// onReady bulk-registers slash commands (index.ts registerCommands).
func (b *Bot) onReady(s *discordgo.Session, r *discordgo.Ready) {
	b.logger.Info("bot_ready", "user", r.User.String(), "guilds", len(r.Guilds))

	guildID := b.cfg.DevGuildID // "" => global
	desired := slashCommands()

	// Fetch existing commands so we can preserve Entry Point commands (type 4),
	// which a bulk overwrite cannot remove (Discord error 50240).
	existing, err := s.ApplicationCommands(s.State.User.ID, guildID)
	if err != nil {
		b.logger.Error("fetch existing commands", "error", err)
	} else {
		for _, c := range existing {
			if int(c.Type) == 4 { // Entry Point command (PrimaryEntryPoint)
				desired = append(desired, c)
			}
		}
	}

	scope := "global"
	if guildID != "" {
		scope = "guild"
	}
	if _, err := s.ApplicationCommandBulkOverwrite(s.State.User.ID, guildID, desired); err != nil {
		b.logger.Error("command_registration_failed", "error", err)
		return
	}
	b.logger.Info("commands_registered", "scope", scope, "guildId", guildID)
}

// onInteraction routes slash commands, buttons, and modal submits. Each
// interaction runs under a context derived from the bot's lifecycle context with
// a per-interaction timeout, so the agent loop / DeepSeek calls are bounded and
// cancelled when the bot shuts down (instead of detached via context.Background).
func (b *Bot) onInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	b.ctxMu.RLock()
	parent := b.lifecycleCtx
	b.ctxMu.RUnlock()
	if parent == nil {
		// Handlers can fire before Run records the lifecycle ctx; fall back to a
		// background parent so the interaction still has a valid, bounded context.
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, interactionTimeout)
	defer cancel()
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		b.routeCommand(ctx, s, i)
	case discordgo.InteractionMessageComponent:
		b.routeComponent(ctx, s, i)
	case discordgo.InteractionModalSubmit:
		b.routeModal(ctx, s, i)
	}
}

func (b *Bot) routeCommand(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.ApplicationCommandData()
	opts := newOptionMap(data.Options)
	userID, _ := interactionUser(i)

	b.logger.Info("command_received", "command", data.Name, "userId", userID, "guildId", i.GuildID)

	var err error
	switch data.Name {
	case "chat":
		err = b.chat.HandleChat(ctx, s, i, opts.str("message"), true)
	case "rmhbot":
		err = b.rmhbot.HandleRmhbotCommand(ctx, s, i, opts.str("request"), true)
	case "rmhbot-continue":
		err = b.rmhbot.HandleRmhbotCommand(ctx, s, i, opts.str("request"), false)
	case "rmhbot-push":
		err = b.rmhbot.HandlePush(ctx, s, i, opts.str("title"))
	default:
		b.logger.Warn("unknown_command", "name", data.Name)
		return
	}
	if err != nil {
		b.logger.Error("command_error", "command", data.Name, "error", err)
	}
}

// routeComponent handles button presses: rmhbot_continue, rmhbot_push,
// chat_continue. customID format is "action:ownerId" — owner-gated.
func (b *Bot) routeComponent(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) {
	action, ownerID := splitCustomID(i.MessageComponentData().CustomID)
	userID, _ := interactionUser(i)

	switch action {
	case "rmhbot_continue":
		if !b.ownerOK(s, i, userID, ownerID, "This session belongs to another user.") {
			return
		}
		_ = showModal(s, i, "rmhbot_continue_modal:"+ownerID, "Continue Editing",
			"request", "What would you like to change next?")
	case "rmhbot_push":
		if !b.ownerOK(s, i, userID, ownerID, "This session belongs to another user.") {
			return
		}
		if err := b.rmhbot.HandlePush(ctx, s, i, ""); err != nil {
			b.logger.Error("button_error", "customId", action, "error", err)
		}
	case "chat_continue":
		if !b.ownerOK(s, i, userID, ownerID, "This chat belongs to another user — run `/chat` to start your own 💬") {
			return
		}
		_ = showModal(s, i, "chat_continue_modal:"+ownerID, "Keep talking with Alex 💬",
			"message", "What do you wanna say?")
	}
}

// routeModal handles modal submits: rmhbot_continue_modal, chat_continue_modal.
func (b *Bot) routeModal(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) {
	action, ownerID := splitCustomID(i.ModalSubmitData().CustomID)
	userID, _ := interactionUser(i)

	switch action {
	case "rmhbot_continue_modal":
		if !b.ownerOK(s, i, userID, ownerID, "This session belongs to another user.") {
			return
		}
		request := modalValue(i, "request")
		if err := b.rmhbot.HandleRmhbotCommand(ctx, s, i, request, false); err != nil {
			b.logger.Error("modal_error", "customId", action, "error", err)
		}
	case "chat_continue_modal":
		if !b.ownerOK(s, i, userID, ownerID, "This chat belongs to another user — run `/chat` to start your own 💬") {
			return
		}
		message := modalValue(i, "message")
		if err := b.chat.HandleChat(ctx, s, i, message, false); err != nil {
			b.logger.Error("modal_error", "customId", action, "error", err)
		}
	}
}

// ownerOK enforces owner-gating. The customID carries the owner's id; the
// interacting user must match. The bot's configured OWNER_ID, when set, is also
// always allowed (an admin override consistent with the OWNER_ID gate).
func (b *Bot) ownerOK(s *discordgo.Session, i *discordgo.InteractionCreate, userID, ownerID, denyMsg string) bool {
	if userID == ownerID {
		return true
	}
	if b.cfg.OwnerID != "" && userID == b.cfg.OwnerID {
		return true
	}
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: denyMsg,
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	})
	return false
}
