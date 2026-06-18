package doctrine

import (
	"math"
	"testing"
)

// Reference values below were produced by running the EXACT Node
// implementation from server/doctrine-worker/index.ts. These tests lock the Go
// port to bit-for-bit parity with the original PRNG and seeding.

func TestGetSeedForDate(t *testing.T) {
	const date = "2026-06-19"
	cases := []struct {
		mode string
		want int
	}{
		{"alibi", 489762987},
		{"spectrum", 1864840003},
		{"outcast", 1313135021},
		{"chainlink", 49484481},
		{"impostor", 1589193561},
		{"sahur_special", 1827053367},
	}
	for _, c := range cases {
		if got := GetSeedForDate(date, c.mode); got != c.want {
			t.Errorf("GetSeedForDate(%q, %q) = %d, want %d", date, c.mode, got, c.want)
		}
	}
}

func TestGetSeedForDateUsesLowercasedMode(t *testing.T) {
	// Call sites pass the lowercased mode; this documents that contract.
	const date = "2026-06-19"
	if GetSeedForDate(date, toLower("ALIBI")) != 489762987 {
		t.Fatal("lowercased ALIBI seed mismatch")
	}
}

func TestMulberry32(t *testing.T) {
	// Each row: seed, then the first three float64 outputs from Node.
	cases := []struct {
		seed int
		want [3]float64
	}{
		{0, [3]float64{0.26642920868471265, 0.00032974570058286, 0.22327202744781971}},
		{1, [3]float64{0.62707394058816135, 0.00273572118021548, 0.52744703995995224}},
		{12345, [3]float64{0.97972826776094735, 0.30675226449966431, 0.48420542152598500}},
		{489762987, [3]float64{0.42476207669824362, 0.77761340816505253, 0.17837971518747509}},
		{2147483647, [3]float64{0.42909808852709830, 0.12713524978607893, 0.38527749828062952}},
	}
	for _, c := range cases {
		r := Mulberry32(c.seed)
		for i, want := range c.want {
			got := r()
			// The Node and Go computations are the same integer arithmetic
			// divided by the same constant, so they must be exactly equal;
			// allow a tiny epsilon only for float-literal rounding in the test.
			if math.Abs(got-want) > 1e-15 {
				t.Errorf("Mulberry32(%d) draw %d = %.17f, want %.17f", c.seed, i, got, want)
			}
		}
	}
}

func TestDifficultyForWeekday(t *testing.T) {
	// 0=Sunday..6=Saturday (JS getUTCDay).
	want := map[int]int{1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 0: 5}
	for wd, exp := range want {
		if got := DifficultyForWeekday(wd); got != exp {
			t.Errorf("DifficultyForWeekday(%d) = %d, want %d", wd, got, exp)
		}
	}
	// Default branch (out-of-range never happens for real weekdays, but the
	// Node `?? 3` default is replicated).
	if got := DifficultyForWeekday(99); got != 3 {
		t.Errorf("DifficultyForWeekday(99) = %d, want 3 (default)", got)
	}
}

func TestSahurDifficulty(t *testing.T) {
	cases := map[int]int{1: 2, 2: 3, 3: 4, 4: 5, 5: 5} // min(5, base+1)
	for base, exp := range cases {
		if got := SahurDifficulty(base); got != exp {
			t.Errorf("SahurDifficulty(%d) = %d, want %d", base, got, exp)
		}
	}
}

func TestModes(t *testing.T) {
	want := []string{"ALIBI", "SPECTRUM", "OUTCAST", "CHAINLINK", "IMPOSTOR"}
	if len(Modes) != len(want) {
		t.Fatalf("Modes len = %d, want %d", len(Modes), len(want))
	}
	for i, m := range want {
		if Modes[i] != m {
			t.Errorf("Modes[%d] = %q, want %q", i, Modes[i], m)
		}
	}
	if SahurSpecialMode != "SAHUR_SPECIAL" {
		t.Errorf("SahurSpecialMode = %q", SahurSpecialMode)
	}
}
