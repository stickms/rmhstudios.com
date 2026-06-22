package botworker

// dmpolicy.go — pure decision logic for bot direct messages, ported from
// lib/rmhark-ai/dm-policy.ts. No DB, no I/O, no DeepSeek — side-effect-free and
// unit-testable.

import "time"

// DmPrivacy mirrors the Prisma enum DmPrivacy (EVERYONE | FOLLOWERS | NONE),
// stored in "user_profile"."dmPrivacy".
type DmPrivacy string

const (
	dmEveryone  DmPrivacy = "EVERYONE"
	dmFollowers DmPrivacy = "FOLLOWERS"
	dmNone      DmPrivacy = "NONE"
)

// policyMessage is the minimal shape the policy functions reason about.
type policyMessage struct {
	SenderID  string
	CreatedAt time.Time
}

// dmMessage is a message with its text, used when formatting history.
type dmMessage struct {
	SenderID string
	Content  string
}

// dmTurn is one labeled turn of a DM conversation, from the bot's point of view.
type dmTurn struct {
	From string // "them" | "you"
	Text string
}

// needsReactiveReply reports whether a bot owes a reactive reply: true when
// there is at least one message and the most recent one is NOT from the bot.
// messages must be ordered oldest-first.
func needsReactiveReply(messages []policyMessage, botID string) bool {
	if len(messages) == 0 {
		return false
	}
	return messages[len(messages)-1].SenderID != botID
}

// canBotMessage reports whether a bot may send the FIRST message to a human,
// per the human's DM privacy. Mirrors app/routes/api/messages.ts.
func canBotMessage(privacy DmPrivacy, humanFollowsBot bool) bool {
	switch privacy {
	case dmNone:
		return false
	case dmFollowers:
		return humanFollowsBot
	case dmEveryone:
		return true
	default:
		return false
	}
}

// decideInitiation decides whether a bot may initiate (or follow up) with a
// human, given the existing conversation's messages (oldest-first), or nil if
// none exists.
//
//   - No conversation            -> "opener"
//   - Human has ever replied     -> "skip" (active; reactive path handles it)
//   - One unanswered bot opener  -> "followup" once enough silence elapsed, else "skip"
//   - Two+ unanswered bot msgs   -> "skip" (give up; never pester further)
func decideInitiation(botID string, now time.Time, followupSilence time.Duration, messages []policyMessage) string {
	if len(messages) == 0 {
		return "opener"
	}
	for _, m := range messages {
		if m.SenderID != botID {
			return "skip" // human replied
		}
	}
	if len(messages) >= 2 {
		return "skip"
	}
	last := messages[len(messages)-1]
	if now.Sub(last.CreatedAt) >= followupSilence {
		return "followup"
	}
	return "skip"
}

// formatDmHistory labels conversation messages as them/you for the model
// prompt (order preserved).
func formatDmHistory(messages []dmMessage, botID string) []dmTurn {
	turns := make([]dmTurn, 0, len(messages))
	for _, m := range messages {
		from := "them"
		if m.SenderID == botID {
			from = "you"
		}
		turns = append(turns, dmTurn{From: from, Text: m.Content})
	}
	return turns
}

// orderPair returns the canonical participant ordering for the Conversation
// unique constraint (participantOneId < participantTwoId). Mirrors Node orderPair().
func orderPair(a, b string) (string, string) {
	if a < b {
		return a, b
	}
	return b, a
}
