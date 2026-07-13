import { candidateProfileSchema, jobMatchSchema, jobProfileSchema } from '../resume/schemas';
import type { CandidateProfile, JobMatch, JobProfile } from '../resume/schemas';

const SKILL_ALIASES: Record<string, string> = {
  js: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  reactjs: 'react', 'react.js': 'react', react: 'react',
  nodejs: 'node.js', node: 'node.js', 'node.js': 'node.js',
  postgres: 'postgresql', postgresql: 'postgresql',
  aws: 'amazon web services', 'amazon web services': 'amazon web services',
  gcp: 'google cloud platform', 'google cloud': 'google cloud platform',
  ml: 'machine learning', 'machine learning': 'machine learning',
  ai: 'artificial intelligence', 'artificial intelligence': 'artificial intelligence',
};

function normalizePhrase(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').replace(/\s+/g, ' ').trim();
  return SKILL_ALIASES[normalized] ?? normalized;
}

function uniquePhrases(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const value of values) {
    const key = normalizePhrase(value);
    if (key && !result.has(key)) result.set(key, value.trim());
  }
  return result;
}

function tokenSet(values: string[]): Set<string> {
  return new Set(
    values.flatMap((value) => normalizePhrase(value).split(' ')).filter((token) => token.length >= 3),
  );
}

function roleFamilyScore(candidate: CandidateProfile, job: JobProfile): number {
  const candidateTokens = tokenSet([
    candidate.headline,
    ...candidate.rolePreferences,
    ...candidate.workHistory.map((work) => work.title),
  ]);
  const jobTokens = tokenSet([job.title, ...job.keywords]);
  if (jobTokens.size === 0) return 10;
  const hits = [...jobTokens].filter((token) => candidateTokens.has(token)).length;
  return Math.round(20 * Math.min(1, hits / Math.min(4, jobTokens.size)));
}

function educationScore(candidate: CandidateProfile, job: JobProfile): number {
  if (job.educationLevels.length === 0) return 10;
  if (candidate.education.length === 0) return 4;
  const candidateText = normalizePhrase(candidate.education.map((entry) => `${entry.degree ?? ''} ${entry.field ?? ''}`).join(' '));
  return job.educationLevels.some((level) => candidateText.includes(normalizePhrase(level))) ? 10 : 3;
}

function locationScore(candidate: CandidateProfile, job: JobProfile): number {
  if (job.remoteStatus === 'remote_us') return 10;
  if (job.locations.length === 0) return 7;
  if (candidate.locations.length === 0) return 5;
  const candidateLocations = uniquePhrases(candidate.locations);
  return job.locations.some((location) => candidateLocations.has(normalizePhrase(location))) ? 10 : 1;
}

function experienceScore(candidate: CandidateProfile, job: JobProfile): number {
  const required = job.minYearsExperience;
  if (required === null || required === 0) return 15;
  if (candidate.yearsExperience === null) return 6;
  if (candidate.yearsExperience >= required) return 15;
  const ratio = candidate.yearsExperience / required;
  return Math.max(0, Math.round(15 * ratio));
}

export interface MatchUserPreferences {
  preferredCities?: string[];
  preferredProgramTypes?: string[];
  boostKeywords?: string[];
}

function preferencesScore(job: JobProfile, prefs: MatchUserPreferences): number {
  const hasPrefs = Boolean(prefs.preferredCities?.length || prefs.preferredProgramTypes?.length || prefs.boostKeywords?.length);
  // No stated preference means no constraint; do not penalize a new user for
  // leaving optional settings blank.
  if (!hasPrefs) return 10;
  let matched = 0;
  let dimensions = 0;
  if (prefs.preferredCities?.length) {
    dimensions += 1;
    const locations = uniquePhrases(job.locations);
    if (prefs.preferredCities.some((city) => locations.has(normalizePhrase(city)))) matched += 1;
  }
  if (prefs.preferredProgramTypes?.length) {
    dimensions += 1;
    if (job.programType && prefs.preferredProgramTypes.map(normalizePhrase).includes(normalizePhrase(job.programType))) matched += 1;
  }
  if (prefs.boostKeywords?.length) {
    dimensions += 1;
    const haystack = normalizePhrase(`${job.title} ${job.summary} ${job.keywords.join(' ')}`);
    if (prefs.boostKeywords.some((keyword) => haystack.includes(normalizePhrase(keyword)))) matched += 1;
  }
  return dimensions === 0 ? 10 : Math.round(10 * matched / dimensions);
}

export function scoreCandidateForJob(
  candidateInput: CandidateProfile,
  jobInput: JobProfile,
  preferences: MatchUserPreferences = {},
): JobMatch {
  const candidate = candidateProfileSchema.parse(candidateInput);
  const job = jobProfileSchema.parse(jobInput);
  const candidateSkills = uniquePhrases(candidate.skills);
  const requiredSkills = uniquePhrases(job.requiredSkills);
  const preferredSkills = uniquePhrases(job.preferredSkills);

  const matchedRequired = [...requiredSkills].filter(([key]) => candidateSkills.has(key));
  const missingRequired = [...requiredSkills].filter(([key]) => !candidateSkills.has(key));
  const matchedPreferred = [...preferredSkills].filter(([key]) => candidateSkills.has(key));
  const matchedSkills = [...new Set([...matchedRequired, ...matchedPreferred].map(([, label]) => label))];
  const missingSkills = missingRequired.map(([, label]) => label);

  const requiredCoverage = requiredSkills.size === 0 ? 1 : matchedRequired.length / requiredSkills.size;
  const preferredCoverage = preferredSkills.size === 0 ? 1 : matchedPreferred.length / preferredSkills.size;
  const skills = Math.round(requiredCoverage * 28 + preferredCoverage * 7);
  const experience = experienceScore(candidate, job);
  const education = educationScore(candidate, job);
  const location = locationScore(candidate, job);
  const roleFamily = roleFamilyScore(candidate, job);
  const preferenceScore = preferencesScore(job, preferences);
  const rawScore = Math.max(0, Math.min(100, skills + roleFamily + experience + education + location + preferenceScore));
  // Required skills are an eligibility gate, not an extra weighted component:
  // a candidate missing every explicit requirement cannot rank as a strong fit
  // solely on location/education/title similarity.
  const score = requiredSkills.size > 0 && requiredCoverage === 0
    ? Math.min(rawScore, 45)
    : requiredSkills.size > 0 && requiredCoverage < 0.5
      ? Math.min(rawScore, 59)
      : rawScore;

  const knownSections = [
    candidate.skills.length > 0,
    candidate.yearsExperience !== null,
    candidate.education.length > 0,
    candidate.workHistory.length > 0,
    job.requiredSkills.length + job.preferredSkills.length > 0,
    job.minYearsExperience !== null,
    job.locations.length > 0 || job.remoteStatus === 'remote_us',
  ].filter(Boolean).length;
  const confidence = Math.round((knownSections / 7) * 100);

  const explanation = missingSkills.length > 0
    ? `Matches ${matchedSkills.length} listed skill${matchedSkills.length === 1 ? '' : 's'}, but is missing ${missingSkills.length} required skill${missingSkills.length === 1 ? '' : 's'}: ${missingSkills.slice(0, 5).join(', ')}.`
    : `Covers the listed required skills${matchedSkills.length ? ` and matches ${matchedSkills.length} skill${matchedSkills.length === 1 ? '' : 's'} overall` : ''}.`;

  return jobMatchSchema.parse({
    score,
    confidence,
    breakdown: {
      skills,
      roleFamily,
      experience,
      education,
      location,
      preferences: preferenceScore,
    },
    matchedSkills,
    missingSkills,
    explanation,
  });
}
