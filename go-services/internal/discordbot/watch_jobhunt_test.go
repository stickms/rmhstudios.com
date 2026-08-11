package discordbot

import "testing"

// The job-hunt matcher decides a figure the page states about a person, so both
// directions are tested and the misses are as important as the hits: a false
// positive silently resets "days since he mentioned applying for a job", which
// is exactly the direction that flatters him.
func TestMatchesJobHunt(t *testing.T) {
	hits := []string{
		"finally applied to that place",
		"applying for a few roles this week",
		"got a rejection email lol",
		"recruiter reached out on linkedin",
		"gotta redo my resume",
		"cover letter is killing me",
		"phone screen tomorrow at 9",
		"the interview went ok i think",
		"job hunt is brutal",
		"looking for a job still",
		"submitted through greenhouse.io",
		"internship apps are open",
		"unemployed and thriving",
		"APPLIED FOR three things today",
	}
	for _, content := range hits {
		if !matchesJobHunt(content) {
			t.Errorf("matchesJobHunt(%q) = false, want true", content)
		}
	}

	misses := []string{
		"",
		"good job man",
		"job's done",
		"nice, gg",
		"can you offer me a ride",
		"that boss has a lot of hp",
		"im applying pressure",
		"job simulator is so funny",
		"how did his interview go",
		"resuming the match now",
	}
	for _, content := range misses {
		if matchesJobHunt(content) {
			t.Errorf("matchesJobHunt(%q) = true, want false", content)
		}
	}
}
