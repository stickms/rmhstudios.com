// bot.go is the gateway bootstrap. It opens a discordgo session (Guilds intent),
// bulk-registers the slash commands on ready (guild-scoped if DISCORD_DEV_GUILD_ID
// is set, else global, preserving Entry Point commands), routes interactions
// (slash commands + buttons + modals) with owner-gating, starts Alex's background
// care loop, and shuts down gracefully.
package discordbot

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// interactionTimeout bounds a single interaction's work (a DeepSeek chat reply or
// an xAI image generation). Generous, but it guarantees the per-interaction
// context is eventually cancelled even if the gateway connection lingers.
const interactionTimeout = 2 * time.Minute

// Config holds the bot's runtime configuration (resolved from env by main()).
type Config struct {
	Token       string // DISCORD_BOT_TOKEN || DISCORD_ACTIVITY_BOT_TOKEN
	DevGuildID  string // DISCORD_DEV_GUILD_ID (empty => global registration)
	OwnerID     string // OWNER_ID — gates button/modal interactions
	DeepSeekKey string // DEEPSEEK_API_KEY
	DeepSeekMod string // DEEPSEEK_MODEL (default "deepseek-chat")
}

// Bot is the long-running gateway bot.
type Bot struct {
	cfg     Config
	logger  *log.Logger
	session *discordgo.Session
	chat    *ChatService
	pet     *PetService

	// lifecycleCtx is set when Run starts; per-interaction contexts are derived
	// from it (with interactionTimeout) so in-flight agent loops / DeepSeek calls
	// are bounded and cancelled on shutdown rather than detached via
	// context.Background(). ctxMu guards the read/write across goroutines.
	ctxMu        sync.RWMutex
	lifecycleCtx context.Context
}

// slashCommands defines the bot's slash commands: chatting with Alex plus the
// tamagotchi care commands.
func slashCommands() []*discordgo.ApplicationCommand {
	return []*discordgo.ApplicationCommand{
		{
			Name:        "chat",
			Description: "Chat with Alex 💬",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "message",
					Description: "What do you wanna say?", Required: true},
			},
		},
		{
			Name:        "alex",
			Description: "Check on Alex — his stats, age, and mood 🧋",
		},
		{
			Name:        "feed",
			Description: "Feed Alex to fill his hunger 🍽️",
			Options: []*discordgo.ApplicationCommandOption{
				{
					Type: discordgo.ApplicationCommandOptionString, Name: "food",
					Description: "What to feed him (defaults to boba)", Required: false,
					Choices: []*discordgo.ApplicationCommandOptionChoice{
						{Name: "🧋 Boba (his fave)", Value: "boba"},
						{Name: "🍜 A full meal", Value: "meal"},
						{Name: "🍪 A snack", Value: "snack"},
					},
				},
			},
		},
		{Name: "play", Description: "Play with Alex to boost his happiness 🎮"},
		{Name: "clean", Description: "Clean Alex up so he doesn't get funky 🧼"},
		{Name: "rest", Description: "Put Alex down for a nap to restore energy 😴"},
		{Name: "study", Description: "Help Alex study to build his intelligence 🧠"},
		{
			Name:        "career",
			Description: "Pick Alex's dream career (or view it) 🎯",
			Options: []*discordgo.ApplicationCommandOption{
				{
					Type: discordgo.ApplicationCommandOptionString, Name: "path",
					Description: "The career to chase", Required: false,
					Choices: []*discordgo.ApplicationCommandOptionChoice{
						{Name: "👨‍💻 Software Engineer", Value: "swe"},
						{Name: "📊 Data Scientist", Value: "data"},
						{Name: "🚀 Startup Founder", Value: "founder"},
						{Name: "📈 Quant", Value: "quant"},
						{Name: "📋 Product Manager", Value: "pm"},
						{Name: "🎨 UX Designer", Value: "design"},
					},
				},
			},
		},
		{Name: "show", Description: "See a pic of what Alex looks like right now 📸"},
		{Name: "revive", Description: "Bring Alex back if he's passed out ✨"},
		{Name: "newlife", Description: "Start a New Game+ once Alex is a grown adult 🎓"},
		{Name: "caretakers", Description: "See who's taken the best care of Alex 🏆"},
		{
			Name:        "alexmessages",
			Description: "Set Alex's messages in this server (Manage Messages / owner only) 🔔",
			Options: []*discordgo.ApplicationCommandOption{
				{
					Type: discordgo.ApplicationCommandOptionString, Name: "level",
					Description: "How much Alex talks here (blank = show current)", Required: false,
					Choices: []*discordgo.ApplicationCommandOptionChoice{
						{Name: "🔔 All messages", Value: "all"},
						{Name: "🩹 Care messages only", Value: "care"},
						{Name: "🔕 Completely silent", Value: "off"},
					},
				},
			},
		},
		{
			Name:        "rename",
			Description: "Give Alex a new name 📝",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "name",
					Description: "Alex's new name (1–32 characters)", Required: true},
			},
		},
	}
}

// New builds the bot from its already-constructed services.
func New(cfg Config, chat *ChatService, pet *PetService, logger *log.Logger) (*Bot, error) {
	if cfg.Token == "" {
		return nil, fmt.Errorf("discord bot token is required")
	}
	session, err := discordgo.New("Bot " + cfg.Token)
	if err != nil {
		return nil, fmt.Errorf("create discord session: %w", err)
	}
	session.Identify.Intents = discordgo.IntentsGuilds

	b := &Bot{cfg: cfg, logger: logger, session: session, chat: chat, pet: pet}
	session.AddHandler(b.onReady)
	session.AddHandler(b.onInteraction)
	session.AddHandler(b.onGuildCreate)
	return b, nil
}

// onGuildCreate fires for every guild on startup (as state syncs) and whenever the
// bot is added to a new server. It triggers Alex's one-time intro announcement,
// which is idempotent (persisted via introSentAt), so startup never re-posts.
func (b *Bot) onGuildCreate(s *discordgo.Session, e *discordgo.GuildCreate) {
	if b.pet == nil || e == nil || e.Guild == nil || e.Guild.Unavailable {
		return
	}
	b.ctxMu.RLock()
	parent := b.lifecycleCtx
	b.ctxMu.RUnlock()
	if parent == nil {
		parent = context.Background()
	}
	guildID := e.Guild.ID
	// Run off the gateway event goroutine — the intro may make several REST calls.
	go func() {
		ctx, cancel := context.WithTimeout(parent, 30*time.Second)
		defer cancel()
		b.pet.AnnounceIntro(ctx, s, guildID)
	}()
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

	// Start Alex's background caretaking loop (care alerts / ambient life / growth
	// + death announcements). Stops when ctx is cancelled.
	if b.pet != nil {
		b.pet.StartCareLoop(ctx, b.session)
	}

	<-ctx.Done()

	b.logger.Info("shutdown_start")
	if err := b.session.Close(); err != nil {
		b.logger.Warn("session close", "error", err)
	}
	b.logger.Info("shutdown_complete")
	return nil
}

// onReady bulk-registers the slash commands.
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
	case "alex":
		err = b.pet.HandleStatus(ctx, s, i)
	case "feed":
		err = b.pet.HandleFeed(ctx, s, i, opts.str("food"))
	case "play":
		err = b.pet.HandlePlay(ctx, s, i)
	case "clean":
		err = b.pet.HandleClean(ctx, s, i)
	case "rest":
		err = b.pet.HandleRest(ctx, s, i)
	case "study":
		err = b.pet.HandleStudy(ctx, s, i)
	case "career":
		err = b.pet.HandleCareer(ctx, s, i, opts.str("path"))
	case "show":
		err = b.pet.HandleShow(ctx, s, i)
	case "revive":
		err = b.pet.HandleRevive(ctx, s, i)
	case "newlife":
		err = b.pet.HandleNewLife(ctx, s, i)
	case "rename":
		err = b.pet.HandleRename(ctx, s, i, opts.str("name"))
	case "caretakers":
		err = b.pet.HandleCaretakers(ctx, s, i)
	case "alexmessages":
		if !b.canToggleAlex(s, i) {
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseChannelMessageWithSource,
				Data: &discordgo.InteractionResponseData{
					Content: "🔒 You need to be the **server owner**, have the **Manage Messages** permission, or be the bot owner to change Alex's messages here.",
					Flags:   discordgo.MessageFlagsEphemeral,
				},
			})
			return
		}
		err = b.pet.HandleSetMessages(ctx, s, i, opts.str("level"))
	default:
		b.logger.Warn("unknown_command", "name", data.Name)
		return
	}
	if err != nil {
		b.logger.Error("command_error", "command", data.Name, "error", err)
	}
}

// routeComponent handles button presses. customID format is "action:ownerId" —
// owner-gated. The only interactive button is "Keep talking" on a /chat reply.
func (b *Bot) routeComponent(_ context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) {
	action, ownerID := splitCustomID(i.MessageComponentData().CustomID)
	userID, _ := interactionUser(i)

	switch action {
	case "chat_continue":
		if !b.ownerOK(s, i, userID, ownerID, "This chat belongs to another user — run `/chat` to start your own 💬") {
			return
		}
		_ = showModal(s, i, "chat_continue_modal:"+ownerID, "Keep talking with Alex 💬",
			"message", "What do you wanna say?")
	}
}

// routeModal handles modal submits — the chat_continue "keep talking" modal.
func (b *Bot) routeModal(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) {
	action, ownerID := splitCustomID(i.ModalSubmitData().CustomID)
	userID, _ := interactionUser(i)

	switch action {
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

// canToggleAlex reports whether the interacting user may change Alex's per-server
// message settings. Any of these qualifies:
//   - the configured bot owner (OWNER_ID; trimmed to tolerate stray whitespace),
//   - the server's own owner (guild.OwnerID) — always allowed in their server,
//   - a member with Manage Messages or Administrator (Discord resolves the
//     member's channel permissions into i.Member.Permissions for slash commands).
//
// The guild-owner path is independent of both OWNER_ID config and the permissions
// bitfield, so it works even when OWNER_ID is unset or the permission field is
// empty for some reason.
func (b *Bot) canToggleAlex(s *discordgo.Session, i *discordgo.InteractionCreate) bool {
	userID, _ := interactionUser(i)

	if owner := strings.TrimSpace(b.cfg.OwnerID); owner != "" && userID == owner {
		return true
	}

	if s != nil && i.GuildID != "" {
		if g, err := s.State.Guild(i.GuildID); err == nil && g != nil && g.OwnerID == userID {
			return true
		}
	}

	if i.Member != nil {
		p := i.Member.Permissions
		if p&discordgo.PermissionManageMessages != 0 || p&discordgo.PermissionAdministrator != 0 {
			return true
		}
	}
	return false
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
