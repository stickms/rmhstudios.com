package status

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// HistoryFileName is the on-disk file the uptime history is persisted to,
// matching the Node service (server/status/index.ts).
const HistoryFileName = "status-history.json"

// ResolveHistoryPath resolves the uptime-history file path exactly as the Node
// service does:
//
//	DATA_DIR = STATUS_DATA_DIR ?? (existsSync('/app/db') ? '/app/db' : './db')
//	HISTORY_FILE = join(DATA_DIR, 'status-history.json')
//
// dataDirEnv is the STATUS_DATA_DIR value ("" when unset).
func ResolveHistoryPath(dataDirEnv string) string {
	dataDir := dataDirEnv
	if dataDir == "" {
		if st, err := os.Stat("/app/db"); err == nil && st.IsDir() {
			dataDir = "/app/db"
		} else {
			dataDir = "./db"
		}
	}
	return filepath.Join(dataDir, HistoryFileName)
}

// EnableHistoryPersistence turns on load-on-start / save-after-probe persistence
// to path, logging non-fatal problems via logger (which may be nil). It loads
// any existing history immediately so percentages survive restarts.
func (p *Prober) EnableHistoryPersistence(path string, logger Warner) {
	p.mu.Lock()
	p.historyPath = path
	p.logger = logger
	p.mu.Unlock()
	p.LoadHistory()
}

// LoadHistory reads the persisted history file (if present) and seeds each
// service's buckets, capped to maxBuckets newest. A missing or corrupt file is
// tolerated: the prober starts fresh and a warning is logged. Mirrors Node's
// loadHistory().
func (p *Prober) LoadHistory() {
	p.mu.RLock()
	path := p.historyPath
	logger := p.logger
	p.mu.RUnlock()
	if path == "" {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) && logger != nil {
			logger.Warn("status: could not read history — starting fresh", "path", path, "error", err)
		}
		return
	}

	var stored map[string][]Bucket
	if err := json.Unmarshal(data, &stored); err != nil {
		if logger != nil {
			logger.Warn("status: history file corrupt — starting fresh", "path", path, "error", err)
		}
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	loaded := 0
	for name, buckets := range stored {
		h := p.hist[name]
		if h == nil {
			// Keep history for services not currently configured? Node only
			// re-attaches buckets for names it iterates from the file but never
			// surfaces them without a matching service, so skip unknown names.
			continue
		}
		if len(buckets) > p.maxBuckets {
			buckets = buckets[len(buckets)-p.maxBuckets:]
		}
		h.mu.Lock()
		h.buckets = buckets
		h.mu.Unlock()
		loaded++
	}
	if logger != nil {
		logger.Warn("status: loaded uptime history", "services", loaded, "path", path)
	}
}

// saveHistoryLocked writes the rolling history to historyPath atomically
// (tmp file + rename), mirroring Node's saveHistory(). The caller MUST hold
// p.mu (read or write). Best-effort: failures are logged, never returned.
func (p *Prober) saveHistoryLocked() {
	obj := make(map[string][]Bucket, len(p.targets))
	for _, t := range p.targets {
		h := p.hist[t.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		if len(h.buckets) > 0 {
			cp := make([]Bucket, len(h.buckets))
			copy(cp, h.buckets)
			obj[t.Name] = cp
		}
		h.mu.Unlock()
	}

	data, err := json.Marshal(obj)
	if err != nil {
		p.warn("status: could not encode history", "error", err)
		return
	}

	if dir := filepath.Dir(p.historyPath); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			p.warn("status: could not create data dir", "dir", dir, "error", err)
			return
		}
	}

	tmp := p.historyPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		p.warn("status: could not write history tmp", "path", tmp, "error", err)
		return
	}
	if err := os.Rename(tmp, p.historyPath); err != nil {
		p.warn("status: could not persist history", "path", p.historyPath, "error", err)
	}
}

func (p *Prober) warn(msg string, args ...any) {
	if p.logger != nil {
		p.logger.Warn(msg, args...)
	}
}
