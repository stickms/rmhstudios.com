// pet_presence.go reflects the global Alex's current state in the bot's own
// Discord presence — a custom status like "🧋 Adult Alex · just vibin", plus an
// online/idle/dnd colour that tracks how he's doing. It's refreshed on every care
// tick and (throttled) right after care commands, so anyone can glance at the bot
// in the member list and see how Alex is doing.
package discordbot

import (
	"fmt"
	"time"

	"github.com/bwmarrin/discordgo"
)

// presenceThrottle bounds how often command handlers push a presence update, so a
// burst of commands can't trip Discord's presence-update rate limit (the care
// tick updates it on its own cadence regardless).
const presenceThrottle = 30 * time.Second

// updatePresence sets the bot's custom status + online colour from the pet state.
// Best-effort: a failure is logged, never fatal.
func (ps *PetService) updatePresence(s *discordgo.Session, p *PetState) {
	err := s.UpdateStatusComplex(discordgo.UpdateStatusData{
		Activities: []*discordgo.Activity{{
			Name:  "Custom Status",
			Type:  discordgo.ActivityTypeCustom,
			State: presenceText(p),
		}},
		Status: presenceStatus(p),
	})
	if err != nil {
		ps.logger.Warn("presence update failed", "error", err)
	}
}

// refreshPresence pushes a presence update from a command handler, throttled so
// frequent commands don't spam the gateway. No-op until the gateway is open.
func (ps *PetService) refreshPresence(p *PetState) {
	s := ps.getSession()
	if s == nil {
		return
	}
	if ps.onCooldown(globalPetKey, "presence", presenceThrottle, time.Now().UTC()) {
		return
	}
	ps.updatePresence(s, p)
}

// presenceText builds the custom-status line shown under the bot's name.
func presenceText(p *PetState) string {
	if !p.Alive {
		return "💀 passed out — someone /revive me"
	}
	mood := p.mood()
	return fmt.Sprintf("%s %s · %s", mood.Emoji, presenceStage(p.LifeStage), mood.Label)
}

// presenceStage is the compact "<stage> Alex" label for the status line.
func presenceStage(st LifeStage) string {
	switch st {
	case StageInfant:
		return "Baby Alex"
	case StageToddler:
		return "Toddler Alex"
	case StageChild:
		return "Kid Alex"
	case StageTeen:
		return "Teen Alex"
	case StageAdult:
		return "Adult Alex"
	default:
		return "Alex"
	}
}

// presenceStatus maps Alex's condition to an online-status colour: dnd when he's
// sick or gone, idle when he's sleepy, online otherwise.
func presenceStatus(p *PetState) string {
	if !p.Alive {
		return string(discordgo.StatusDoNotDisturb)
	}
	switch p.mood().Key {
	case "sick":
		return string(discordgo.StatusDoNotDisturb)
	case "sleepy":
		return string(discordgo.StatusIdle)
	default:
		return string(discordgo.StatusOnline)
	}
}
