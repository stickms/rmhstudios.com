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
	if l, ok := careerLabel[p.Career]; ok {
		career = "working toward becoming a " + l
	}
	return fmt.Sprintf("You (Alex) are a %s right now, feeling: %s. You're %s.",
		stageWord(p.LifeStage), mood.Label, career)
}

// proactiveContent generates Alex's message for a proactive broadcast via
// DeepSeek, or returns "" if unavailable (caller falls back to a template).
func (ps *PetService) proactiveContent(ctx context.Context, pl plan) string {
	if ps.deepseek == nil || !ps.deepseek.configured() {
		return ""
	}

	system := alexSystemPrompt + "\n\n" + petStateLine(&pl.pet)
	var instruction string

	switch pl.kind {
	case kindCareAlert:
		instruction = careInstruction(pl.need)
	case kindAmbient:
		instruction = ambientInstruction(ctx)
	default:
		return ""
	}

	reqCtx, cancel := context.WithTimeout(ctx, aiTimeout)
	defer cancel()
	reply, err := ps.deepseek.Chat(reqCtx, []ChatMessage{
		{Role: roleSystem, Content: system},
		{Role: roleUser, Content: instruction},
	})
	if err != nil {
		ps.logger.Warn("proactive AI generation failed, using template", "error", err)
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
