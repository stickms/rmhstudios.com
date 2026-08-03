// bot.go is the gateway bootstrap. It opens a discordgo session, bulk-registers
// the single slash command on ready (guild-scoped if DISCORD_DEV_GUILD_ID is
// set, else global, preserving Entry Point commands), routes interactions, and
// shuts down gracefully.
//
// There is exactly one command and no components, no message listeners and no
// background loops: the Liquid Globe bot answers /liquid and is otherwise
// silent. Adding chatter back would be a change of what this bot is.
package discordbot

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// interactionTimeout bounds a single interaction's work: two xAI calls (a vision
// read and an image generation) plus a DeepSeek review, in series. Generous, but
// it guarantees the per-interaction context is eventually cancelled even if the
// gateway connection lingers.
const interactionTimeout = 3 * time.Minute

// Config holds the bot's runtime configuration (resolved from env by Run).
type Config struct {
	Token       string // DISCORD_BOT_TOKEN || DISCORD_ACTIVITY_BOT_TOKEN
	DevGuildID  string // DISCORD_DEV_GUILD_ID (empty => global registration)
	DeepSeekKey string // DEEPSEEK_API_KEY
	DeepSeekMod string // DEEPSEEK_MODEL (default "deepseek-chat")
	XAIKey      string // XAI_API_KEY
	XAIImageMod string // XAI_IMAGE_MODEL (default "grok-imagine-image")
	XAIVisonMod string // XAI_VISION_MODEL (default "grok-4-fast-non-reasoning")
	Cooldown    time.Duration
}

// Bot is the long-running gateway bot.
type Bot struct {
	cfg     Config
	logger  *log.Logger
	session *discordgo.Session
	liquid  *LiquidService

	// lifecycleCtx is set when Run starts; per-interaction contexts are derived
	// from it (with interactionTimeout) so in-flight model calls are bounded and
	// cancelled on shutdown rather than detached via context.Background().
	// ctxMu guards the read/write across goroutines.
	ctxMu        sync.RWMutex
	lifecycleCtx context.Context
}

// slashCommands defines the bot's command surface: /liquid, and nothing else.
func slashCommands() []*discordgo.ApplicationCommand {
	return []*discordgo.ApplicationCommand{
		{
			Name:        "liquid",
			Description: "Re-make an image in the RMH liquid globe design language 🔮",
			Options: []*discordgo.ApplicationCommandOption{
				{
					Type:        discordgo.ApplicationCommandOptionAttachment,
					Name:        "image",
					Description: "The picture to liquefy (PNG, JPEG, GIF or WebP)",
					Required:    true,
				},
				{
					Type:        discordgo.ApplicationCommandOptionString,
					Name:        "notes",
					Description: "Optional: what the treatment should pay attention to",
					Required:    false,
					MaxLength:   notesMaxLen,
				},
			},
		},
	}
}

// notesMaxLen bounds the optional steering text, which is forwarded to both
// models — an unbounded field here is an unbounded token bill.
const notesMaxLen = 300

// New builds the bot from its already-constructed services.
func New(cfg Config, liquid *LiquidService, logger *log.Logger) (*Bot, error) {
	if cfg.Token == "" {
		return nil, fmt.Errorf("discord bot token is required")
	}
	session, err := discordgo.New("Bot " + cfg.Token)
	if err != nil {
		return nil, fmt.Errorf("create discord session: %w", err)
	}
	// Guilds only. Slash commands arrive over the interaction gateway regardless
	// of intents, and this bot never reads channel messages.
	session.Identify.Intents = discordgo.IntentsGuilds

	b := &Bot{cfg: cfg, logger: logger, session: session, liquid: liquid}
	session.AddHandler(b.onReady)
	session.AddHandler(b.onInteraction)
	return b, nil
}

// Run opens the gateway session and blocks until ctx is cancelled, then closes
// the session cleanly.
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

// onReady bulk-registers the slash command and sets the bot's presence.
func (b *Bot) onReady(s *discordgo.Session, r *discordgo.Ready) {
	b.logger.Info("bot_ready", "user", r.User.String(), "guilds", len(r.Guilds))

	if err := s.UpdateStatusComplex(discordgo.UpdateStatusData{
		Status: string(discordgo.StatusOnline),
		Activities: []*discordgo.Activity{{
			Name: "everything turn to glass",
			Type: discordgo.ActivityTypeWatching,
		}},
	}); err != nil {
		b.logger.Warn("presence update", "error", err)
	}

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
	// A bulk overwrite is also what RETIRES the old Alex command set: any command
	// not in `desired` is removed by this call, so the first boot after this
	// change clears /chat, /feed, /play and the rest without a manual purge.
	if _, err := s.ApplicationCommandBulkOverwrite(s.State.User.ID, guildID, desired); err != nil {
		b.logger.Error("command_registration_failed", "error", err)
		return
	}
	b.logger.Info("commands_registered", "scope", scope, "guildId", guildID)
}

// onInteraction routes slash commands under a context derived from the bot's
// lifecycle context with a per-interaction timeout, so the model calls are
// bounded and cancelled when the bot shuts down.
func (b *Bot) onInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Type != discordgo.InteractionApplicationCommand {
		return
	}

	b.ctxMu.RLock()
	parent := b.lifecycleCtx
	b.ctxMu.RUnlock()
	if parent == nil {
		// Handlers can fire before Run records the lifecycle ctx; fall back to a
		// background parent so the interaction still has a valid, bounded context.
		parent = context.Background()
	}

	data := i.ApplicationCommandData()
	if data.Name != "liquid" {
		b.logger.Warn("unknown_command", "name", data.Name)
		return
	}

	opts := newOptionMap(data.Options)
	userID, _ := interactionUser(i)
	b.logger.Info("command_received", "command", data.Name, "userId", userID, "guildId", i.GuildID)

	att := opts.attachment(&data, "image")
	notes := opts.str("notes")

	// Run off the gateway goroutine: the pipeline takes tens of seconds, and
	// blocking here would stall every other event on the connection.
	go func() {
		ctx, cancel := context.WithTimeout(parent, interactionTimeout)
		defer cancel()
		if err := b.liquid.HandleLiquid(ctx, s, i, att, notes); err != nil {
			b.logger.Error("command_error", "command", "liquid", "error", err)
		}
	}()
}
