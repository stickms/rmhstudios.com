package rmhbox

import (
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// ─── Stub minigame (8 of 9, clearly-marked migration TODOs) ──────────────────
//
// A compiling placeholder so the lobby/coordinator lifecycle can be exercised
// against every registered game. It auto-completes after a short delay with all
// players ranked at zero. Real handlers live in server/rmhbox/minigames/*.

type stubGame struct {
	BaseGame
	id   string
	mode SpectatorMode
}

func newStubFactory(id string, mode SpectatorMode) minigameFactory {
	return func(ctx *MinigameContext) Minigame {
		g := &stubGame{id: id, mode: mode}
		g.init(ctx)
		return g
	}
}

func (g *stubGame) Start() {
	g.isRunning = true
	// TODO(migration): replace with the real handler. Auto-complete after 1s.
	g.setTimeout(func() { g.ctx.OnComplete(g.ComputeResults()) }, 1000)
}

func (g *stubGame) HandleInput(string, string, map[string]any) {}
func (g *stubGame) GetStateForPlayer(string) any               { return map[string]any{"stub": g.id} }
func (g *stubGame) GetStateForSpectator() any                  { return map[string]any{"stub": g.id} }
func (g *stubGame) SpectatorMode() SpectatorMode               { return g.mode }

func (g *stubGame) ComputeResults() MinigameResults {
	rankings := make([]PlayerRanking, 0, len(g.ctx.Players))
	i := 1
	for _, p := range g.ctx.Players {
		rankings = append(rankings, PlayerRanking{UserID: p.UserID, UserName: p.UserName, Score: 0, Rank: i, Deltas: map[string]int{}})
		i++
	}
	return MinigameResults{Rankings: rankings, Awards: []Award{}, GameSpecificData: map[string]any{}, Duration: 0}
}

func (g *stubGame) ForceEnd(string)                 { g.Cleanup(); g.ctx.OnComplete(g.ComputeResults()) }
func (g *stubGame) GetSpectatorSnapshot(string) any { return g.GetStateForSpectator() }

// ═════════════════════════════════════════════════════════════════════════════
// Rhyme Time — FULL port of server/rmhbox/minigames/rhyme-time/handler.ts
// ═════════════════════════════════════════════════════════════════════════════
//
// Players get a root word each round and submit rhyming words within a time
// limit. Scoring rewards rarity (how few players found the same word),
// multi-syllable rhymes (bonus), and speed (first submitter of a non-unique
// word). Invalid known words incur a penalty.
//
// Phases per round: ROUND_START -> INPUT -> SCORING -> INTERMISSION.
// Join-in-progress: spectate_only. spectatorMode: competitive-individual.
//
// The Node handler validated rhymes against the CMU pronouncing dictionary via
// the `rhyming-part` package. To stay self-contained (no new external deps) the
// Go port uses a deterministic phonetic-suffix heuristic over a small bundled
// word set — the structure, scoring, masking and awards are faithfully ported.

const (
	rtTotalRounds        = 3
	rtInputDuration      = 45
	rtScoringDuration    = 10
	rtIntermissionDur    = 10
	rtRoundStartDuration = 2
	rtMaxSubmissions     = 30
	rtCommonPoints       = 20
	rtUncommonPoints     = 50
	rtRarePoints         = 90
	rtMultiSyllableBonus = 20
	rtSpeedBonus         = 10
	rtInvalidPenalty     = -10
)

type rtPhase string

const (
	rtRoundStart   rtPhase = "ROUND_START"
	rtInput        rtPhase = "INPUT"
	rtScoring      rtPhase = "SCORING"
	rtIntermission rtPhase = "INTERMISSION"
)

type rtRootWord struct {
	Word          string `json:"word"`
	Difficulty    string `json:"difficulty"`
	SyllableCount int    `json:"syllableCount"`
}

type rtSubmission struct {
	Word            string `json:"word"`
	Timestamp       int64  `json:"timestamp"`
	IsValid         bool   `json:"isValid"`
	IsMultiSyllable bool   `json:"isMultiSyllable"`
	InvalidReason   string `json:"invalidReason,omitempty"`
}

type rtWordBreakdown struct {
	Word               string `json:"word"`
	IsValid            bool   `json:"isValid"`
	InvalidReason      string `json:"invalidReason,omitempty"`
	Rarity             string `json:"rarity,omitempty"`
	BasePoints         int    `json:"basePoints"`
	MultiSyllableBonus int    `json:"multiSyllableBonus"`
	SpeedBonus         int    `json:"speedBonus"`
	TotalPoints        int    `json:"totalPoints"`
	SubmitterCount     int    `json:"submitterCount"`
	IsMultiSyllable    bool   `json:"isMultiSyllable"`
}

type rtPlayerRoundResult struct {
	UserID       string            `json:"userId"`
	UserName     string            `json:"userName"`
	Breakdown    []rtWordBreakdown `json:"breakdown"`
	RoundScore   int               `json:"roundScore"`
	ValidCount   int               `json:"validCount"`
	InvalidCount int               `json:"invalidCount"`
}

type rtRoundResult struct {
	RoundNumber   int                            `json:"roundNumber"`
	RootWord      rtRootWord                     `json:"rootWord"`
	PlayerResults map[string]rtPlayerRoundResult `json:"playerResults"`
}

type rtState struct {
	Phase         rtPhase                   `json:"phase"`
	CurrentRound  int                       `json:"currentRound"`
	TotalRounds   int                       `json:"totalRounds"`
	RootWord      *rtRootWord               `json:"rootWord"`
	TimeRemaining int                       `json:"timeRemaining"`
	Submissions   map[string][]rtSubmission `json:"-"`
	RoundResults  []rtRoundResult           `json:"roundResults"`
	Scores        map[string]int            `json:"scores"`
}

type rhymeTimeGame struct {
	BaseGame
	mu        sync.Mutex // guards game state (handler calls + timers race)
	state     rtState
	rootWords []rtRootWord
	usedRoots map[string]bool
	startedAt int64
}

func newRhymeTimeGame(ctx *MinigameContext) *rhymeTimeGame {
	g := &rhymeTimeGame{rootWords: rtLoadRootWords(), usedRoots: map[string]bool{}}
	g.init(ctx)
	return g
}

func (g *rhymeTimeGame) SpectatorMode() SpectatorMode { return SpectatorCompetitive }

func (g *rhymeTimeGame) Start() {
	g.isRunning = true
	g.startedAt = nowMS()
	g.initializeState()
	g.startRound()
}

func (g *rhymeTimeGame) initializeState() {
	scores := map[string]int{}
	for uid := range g.ctx.Players {
		scores[uid] = 0
	}
	g.state = rtState{
		Phase:        rtRoundStart,
		CurrentRound: 0,
		TotalRounds:  g.ctx.GetSettingInt("totalRounds", rtTotalRounds),
		Submissions:  map[string][]rtSubmission{},
		RoundResults: []rtRoundResult{},
		Scores:       scores,
	}
}

func (g *rhymeTimeGame) selectRootWord() rtRootWord {
	avail := make([]rtRootWord, 0, len(g.rootWords))
	for _, rw := range g.rootWords {
		if !g.usedRoots[rw.Word] {
			avail = append(avail, rw)
		}
	}
	pool := avail
	if len(pool) == 0 {
		pool = g.rootWords
	}
	sel := pool[rand.Intn(len(pool))]
	g.usedRoots[sel.Word] = true
	return sel
}

func (g *rhymeTimeGame) startRound() {
	if !g.isRunning {
		return
	}
	g.mu.Lock()
	g.state.CurrentRound++
	rw := g.selectRootWord()
	g.state.RootWord = &rw
	g.state.Phase = rtRoundStart
	g.state.TimeRemaining = rtRoundStartDuration
	g.state.Submissions = map[string][]rtSubmission{}
	for uid := range g.ctx.Players {
		g.state.Submissions[uid] = []rtSubmission{}
	}
	round := g.state.CurrentRound
	total := g.state.TotalRounds
	g.mu.Unlock()

	g.broadcastRound(round, total)
	g.broadcastGameAction(map[string]any{
		"type": "RT_ROUND_START", "round": round, "totalRounds": total,
		"rootWord": rw, "duration": rtRoundStartDuration,
	})
	g.startPhaseTimer(rtRoundStartDuration)
	g.setTimeout(g.startInputPhase, rtRoundStartDuration*1000)
}

func (g *rhymeTimeGame) startInputPhase() {
	if !g.isRunning {
		return
	}
	dur := g.ctx.GetSettingInt("inputDuration", rtInputDuration)
	g.mu.Lock()
	g.state.Phase = rtInput
	g.state.TimeRemaining = dur
	g.mu.Unlock()

	g.broadcastGameAction(map[string]any{"type": "RT_INPUT_START", "duration": dur, "timeRemaining": dur})
	g.startPhaseTimer(dur)
	g.setTimeout(g.endInputPhase, int64(dur)*1000)
}

func (g *rhymeTimeGame) endInputPhase() {
	if !g.isRunning {
		return
	}
	g.clearPhaseTimer()
	g.mu.Lock()
	g.state.Phase = rtScoring
	g.state.TimeRemaining = rtScoringDuration
	roundResult := g.computeRoundResults()
	g.state.RoundResults = append(g.state.RoundResults, roundResult)
	for uid, pr := range roundResult.PlayerResults {
		g.state.Scores[uid] += pr.RoundScore
	}
	round := g.state.CurrentRound
	scores := copyIntMap(g.state.Scores)
	total := g.state.TotalRounds
	g.mu.Unlock()

	g.broadcastGameAction(map[string]any{
		"type": "RT_ROUND_RESULTS", "round": round, "results": roundResult,
		"scores": scores, "duration": rtScoringDuration,
	})
	g.startPhaseTimer(rtScoringDuration)
	g.setTimeout(func() {
		if round >= total {
			g.endGame()
		} else {
			g.startIntermission()
		}
	}, rtScoringDuration*1000)
}

func (g *rhymeTimeGame) startIntermission() {
	if !g.isRunning {
		return
	}
	g.mu.Lock()
	g.state.Phase = rtIntermission
	g.state.TimeRemaining = rtIntermissionDur
	next := g.state.CurrentRound + 1
	scores := copyIntMap(g.state.Scores)
	g.mu.Unlock()

	g.broadcastGameAction(map[string]any{
		"type": "RT_INTERMISSION", "duration": rtIntermissionDur, "nextRound": next, "scores": scores,
	})
	g.startPhaseTimer(rtIntermissionDur)
	g.setTimeout(g.startRound, rtIntermissionDur*1000)
}

func (g *rhymeTimeGame) endGame() {
	if !g.isRunning {
		return
	}
	g.Cleanup()
	g.ctx.OnComplete(g.ComputeResults())
}

// ─── Input ───────────────────────────────────────────────────────────────────

func (g *rhymeTimeGame) HandleInput(userID, action string, data map[string]any) {
	if action != "SUBMIT_RHYME" {
		return
	}
	g.mu.Lock()
	if g.state.Phase != rtInput {
		g.mu.Unlock()
		return
	}
	rawWord, _ := data["word"].(string)
	word := strings.TrimSpace(strings.ToLower(rawWord))
	if word == "" {
		g.mu.Unlock()
		g.reject(userID, "invalid_input")
		return
	}
	subs, ok := g.state.Submissions[userID]
	if !ok {
		g.mu.Unlock() // not a participant
		return
	}
	maxSub := g.ctx.GetSettingInt("maxSubmissions", rtMaxSubmissions)
	if len(subs) >= maxSub {
		g.mu.Unlock()
		g.reject(userID, "max_submissions")
		return
	}
	for _, s := range subs {
		if s.Word == word {
			g.mu.Unlock()
			g.reject(userID, "duplicate")
			return
		}
	}
	root := *g.state.RootWord
	isValid := rtIsValidRhyme(word, root.Word)
	multi := false
	if isValid {
		multi = rtIsMultiSyllable(word, root.SyllableCount)
	}
	invalidReason := ""
	if !isValid {
		if rtIsKnownWord(word) {
			invalidReason = "does_not_rhyme"
		} else {
			invalidReason = "not_in_dictionary"
		}
	}
	sub := rtSubmission{Word: word, Timestamp: nowMS(), IsValid: isValid, IsMultiSyllable: multi, InvalidReason: invalidReason}
	g.state.Submissions[userID] = append(subs, sub)
	validCount := 0
	for _, s := range g.state.Submissions[userID] {
		if s.IsValid {
			validCount++
		}
	}
	g.mu.Unlock()

	ack := map[string]any{
		"type": "RT_RHYME_SUBMITTED", "word": word, "isValid": isValid,
		"invalidReason": invalidReason, "submissionCount": len(subs) + 1, "maxSubmissions": maxSub,
	}
	g.ctx.SendToPlayer(userID, "rmhbox:game:action", ack)
	g.ctx.SendToSpectatorFollowers(userID, "rmhbox:game:action", ack)
	g.broadcastGameAction(map[string]any{"type": "RT_SUBMISSION_COUNT", "userId": userID, "count": validCount})
}

func (g *rhymeTimeGame) reject(userID, reason string) {
	g.ctx.SendToPlayer(userID, "rmhbox:game:action", map[string]any{"type": "RT_RHYME_REJECTED", "reason": reason})
}

// ─── Scoring (called with g.mu held) ─────────────────────────────────────────

func (g *rhymeTimeGame) computeRoundResults() rtRoundResult {
	root := *g.state.RootWord

	submitterCounts := map[string]int{}
	firstSubmitter := map[string]struct {
		userID string
		ts     int64
	}{}
	for uid, subs := range g.state.Submissions {
		for _, s := range subs {
			if !s.IsValid {
				continue
			}
			submitterCounts[s.Word]++
			f, ok := firstSubmitter[s.Word]
			if !ok || s.Timestamp < f.ts {
				firstSubmitter[s.Word] = struct {
					userID string
					ts     int64
				}{uid, s.Timestamp}
			}
		}
	}

	playerResults := map[string]rtPlayerRoundResult{}
	enableMulti := g.ctx.GetSettingBool("enableMultiSyllableBonus", rtMultiSyllableBonus > 0)
	enableSpeed := g.ctx.GetSettingBool("enableSpeedBonus", rtSpeedBonus > 0)
	invalidPenalty := g.ctx.GetSettingInt("invalidPenalty", rtInvalidPenalty)

	for uid, subs := range g.state.Submissions {
		userName := "Unknown"
		if p, ok := g.ctx.Players[uid]; ok {
			userName = p.UserName
		}
		breakdown := []rtWordBreakdown{}
		roundScore, validCount, invalidCount := 0, 0, 0

		for _, s := range subs {
			if !s.IsValid {
				penalty := invalidPenalty
				if s.InvalidReason == "not_in_dictionary" {
					penalty = 0
				} else {
					invalidCount++
				}
				breakdown = append(breakdown, rtWordBreakdown{
					Word: s.Word, IsValid: false, InvalidReason: s.InvalidReason,
					BasePoints: penalty, TotalPoints: penalty,
				})
				roundScore += penalty
				continue
			}
			validCount++
			cnt := submitterCounts[s.Word]
			if cnt < 1 {
				cnt = 1
			}
			rarity := rtRarity(cnt)
			base := rtBasePoints(rarity)
			multiBonus := 0
			if s.IsMultiSyllable && enableMulti {
				multiBonus = rtMultiSyllableBonus
			}
			speedBonus := 0
			if enableSpeed && cnt > 1 {
				if f, ok := firstSubmitter[s.Word]; ok && f.userID == uid {
					speedBonus = rtSpeedBonus
				}
			}
			total := base + multiBonus + speedBonus
			breakdown = append(breakdown, rtWordBreakdown{
				Word: s.Word, IsValid: true, Rarity: rarity, BasePoints: base,
				MultiSyllableBonus: multiBonus, SpeedBonus: speedBonus, TotalPoints: total,
				SubmitterCount: cnt, IsMultiSyllable: s.IsMultiSyllable,
			})
			roundScore += total
		}

		playerResults[uid] = rtPlayerRoundResult{
			UserID: uid, UserName: userName, Breakdown: breakdown,
			RoundScore: roundScore, ValidCount: validCount, InvalidCount: invalidCount,
		}
	}

	return rtRoundResult{RoundNumber: g.state.CurrentRound, RootWord: root, PlayerResults: playerResults}
}

func rtRarity(submitterCount int) string {
	if submitterCount <= 1 {
		return "rare"
	}
	if submitterCount == 2 {
		return "uncommon"
	}
	return "common"
}

func rtBasePoints(rarity string) int {
	switch rarity {
	case "rare":
		return rtRarePoints
	case "uncommon":
		return rtUncommonPoints
	default:
		return rtCommonPoints
	}
}

// ─── State masking ───────────────────────────────────────────────────────────

func (g *rhymeTimeGame) GetStateForPlayer(userID string) any {
	g.mu.Lock()
	defer g.mu.Unlock()
	base := map[string]any{
		"phase": g.state.Phase, "currentRound": g.state.CurrentRound,
		"totalRounds": g.state.TotalRounds, "rootWord": g.state.RootWord,
		"timeRemaining": g.state.TimeRemaining, "scores": copyIntMap(g.state.Scores),
	}
	mine := g.state.Submissions[userID]
	if mine == nil {
		mine = []rtSubmission{}
	}
	base["mySubmissions"] = mine
	if g.state.Phase == rtInput {
		base["roundResults"] = []rtRoundResult{}
	} else {
		base["roundResults"] = g.state.RoundResults
	}
	return base
}

func (g *rhymeTimeGame) GetStateForSpectator() any {
	g.mu.Lock()
	defer g.mu.Unlock()
	base := map[string]any{
		"phase": g.state.Phase, "currentRound": g.state.CurrentRound,
		"totalRounds": g.state.TotalRounds, "rootWord": g.state.RootWord,
		"timeRemaining": g.state.TimeRemaining, "scores": copyIntMap(g.state.Scores),
		"mySubmissions": []rtSubmission{},
	}
	if g.state.Phase == rtInput {
		base["roundResults"] = []rtRoundResult{}
	} else {
		base["roundResults"] = g.state.RoundResults
	}
	return base
}

// GetSpectatorSnapshot: competitive-individual -> follow a target player.
func (g *rhymeTimeGame) GetSpectatorSnapshot(targetPlayerID string) any {
	if g.SpectatorMode() == SpectatorCompetitive && targetPlayerID != "" {
		return g.GetStateForPlayer(targetPlayerID)
	}
	return g.GetStateForSpectator()
}

// ─── Results & awards ────────────────────────────────────────────────────────

func (g *rhymeTimeGame) ComputeResults() MinigameResults {
	g.mu.Lock()
	rankings := g.computeRankings()
	awards := g.computeAwards()
	roundResults := g.state.RoundResults
	total := g.state.TotalRounds
	g.mu.Unlock()
	return MinigameResults{
		Rankings: rankings, Awards: awards,
		GameSpecificData: map[string]any{"roundResults": roundResults, "totalRounds": total},
		Duration:         nowMS() - g.startedAt,
	}
}

func (g *rhymeTimeGame) computeRankings() []PlayerRanking {
	entries := make([]PlayerRanking, 0, len(g.ctx.Players))
	for uid, p := range g.ctx.Players {
		deltas := map[string]int{}
		for _, rr := range g.state.RoundResults {
			if pr, ok := rr.PlayerResults[uid]; ok {
				deltas[rtRoundKey(rr.RoundNumber)] = pr.RoundScore
			} else {
				deltas[rtRoundKey(rr.RoundNumber)] = 0
			}
		}
		entries = append(entries, PlayerRanking{UserID: uid, UserName: p.UserName, Score: g.state.Scores[uid], Deltas: deltas})
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Score > entries[j].Score })
	for i := range entries {
		entries[i].Rank = i + 1
	}
	return entries
}

func rtRoundKey(n int) string { return "round_" + itoa(n) }

type rtStat struct {
	valid, rare, multi, speed int
	hitMax                    bool
}

func (g *rhymeTimeGame) computeAwards() []Award {
	stats := map[string]*rtStat{}
	for uid := range g.ctx.Players {
		stats[uid] = &rtStat{}
	}
	for _, rr := range g.state.RoundResults {
		for uid, pr := range rr.PlayerResults {
			s, ok := stats[uid]
			if !ok {
				continue
			}
			s.valid += pr.ValidCount
			for _, wb := range pr.Breakdown {
				if wb.IsValid && wb.Rarity == "rare" {
					s.rare++
				}
				if wb.IsValid && wb.IsMultiSyllable {
					s.multi++
				}
				if wb.SpeedBonus > 0 {
					s.speed++
				}
			}
			if len(pr.Breakdown) >= rtMaxSubmissions {
				s.hitMax = true
			}
		}
	}
	awards := []Award{}
	if u, v := rtTopStat(stats, func(s *rtStat) int { return s.valid }); v > 0 {
		awards = append(awards, Award{UserID: u, Title: "Wordsmith", Description: "Submitted " + itoa(v) + " valid rhymes", Icon: "pencil-line"})
	}
	if u, v := rtTopStat(stats, func(s *rtStat) int { return s.rare }); v > 0 {
		awards = append(awards, Award{UserID: u, Title: "Diamond in the Rough", Description: "Found " + itoa(v) + " rare rhymes", Icon: "gem"})
	}
	if u, v := rtTopStat(stats, func(s *rtStat) int { return s.multi }); v > 0 {
		awards = append(awards, Award{UserID: u, Title: "Syllable Surfer", Description: "Submitted " + itoa(v) + " multi-syllable rhymes", Icon: "waves"})
	}
	if u, v := rtTopStat(stats, func(s *rtStat) int { return s.speed }); v > 0 {
		awards = append(awards, Award{UserID: u, Title: "Quick Draw", Description: "Earned " + itoa(v) + " speed bonuses", Icon: "zap"})
	}
	for uid, s := range stats {
		if s.hitMax {
			awards = append(awards, Award{UserID: uid, Title: "Overachiever", Description: "Hit the submission limit", Icon: "trophy"})
		}
	}
	return awards
}

// rtTopStat finds the player with the highest value of get(s) (ties -> first).
func rtTopStat(stats map[string]*rtStat, get func(*rtStat) int) (string, int) {
	top, topVal := "", -1
	for uid, s := range stats {
		if v := get(s); v > topVal {
			topVal, top = v, uid
		}
	}
	return top, topVal
}

func (g *rhymeTimeGame) ForceEnd(reason string) {
	g.Cleanup()
	g.ctx.OnComplete(g.ComputeResults())
}

func (g *rhymeTimeGame) HandlePlayerJoin(userID string) {
	g.ctx.SendToPlayer(userID, "rmhbox:game:state_snapshot", g.GetStateForSpectator())
}

// ─── Self-contained rhyme validation (replaces the CMU dictionary dep) ───────

func rtLoadRootWords() []rtRootWord {
	return []rtRootWord{
		{Word: "cat", Difficulty: "easy", SyllableCount: 1},
		{Word: "light", Difficulty: "easy", SyllableCount: 1},
		{Word: "rhyme", Difficulty: "medium", SyllableCount: 1},
		{Word: "station", Difficulty: "hard", SyllableCount: 2},
		{Word: "today", Difficulty: "medium", SyllableCount: 2},
		{Word: "blue", Difficulty: "easy", SyllableCount: 1},
		{Word: "round", Difficulty: "medium", SyllableCount: 1},
		{Word: "fire", Difficulty: "medium", SyllableCount: 2},
	}
}

// rtRhymeKey is the phonetic-suffix heuristic standing in for the CMU rhyming
// part: the trailing vowel-onward chunk of the word.
func rtRhymeKey(word string) string {
	w := strings.ToLower(strings.TrimSpace(word))
	vowels := "aeiouy"
	last := -1
	for i := 0; i < len(w); i++ {
		if strings.IndexByte(vowels, w[i]) >= 0 {
			last = i
		}
	}
	if last < 0 {
		return w
	}
	if last >= 1 {
		return w[last-1:]
	}
	return w[last:]
}

func rtIsValidRhyme(word, root string) bool {
	if word == root || word == "" {
		return false
	}
	return rtRhymeKey(word) == rtRhymeKey(root)
}

func rtCountSyllables(word string) int {
	w := strings.ToLower(word)
	vowels := "aeiouy"
	count, prevVowel := 0, false
	for i := 0; i < len(w); i++ {
		isVowel := strings.IndexByte(vowels, w[i]) >= 0
		if isVowel && !prevVowel {
			count++
		}
		prevVowel = isVowel
	}
	if count == 0 {
		count = 1
	}
	return count
}

func rtIsMultiSyllable(word string, rootSyllables int) bool {
	return rtCountSyllables(word) >= 2 && rtCountSyllables(word) >= rootSyllables
}

func rtIsKnownWord(word string) bool {
	// Heuristic: words of reasonable length with at least one vowel are treated
	// as "known" (so they incur the does-not-rhyme penalty rather than the
	// silent not-in-dictionary path).
	if len(word) < 2 || len(word) > 30 {
		return false
	}
	for i := 0; i < len(word); i++ {
		if strings.IndexByte("aeiouy", word[i]) >= 0 {
			return true
		}
	}
	return false
}

// ─── small helpers ───────────────────────────────────────────────────────────

func copyIntMap(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func itoa(n int) string { return strconv.Itoa(n) }
