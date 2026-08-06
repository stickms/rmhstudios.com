// pet_events.go adds Alex's interactive community prompts. Every so often (as a
// flavour of his ambient life) Alex posts a limited-time "event" — e.g. "reply
// with your favorite boba flavor!" — or a casual question. The first few people
// to reply in each channel get a personal reply from Alex, and their reply quietly
// counts as an "interaction" on the caretaker leaderboard (Alex never announces
// points — the reward is just reflected on /caretakers).
//
// The currently-active prompt is tracked in memory (it's short-lived, so there's
// no need to persist it across restarts); the interaction credit DOES persist, via
// the normal caretaker leaderboard. Claiming is atomic and once-per-user, so an
// event can't be farmed.
package discordbot

import (
	"context"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/config"
)

// interactionPoints is how many leaderboard points answering a prompt earns (the
// "interactions" way of caring for Alex). Not announced to users.
const interactionPoints = 6

// promptMaxClaims caps how many users can win a single prompt ("first few").
const promptMaxClaims = 12

// Prompt styles (affect wording only; both reward a reply once per user).
const (
	promptStyleEvent    = "event"    // "reply with X for care points!"
	promptStyleQuestion = "question" // a casual question that also rewards a reply
)

// promptDuration is how long a prompt stays claimable after it's posted.
func promptDuration() time.Duration {
	return config.GetDuration("ALEX_PROMPT_DURATION", 30*time.Minute)
}

// activePrompt is the currently-live community prompt. Guarded by ps.promptMu.
type activePrompt struct {
	style     string          // promptStyleEvent / promptStyleQuestion
	channels  map[string]bool // channels it was posted to (reward-eligible)
	expiresAt time.Time
	claimed   map[string]bool // userID -> already rewarded
}

// registerPrompt records a freshly-posted prompt as the active one, replacing any
// previous prompt. channels is the set of channels it actually went out to.
func (ps *PetService) registerPrompt(style string, channels map[string]bool, now time.Time) {
	if len(channels) == 0 {
		return
	}
	ps.promptMu.Lock()
	ps.prompt = &activePrompt{
		style:     style,
		channels:  channels,
		expiresAt: now.Add(promptDuration()),
		claimed:   make(map[string]bool),
	}
	ps.promptMu.Unlock()
}

// claimPrompt atomically checks whether userID may claim the active prompt in
// channelID and, if so, records the claim. Returns true on a successful
// (first-time, in-window, under-cap, right-channel) claim.
func (ps *PetService) claimPrompt(channelID, userID string, now time.Time) bool {
	if channelID == "" || userID == "" {
		return false
	}
	ps.promptMu.Lock()
	defer ps.promptMu.Unlock()
	p := ps.prompt
	if p == nil || now.After(p.expiresAt) {
		return false
	}
	if !p.channels[channelID] {
		return false
	}
	if p.claimed[userID] || len(p.claimed) >= promptMaxClaims {
		return false
	}
	p.claimed[userID] = true
	return true
}

// creditInteraction credits a caretaker for interacting with a prompt
// (best-effort). It's the "interactions" way of earning leaderboard points.
func (ps *PetService) creditInteraction(ctx context.Context, userID, username, avatarHash string) {
	if err := ps.repo.bumpCaretaker(ctx, globalPetKey, userID, username, avatarHash, "interactions", interactionPoints); err != nil {
		ps.logger.Warn("interaction credit failed", "user", userID, "error", err)
	}
}
