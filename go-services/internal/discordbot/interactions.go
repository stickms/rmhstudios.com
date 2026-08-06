// interactions.go holds the small discordgo glue helpers shared by bot.go,
// chat.go and pet_service.go: extracting the invoking user, reading command options,
// splitting "action:ownerId" custom IDs, building/reading modals, and the
// plain-text reply helper.
package discordbot

import (
	"strings"

	"github.com/bwmarrin/discordgo"
)

// interactionUser returns the invoking user's id and username, handling both
// guild (i.Member.User) and DM (i.User) interactions.
func interactionUser(i *discordgo.InteractionCreate) (id, username string) {
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User.ID, i.Member.User.Username
	}
	if i.User != nil {
		return i.User.ID, i.User.Username
	}
	return "", ""
}

// interactionAvatar returns the invoking user's Discord avatar hash (empty when
// they have no custom avatar), used to render their face on the leaderboard.
func interactionAvatar(i *discordgo.InteractionCreate) string {
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User.Avatar
	}
	if i.User != nil {
		return i.User.Avatar
	}
	return ""
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

func (m optionMap) boolean(name string) bool {
	if o, ok := m[name]; ok {
		return o.BoolValue()
	}
	return false
}

// splitCustomID splits a "action:ownerId" custom ID. Mirrors the TS
// `interaction.customId.split(':')`.
func splitCustomID(customID string) (action, ownerID string) {
	parts := strings.SplitN(customID, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return parts[0], ""
}

// showModal sends a single-paragraph-text-input modal in response to a button.
func showModal(s *discordgo.Session, i *discordgo.InteractionCreate, customID, title, inputID, label string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseModal,
		Data: &discordgo.InteractionResponseData{
			CustomID: customID,
			Title:    title,
			Components: []discordgo.MessageComponent{
				discordgo.ActionsRow{Components: []discordgo.MessageComponent{
					discordgo.TextInput{
						CustomID:  inputID,
						Label:     label,
						Style:     discordgo.TextInputParagraph,
						Required:  true,
						MaxLength: 1000,
					},
				}},
			},
		},
	})
}

// modalValue reads a text input value from a submitted modal by its component id.
func modalValue(i *discordgo.InteractionCreate, inputID string) string {
	for _, row := range i.ModalSubmitData().Components {
		ar, ok := row.(*discordgo.ActionsRow)
		if !ok {
			continue
		}
		for _, c := range ar.Components {
			if ti, ok := c.(*discordgo.TextInput); ok && ti.CustomID == inputID {
				return ti.Value
			}
		}
	}
	return ""
}

// respondText sends a plain immediate text reply (used for the early-out guards
// like "No active session"). Mirrors interaction.reply({ content }).
func respondText(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: content},
	})
}

// respondEphemeralEmbed sends an immediate ephemeral embed reply (only the
// invoking user sees it) — used by /prompt so a long persona prompt never
// clutters the channel.
func respondEphemeralEmbed(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: []*discordgo.MessageEmbed{embed},
			Flags:  discordgo.MessageFlagsEphemeral,
		},
	})
}
