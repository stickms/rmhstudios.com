package vibeworker

// storage.go — object storage for rendered vibe thumbnails, mirroring
// lib/storage/s3.server.ts and go-services/internal/botworker/storage.go.
// Production writes WebP thumbnails to S3 (so the web app serves the key from
// S3/CDN); local development falls back to the filesystem (.uploads), which the
// Node proxy route (/api/vibe/thumb/<slug>) streams back via getObject.
//
// The object key matches the Node side (lib/storage/keys.ts vibeThumbKey):
// "vibe-thumbs/<slug>.webp", and the served URL matches vibeThumbUrl().

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ─── Env contract (mirrors s3.server.ts s3Configured) ──────────────────

func s3Configured() bool {
	return os.Getenv("S3_BUCKET") != "" &&
		os.Getenv("S3_ENDPOINT") != "" &&
		os.Getenv("S3_ACCESS_KEY_ID") != "" &&
		os.Getenv("S3_SECRET_ACCESS_KEY") != ""
}

func s3Region() string {
	if r := os.Getenv("S3_REGION"); r != "" {
		return r
	}
	return "us-east-1"
}

func s3ForcePathStyle() bool {
	return os.Getenv("S3_FORCE_PATH_STYLE") != "false"
}

// ─── Key + URL helpers (mirror lib/storage/keys.ts) ────────────────────

// vibeThumbKey is the object key for a slug's thumbnail: "vibe-thumbs/<slug>.webp".
func vibeThumbKey(slug string) string {
	return "vibe-thumbs/" + slug + ".webp"
}

// cdnBase mirrors lib/storage/asset.ts CDN_BASE (VITE_CDN_BASE_URL, trailing
// slash trimmed). Empty when no public CDN is configured.
func cdnBase() string {
	return strings.TrimRight(os.Getenv("VITE_CDN_BASE_URL"), "/")
}

// vibeThumbURL mirrors vibeThumbUrl(): CDN URL when configured, else the Node
// proxy route. Both carry the `?v=` cache-buster.
func vibeThumbURL(slug string, version int64) string {
	if base := cdnBase(); base != "" {
		return fmt.Sprintf("%s/%s?v=%d", base, vibeThumbKey(slug), version)
	}
	return fmt.Sprintf("/api/vibe/thumb/%s?v=%d", slug, version)
}

// ─── putObject dispatch (mirrors s3.server.ts putObject) ───────────────

func putObject(key string, body []byte, contentType string) error {
	if !s3Configured() {
		return localPut(key, body)
	}
	return s3Put(key, body, contentType)
}

// localPut writes under LOCAL_STORAGE_DIR (default ".uploads"), preserving the
// key path while preventing traversal. Mirrors the Node localPut.
func localPut(key string, body []byte) error {
	root := os.Getenv("LOCAL_STORAGE_DIR")
	if root == "" {
		root = ".uploads"
	}
	safe := strings.TrimLeft(strings.ReplaceAll(key, "\\", "/"), "/")
	safe = strings.ReplaceAll(safe, "..", "")
	dest := filepath.Join(root, filepath.FromSlash(safe))
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dest, body, 0o644)
}

// s3Put uploads to the configured S3-compatible endpoint using static creds,
// matching the Node S3Client semantics exactly.
func s3Put(key string, body []byte, contentType string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	creds := credentials.NewStaticCredentialsProvider(
		os.Getenv("S3_ACCESS_KEY_ID"),
		os.Getenv("S3_SECRET_ACCESS_KEY"),
		"",
	)
	client := s3.New(s3.Options{
		Region:       s3Region(),
		Credentials:  creds,
		BaseEndpoint: aws.String(os.Getenv("S3_ENDPOINT")),
		UsePathStyle: s3ForcePathStyle(),
	})
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(os.Getenv("S3_BUCKET")),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	return err
}
