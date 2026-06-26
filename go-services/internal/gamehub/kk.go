package gamehub

import (
	"crypto/rand"
	"encoding/json"
	"strconv"
	"strings"
	"sync"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Kowloon Knockout — Go port of
// server/socket-server/handlers/kowloon-knockout.ts.
//
// Lobby-based, host-authoritative rooms for up to 4 fighters (FFA or teams).
// Humans occupy stable seat slots (0..3); empty slots up to the host-chosen
// arena size are filled by CPU. In-match, guests stream compact input commands
// to the host (seat 0), and the host broadcasts quantized snapshots to every
// guest. Ported standalone (rather than via RelayGroup) because of the lobby /
// seat bookkeeping, which is worth keeping verbatim against the source of truth.

// Event constants — kept 1:1 with the TS C2S/S2C maps.
const (
	kkCreateRoom = "kk:create_room"
	kkJoinRoom   = "kk:join_room"
	kkSetFighter = "kk:set_fighter"
	kkSetConfig  = "kk:set_config"
	kkStart      = "kk:start"
	kkInput      = "kk:input"
	kkSnapshot   = "kk:snapshot"
	kkLeave      = "kk:leave"

	kkRoomCreated = "kk:room_created"
	kkLobbyUpdate = "kk:lobby_update"
	kkMatchStart  = "kk:match_start"
	kkPlayerLeft  = "kk:player_left"
	kkError       = "kk:error"

	kkMaxSeats       = 4
	kkDefaultFighter = "stone_tiger"
	kkAIDifficulty   = 0.6
)

var kkAIPool = []string{
	"iron_bull", "silver_viper", "night_crane", "ghost_monkey",
	"black_tortoise", "red_phoenix", "smoke_leopard", "jade_dragon", "stone_tiger",
}

// kkSlot is one seat occupant (a human connection + chosen fighter).
type kkSlot struct {
	ConnID    string
	ClassName string
}

// KKRoom is a single lobby/match. Slots index == seat number.
type KKRoom struct {
	Code      string
	Mode      string // "ffa" | "teams"
	ArenaSize int    // 2..4 number of fighters
	MaxRounds int
	State     string // "lobby" | "playing"
	Slots     [kkMaxSeats]*kkSlot
}

// KKManager owns Kowloon Knockout state.
type KKManager struct {
	reg    *connRegistry
	logger *log.Logger

	mu         sync.Mutex
	rooms      map[string]*KKRoom // code -> room
	connToRoom map[string]string  // connID -> code
}

// NewKKManager builds the manager around a shared connection registry.
func NewKKManager(reg *connRegistry, logger *log.Logger) *KKManager {
	return &KKManager{
		reg:        reg,
		logger:     logger,
		rooms:      make(map[string]*KKRoom),
		connToRoom: make(map[string]string),
	}
}

// Register wires KK's inbound handlers onto the hub. Disconnect cleanup is
// invoked centrally by the Manager via Cleanup.
func (m *KKManager) Register(hub *realtime.Hub) {
	hub.On(kkCreateRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Mode         string `json:"mode"`
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.CreateRoom(c.ID, p.Mode, p.FighterClass)
	})
	hub.On(kkJoinRoom, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Code         string `json:"code"`
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.JoinRoom(c.ID, p.Code, p.FighterClass)
	})
	hub.On(kkSetFighter, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			FighterClass string `json:"fighterClass"`
		}
		_ = e.Bind(&p)
		m.SetFighter(c.ID, p.FighterClass)
	})
	hub.On(kkSetConfig, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Mode      *string `json:"mode"`
			ArenaSize *int    `json:"arenaSize"`
			MaxRounds *int    `json:"maxRounds"`
		}
		_ = e.Bind(&p)
		m.SetConfig(c.ID, p.Mode, p.ArenaSize, p.MaxRounds)
	})
	hub.On(kkStart, func(c *realtime.Conn, _ realtime.Envelope) {
		m.Start(c.ID)
	})
	hub.On(kkInput, func(c *realtime.Conn, e realtime.Envelope) {
		var p struct {
			Input json.RawMessage `json:"input"`
		}
		_ = e.Bind(&p)
		m.Input(c.ID, p.Input)
	})
	hub.On(kkSnapshot, func(c *realtime.Conn, e realtime.Envelope) {
		m.Snapshot(c.ID, e.Payload)
	})
	hub.On(kkLeave, func(c *realtime.Conn, _ realtime.Envelope) {
		m.Cleanup(c.ID)
	})
}

// ── Seat / roster helpers (caller holds the lock) ───────────────────

func (r *KKRoom) seatOf(connID string) int {
	for i, s := range r.Slots {
		if s != nil && s.ConnID == connID {
			return i
		}
	}
	return -1
}

func (r *KKRoom) highestOccupied() int {
	h := -1
	for i, s := range r.Slots {
		if s != nil {
			h = i
		}
	}
	return h
}

func (r *KKRoom) firstFree() int {
	for i, s := range r.Slots {
		if s == nil {
			return i
		}
	}
	return -1
}

func (r *KKRoom) teamFor(seat int) int {
	if r.Mode == "teams" {
		return seat % 2
	}
	return seat
}

func kkAIClassFor(seat int) string {
	return kkAIPool[seat%len(kkAIPool)]
}

func (r *KKRoom) clampArena(requested int) int {
	lo := r.highestOccupied() + 1
	if lo < 2 {
		lo = 2
	}
	if requested < lo {
		requested = lo
	}
	if requested > kkMaxSeats {
		requested = kkMaxSeats
	}
	return requested
}

// roster returns the arena's fighters: humans where slots are filled, else CPU.
func (r *KKRoom) roster() []map[string]any {
	out := make([]map[string]any, 0, r.ArenaSize)
	for i := 0; i < r.ArenaSize; i++ {
		slot := r.Slots[i]
		if slot != nil {
			out = append(out, map[string]any{
				"seat": i, "className": slot.ClassName, "team": r.teamFor(i),
				"name": "P" + strconv.Itoa(i+1), "connected": true, "human": true,
			})
		} else {
			out = append(out, map[string]any{
				"seat": i, "className": kkAIClassFor(i), "team": r.teamFor(i),
				"name": "CPU", "connected": true, "human": false,
			})
		}
	}
	return out
}

func (m *KKManager) emitLobby(room *KKRoom) {
	seats := room.roster()
	for i := 0; i < kkMaxSeats; i++ {
		slot := room.Slots[i]
		if slot == nil {
			continue
		}
		m.reg.send(slot.ConnID, realtime.MustEnvelope(kkLobbyUpdate, map[string]any{
			"you": i, "hostSeat": 0, "mode": room.Mode,
			"arenaSize": room.ArenaSize, "maxRounds": room.MaxRounds, "seats": seats,
		}))
	}
}

// ── Public API (also exercised directly by unit tests) ──────────────

// CreateRoom seats the caller as host (seat 0) of a fresh lobby.
func (m *KKManager) CreateRoom(connID, mode, fighterClass string) {
	m.Cleanup(connID)
	if fighterClass == "" {
		fighterClass = kkDefaultFighter
	}
	if mode != "teams" {
		mode = "ffa"
	}
	code := uniqueCode(func(c string) bool {
		m.mu.Lock()
		_, exists := m.rooms[c]
		m.mu.Unlock()
		return exists
	})

	m.mu.Lock()
	room := &KKRoom{Code: code, Mode: mode, ArenaSize: 2, MaxRounds: 3, State: "lobby"}
	room.Slots[0] = &kkSlot{ConnID: connID, ClassName: fighterClass}
	m.rooms[code] = room
	m.connToRoom[connID] = code
	m.mu.Unlock()

	m.reg.send(connID, realtime.MustEnvelope(kkRoomCreated, map[string]any{"code": code, "seat": 0}))
	m.mu.Lock()
	m.emitLobby(room)
	m.mu.Unlock()
}

// JoinRoom seats the caller in the next free slot of an existing lobby.
func (m *KKManager) JoinRoom(connID, code, fighterClass string) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if fighterClass == "" {
		fighterClass = kkDefaultFighter
	}

	m.mu.Lock()
	room, ok := m.rooms[code]
	if !ok {
		m.mu.Unlock()
		m.reg.send(connID, errEnvelope(kkError, "Room not found"))
		return
	}
	if room.State != "lobby" {
		m.mu.Unlock()
		m.reg.send(connID, errEnvelope(kkError, "Match already in progress"))
		return
	}
	seat := room.firstFree()
	if seat == -1 {
		m.mu.Unlock()
		m.reg.send(connID, errEnvelope(kkError, "Room is full"))
		return
	}
	// Reassign any prior room for this connection.
	if prev, had := m.connToRoom[connID]; had && prev != code {
		m.mu.Unlock()
		m.Cleanup(connID)
		m.mu.Lock()
	}
	room.Slots[seat] = &kkSlot{ConnID: connID, ClassName: fighterClass}
	m.connToRoom[connID] = code
	if room.ArenaSize < seat+1 {
		room.ArenaSize = seat + 1
	}
	if room.Mode == "teams" && room.ArenaSize%2 != 0 {
		room.Mode = "ffa"
	}
	m.emitLobby(room)
	m.mu.Unlock()
}

// SetFighter updates the caller's chosen fighter while in the lobby.
func (m *KKManager) SetFighter(connID, fighterClass string) {
	if fighterClass == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	room := m.roomOf(connID)
	if room == nil || room.State != "lobby" {
		return
	}
	seat := room.seatOf(connID)
	if seat == -1 {
		return
	}
	room.Slots[seat].ClassName = fighterClass
	m.emitLobby(room)
}

// SetConfig lets the host change mode / arena size / rounds while in the lobby.
func (m *KKManager) SetConfig(connID string, mode *string, arenaSize *int, maxRounds *int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room := m.roomOf(connID)
	if room == nil || room.State != "lobby" || room.seatOf(connID) != 0 {
		return
	}
	if mode != nil && (*mode == "ffa" || *mode == "teams") {
		room.Mode = *mode
	}
	if arenaSize != nil {
		room.ArenaSize = room.clampArena(*arenaSize)
	}
	if maxRounds != nil {
		v := *maxRounds
		if v < 1 {
			v = 1
		}
		if v > 5 {
			v = 5
		}
		room.MaxRounds = v
	}
	if room.Mode == "teams" && room.ArenaSize%2 != 0 {
		room.Mode = "ffa"
	}
	m.emitLobby(room)
}

// Start (host only) freezes the roster and emits kk:match_start to all humans.
func (m *KKManager) Start(connID string) {
	m.mu.Lock()
	room := m.roomOf(connID)
	if room == nil || room.State != "lobby" || room.seatOf(connID) != 0 {
		m.mu.Unlock()
		return
	}
	room.State = "playing"
	preview := room.roster()
	seats := make([]map[string]any, len(preview))
	for i, r := range preview {
		kind := "ai"
		if r["human"] == true {
			kind = "human"
		}
		seats[i] = map[string]any{
			"seat": r["seat"], "className": r["className"], "team": r["team"],
			"kind": kind, "name": r["name"],
		}
	}
	recipients := make([][2]any, 0, kkMaxSeats)
	for i := 0; i < kkMaxSeats; i++ {
		if slot := room.Slots[i]; slot != nil {
			recipients = append(recipients, [2]any{slot.ConnID, i})
		}
	}
	mode, maxRounds := room.Mode, room.MaxRounds
	m.mu.Unlock()

	for _, r := range recipients {
		m.reg.send(r[0].(string), realtime.MustEnvelope(kkMatchStart, map[string]any{
			"you": r[1], "mode": mode, "maxRounds": maxRounds, "aiDifficulty": kkAIDifficulty, "seats": seats,
		}))
	}
}

// Input relays a guest's command up to the host, stamped with the guest's seat.
func (m *KKManager) Input(connID string, input json.RawMessage) {
	m.mu.Lock()
	room := m.roomOf(connID)
	if room == nil {
		m.mu.Unlock()
		return
	}
	seat := room.seatOf(connID)
	host := room.Slots[0]
	m.mu.Unlock()
	if seat <= 0 || host == nil {
		return
	}
	if input == nil {
		input = json.RawMessage("null")
	}
	m.reg.send(host.ConnID, realtime.MustEnvelope(kkInput, map[string]any{"seat": seat, "input": input}))
}

// Snapshot broadcasts the host's authoritative frame to every guest.
func (m *KKManager) Snapshot(connID string, payload []byte) {
	m.mu.Lock()
	room := m.roomOf(connID)
	if room == nil || room.seatOf(connID) != 0 {
		m.mu.Unlock()
		return
	}
	targets := make([]string, 0, kkMaxSeats-1)
	for i := 1; i < kkMaxSeats; i++ {
		if slot := room.Slots[i]; slot != nil {
			targets = append(targets, slot.ConnID)
		}
	}
	m.mu.Unlock()
	for _, id := range targets {
		m.reg.send(id, realtime.Envelope{Event: kkSnapshot, Payload: payload})
	}
}

// Cleanup tears down a connection's seat. Host leaving disbands the room;
// a guest leaving frees its slot and notifies the rest.
func (m *KKManager) Cleanup(connID string) {
	m.mu.Lock()
	code, ok := m.connToRoom[connID]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.connToRoom, connID)
	room := m.rooms[code]
	if room == nil {
		m.mu.Unlock()
		return
	}
	seat := room.seatOf(connID)
	if seat == -1 {
		m.mu.Unlock()
		return
	}

	if seat == 0 {
		// Host left — disband.
		others := make([]string, 0, kkMaxSeats)
		for _, slot := range room.Slots {
			if slot != nil && slot.ConnID != connID {
				others = append(others, slot.ConnID)
				delete(m.connToRoom, slot.ConnID)
			}
		}
		delete(m.rooms, code)
		m.mu.Unlock()
		for _, id := range others {
			m.reg.send(id, errEnvelope(kkError, "Host left the room"))
		}
		return
	}

	room.Slots[seat] = nil
	lobby := room.State == "lobby"
	others := make([]string, 0, kkMaxSeats)
	for _, slot := range room.Slots {
		if slot != nil {
			others = append(others, slot.ConnID)
		}
	}
	m.mu.Unlock()

	for _, id := range others {
		m.reg.send(id, realtime.MustEnvelope(kkPlayerLeft, map[string]any{"seat": seat}))
	}
	if lobby {
		m.mu.Lock()
		if r := m.rooms[code]; r != nil {
			m.emitLobby(r)
		}
		m.mu.Unlock()
	}
}

// roomOf returns the room a connection belongs to (caller holds the lock).
func (m *KKManager) roomOf(connID string) *KKRoom {
	code, ok := m.connToRoom[connID]
	if !ok {
		return nil
	}
	return m.rooms[code]
}

// ── Shared helpers (also used by relay.go) ──────────────────────────

const (
	roomCodeLength   = 6
	roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // matches socket-server config
)

// generateRoomCode ports utils.ts generateRoomCode (crypto/rand).
func generateRoomCode() string {
	b := make([]byte, roomCodeLength)
	_, _ = rand.Read(b)
	out := make([]byte, roomCodeLength)
	for i := range out {
		out[i] = roomCodeAlphabet[int(b[i])%len(roomCodeAlphabet)]
	}
	return string(out)
}

// uniqueCode ports generateUniqueCode: up to 20 attempts, degrading gracefully.
func uniqueCode(taken func(string) bool) string {
	var code string
	for i := 0; i < 20; i++ {
		code = generateRoomCode()
		if !taken(code) {
			return code
		}
	}
	return code
}

func errEnvelope(event, msg string) realtime.Envelope {
	return realtime.MustEnvelope(event, map[string]any{"message": msg})
}
