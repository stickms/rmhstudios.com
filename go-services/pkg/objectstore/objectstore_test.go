// go-services/pkg/objectstore/objectstore_test.go
package objectstore

import (
	"errors"
	"testing"
)

func TestParseConfigDefaults(t *testing.T) {
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_REGION", "us-east-1")
	t.Setenv("S3_ACCESS_KEY_ID", "k")
	t.Setenv("S3_SECRET_ACCESS_KEY", "s")
	t.Setenv("S3_BUCKET", "rmh-media")
	t.Setenv("S3_FORCE_PATH_STYLE", "true")

	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if cfg.bucket != "rmh-media" {
		t.Errorf("bucket = %q, want rmh-media", cfg.bucket)
	}
	if !cfg.forcePathStyle {
		t.Errorf("forcePathStyle = false, want true")
	}
}

func TestLoadConfigMissingBucket(t *testing.T) {
	t.Setenv("S3_ENDPOINT", "http://minio:9000")
	t.Setenv("S3_BUCKET", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected error for missing S3_BUCKET")
	}
}

func TestSentinelsDistinct(t *testing.T) {
	if errors.Is(ErrNotFound, ErrRangeNotSatisfiable) {
		t.Fatal("sentinels must be distinct")
	}
}
