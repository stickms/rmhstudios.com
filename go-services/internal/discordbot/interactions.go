// interactions.go holds the small discordgo glue shared by bot.go and
// liquid.go: extracting the invoking user, reading command options (including
// the attachment resolution slash commands need), the ephemeral reply helper,
// and the rune-safe truncation the embed budget arithmetic runs on.
package discordbot

import (
	"github.com/bwmarrin/discordgo"
)

// interactionUser returns the invoking user's id and username, handling both
// guild (i.Member.User) and DM (i.User) interactions.
func interactionUser(i *discordgo.InteractionCreate) (id, username string) {
	if i == nil {
		return "", ""
	}
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User.ID, i.Member.User.Username
	}
	if i.User != nil {
		return i.User.ID, i.User.Username
	}
	return "", ""
}

// optionMap is a name->option lookup for slash command options.
type optionMap map[string]*discordgo.ApplicationCommandInteractionDataOption

func newOptionMap(opts []*discordgo.ApplicationCommandInteractionDataOption) optionMap {
	m := make(optionMap, len(opts))
	for _, o := range opts {
		m[o.Name] = o
	}
	return m
}

func (m optionMap) str(name string) string {
	if o, ok := m[name]; ok {
		return o.StringValue()
	}
	return ""
}

// attachment resolves an attachment option. Discord sends the option's value as
// the attachment's snowflake and puts the attachment itself in the interaction's
// resolved data, so the id has to be looked up against `data` — the option alone
// carries nothing usable. Returns nil when the option is absent or the resolved
// map does not contain it (which Discord should not do, but a nil here is a
// clean "no image" the handler already reports).
func (m optionMap) attachment(data *discordgo.ApplicationCommandInteractionData, name string) *discordgo.MessageAttachment {
	o, ok := m[name]
	if !ok || o.Type != discordgo.ApplicationCommandOptionAttachment {
		return nil
	}
	id, _ := o.Value.(string)
	if id == "" || data == nil || data.Resolved == nil || data.Resolved.Attachments == nil {
		return nil
	}
	return data.Resolved.Attachments[id]
}

// respondEphemeral sends an immediate reply only the invoking user can see —
// used for the pre-flight refusals (cooldown, bad upload, no key), which are
// feedback for one person rather than content for the channel.
func respondEphemeral(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	})
}

// ─── Rune-safe text budgeting ───────────────────────────────────────────
//
// Discord counts embed limits in characters, and this bot's copy is emoji-heavy,
// so every cut operates on runes — a byte slice would split a multi-byte glyph
// and Discord rejects the malformed result.

// truncate cuts text to at most max characters, appending an ellipsis on
// overflow.
func truncate(text string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(text)
	if len(r) <= max {
		return text
	}
	if max == 1 {
		return string(r[:1])
	}
	return string(r[:max-1]) + "…"
}

// truncateHard is a plain cut with no ellipsis, for fields (title, footer) where
// the marker would cost a character the caller is already budgeting exactly.
func truncateHard(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
