package ledger

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Handler exposes the Ledger's HTTP API.
type Handler struct {
	svc    *Service
	logger *log.Logger
}

// NewHandler builds a Handler.
func NewHandler(svc *Service, logger *log.Logger) *Handler {
	return &Handler{svc: svc, logger: logger}
}

// RegisterRoutes wires the Ledger API routes into mux.
// All paths are under /ledger/v0/.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /ledger/v0/artifacts", h.putArtifact)
	mux.HandleFunc("GET /ledger/v0/artifacts/{hash}", h.getArtifact)
	mux.HandleFunc("GET /ledger/v0/artifacts/{hash}/content", h.getArtifactContent)
	mux.HandleFunc("POST /ledger/v0/runs", h.createRun)
	mux.HandleFunc("GET /ledger/v0/runs/{id}", h.getRun)
	mux.HandleFunc("POST /ledger/v0/runs/{runId}/steps", h.recordStep)
}

// POST /ledger/v0/artifacts
// Body: raw bytes. Content-Type header becomes artifact contentType.
// Returns: ArtifactMeta JSON.
func (h *Handler) putArtifact(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	meta, err := h.svc.WriteArtifact(r.Context(), r.Body, contentType)
	if err != nil {
		h.logger.Error("ledger: put artifact", "error", err)
		httpx.WriteJSON(w, http.StatusInternalServerError, errBody(err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, meta)
}

// GET /ledger/v0/artifacts/{hash}
// Returns artifact metadata JSON (no content).
func (h *Handler) getArtifact(w http.ResponseWriter, r *http.Request) {
	id := artifactID(r)
	meta, err := h.svc.GetArtifactMeta(r.Context(), id)
	if err != nil {
		h.logger.Error("ledger: get artifact meta", "id", id, "error", err)
		httpx.WriteJSON(w, http.StatusNotFound, errBody(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, meta)
}

// GET /ledger/v0/artifacts/{hash}/content
// Streams raw artifact bytes.
func (h *Handler) getArtifactContent(w http.ResponseWriter, r *http.Request) {
	id := artifactID(r)
	meta, rc, err := h.svc.ReadArtifact(r.Context(), id)
	if err != nil {
		h.logger.Error("ledger: get artifact content", "id", id, "error", err)
		httpx.WriteJSON(w, http.StatusNotFound, errBody(err))
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", meta.ContentType)
	w.Header().Set("X-Ledger-ID", meta.ID)
	w.WriteHeader(http.StatusOK)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := rc.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
		}
		if readErr != nil {
			break
		}
	}
}

// POST /ledger/v0/runs
// Body: {"description":"..."}
// Returns: PlanRun JSON (includes bundleId and rerunCmd).
func (h *Handler) createRun(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, errBody(err))
		return
	}
	run, err := h.svc.CreateRun(r.Context(), req.Description)
	if err != nil {
		h.logger.Error("ledger: create run", "error", err)
		httpx.WriteJSON(w, http.StatusInternalServerError, errBody(err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, runResponse(run, nil))
}

// GET /ledger/v0/runs/{id}
// id can be the cuid run ID or the human-readable bundleId.
// Returns: full run with steps and provenance graph.
func (h *Handler) getRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var run PlanRun
	var steps []PlanStep
	var err error
	if strings.HasPrefix(id, "run-") {
		run, steps, err = h.svc.GetRunByBundleID(r.Context(), id)
	} else {
		run, steps, err = h.svc.GetRun(r.Context(), id)
	}
	if err != nil {
		h.logger.Error("ledger: get run", "id", id, "error", err)
		httpx.WriteJSON(w, http.StatusNotFound, errBody(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, runResponse(run, steps))
}

// POST /ledger/v0/runs/{runId}/steps
// Body: RecordStepRequest JSON.
// Returns: PlanStep JSON.
func (h *Handler) recordStep(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("runId")
	var req RecordStepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, errBody(err))
		return
	}
	req.RunID = runID
	step, err := h.svc.RecordStep(r.Context(), req)
	if err != nil {
		h.logger.Error("ledger: record step", "runId", runID, "error", err)
		httpx.WriteJSON(w, http.StatusInternalServerError, errBody(err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, step)
}

// artifactID extracts the artifact ID path value and re-adds the "sha256:" prefix
// since URL path segments cannot contain colons on some routers/proxies.
// Clients may pass the full "sha256:<hex>" or just the "<hex>" part.
func artifactID(r *http.Request) string {
	v := r.PathValue("hash")
	if strings.HasPrefix(v, "sha256:") {
		return v
	}
	return "sha256:" + v
}

// runResponse is the JSON shape for a run (including rerunCmd and steps).
func runResponse(run PlanRun, steps []PlanStep) any {
	return struct {
		PlanRun
		RerunCmd string     `json:"rerunCmd"`
		Steps    []PlanStep `json:"steps,omitempty"`
	}{run, run.RerunCmd(), steps}
}

func errBody(err error) any {
	return map[string]string{"error": err.Error()}
}
