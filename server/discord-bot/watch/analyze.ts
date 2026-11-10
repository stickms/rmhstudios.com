/**
 * What one message is worth to the rollups (port of analyzeMessage and watch_jobhunt.go). Pure.
 *
 * The job-hunt flag is decided ONCE at insert and stored: the message text does not survive
 * retention, so a rule applied later would have nothing to read. The rule errs toward missing a
 * mention rather than inventing one — the figure it feeds is a days-since counter, and a false
 * positive resets it in the direction that flatters the subject.
 */
import { zonedParts } from '../tz';
import { LATE_NIGHT_END, LATE_NIGHT_START } from './rollup';

export interface MessageMetrics {
  chars: number;
  words: number;
  links: number;
  emoji: number;
  question: boolean;
}

/** Go's unicode emoji blocks: pictographs, misc symbols + dingbats, mahjong..enclosed. */
export function isPictographic(cp: number): boolean {
  return (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f000 && cp <= 0x1f2ff);
}

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

export function analyzeMessage(content: string): MessageMetrics {
  const runes = [...content];
  const words = content.split(/\s+/).filter(Boolean).length;
  const lower = content.toLowerCase();
  let emoji = count(content, '<:') + count(content, '<a:');
  for (const r of runes) if (isPictographic(r.codePointAt(0)!)) emoji++;
  return {
    chars: runes.length,
    words,
    links: count(lower, 'http://') + count(lower, 'https://'),
    emoji,
    question: content.includes('?'),
  };
}

export function isLateNight(ms: number, tz: string): boolean {
  const h = zonedParts(ms, tz).hour;
  return h >= LATE_NIGHT_START && h < LATE_NIGHT_END;
}

/** Cut to at most n code points (never mid-emoji). */
export function truncateRunes(s: string, n: number): string {
  const r = [...s];
  return r.length <= n ? s : r.slice(0, n).join('');
}

// Go RE2 `\s` is ASCII whitespace; JS's is Unicode. The class below keeps Go's meaning.
const S = '[\\t\\n\\f\\r ]';
const re = (src: string) => new RegExp(src.replace(/\\s/g, S));

const JOB_HUNT_PATTERNS = [
  // The act itself.
  '\\bapplied\\s+(?:to|for|at)\\b',
  '\\bapply(?:ing)?\\s+(?:to|for|at)\\b',
  '\\bjob\\s+app(?:lication)?s?\\b',
  '\\bapplications?\\b',
  // The apparatus around it.
  '\\brecruiters?\\b',
  '\\bcover\\s+letters?\\b',
  '\\bresumes?\\b',
  '\\bcurriculum\\s+vitae\\b',
  '\\bhiring\\s+manager\\b',
  '\\bonsite\\s+interview\\b',
  '\\bphone\\s+screens?\\b',
  '\\btechnical\\s+screens?\\b',
  '\\binterview(?:s|ed|ing)?\\b',
  '\\binternships?\\b',
  '\\bcareer\\s+fair\\b',
  // The boards and ATSes.
  '\\blinkedin\\b',
  '\\bindeed\\.com\\b',
  '\\bglassdoor\\b',
  '\\bgreenhouse\\.io\\b',
  '\\blever\\.co\\b',
  '\\bashbyhq\\b',
  '\\bworkday(?:jobs)?\\b',
  '\\bsmartrecruiters\\b',
  // "Job"/"offer"/"opening" only beside something that makes them about work.
  '\\bjob\\s+(?:hunt|search|market|offer|listing|posting|board|lead)',
  '\\b(?:hunting|searching|looking)\\s+for\\s+(?:a\\s+)?(?:job|work|internship|role)',
  '\\bnew\\s+(?:job|grad)\\s+(?:role|position|opening)?',
  '\\b(?:job|offer)\\s+letter\\b',
  // Go's `[\s-]?`, spelled as an alternation so the ASCII-\s rewrite below stays valid.
  '\\bfull(?:\\s|-)?time\\s+(?:role|offer|position)\\b',
  '\\bunemploy(?:ed|ment)\\b',
  '\\bgot\\s+(?:an?\\s+)?offer\\b',
  '\\brejection\\s+(?:email|letter)\\b',
  '\\bghosted\\s+(?:me\\s+)?(?:by|after)\\b',
].map(re);

const JOB_HUNT_NEGATIONS = ['\\b(?:his|her|their|your)\\s+interview\\b', '\\bjob\\s+simulator\\b'].map(re);

export function matchesJobHunt(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  if (!JOB_HUNT_PATTERNS.some((p) => p.test(lower))) return false;
  return !JOB_HUNT_NEGATIONS.some((p) => p.test(lower));
}
