package botworker

import (
	"os"
	"path/filepath"
	"testing"
)

// s3Configured / backend selection: S3 is used only when ALL four S3_* vars are
// set; otherwise the local filesystem backend is used. Mirrors
// lib/storage/s3.server.ts s3Configured().

func TestS3ConfiguredRequiresAllFourVars(t *testing.T) {
	all := map[string]string{
		"S3_BUCKET":            "b",
		"S3_ENDPOINT":          "https://s3.example.com",
		"S3_ACCESS_KEY_ID":     "ak",
		"S3_SECRET_ACCESS_KEY": "sk",
	}
	// All set => configured.
	for k, v := range all {
		t.Setenv(k, v)
	}
	if !s3Configured() {
		t.Fatal("s3Configured = false with all four vars set")
	}
	// Drop each one in turn => not configured.
	for missing := range all {
		for k, v := range all {
			if k == missing {
				t.Setenv(k, "")
			} else {
				t.Setenv(k, v)
			}
		}
		if s3Configured() {
			t.Errorf("s3Configured = true with %s unset", missing)
		}
	}
}

func TestStorageBackendSelection(t *testing.T) {
	// No S3 vars => local backend.
	for _, k := range []string{"S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"} {
		t.Setenv(k, "")
	}
	if got := storageBackendName(); got != "local" {
		t.Errorf("backend = %q, want local", got)
	}
	// All S3 vars => s3 backend.
	t.Setenv("S3_BUCKET", "b")
	t.Setenv("S3_ENDPOINT", "https://s3.example.com")
	t.Setenv("S3_ACCESS_KEY_ID", "ak")
	t.Setenv("S3_SECRET_ACCESS_KEY", "sk")
	if got := storageBackendName(); got != "s3" {
		t.Errorf("backend = %q, want s3", got)
	}
}

// Object-key derivation must match keys.ts: feedImageKey prefixes "rmharks/",
// and the S3 PutObject must use that exact key (no extra normalization). The
// resulting feed URL must be identical to what Node produces.
func TestS3ObjectKeyMatchesKeysTS(t *testing.T) {
	filename := "user1-1700000000000-123456789.jpg"
	key := feedImageKey(filename)
	if key != "rmharks/"+filename {
		t.Fatalf("feedImageKey = %q, want rmharks/%s", key, filename)
	}
	// The S3 PutObject key derivation is identity on the feed key (no rewriting),
	// matching the Node putObject(key, …) call which passes Key: key verbatim.
	if got := s3ObjectKey(key); got != key {
		t.Errorf("s3ObjectKey rewrote the key: got %q, want %q", got, key)
	}
	// And the URL the web app serves is /api/feed/image/<filename>.
	if url := feedImageURL(filename); url != "/api/feed/image/"+filename {
		t.Errorf("feedImageURL = %q", url)
	}
}

func TestS3RegionDefault(t *testing.T) {
	t.Setenv("S3_REGION", "")
	if got := s3Region(); got != "us-east-1" {
		t.Errorf("s3Region default = %q, want us-east-1", got)
	}
	t.Setenv("S3_REGION", "eu-west-2")
	if got := s3Region(); got != "eu-west-2" {
		t.Errorf("s3Region = %q, want eu-west-2", got)
	}
}

func TestS3ForcePathStyle(t *testing.T) {
	// Default (unset) => true, mirroring `S3_FORCE_PATH_STYLE !== "false"`.
	t.Setenv("S3_FORCE_PATH_STYLE", "")
	if !s3ForcePathStyle() {
		t.Error("s3ForcePathStyle default = false, want true")
	}
	// Only the literal "false" disables it.
	t.Setenv("S3_FORCE_PATH_STYLE", "false")
	if s3ForcePathStyle() {
		t.Error("s3ForcePathStyle(\"false\") = true, want false")
	}
	t.Setenv("S3_FORCE_PATH_STYLE", "true")
	if !s3ForcePathStyle() {
		t.Error("s3ForcePathStyle(\"true\") = false, want true")
	}
	// Any other value also keeps path style on (Node only special-cases "false").
	t.Setenv("S3_FORCE_PATH_STYLE", "anything")
	if !s3ForcePathStyle() {
		t.Error("s3ForcePathStyle(\"anything\") = false, want true")
	}
}

// Local fallback still works and writes under LOCAL_STORAGE_DIR.
func TestLocalPutFallback(t *testing.T) {
	for _, k := range []string{"S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"} {
		t.Setenv(k, "")
	}
	dir := t.TempDir()
	t.Setenv("LOCAL_STORAGE_DIR", dir)
	if err := putObject(feedImageKey("u-1-2.png"), []byte("PNGDATA"), "image/png"); err != nil {
		t.Fatalf("putObject local fallback failed: %v", err)
	}
	// The file must exist under <dir>/rmharks/u-1-2.png with the written bytes.
	data, err := os.ReadFile(filepath.Join(dir, "rmharks", "u-1-2.png"))
	if err != nil {
		t.Fatalf("local putObject did not write expected key under %s: %v", dir, err)
	}
	if string(data) != "PNGDATA" {
		t.Errorf("local file contents = %q, want PNGDATA", string(data))
	}
}
