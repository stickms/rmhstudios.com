package ledger

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Store is a content-addressed artifact store backed by the local filesystem.
// Artifacts are immutable once written; writing the same bytes twice is a no-op.
type Store struct{ root string }

// NewStore creates a Store rooted at dir, creating the directory if needed.
func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("ledger store: mkdir %s: %w", dir, err)
	}
	return &Store{root: dir}, nil
}

// Put streams r into the store. It computes the SHA-256 hash incrementally so
// the content is never held fully in memory. Returns the artifact ID
// ("sha256:<hex>") and byte count. If an artifact with the same hash already
// exists the write is skipped (idempotent).
func (s *Store) Put(_ context.Context, r io.Reader) (id string, n int64, err error) {
	// Write to a temp file in the root so the rename is on the same filesystem.
	tmp, err := os.CreateTemp(s.root, ".tmp-*")
	if err != nil {
		return "", 0, fmt.Errorf("ledger store: create temp: %w", err)
	}
	tmpName := tmp.Name()
	// Clean up on any error path.
	defer func() {
		if err != nil {
			tmp.Close()
			os.Remove(tmpName)
		}
	}()

	h := sha256.New()
	n, err = io.Copy(io.MultiWriter(tmp, h), r)
	if err != nil {
		return "", 0, fmt.Errorf("ledger store: write temp: %w", err)
	}
	if err = tmp.Close(); err != nil {
		return "", 0, fmt.Errorf("ledger store: close temp: %w", err)
	}

	hexHash := hex.EncodeToString(h.Sum(nil))
	id = "sha256:" + hexHash
	dest := s.path(hexHash)

	if err = os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", 0, fmt.Errorf("ledger store: mkdir shard: %w", err)
	}
	// If the artifact already exists, discard the temp file.
	if _, statErr := os.Stat(dest); statErr == nil {
		os.Remove(tmpName)
		return id, n, nil
	}
	if err = os.Rename(tmpName, dest); err != nil {
		return "", 0, fmt.Errorf("ledger store: rename to dest: %w", err)
	}
	return id, n, nil
}

// Get opens the artifact for reading. The caller must close the returned reader.
func (s *Store) Get(_ context.Context, id string) (io.ReadCloser, error) {
	hexHash, err := parseID(id)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(s.path(hexHash))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("ledger store: artifact %s not found", id)
		}
		return nil, fmt.Errorf("ledger store: open %s: %w", id, err)
	}
	return f, nil
}

// Has reports whether the artifact exists in the store.
func (s *Store) Has(_ context.Context, id string) (bool, error) {
	hexHash, err := parseID(id)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(s.path(hexHash))
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

// StoragePath returns the relative path for hex (used when building ArtifactMeta).
func (s *Store) StoragePath(id string) (string, error) {
	hexHash, err := parseID(id)
	if err != nil {
		return "", err
	}
	return hexHash[:2] + "/" + hexHash, nil
}

// path builds the absolute path for a hex hash.
func (s *Store) path(hexHash string) string {
	return filepath.Join(s.root, hexHash[:2], hexHash)
}

// parseID strips the "sha256:" prefix and validates the hex length.
func parseID(id string) (string, error) {
	const prefix = "sha256:"
	if len(id) < len(prefix)+64 || id[:len(prefix)] != prefix {
		return "", fmt.Errorf("ledger store: invalid artifact id %q", id)
	}
	return id[len(prefix):], nil
}
