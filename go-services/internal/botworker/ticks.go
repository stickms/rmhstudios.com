package botworker

// ticks.go — the reply tick and DM tick, ported from server/bot-worker/index.ts
// (reactToComments, seedBotConversation, answerDirectMessages,
// initiateDirectMessages). Each tick runs under the shared Start/Stop/WaitGroup
// pattern; per-attempt work is wrapped in panic recovery and records JobRuns
// ok/error/panic (FAILURE ISOLATION spec requirement).

import (
	"context"
	"math/rand"
	"strings"
	"time"
)

// ─── Reply tick ────────────────────────────────────────────────────────

// safeReplyTick runs one reply round with a reentrancy guard (Node `replying`).
func (w *Worker) safeReplyTick(ctx context.Context) {
	w.replyMu.Lock()
	if w.replying {
		w.replyMu.Unlock()
		return
	}
	w.replying = true
	w.replyMu.Unlock()
	defer func() {
		w.replyMu.Lock()
		w.replying = false
		w.replyMu.Unlock()
	}()

	defer func() {
		if r := recover(); r != nil {
			w.recordJob(jobReply, "panic")
			w.logger.Error("bot-worker: replyTick panicked", "panic", r)
		}
	}()

	if w.ds == nil {
		return
	}
	w.reactToComments(ctx)
	w.seedBotConversation(ctx)
}

// reactToComments makes bots reply to recent comments aimed at them. Humans get
// answered readily; bot→bot is rarer and depth-capped. Mirrors Node reactToComments().
func (w *Worker) reactToComments(ctx context.Context) {
	since := time.Now().Add(-replyLookbackDuration)
	comments, err := w.repo.RecentComments(ctx, since)
	if err != nil {
		w.logger.Error("bot-worker: recent comments failed", "error", err)
		w.recordJob(jobReply, "error")
		return
	}

	type candidate struct {
		comment     CommentRow
		targetID    string
		authorIsBot bool
	}
	var candidates []candidate
	for _, c := range comments {
		// Resolve the reply target: parent comment author (threaded) or post author.
		var targetID string
		var targetIsBot bool
		if c.ParentID != nil {
			if c.ParentUserID != nil {
				targetID = *c.ParentUserID
			}
			if c.ParentUserIsBot != nil {
				targetIsBot = *c.ParentUserIsBot
			}
		} else {
			targetID = c.PostUserID
			targetIsBot = c.PostUserIsBot
		}
		// Only bots reply; the post must exist and not be deleted; never self-reply.
		if targetID == "" || !targetIsBot || c.PostDeletedAt != nil || targetID == c.UserID {
			continue
		}
		candidates = append(candidates, candidate{comment: c, targetID: targetID, authorIsBot: c.AuthorIsBot})
	}

	made := 0
	for _, cand := range shuffleCandidates(candidates) {
		if made >= maxRepliesPerTick || ctx.Err() != nil {
			break
		}
		prob := reactiveHumanProb
		if cand.authorIsBot {
			prob = botToBotProb
		}
		if rand.Float64() > prob {
			continue
		}
		func(c candidate) {
			defer func() {
				if r := recover(); r != nil {
					w.recordJob(jobReply, "panic")
					w.logger.Error("bot-worker: reactive reply panicked", "panic", r)
				}
			}()
			// Skip if already answered by this bot.
			answered, err := w.repo.CommentAlreadyAnswered(ctx, c.comment.ID, c.targetID)
			if err != nil || answered {
				return
			}
			if w.replyToComment(ctx, c.targetID, c.comment.ID, c.comment.RmheetID) {
				made++
				w.recordJob(jobReply, "ok")
			}
		}(cand)
	}
}

// replyToComment posts a single in-character reply from botID to a comment.
// Mirrors Node replyToComment(). Returns whether a reply was created.
func (w *Worker) replyToComment(ctx context.Context, botID, commentID, rmheetID string) bool {
	rc, err := w.repo.BuildReplyContext(ctx, commentID)
	if err != nil || rc == nil {
		return false
	}
	if len(rc.Thread) >= maxReplyDepth {
		return false
	}
	persona := w.personaFor(ctx, botID)
	content, err := w.ds.GenerateReply(ctx, persona, rc.PostContent, rc.QuotedPostContent, rc.Thread)
	if err != nil {
		w.logger.Error("bot-worker: generate reply failed", "bot", botID, "error", err)
		w.recordJob(jobReply, "error")
		return false
	}
	if strings.TrimSpace(content) == "" {
		return false
	}
	parent := commentID
	if err := w.repo.InsertComment(ctx, rmheetID, botID, content, &parent); err != nil {
		w.logger.Error("bot-worker: insert reply failed", "bot", botID, "error", err)
		w.recordJob(jobReply, "error")
		return false
	}
	if err := w.repo.UpdateBotLastPostAt(ctx, botID); err != nil {
		w.logger.Warn("bot-worker: update botLastPostAt (reply) failed", "bot", botID, "error", err)
	}
	w.logger.Info("bot-worker: replied to comment", "bot", botID, "comment", commentID)
	return true
}

// seedBotConversation occasionally makes a bot reply to another bot's recent
// post (proactive chatter). Mirrors Node seedBotConversation().
func (w *Worker) seedBotConversation(ctx context.Context) {
	if rand.Float64() > proactiveProb {
		return
	}
	since := time.Now().Add(-proactiveLookbackDuration)
	posts, err := w.repo.RecentBotPosts(ctx, since)
	if err != nil {
		w.logger.Error("bot-worker: recent bot posts failed", "error", err)
		w.recordJob(jobReply, "error")
		return
	}
	if len(posts) == 0 {
		return
	}
	post := posts[rand.Intn(len(posts))]

	commenters, err := w.repo.CommentersOnPost(ctx, post.ID)
	if err != nil {
		w.recordJob(jobReply, "error")
		return
	}
	bots, err := w.repo.BotsExcept(ctx, post.UserID)
	if err != nil {
		w.recordJob(jobReply, "error")
		return
	}
	var eligible []BotUser
	for _, b := range bots {
		if !commenters[b.ID] {
			eligible = append(eligible, b)
		}
	}
	if len(eligible) == 0 {
		return
	}
	bot := eligible[rand.Intn(len(eligible))]

	func() {
		defer func() {
			if r := recover(); r != nil {
				w.recordJob(jobReply, "panic")
				w.logger.Error("bot-worker: proactive reply panicked", "panic", r)
			}
		}()
		content, err := w.ds.GenerateReply(ctx, bot.BotPersona, post.Content, post.QuotedContent, nil)
		if err != nil {
			w.recordJob(jobReply, "error")
			return
		}
		if strings.TrimSpace(content) == "" {
			return
		}
		// Top-level comment (no parent).
		if err := w.repo.InsertComment(ctx, post.ID, bot.ID, content, nil); err != nil {
			w.logger.Error("bot-worker: insert proactive comment failed", "error", err)
			w.recordJob(jobReply, "error")
			return
		}
		if err := w.repo.UpdateBotLastPostAt(ctx, bot.ID); err != nil {
			w.logger.Warn("bot-worker: update botLastPostAt (proactive) failed", "error", err)
		}
		w.logger.Info("bot-worker: proactively replied to bot post", "bot", bot.ID, "post", post.ID)
		w.recordJob(jobReply, "ok")
	}()
}

// ─── DM tick ───────────────────────────────────────────────────────────

// safeDmTick runs one DM round with a reentrancy guard (Node `dmRunning`).
func (w *Worker) safeDmTick(ctx context.Context) {
	w.dmMu.Lock()
	if w.dmRunning {
		w.dmMu.Unlock()
		return
	}
	w.dmRunning = true
	w.dmMu.Unlock()
	defer func() {
		w.dmMu.Lock()
		w.dmRunning = false
		w.dmMu.Unlock()
	}()

	defer func() {
		if r := recover(); r != nil {
			w.recordJob(jobDM, "panic")
			w.logger.Error("bot-worker: dmTick panicked", "panic", r)
		}
	}()

	if w.ds == nil {
		return
	}
	w.answerDirectMessages(ctx)
	w.initiateDirectMessages(ctx)
}

// answerDirectMessages makes bots reply when a human spoke last in a 1:1 convo
// with exactly one bot participant. Mirrors Node answerDirectMessages().
func (w *Worker) answerDirectMessages(ctx context.Context) {
	since := time.Now().Add(-dmLookbackDuration)
	convos, err := w.repo.RecentBotConversations(ctx, since)
	if err != nil {
		w.logger.Error("bot-worker: recent bot conversations failed", "error", err)
		w.recordJob(jobDM, "error")
		return
	}

	type cand struct{ conversationID, botID, humanID string }
	var candidates []cand
	for _, c := range convos {
		if c.OneIsBot == c.TwoIsBot {
			continue // both bots or neither — skip
		}
		botID, humanID := c.ParticipantTwoID, c.ParticipantOneID
		if c.OneIsBot {
			botID, humanID = c.ParticipantOneID, c.ParticipantTwoID
		}
		lastSender, err := w.repo.LastMessageSender(ctx, c.ID)
		if err != nil || lastSender == "" || lastSender == botID {
			continue // nothing new from the human
		}
		candidates = append(candidates, cand{c.ID, botID, humanID})
	}

	made := 0
	for _, idx := range rand.Perm(len(candidates)) {
		c := candidates[idx]
		if made >= maxDMRepliesPerTick || ctx.Err() != nil {
			break
		}
		if rand.Float64() > reactiveDMProb {
			continue
		}
		func(c cand) {
			defer func() {
				if r := recover(); r != nil {
					w.recordJob(jobDM, "panic")
					w.logger.Error("bot-worker: reactive DM panicked", "panic", r)
				}
			}()
			persona := w.personaFor(ctx, c.botID)
			if persona == "" {
				return
			}
			history, err := w.repo.RecentDMHistory(ctx, c.conversationID)
			if err != nil {
				w.recordJob(jobDM, "error")
				return
			}
			// History is newest-first; reverse to oldest-first for formatDmHistory.
			reverseMessages(history)
			turns := formatDmHistory(history, c.botID)

			typing := typingPayload{ConversationID: c.conversationID, SenderID: c.botID, IsTyping: true}
			w.notify.notifyTyping(ctx, c.humanID, typing)
			content, genErr := w.ds.GenerateDMReply(ctx, persona, turns)
			typing.IsTyping = false
			w.notify.notifyTyping(ctx, c.humanID, typing)
			if genErr != nil {
				w.recordJob(jobDM, "error")
				return
			}
			if strings.TrimSpace(content) == "" {
				return
			}
			msg, err := w.repo.SendBotDM(ctx, c.conversationID, c.botID, content)
			if err != nil {
				w.logger.Error("bot-worker: send DM failed", "error", err)
				w.recordJob(jobDM, "error")
				return
			}
			w.notify.notifyMessageDelivered(ctx, c.humanID, msg)
			made++
			w.logger.Info("bot-worker: answered DM", "bot", c.botID, "human", c.humanID)
			w.recordJob(jobDM, "ok")
		}(c)
	}
}

// initiateDirectMessages rarely opens (or gently follows up) a DM with a
// recently-active human, respecting privacy + anti-pester rules. Mirrors Node
// initiateDirectMessages().
func (w *Worker) initiateDirectMessages(ctx context.Context) {
	if rand.Float64() > dmInitiateProb {
		return
	}
	since := time.Now().Add(-dmActiveHumanLookbackDuration)
	humanIDs, err := w.repo.RecentActiveHumans(ctx, since)
	if err != nil {
		w.logger.Error("bot-worker: recent active humans failed", "error", err)
		w.recordJob(jobDM, "error")
		return
	}
	if len(humanIDs) == 0 {
		return
	}
	bots, err := w.repo.BotsExcept(ctx, "") // all bots (no exclusion)
	if err != nil || len(bots) == 0 {
		return
	}

	opened := 0
	for _, idx := range rand.Perm(len(humanIDs)) {
		humanID := humanIDs[idx]
		if opened >= maxDMOpenersPerTick || ctx.Err() != nil {
			break
		}
		bot := bots[rand.Intn(len(bots))]
		if bot.BotPersona == "" || bot.ID == humanID {
			continue
		}
		func() {
			defer func() {
				if r := recover(); r != nil {
					w.recordJob(jobDM, "panic")
					w.logger.Error("bot-worker: DM initiation panicked", "panic", r)
				}
			}()
			// Privacy gate.
			privacy, err := w.repo.DMPrivacy(ctx, humanID)
			if err != nil {
				w.recordJob(jobDM, "error")
				return
			}
			humanFollowsBot := false
			if privacy == dmFollowers {
				humanFollowsBot, _ = w.repo.FollowExists(ctx, humanID, bot.ID)
			}
			if !canBotMessage(privacy, humanFollowsBot) {
				return
			}
			// Anti-pester gate from the existing conversation (if any).
			pOne, pTwo := orderPair(bot.ID, humanID)
			_, msgs, err := w.repo.ConversationOpenerMessages(ctx, pOne, pTwo)
			if err != nil {
				w.recordJob(jobDM, "error")
				return
			}
			decision := decideInitiation(bot.ID, time.Now(), dmFollowupSilenceDuration, msgs)
			if decision == "skip" {
				return
			}
			content, err := w.ds.GenerateDMOpener(ctx, bot.BotPersona)
			if err != nil || strings.TrimSpace(content) == "" {
				if err != nil {
					w.recordJob(jobDM, "error")
				}
				return
			}
			convID, err := w.repo.UpsertConversation(ctx, pOne, pTwo)
			if err != nil {
				w.logger.Error("bot-worker: upsert conversation failed", "error", err)
				w.recordJob(jobDM, "error")
				return
			}
			msg, err := w.repo.SendBotDM(ctx, convID, bot.ID, content)
			if err != nil {
				w.logger.Error("bot-worker: send opener DM failed", "error", err)
				w.recordJob(jobDM, "error")
				return
			}
			w.notify.notifyMessageDelivered(ctx, humanID, msg)
			opened++
			w.logger.Info("bot-worker: opened/followed-up DM", "bot", bot.ID, "human", humanID, "decision", decision)
			w.recordJob(jobDM, "ok")
		}()
	}
}

// personaFor loads a bot's persona text, used by reply/DM ticks. Falls back to
// empty on any error (the caller treats empty persona as "skip" where relevant).
func (w *Worker) personaFor(ctx context.Context, botID string) string {
	bots, err := w.repo.BotsExcept(ctx, "") // all bots
	if err != nil {
		return ""
	}
	for _, b := range bots {
		if b.ID == botID {
			return b.BotPersona
		}
	}
	return ""
}

// reverseMessages reverses a slice of dmMessage in place.
func reverseMessages(m []dmMessage) {
	for i, j := 0, len(m)-1; i < j; i, j = i+1, j-1 {
		m[i], m[j] = m[j], m[i]
	}
}

// shuffleCandidates returns a shuffled copy of a generic candidate slice.
func shuffleCandidates[T any](in []T) []T {
	out := make([]T, len(in))
	copy(out, in)
	rand.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}
