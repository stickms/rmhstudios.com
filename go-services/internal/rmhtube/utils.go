package rmhtube

import (
	"crypto/rand"
	"net/url"
	"regexp"
	"strings"
)

// Pure string-op ports of lib/rmhtube/utils.ts. No network access — YouTube
// metadata resolution that the TS version stubbed (title) is reproduced exactly.

const (
	roomCodeLength   = 6
	roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

var sanitizeStrip = regexp.MustCompile(`[<>&"']`)

// directMediaRe matches direct-playable file extensions (mirrors the TS regex
// /\.(mp4|webm|ogg|m3u8|mpd)(\?|$)/i applied to the URL pathname).
var directMediaRe = regexp.MustCompile(`(?i)\.(mp4|webm|ogg|m3u8|mpd)(\?|$)`)

// sanitizeString ports utils.ts sanitizeString: trim, strip HTML-significant
// chars, truncate to maxLength (by rune, matching JS string .slice semantics
// closely enough for the ASCII inputs this guards).
func sanitizeString(raw string, maxLength int) string {
	s := strings.TrimSpace(raw)
	s = sanitizeStrip.ReplaceAllString(s, "")
	r := []rune(s)
	if len(r) > maxLength {
		r = r[:maxLength]
	}
	return string(r)
}

// generateRoomCode ports utils.ts generateRoomCode (crypto/rand instead of
// nanoid's Math.random-backed alphabet generator).
func generateRoomCode() string {
	return randomCode(roomCodeLength, roomCodeAlphabet)
}

const nanoidAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict"

// nanoid ports the lib usage of nanoid(n) for invite codes / queue ids / chat
// ids / message ids. The exact alphabet is not load-bearing (ids are opaque),
// only uniqueness and length are; this uses nanoid's default alphabet.
func nanoid(n int) string { return randomCode(n, nanoidAlphabet) }

func randomCode(n int, alphabet string) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	out := make([]byte, n)
	for i := range out {
		out[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(out)
}

// detectMediaType ports utils.ts detectMediaType. Returns "" when the URL is not
// a supported media source (the TS null).
func detectMediaType(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")

	switch {
	case host == "youtube.com" || host == "youtu.be" || host == "m.youtube.com":
		return "youtube"
	case host == "twitch.tv" || strings.HasSuffix(host, ".twitch.tv"):
		return "twitch"
	case directMediaRe.MatchString(parsed.Path):
		return "direct"
	}
	return ""
}

// extractYouTubeID ports utils.ts extractYouTubeId. Returns "" when no id.
func extractYouTubeID(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	switch host {
	case "youtu.be":
		return strings.TrimPrefix(parsed.Path, "/")
	case "youtube.com", "m.youtube.com":
		return parsed.Query().Get("v")
	}
	return ""
}

// youtubeThumbURL ports utils.ts youtubeThumbUrl.
func youtubeThumbURL(videoID string) string {
	return "https://img.youtube.com/vi/" + videoID + "/mqdefault.jpg"
}
