package discordbot

import (
	"regexp"
	"strings"
)

// Job-hunt detection: does a message read as being about looking for work?
//
// This exists so `/sohumtracker` can say "days since he mentioned applying for a
// job", which is the one figure on that page measured against the thing he
// actually said he would do. Everything else there counts what he DID; this
// counts whether the subject came up at all.
//
// # Why the flag is stored and not recomputed
//
// The decision is made once, when the message arrives, and written to the
// message row as a boolean — which then rolls up into a per-day count. Message
// TEXT is deleted after the retention window, so a rule applied later would have
// nothing to apply itself to and the counter would silently reset to zero for
// every older day. A boolean outlives the sentence it was derived from.
//
// # Why these patterns
//
// Two classes, and the split is the whole design:
//
//   - Unambiguous phrases. "Cover letter" and "recruiter" are not said about
//     anything else, so they match on their own.
//   - "Job" and "offer", which are said about everything ("good job", "job's
//     done", "offer me a ride"), so they only count next to a hunting verb.
//
// The rule errs toward MISSING mentions rather than inventing them. The figure
// this feeds is a days-since counter, and a false positive silently resets it —
// which is exactly the direction that flatters him, and the direction this page
// must not be wrong in.

// jobHuntPatterns are the phrases that mean job-hunting on their own.
//
// Compiled once at init: this runs on every message the tracker sees, and
// recompiling twenty regexes per message would be the most expensive thing in
// the handler by an order of magnitude.
var jobHuntPatterns = compilePatterns([]string{
	// The act itself.
	`\bapplied\s+(?:to|for|at)\b`,
	`\bapply(?:ing)?\s+(?:to|for|at)\b`,
	`\bjob\s+app(?:lication)?s?\b`,
	`\bapplications?\b`,

	// The apparatus around it.
	`\brecruiters?\b`,
	`\bcover\s+letters?\b`,
	`\bresumes?\b`,
	`\bcurriculum\s+vitae\b`,
	`\bhiring\s+manager\b`,
	`\bonsite\s+interview\b`,
	`\bphone\s+screens?\b`,
	`\btechnical\s+screens?\b`,
	`\binterview(?:s|ed|ing)?\b`,
	`\binternships?\b`,
	`\bcareer\s+fair\b`,

	// The boards and ATSes. A link to one is a stronger signal than the word.
	`\blinkedin\b`,
	`\bindeed\.com\b`,
	`\bglassdoor\b`,
	`\bgreenhouse\.io\b`,
	`\blever\.co\b`,
	`\bashbyhq\b`,
	`\bworkday(?:jobs)?\b`,
	`\bsmartrecruiters\b`,

	// "Job"/"offer"/"opening" only beside something that makes them about work.
	`\bjob\s+(?:hunt|search|market|offer|listing|posting|board|lead)`,
	`\b(?:hunting|searching|looking)\s+for\s+(?:a\s+)?(?:job|work|internship|role)`,
	`\bnew\s+(?:job|grad)\s+(?:role|position|opening)?`,
	`\b(?:job|offer)\s+letter\b`,
	`\bfull[\s-]?time\s+(?:role|offer|position)\b`,
	`\bunemploy(?:ed|ment)\b`,
	`\bgot\s+(?:an?\s+)?offer\b`,
	`\brejection\s+(?:email|letter)\b`,
	`\bghosted\s+(?:me\s+)?(?:by|after)\b`,
})

// jobHuntNegations are phrases that contain a matched pattern but are plainly
// not about his own job hunt.
//
// Deliberately short. Every entry here is a place the page would otherwise
// silently forgive him, so the bar for adding one is a phrase that is common AND
// unmistakable — not merely a case the rule could theoretically get wrong.
var jobHuntNegations = compilePatterns([]string{
	// Somebody else's interview, which is a fact about them.
	`\b(?:his|her|their|your)\s+interview\b`,
	// A game, and a very common word beside "job" in this particular server.
	`\bjob\s+simulator\b`,
})

func compilePatterns(sources []string) []*regexp.Regexp {
	out := make([]*regexp.Regexp, 0, len(sources))
	for _, source := range sources {
		out = append(out, regexp.MustCompile(source))
	}
	return out
}

// matchesJobHunt reports whether a message reads as being about looking for work.
//
// Case-insensitive by lowercasing once rather than by `(?i)` on twenty patterns:
// one allocation per message against twenty case-folding matchers.
func matchesJobHunt(content string) bool {
	if content == "" {
		return false
	}
	lower := strings.ToLower(content)

	matched := false
	for _, pattern := range jobHuntPatterns {
		if pattern.MatchString(lower) {
			matched = true
			break
		}
	}
	if !matched {
		return false
	}
	for _, negation := range jobHuntNegations {
		if negation.MatchString(lower) {
			return false
		}
	}
	return true
}
