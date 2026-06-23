// Package botworker is the Go port of server/bot-worker/index.ts.
// It maintains a pool of AI-generated bot users and posts in-voice from them
// throughout the day. Bots never reveal they are bots.
//
// Pacing constants are copied verbatim from the Node source (intEnv defaults).
package botworker

import "time"

// Pacing constants ported from server/bot-worker/index.ts intEnv/probEnv defaults.
const (
	// targetBotCount is how many synthetic users to keep alive.
	targetBotCount = 20
	// botCreateBatch is how many new bots to mint per maintenance cycle.
	botCreateBatch = 6
	// userCheckInterval is how often to top up the bot pool (default 2h).
	userCheckInterval = 2 * time.Hour
	// postTickInterval is how often to consider posting (default 5m).
	postTickInterval = 5 * time.Minute
	// maxPostsPerTick is the most posts we'll create in a single tick.
	maxPostsPerTick = 5
	// botImageProbability is the chance a given post gets an AI-generated image.
	botImageProbability = 0.05

	// replyTickInterval matches postTickInterval in the Node defaults.
	replyTickInterval = postTickInterval
	// replyLookbackDuration is how far back we look for comments to reply to.
	replyLookbackDuration = 12 * time.Hour
	// maxRepliesPerTick caps replies per tick.
	maxRepliesPerTick = 4
	// maxReplyDepth stops threads from spiralling.
	maxReplyDepth = 6
	// reactiveHumanProb is the probability a bot answers a human who replied to it.
	reactiveHumanProb = 0.9
	// botToBotProb is the probability a bot answers another bot who replied to it.
	botToBotProb = 0.3
	// proactiveProb is the probability per tick that a bot proactively replies to another bot's post.
	proactiveProb = 0.4
	// proactiveLookbackDuration is the window for proactive replies.
	proactiveLookbackDuration = 6 * time.Hour

	// dmTickInterval is how often the worker services DMs.
	dmTickInterval = 1 * time.Minute
	// dmLookbackDuration is how far back we look for DMs to answer.
	dmLookbackDuration = 24 * time.Hour
	// maxDMRepliesPerTick caps reactive DM replies per tick.
	maxDMRepliesPerTick = 4
	// reactiveDMProb is the probability a bot answers a human's DM.
	reactiveDMProb = 1.0
	// dmInitiateProb is the probability per tick that a bot-initiated opener happens.
	dmInitiateProb = 0.15
	// maxDMOpenersPerTick caps bot-initiated openers per tick.
	maxDMOpenersPerTick = 1
	// dmFollowupSilenceDuration is the silence after a lone opener before one gentle follow-up.
	dmFollowupSilenceDuration = 3 * 24 * time.Hour
	// dmActiveHumanLookbackDuration defines "recently-active" candidate humans for openers.
	dmActiveHumanLookbackDuration = 7 * 24 * time.Hour
)

// Persona holds the private prompt seed describing a bot's posting theme.
// It is stored in the "botPersona" column of the "user" table.
// Fields here are derived when generating a post; they are NOT stored as
// structured data in the DB (the DB stores the full persona text string).
type Persona struct {
	// Theme is the topic area of the persona (e.g. "coffee", "philosophy").
	Theme string
	// Voice is how the persona writes (e.g. "wry", "earnest").
	Voice string
	// Temperament describes the posting style (e.g. "frequently", "rare poster").
	Temperament string
}

// BotUser holds the subset of a "user" row the worker needs to pace and post.
//
// SQL table: "user"  (Prisma model User @@map("user"))
// Columns used:
//
//	id            → "id"           TEXT
//	botPersona    → "botPersona"   TEXT (Prisma camelCase = same in PG, no @map)
//	botLastPostAt → "botLastPostAt" TIMESTAMPTZ
//	isBot         → "isBot"        BOOLEAN
type BotUser struct {
	ID           string
	BotPersona   string
	BotLastPostAt *time.Time
}
