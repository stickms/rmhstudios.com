package rmhmusic

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// generateRoomCode produces a short human-friendly join code from the
// unambiguous alphabet, the Go analog of nanoid's customAlphabet in
// lib/rmhmusic/utils.ts.
func generateRoomCode() string {
	return randString(roomCodeAlphabet, roomCodeLength)
}

// generateRoomID produces a nanoid-style url-safe id used as the room's
// primary key (the Node service used nanoid() with the default 21-char alphabet).
func generateRoomID() string {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
	return randString(alphabet, 21)
}

// generateItemID is the nanoid analog used for queue items and chat messages.
func generateItemID() string {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
	return randString(alphabet, 21)
}

func randString(alphabet string, n int) string {
	var b strings.Builder
	b.Grow(n)
	max := big.NewInt(int64(len(alphabet)))
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand failure is effectively impossible; fall back to 0 so
			// the id is still well-formed rather than panicking a live service.
			b.WriteByte(alphabet[0])
			continue
		}
		b.WriteByte(alphabet[idx.Int64()])
	}
	return b.String()
}

// sanitizeString trims, strips a few HTML-significant characters, and truncates,
// matching sanitizeString in lib/rmhmusic/utils.ts.
func sanitizeString(raw string, maxLength int) string {
	s := strings.TrimSpace(raw)
	s = strings.NewReplacer("<", "", ">", "", "&", "", "\"", "", "'", "").Replace(s)
	if len(s) > maxLength {
		s = s[:maxLength]
	}
	return s
}
