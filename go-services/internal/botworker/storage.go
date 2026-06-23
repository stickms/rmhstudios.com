package botworker

// storage.go — object storage for bot-generated feed images, ported from
// lib/storage/s3.server.ts. Production writes to S3 (so the web app can serve
// the image key from S3/CDN); local development falls back to the filesystem.
//
// Backend selection mirrors s3Configured(): S3 is used iff ALL of S3_BUCKET,
// S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are set; otherwise the
// local filesystem backend (LOCAL_STORAGE_DIR || ".uploads") is used.
//
// The object key passed to S3 is the feed key from keys.ts verbatim
// ("rmharks/<filename>"), and the content-type matches contentTypeForFilename,
// so the resulting feed URL is identical to what the Node side produces.

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ─── Env contract (mirrors s3.server.ts) ───────────────────────────────

// s3Configured reports whether all four S3 vars are set. Mirrors Node
// s3Configured().
func s3Configured() bool {
	return os.Getenv("S3_BUCKET") != "" &&
		os.Getenv("S3_ENDPOINT") != "" &&
		os.Getenv("S3_ACCESS_KEY_ID") != "" &&
		os.Getenv("S3_SECRET_ACCESS_KEY") != ""
}

// storageBackendName returns "s3" or "local" for the active backend.
func storageBackendName() string {
	if s3Configured() {
		return "s3"
	}
	return "local"
}

// s3Region resolves S3_REGION (default "us-east-1"). Mirrors Node.
func s3Region() string {
	if r := os.Getenv("S3_REGION"); r != "" {
		return r
	}
	return "us-east-1"
}

// s3ForcePathStyle mirrors Node `process.env.S3_FORCE_PATH_STYLE !== "false"`:
// path-style addressing is on unless the var is exactly the string "false".
func s3ForcePathStyle() bool {
	return os.Getenv("S3_FORCE_PATH_STYLE") != "false"
}

// s3ObjectKey is the identity transform on the feed key — the Node putObject
// passes Key: key verbatim, so we must not rewrite it. Exists so the parity is
// explicit and unit-testable.
func s3ObjectKey(key string) string { return key }

// ─── putObject dispatch ────────────────────────────────────────────────

// putObject hosts the bytes under the given key. Uses S3 when configured, else
// the local filesystem. Mirrors lib/storage/s3.server.ts putObject().
func putObject(key string, body []byte, contentType string) error {
	if !s3Configured() {
		return localPut(key, body)
	}
	return s3Put(key, body, contentType)
}

// ─── Local filesystem backend ──────────────────────────────────────────

// localPut writes under LOCAL_STORAGE_DIR (default ".uploads"), preserving the
// key path while preventing traversal. Mirrors the Node localPut/localPath.
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

// ─── S3 backend ────────────────────────────────────────────────────────

// s3Put uploads to the configured S3-compatible endpoint using static creds,
// the configured region, and forcePathStyle — matching the Node S3Client
// semantics exactly. The bucket is S3_BUCKET and the key is passed verbatim.
func s3Put(key string, body []byte, contentType string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	endpoint := os.Getenv("S3_ENDPOINT")
	bucket := os.Getenv("S3_BUCKET")
	creds := credentials.NewStaticCredentialsProvider(
		os.Getenv("S3_ACCESS_KEY_ID"),
		os.Getenv("S3_SECRET_ACCESS_KEY"),
		"",
	)

	client := s3.New(s3.Options{
		Region:       s3Region(),
		Credentials:  creds,
		BaseEndpoint: aws.String(endpoint),
		UsePathStyle: s3ForcePathStyle(),
	})

	objectKey := s3ObjectKey(key)
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	return err
}
