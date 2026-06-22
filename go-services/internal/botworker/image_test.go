package botworker

import "testing"

func TestFeedImageKeyAndURL(t *testing.T) {
	if got := feedImageKey("user1-123-456.jpg"); got != "rmharks/user1-123-456.jpg" {
		t.Errorf("feedImageKey = %q", got)
	}
	if got := feedImageURL("user1-123-456.jpg"); got != "/api/feed/image/user1-123-456.jpg" {
		t.Errorf("feedImageURL = %q", got)
	}
}

func TestContentTypeForFilename(t *testing.T) {
	cases := map[string]string{
		"a.png":  "image/png",
		"a.jpg":  "image/jpeg",
		"a.jpeg": "image/jpeg",
		"a.webp": "image/webp",
		"a.gif":  "image/gif",
		"a.bin":  "application/octet-stream",
		"noext":  "application/octet-stream",
	}
	for in, want := range cases {
		if got := contentTypeForFilename(in); got != want {
			t.Errorf("contentTypeForFilename(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDetectImageExt(t *testing.T) {
	// JPEG magic: FF D8 FF
	jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00}
	if got := detectImageExt(jpeg); got != ".jpg" {
		t.Errorf("detectImageExt(jpeg) = %q, want .jpg", got)
	}
	// PNG magic: 89 50 4E 47 0D 0A 1A 0A
	png := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00}
	if got := detectImageExt(png); got != ".png" {
		t.Errorf("detectImageExt(png) = %q, want .png", got)
	}
	// GIF magic: "GIF8"
	gif := []byte("GIF89a...")
	if got := detectImageExt(gif); got != ".gif" {
		t.Errorf("detectImageExt(gif) = %q, want .gif", got)
	}
	// WEBP: RIFF....WEBP
	webp := []byte{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'}
	if got := detectImageExt(webp); got != ".webp" {
		t.Errorf("detectImageExt(webp) = %q, want .webp", got)
	}
	// Unknown
	if got := detectImageExt([]byte{0x00, 0x01, 0x02}); got != "" {
		t.Errorf("detectImageExt(unknown) = %q, want empty", got)
	}
}

func TestImageDailyCap(t *testing.T) {
	t.Setenv("XAI_IMAGE_DAILY_CAP", "")
	if got := imageDailyCap(); got != 50 {
		t.Errorf("imageDailyCap default = %d, want 50", got)
	}
	t.Setenv("XAI_IMAGE_DAILY_CAP", "100")
	if got := imageDailyCap(); got != 100 {
		t.Errorf("imageDailyCap override = %d, want 100", got)
	}
	t.Setenv("XAI_IMAGE_DAILY_CAP", "garbage")
	if got := imageDailyCap(); got != 50 {
		t.Errorf("imageDailyCap garbage = %d, want 50", got)
	}
}

func TestIsImageGenConfigured(t *testing.T) {
	t.Setenv("XAI_API_KEY", "")
	if isImageGenConfigured() {
		t.Error("isImageGenConfigured = true with no key")
	}
	t.Setenv("XAI_API_KEY", "k")
	t.Setenv("XAI_IMAGE_ENABLED", "false")
	if isImageGenConfigured() {
		t.Error("isImageGenConfigured = true with kill switch")
	}
	t.Setenv("XAI_IMAGE_ENABLED", "true")
	if !isImageGenConfigured() {
		t.Error("isImageGenConfigured = false with key + enabled")
	}
}

func TestTodayKey(t *testing.T) {
	got := todayKey()
	if len(got) != 10 || got[4] != '-' || got[7] != '-' {
		t.Errorf("todayKey = %q, want YYYY-MM-DD", got)
	}
}
