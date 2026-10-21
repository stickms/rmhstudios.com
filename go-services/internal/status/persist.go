package status

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// HistoryFileName is the on-disk file the uptime history is persisted to,
// matching the Node service (server/status/index.ts).
const HistoryFileName = "status-history.json"

// ExtendedFileName holds everything the Node format has no room for: the daily
// rollups, the recent-sample ring and the running counters. It sits beside the
// history file so the Node-compatible file stays exactly that.
const ExtendedFileName = "status-extended.json"

// IncidentsFileName holds incidents, maintenance windows and announcements.
const IncidentsFileName = "status-incidents.json"

// extendedState is the on-disk shape of ExtendedFileName.
type extendedState struct {
	Version  int                  `json:"version"`
	Daily    map[string][]Bucket  `json:"daily"`
	Recent   map[string][]Sample  `json:"recent"`
	Counters map[string]*Counters `json:"counters"`
}

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
	p.extPath = filepath.Join(filepath.Dir(path), ExtendedFileName)
	p.logger = logger
	p.mu.Unlock()
	p.LoadHistory()
	p.loadExtended()
}

// loadExtended reads the extended-state file. Like LoadHistory it tolerates a
// missing or corrupt file. A service with hourly history but no daily rollup —
// the first boot after this file was introduced — has its daily series rebuilt
// from the hourly one, so the long view starts with what is already known.
func (p *Prober) loadExtended() {
	p.mu.RLock()
	path := p.extPath
	p.mu.RUnlock()
	if path == "" {
		return
	}

	var st extendedState
	data, err := os.ReadFile(path)
	if err == nil {
		if jerr := json.Unmarshal(data, &st); jerr != nil {
			p.warn("status: extended history corrupt — rebuilding", "path", path, "error", jerr)
			st = extendedState{}
		}
	} else if !os.IsNotExist(err) {
		p.warn("status: could not read extended history", "path", path, "error", err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	for name, h := range p.hist {
		h.mu.Lock()
		if d, ok := st.Daily[name]; ok && len(d) > 0 {
			if len(d) > p.maxDays {
				d = d[len(d)-p.maxDays:]
			}
			h.daily = d
		} else if len(h.buckets) > 0 {
			h.daily = rollupDaily(h.buckets)
		}
		if r, ok := st.Recent[name]; ok {
			if p.recentCap > 0 && len(r) > p.recentCap {
				r = r[len(r)-p.recentCap:]
			}
			h.recent = r
		}
		if c, ok := st.Counters[name]; ok && c != nil {
			if c.Codes == nil {
				c.Codes = map[string]int{}
			}
			if c.Errors == nil {
				c.Errors = map[string]int{}
			}
			h.ctr = c
		}
		h.mu.Unlock()
	}
}

// saveExtendedLocked writes the extended state atomically. Caller holds p.mu.
func (p *Prober) saveExtendedLocked() {
	if p.extPath == "" {
		return
	}
	st := extendedState{
		Version:  1,
		Daily:    make(map[string][]Bucket, len(p.hist)),
		Recent:   make(map[string][]Sample, len(p.hist)),
		Counters: make(map[string]*Counters, len(p.hist)),
	}
	for _, t := range p.targets {
		h := p.hist[t.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		st.Daily[t.Name] = append([]Bucket(nil), h.daily...)
		st.Recent[t.Name] = append([]Sample(nil), h.recent...)
		if h.ctr != nil {
			cp := *h.ctr
			cp.Codes = copyCounts(h.ctr.Codes)
			cp.Errors = copyCounts(h.ctr.Errors)
			cp.Changes = append([]int64(nil), h.ctr.Changes...)
			st.Counters[t.Name] = &cp
		}
		h.mu.Unlock()
	}
	data, err := json.Marshal(st)
	if err != nil {
		p.warn("status: could not encode extended history", "error", err)
		return
	}
	if err := writeFileAtomic(p.extPath, data); err != nil {
		p.lastSaveErr = err.Error()
		p.warn("status: could not persist extended history", "path", p.extPath, "error", err)
	}
}

func copyCounts(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// writeFileAtomic writes data to path via a tmp file and a rename, creating the
// directory if needed, so a crash mid-write never leaves a truncated file.
func writeFileAtomic(path string, data []byte) error {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
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
		logger.Info("status: loaded uptime history", "services", loaded, "path", path)
	}
}

// SaveHistory persists the rolling history to historyPath, acquiring the lock.
// It is the exported, lock-acquiring counterpart of saveHistoryLocked, used for
// the final flush on shutdown (Node's SIGTERM saveHistory()). It is a no-op
// when persistence is disabled (historyPath empty). Best-effort: errors are
// logged, never returned.
func (p *Prober) SaveHistory() {
	// The full lock, not the read lock: a save records its own outcome
	// (lastSaveAt / lastSaveErr) for the prober-health panel.
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.historyPath == "" {
		return
	}
	p.saveHistoryLocked()
	p.saveExtendedLocked()
}

// saveHistoryLocked writes the rolling history to historyPath atomically
// (tmp file + rename), mirroring Node's saveHistory(). The caller MUST hold
// p.mu for writing. Best-effort: failures are logged, never returned.
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
		p.lastSaveErr = err.Error()
		p.warn("status: could not write history tmp", "path", tmp, "error", err)
		return
	}
	if err := os.Rename(tmp, p.historyPath); err != nil {
		p.lastSaveErr = err.Error()
		p.warn("status: could not persist history", "path", p.historyPath, "error", err)
		return
	}
	p.lastSaveAt = time.Now()
	p.lastSaveErr = ""
}

func (p *Prober) warn(msg string, args ...any) {
	if p.logger != nil {
		p.logger.Warn(msg, args...)
	}
}
