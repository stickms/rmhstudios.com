package recap

// Minimal port of the Lights Out puzzle helpers used by the recap embed:
//   lib/lights-out/seed.ts    -> getDateSeed / createSeededRng
//   lib/lights-out/shapes.ts  -> getDailyShape / getShapeLabel
//   lib/lights-out/lights-out.ts -> generatePuzzle / getOptimalMoves
//
// Only the pieces needed to compute (shapeLabel, optimalMoves) for a given
// dateKey are ported. The interactive play helpers (toggleCellInGrid, share,
// persistence, etc.) are intentionally out of scope for the recap runner.

import (
	"math"
	"strconv"
	"strings"
)

// seededRng is the Mulberry32 generator from lib/lights-out/seed.ts. JS does its
// arithmetic on 32-bit unsigned ints (via Math.imul / >>> 0); we reproduce that
// with uint32 math so the puzzle sequence is byte-for-byte identical.
type seededRng struct{ state uint32 }

func createSeededRng(seed int) *seededRng {
	return &seededRng{state: uint32(seed)}
}

// next reproduces the Mulberry32 step exactly.
func (r *seededRng) next() float64 {
	r.state += 0x6d2b79f5
	t := r.state
	t = imul(t^(t>>15), t|1)
	t ^= t + imul(t^(t>>7), t|61)
	return float64((t^(t>>14))>>0) / 4294967296.0
}

// imul mirrors JS Math.imul: 32-bit integer multiply with wraparound.
func imul(a, b uint32) uint32 {
	return a * b
}

// getDateSeed ports getDateSeed(date): y*10000 + m*100 + d. The Node runner
// builds the Date from the dateKey's local Y/M/D, so we parse the same parts.
func getDateSeed(year, month, day int) int {
	return year*10000 + month*100 + day
}

// parseDateKey splits a "YYYY-MM-DD" key into its numeric parts, matching the
// Node `dateKey.split('-').map(Number)`.
func parseDateKey(dateKey string) (year, month, day int, ok bool) {
	parts := strings.Split(dateKey, "-")
	if len(parts) != 3 {
		return 0, 0, 0, false
	}
	y, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	d, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, 0, 0, false
	}
	return y, m, d, true
}

// ─── shapes (lib/lights-out/shapes.ts) ──────────────────────────────────────

type shapeType int

const (
	shapeRect shapeType = iota
	shapeTriangle
	shapeCustom
)

type gridShape struct {
	typ   shapeType
	rows  int
	cols  int
	size  int      // triangle
	mask  [][]bool // custom
	label string   // custom
}

// maskFrom builds a boolean mask from a visual pattern ('#' = active).
func maskFrom(pattern []string) [][]bool {
	out := make([][]bool, len(pattern))
	for i, row := range pattern {
		cells := make([]bool, len(row))
		for j, ch := range row {
			cells[j] = ch == '#'
		}
		out[i] = cells
	}
	return out
}

// shapes is the SHAPES array from shapes.ts, in the same order — the seed picks
// by index so order must match exactly.
var shapes = []gridShape{
	{typ: shapeRect, rows: 3, cols: 3},
	{typ: shapeRect, rows: 3, cols: 4},
	{typ: shapeRect, rows: 4, cols: 3},
	{typ: shapeRect, rows: 4, cols: 4},
	{typ: shapeRect, rows: 3, cols: 5},
	{typ: shapeRect, rows: 5, cols: 3},
	{typ: shapeTriangle, size: 4},
	{typ: shapeTriangle, size: 5},
	{typ: shapeCustom, rows: 5, cols: 5, label: "◇ Diamond", mask: maskFrom([]string{"..#..", ".###.", "#####", ".###.", "..#.."})},
	{typ: shapeCustom, rows: 5, cols: 5, label: "✚ Plus", mask: maskFrom([]string{"..#..", "..#..", "#####", "..#..", "..#.."})},
	{typ: shapeCustom, rows: 5, cols: 3, label: "H-Shape", mask: maskFrom([]string{"#.#", "#.#", "###", "#.#", "#.#"})},
	{typ: shapeCustom, rows: 4, cols: 4, label: "◻ Ring", mask: maskFrom([]string{"####", "#..#", "#..#", "####"})},
	{typ: shapeCustom, rows: 5, cols: 5, label: "↑ Arrow", mask: maskFrom([]string{"..#..", ".###.", "#####", "..#..", "..#.."})},
	{typ: shapeCustom, rows: 4, cols: 3, label: "U-Shape", mask: maskFrom([]string{"#.#", "#.#", "#.#", "###"})},
	{typ: shapeCustom, rows: 5, cols: 5, label: "⦿ Butterfly", mask: maskFrom([]string{"#...#", "##.##", "..#..", "##.##", "#...#"})},
	{typ: shapeCustom, rows: 4, cols: 5, label: "T-Shape", mask: maskFrom([]string{"#####", "..#..", "..#..", "..#.."})},
}

func getDailyShape(seed int) gridShape {
	// JS `seed % SHAPES.length` with a non-negative seed; guard anyway.
	idx := seed % len(shapes)
	if idx < 0 {
		idx += len(shapes)
	}
	return shapes[idx]
}

func getShapeLabel(s gridShape) string {
	switch s.typ {
	case shapeRect:
		return strconv.Itoa(s.rows) + "×" + strconv.Itoa(s.cols)
	case shapeTriangle:
		return "△" + strconv.Itoa(s.size)
	default:
		return s.label
	}
}

// isActiveCell ports shapes.ts isActiveCell.
func isActiveCell(s gridShape, r, c int) bool {
	switch s.typ {
	case shapeCustom:
		if r < 0 || r >= len(s.mask) || c < 0 || c >= len(s.mask[r]) {
			return false
		}
		return s.mask[r][c]
	case shapeRect:
		return r >= 0 && r < s.rows && c >= 0 && c < s.cols
	default: // triangle
		return r >= 0 && r < s.size && c >= 0 && c <= r
	}
}

// ─── puzzle (lib/lights-out/lights-out.ts) ──────────────────────────────────

type grid [][]bool

var rectDirs = [5][2]int{{0, 0}, {-1, 0}, {1, 0}, {0, -1}, {0, 1}}

func triangleNeighbors(r, c, size int) [][2]int {
	out := [][2]int{{r, c}}
	if r > 0 && c > 0 {
		out = append(out, [2]int{r - 1, c - 1})
	}
	if r > 0 && c <= r-1 {
		out = append(out, [2]int{r - 1, c})
	}
	if c > 0 {
		out = append(out, [2]int{r, c - 1})
	}
	if c < r {
		out = append(out, [2]int{r, c + 1})
	}
	if r+1 < size {
		out = append(out, [2]int{r + 1, c})
	}
	if r+1 < size && c+1 <= r+1 {
		out = append(out, [2]int{r + 1, c + 1})
	}
	return out
}

func getAllCells(s gridShape) [][2]int {
	var cells [][2]int
	switch s.typ {
	case shapeRect:
		for r := 0; r < s.rows; r++ {
			for c := 0; c < s.cols; c++ {
				cells = append(cells, [2]int{r, c})
			}
		}
	case shapeTriangle:
		for r := 0; r < s.size; r++ {
			for c := 0; c <= r; c++ {
				cells = append(cells, [2]int{r, c})
			}
		}
	default:
		for r := 0; r < s.rows; r++ {
			for c := 0; c < s.cols; c++ {
				if s.mask[r][c] {
					cells = append(cells, [2]int{r, c})
				}
			}
		}
	}
	return cells
}

func createEmptyGrid(s gridShape) grid {
	switch s.typ {
	case shapeTriangle:
		g := make(grid, s.size)
		for r := 0; r < s.size; r++ {
			g[r] = make([]bool, r+1)
		}
		return g
	case shapeRect:
		g := make(grid, s.rows)
		for r := range g {
			g[r] = make([]bool, s.cols)
		}
		return g
	default: // custom: full rect, inactive cells stay false
		g := make(grid, s.rows)
		for r := range g {
			g[r] = make([]bool, s.cols)
		}
		return g
	}
}

func cloneGrid(g grid) grid {
	out := make(grid, len(g))
	for r := range g {
		out[r] = append([]bool(nil), g[r]...)
	}
	return out
}

func toggleAtRect(g grid, r, c int, s gridShape) {
	rows := len(g)
	cols := 0
	if rows > 0 {
		cols = len(g[0])
	}
	for _, d := range rectDirs {
		nr, nc := r+d[0], c+d[1]
		if nr >= 0 && nr < rows && nc >= 0 && nc < cols {
			if !isActiveCell(s, nr, nc) {
				continue
			}
			g[nr][nc] = !g[nr][nc]
		}
	}
}

func toggleAtTriangle(g grid, r, c int) {
	size := len(g)
	for _, nb := range triangleNeighbors(r, c, size) {
		g[nb[0]][nb[1]] = !g[nb[0]][nb[1]]
	}
}

func applyMoves(s gridShape, g grid, moves [][2]int) grid {
	next := cloneGrid(g)
	for _, m := range moves {
		if s.typ == shapeTriangle {
			toggleAtTriangle(next, m[0], m[1])
		} else {
			toggleAtRect(next, m[0], m[1], s)
		}
	}
	return next
}

func isSolved(g grid, s gridShape) bool {
	if s.typ == shapeCustom {
		for r := range g {
			for c, cell := range g[r] {
				if isActiveCell(s, r, c) && cell {
					return false
				}
			}
		}
		return true
	}
	for r := range g {
		for _, cell := range g[r] {
			if cell {
				return false
			}
		}
	}
	return true
}

// solvePuzzle brute-forces the minimum-length solution (ports solvePuzzle).
func solvePuzzle(g grid, s gridShape) [][2]int {
	cells := getAllCells(s)
	n := len(cells)
	maxMask := 1 << n
	if cap := 1 << 15; maxMask > cap {
		maxMask = cap
	}
	var best [][2]int
	for mask := 1; mask < maxMask; mask++ {
		var moves [][2]int
		for i := 0; i < n; i++ {
			if mask&(1<<i) != 0 {
				moves = append(moves, cells[i])
			}
		}
		if best != nil && len(moves) >= len(best) {
			continue // prune
		}
		result := applyMoves(s, cloneGrid(g), moves)
		if isSolved(result, s) {
			best = moves
		}
	}
	return best
}

// getOptimalMoves returns the minimum move count, or -1 when unsolvable (Node
// returns null; callers treat -1 as "omit Optimal line").
func getOptimalMoves(g grid, s gridShape) int {
	sol := solvePuzzle(g, s)
	if sol == nil {
		return -1
	}
	return len(sol)
}

// shuffle ports the seeded Fisher-Yates from lights-out.ts.
func shuffle(arr [][2]int, rng *seededRng) [][2]int {
	out := append([][2]int(nil), arr...)
	for i := len(out) - 1; i > 0; i-- {
		j := int(math.Floor(rng.next() * float64(i+1)))
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// generatePuzzle ports generatePuzzle, including the difficulty scaling, the
// 100-attempt retry loop, and the deterministic fallback.
func generatePuzzle(rng *seededRng, s gridShape) grid {
	cells := getAllCells(s)
	n := len(cells)

	var minMoves, maxMoves int
	switch {
	case n <= 6:
		minMoves, maxMoves = 2, 4
	case n <= 9:
		minMoves, maxMoves = 3, 5
	case n <= 12:
		minMoves, maxMoves = 4, 7
	default:
		minMoves, maxMoves = 5, 8
	}

	for attempt := 0; attempt < 100; attempt++ {
		numMoves := minMoves + int(math.Floor(rng.next()*float64(maxMoves-minMoves+1)))
		shuffled := shuffle(cells, rng)
		selected := shuffled
		if numMoves < len(shuffled) {
			selected = shuffled[:numMoves]
		}

		g := createEmptyGrid(s)
		for _, cell := range selected {
			if s.typ == shapeTriangle {
				toggleAtTriangle(g, cell[0], cell[1])
			} else {
				toggleAtRect(g, cell[0], cell[1], s)
			}
		}

		if isSolved(g, s) {
			continue
		}

		sol := solvePuzzle(g, s)
		if sol == nil || len(sol) < minMoves {
			continue
		}
		return g
	}

	// Fallback: toggle first minMoves cells.
	g := createEmptyGrid(s)
	limit := minMoves
	if len(cells) < limit {
		limit = len(cells)
	}
	for i := 0; i < limit; i++ {
		cell := cells[i]
		if s.typ == shapeTriangle {
			toggleAtTriangle(g, cell[0], cell[1])
		} else {
			toggleAtRect(g, cell[0], cell[1], s)
		}
	}
	return g
}

// puzzleMeta bundles the values the recap embed needs about a day's puzzle.
type puzzleMeta struct {
	shapeLabel string
	optimal    int // -1 == unknown / omit
}

// computePuzzleMeta reproduces the Node block:
//
//	const [y,m,d] = dateKey.split('-').map(Number);
//	const date = new Date(y, m-1, d);
//	const seed = getDateSeed(date);
//	const shape = getDailyShape(seed);
//	const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
//	const optimal = getOptimalMoves(puzzleGrid, shape);
func computePuzzleMeta(dateKey string) puzzleMeta {
	y, m, d, ok := parseDateKey(dateKey)
	if !ok {
		return puzzleMeta{shapeLabel: dateKey, optimal: -1}
	}
	seed := getDateSeed(y, m, d)
	shape := getDailyShape(seed)
	label := getShapeLabel(shape)
	puzzle := generatePuzzle(createSeededRng(seed), shape)
	optimal := getOptimalMoves(puzzle, shape)
	return puzzleMeta{shapeLabel: label, optimal: optimal}
}
