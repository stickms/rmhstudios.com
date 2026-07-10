// pet_ai.go uses the (already-configured) DeepSeek key to generate Alex's
// proactive messages on the fly, so his ambient/care posts vary instead of
// cycling fixed templates. It occasionally riffs on a real tech-news headline
// pulled from the free Hacker News API (no key). Every path degrades gracefully:
// if DeepSeek isn't configured or fails, the caller falls back to the static
// templates, so the bot never depends on the AI being up.
package discordbot

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── Tech-news headlines (Hacker News front page, cached) ────────────────

var (
	newsMu       sync.Mutex
	newsCache    []string
	newsFetched  time.Time
	newsHTTP     = &http.Client{Timeout: 6 * time.Second}
	newsCacheTTL = 30 * time.Minute
)

// headlines returns a few current tech headlines (cached ~30m). Best-effort:
// returns nil on any failure so callers just skip the news riff.
func headlines(ctx context.Context) []string {
	newsMu.Lock()
	if time.Since(newsFetched) < newsCacheTTL && len(newsCache) > 0 {
		defer newsMu.Unlock()
		return newsCache
	}
	newsMu.Unlock()

	reqCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet,
		"https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20", nil)
	if err != nil {
		return nil
	}
	resp, err := newsHTTP.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil
	}
	var parsed struct {
		Hits []struct {
			Title string `json:"title"`
		} `json:"hits"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil
	}
	var titles []string
	for _, h := range parsed.Hits {
		if t := strings.TrimSpace(h.Title); t != "" {
			titles = append(titles, t)
		}
	}
	if len(titles) == 0 {
		return nil
	}
	newsMu.Lock()
	newsCache = titles
	newsFetched = time.Now()
	newsMu.Unlock()
	return titles
}

// ─── Proactive message generation ────────────────────────────────────────

// aiTimeout bounds a single proactive generation so the care loop can't hang.
const aiTimeout = 15 * time.Second

// petStateLine describes Alex's current state for the model (compact, no numbers
// dump — enough to color the message).
func petStateLine(p *PetState) string {
	if !p.Alive {
		return "You (Alex) are currently passed out from neglect, waiting to be revived."
	}
	mood := p.mood()
	career := "still figuring out your career"
	if p.Career != "" {
		career = "working toward: " + careerDisplay(p.Career)
	}
	return fmt.Sprintf("You (Alex) are a %s right now, feeling: %s. You're %s.",
		stageWord(p.LifeStage), mood.Label, career)
}

// proactiveTemperature / proactivePresence / proactiveFrequency are the creative
// sampling knobs for Alex's ambient chatter — a higher temperature than a normal
// reply, plus presence/frequency penalties, so his self-initiated posts stop
// collapsing onto the same few boba/LinkedIn jokes every time.
const (
	proactiveTemperature = 1.5
	proactivePresence    = 0.5
	proactiveFrequency   = 0.4
)

// proactiveContent generates Alex's message for a proactive broadcast via
// DeepSeek, or returns "" if unavailable (caller falls back to a template). The
// instruction is seeded with a rotating topic and a list of his recent posts to
// steer away from, and sampled with creative settings, so the stream of quips
// stays varied instead of repeating itself.
func (ps *PetService) proactiveContent(ctx context.Context, pl plan) string {
	if ps.deepseek == nil || !ps.deepseek.configured() {
		return ""
	}

	system := alexSystemPrompt + "\n\n" + petStateLine(&pl.pet)
	var instruction string
	seedTopic := true

	switch pl.kind {
	case kindCareAlert:
		instruction = careInstruction(pl.need)
		seedTopic = false // a care plea is about a specific need; don't derail it
	case kindAmbient:
		instruction = ambientInstruction(ctx)
	case kindPrompt:
		if pl.promptStyle == promptStyleEvent {
			instruction = eventPromptInstruction()
		} else {
			instruction = questionPromptInstruction()
		}
	default:
		return ""
	}

	if seedTopic {
		instruction += ambientTopicHint()
	}
	instruction += ps.recentPostsHint()

	reqCtx, cancel := context.WithTimeout(ctx, aiTimeout)
	defer cancel()
	reply, err := ps.deepseek.ChatWith(reqCtx, []ChatMessage{
		{Role: roleSystem, Content: system},
		{Role: roleUser, Content: instruction},
	}, ChatOptions{
		Temperature:      floatPtr(proactiveTemperature),
		PresencePenalty:  floatPtr(proactivePresence),
		FrequencyPenalty: floatPtr(proactiveFrequency),
	})
	if err != nil {
		ps.logger.Warn("proactive AI generation failed, using template", "error", err)
		return ""
	}
	out := boundMessage(reply)
	ps.rememberPost(out)
	return out
}

// ambientTopics is a broad rotation of themes to steer Alex's self-initiated
// chatter, so he isn't always on about boba. A random one is suggested to the
// model each time (as a soft lean, not a hard requirement).
var ambientTopics = []string{
	"grabbing boba or trying a new boba flavor",
	"the gym, a workout, or the post-workout soreness",
	"a video game or getting cooked online",
	"dorm / apartment / roommate life",
	"a bug, a broken deploy, or merge conflicts from hell",
	"cooking a meal, a snack, or ordering takeout",
	"weekend plans or the weather today",
	"a show, movie, anime, or a song stuck in his head",
	"his Wells Fargo internship / intern life",
	"a slightly unhinged LinkedIn humble-brag",
	"a random shower thought or a spicy hot take",
	"intramurals or a sports team he's into",
	"a side project he's vibe coding with zero plan",
	"being broke on a student budget",
	"missing home, family, or hometown food",
	"gassing up the server / a wholesome check-in",
	"caffeine, energy drinks, or running on no sleep",
	"a class, an exam, or procrastinating on homework",
	"touching grass / actually going outside for once",
	"AI, the job market, or the future of tech",
	"public transit, his commute, or Minnesota winters",
	"an impulse purchase he can't stop thinking about",
}

// ambientTopicHint suggests one rotating theme for a proactive post.
func ambientTopicHint() string {
	return "\n\nLean this one toward: " + pick(ambientTopics) +
		" — but only if it fits you naturally. Whatever you pick, make it feel fresh and specific, not generic."
}

// recentPostsN caps how many recent AI posts are remembered / fed back as
// "don't repeat these" context.
const recentPostsN = 6

// rememberPost records a freshly-generated proactive post so future generations
// can be told to avoid repeating it. Keeps only the last recentPostsN.
func (ps *PetService) rememberPost(post string) {
	post = strings.TrimSpace(post)
	if post == "" {
		return
	}
	ps.recentMu.Lock()
	defer ps.recentMu.Unlock()
	ps.recentPosts = append(ps.recentPosts, post)
	if len(ps.recentPosts) > recentPostsN {
		ps.recentPosts = ps.recentPosts[len(ps.recentPosts)-recentPostsN:]
	}
}

// recentPostsHint returns an instruction fragment listing Alex's recent posts so
// the model steers clear of repeating them, or "" if there are none yet.
func (ps *PetService) recentPostsHint() string {
	ps.recentMu.Lock()
	defer ps.recentMu.Unlock()
	if len(ps.recentPosts) == 0 {
		return ""
	}
	return "\n\nYou recently posted these — say something clearly DIFFERENT (new topic, " +
		"new opener, don't recycle the same jokes or emoji):\n- " + strings.Join(ps.recentPosts, "\n- ")
}

// actionReaction generates Alex's in-character reaction to a care action just
// performed (feed/play/clean/rest/study), so his responses vary instead of
// cycling the fixed flavor lines. Returns "" on any failure so the caller falls
// back to the static line.
func (ps *PetService) actionReaction(ctx context.Context, pet *PetState, action string) string {
	if ps.deepseek == nil || !ps.deepseek.configured() {
		return ""
	}
	what := map[string]string{
		"feed":  "Someone just fed you (boba or a meal) and your hunger went up.",
		"play":  "Someone just played with you and you had a blast.",
		"clean": "Someone just cleaned you up and now you're fresh.",
		"rest":  "Someone just put you down for a nap and you woke up recharged.",
		"study": "Someone just helped you study and you got a little smarter.",
	}[action]
	if what == "" {
		return ""
	}

	system := alexSystemPrompt
	if pet != nil {
		system += "\n\n" + petStateLine(pet)
	}
	user := what + " React in ONE short, in-character sentence — a little hype and funny, " +
		"and gas up whoever did it. No hashtags, no markdown headers, don't mention any slash commands."

	reqCtx, cancel := context.WithTimeout(ctx, aiTimeout)
	defer cancel()
	reply, err := ps.deepseek.Chat(reqCtx, []ChatMessage{
		{Role: roleSystem, Content: system},
		{Role: roleUser, Content: user},
	})
	if err != nil {
		ps.logger.Warn("action reaction AI failed, using template", "action", action, "error", err)
		return ""
	}
	return boundMessage(reply)
}

// ─── Community prompt generation (see pet_events.go) ─────────────────────

// eventPromptInstruction asks Alex to post a limited-time "reply to this" event.
// He never talks about points/rewards — replying just quietly counts as an
// interaction on the leaderboard.
func eventPromptInstruction() string {
	return "Post a short, fun LIMITED-TIME community moment to your Discord server. " +
		"Invite people to REPLY to your message with something themed to you — their favorite boba flavor, " +
		"their go-to coding snack, the last thing they shipped, their comfort food, a hot take, etc. " +
		"Make it playful and time-limited (encourage quick replies). 1–2 sentences, in character, hype. " +
		"Do NOT mention points, rewards, or a leaderboard. No hashtags, no markdown headers."
}

// questionPromptInstruction asks Alex to pose a casual, reply-worthy question.
func questionPromptInstruction() string {
	return "Ask your Discord server a short, casual, fun question to spark conversation (boba, tech, college life, " +
		"hobbies, hot takes — whatever fits you) and encourage people to reply. 1 sentence, in character. " +
		"Do NOT mention points, rewards, or a leaderboard. No hashtags, no markdown headers."
}

// eventPromptLines / questionPromptLines are the static fallbacks used when
// DeepSeek is unavailable. None mention points — replying just counts quietly.
var eventPromptLines = []string{
	"⏳ flash moment! reply to this with your favorite boba flavor, first few gimme the vibes 🧋",
	"quick one — reply with the last thing you shipped (or wanted to) 🚀 limited time, go go go!",
	"drop your comfort food in the replies 🍜 clock's tickin, lemme see em!",
	"reply with your go-to coding snack rn 💻🍪 limited-time, don't sleep on it!",
	"name a boba topping that goes CRAZY — reply and put me on 🧋 first few repliers!",
	"reply with your biggest W of the week 🏆 limited time, lessgo hype me up!",
	"flash prompt ⚡ reply with the app or site you can't live without rn 📱",
	"reply with your current hyperfixation, no judgment 👀 quick lil window, go!",
	"drop the last song you had on repeat 🎧 first few replies get me vibin fr",
	"reply with a hot take that'd start a war in the group chat 🔥 limited time!",
	"what's your comfort show for background noise while you grind? reply fast 📺",
	"reply with your dream job in 3 words or less 💼 clock's runnin, lemme see!",
	"name the city you'd move to tomorrow if money wasn't real 🌆 reply quick!",
	"reply with your controversial food combo 🍕 the weirder the better, go go!",
	"drop your most-used emoji, it says everything about you 😭 quick reply!",
	"reply with the tab you always have open but never close 🗂️ limited time!",
}

var questionPromptLines = []string{
	"real talk — what's the best boba order of all time? reply and lemme judge 🧋",
	"hot take: tabs or spaces? reply your answer, wrong answers welcome 💻",
	"what should I vibe-code next? drop ideas in the replies 🚀",
	"what's everybody grinding on today? reply and put me on 👀",
	"if you could intern anywhere this summer, where? reply, I'm nosy 💼",
	"what's the move this weekend, I need plans fr 🗓️ reply lemme live vicariously",
	"coffee or energy drink for the grind? reply, pick a side ☕⚡",
	"what game's eatin up all your time rn? reply and put me on 🎮",
	"what's a skill you wanna learn but keep putting off? reply, we accountability buddies now 📚",
	"morning grinder or 2am gremlin? reply and expose yourself 🌙",
	"what's the last thing that genuinely made you laugh? reply, I need it 😂",
	"if your life had a theme song rn what is it? reply 🎵",
	"desk setup check — what's the one thing you'd upgrade first? reply 🖥️",
	"what's a food everyone loves that you low-key can't stand? reply, be brave 🍽️",
	"what city has the best food scene, no wrong answers... except the wrong ones 🌎 reply!",
	"what's on your bucket list this year? reply and manifest it with me ✨",
}

func eventPromptLine() string    { return pick(eventPromptLines) }
func questionPromptLine() string { return pick(questionPromptLines) }

// promptAckContent generates Alex's reply to someone who answered a prompt —
// reacting to their answer and hyping them up. He does NOT mention points (the
// interaction is credited silently). "" on failure.
func (ps *PetService) promptAckContent(ctx context.Context, pet *PetState, userName, userAnswer string) string {
	if ps.deepseek == nil || !ps.deepseek.configured() {
		return ""
	}
	system := alexSystemPrompt
	if pet != nil {
		system += "\n\n" + petStateLine(pet)
	}
	system += fmt.Sprintf("\n\nSomeone named %q just replied to your community prompt. React to their answer in ONE "+
		"short, hype sentence and gas them up. Do NOT mention points, rewards, or a leaderboard. "+
		"No hashtags, no markdown headers.", userName)

	user := "Their reply: " + userAnswer
	if strings.TrimSpace(userAnswer) == "" {
		user = "They replied (you can't see the exact text) — just hype them up for joining in."
	}

	reqCtx, cancel := context.WithTimeout(ctx, aiTimeout)
	defer cancel()
	reply, err := ps.deepseek.Chat(reqCtx, []ChatMessage{
		{Role: roleSystem, Content: system},
		{Role: roleUser, Content: user},
	})
	if err != nil {
		return ""
	}
	return boundMessage(reply)
}

// promptAckLines are static fallbacks for the prompt reply — no points mentioned.
var promptAckLines = []string{
	"ayy that's a W answer 🔥 appreciate you fr 🧋",
	"sheeesh I fw that 😤 thank you for pullin up!",
	"that's bussin ngl 🙏 you carried today no cap",
	"W reply fr 💯 you the GOAT 🐐",
	"okok I see you 👀 love that answer, respect 🤝",
}

func promptAckLine() string {
	return pick(promptAckLines)
}

// careerReaction generates Alex's in-character hype when he adopts a new (custom)
// career/goal. "" on failure so the caller falls back to a generic blurb.
func (ps *PetService) careerReaction(ctx context.Context, pet *PetState, career string) string {
	if ps.deepseek == nil || !ps.deepseek.configured() {
		return ""
	}
	system := alexSystemPrompt
	if pet != nil {
		system += "\n\n" + petStateLine(pet)
	}
	user := fmt.Sprintf("You just decided your new dream career / goal is: %q. React in ONE short, hype in-character "+
		"sentence about chasing it and grinding toward it. No hashtags, no markdown headers, don't mention slash commands.", career)

	reqCtx, cancel := context.WithTimeout(ctx, aiTimeout)
	defer cancel()
	reply, err := ps.deepseek.Chat(reqCtx, []ChatMessage{
		{Role: roleSystem, Content: system},
		{Role: roleUser, Content: user},
	})
	if err != nil {
		ps.logger.Warn("career reaction AI failed, using template", "error", err)
		return ""
	}
	return boundMessage(reply)
}

// careInstruction asks Alex to plead for a specific need, mentioning the command.
func careInstruction(need string) string {
	cmd := map[string]string{
		"hungry": "/feed", "sleepy": "/rest", "stinky": "/clean",
		"sad": "/play or /chat", "sick": "/feed and /rest", "gone": "/revive",
	}[need]
	if cmd == "" {
		cmd = "/alex"
	}
	return fmt.Sprintf(
		"Post a short message to your Discord server letting everyone know you need care because you're feeling %q. "+
			"Naturally work in the %s command so someone helps you. 1–2 sentences, in character, a little dramatic and funny. "+
			"No hashtags. Don't use markdown headers.",
		need, cmd)
}

// ambientInstruction asks for a slice-of-life post, sometimes seeded with news.
func ambientInstruction(ctx context.Context) string {
	base := "Post a short, fun slice-of-life status update to your Discord server about what you're up to right now, " +
		"or ask the server a casual question to spark conversation. 1–2 sentences, in character. " +
		"No hashtags, no markdown headers."

	// ~45% of the time, riff on a real tech headline if we have one.
	if rand.Intn(100) < 45 {
		if hs := headlines(ctx); len(hs) > 0 {
			pick3 := shuffleTop(hs, 3)
			return base + "\n\nOptionally, you can react to one of these tech headlines from today (only if it's " +
				"funny or interesting to you — otherwise ignore them):\n- " + strings.Join(pick3, "\n- ")
		}
	}
	return base
}

// shuffleTop returns up to n randomly-chosen items from xs.
func shuffleTop(xs []string, n int) []string {
	cp := append([]string(nil), xs...)
	rand.Shuffle(len(cp), func(i, j int) { cp[i], cp[j] = cp[j], cp[i] })
	if len(cp) > n {
		cp = cp[:n]
	}
	return cp
}

// boundMessage trims/limits a generated message to something Discord-friendly.
func boundMessage(s string) string {
	s = strings.TrimSpace(s)
	// Strip surrounding quotes the model sometimes adds.
	s = strings.Trim(s, "\"")
	s = strings.TrimSpace(s)
	const max = 600
	r := []rune(s)
	if len(r) > max {
		s = strings.TrimSpace(string(r[:max])) + "…"
	}
	return s
}
