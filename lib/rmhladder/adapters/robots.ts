import { politeFetch } from './http';

interface Group { agents: string[]; rules: Array<{ allow: boolean; prefix: string }> }

function parse(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ allow: key === 'allow', prefix: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean {
  const groups = parse(robotsTxt);
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const applicable = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  let verdict = true;
  let matchLen = -1;
  for (const g of applicable) {
    for (const r of g.rules) {
      // Extract effective prefix (up to first * or $)
      const effectivePrefix = r.prefix.split(/[\*$]/)[0];
      // Detect bare wildcard: non-empty raw prefix that becomes empty after stripping * or $
      const isMatchAll = effectivePrefix === '' && r.prefix !== '';
      // Skip rules that don't match (unless it's a bare wildcard match-all)
      if (!isMatchAll && (effectivePrefix === '' || !path.startsWith(effectivePrefix))) continue;
      // Bare wildcard has effective length 0; literal rules have their prefix length
      const effLen = effectivePrefix.length;
      // Update verdict if this rule is longer, or if it's a match-all and we had no rule before
      if (effLen > matchLen || (matchLen === -1 && isMatchAll)) { matchLen = Math.max(effLen, 0); verdict = r.allow; }
    }
  }
  return verdict;
}

export async function checkRobots(url: string, fetchImpl?: typeof fetch): Promise<boolean> {
  try {
    const u = new URL(url);
    const res = await politeFetch(`${u.origin}/robots.txt`, { fetchImpl });
    if (!res.ok) return true; // no robots.txt → allowed
    const { LADDER_USER_AGENT } = await import('./http');
    return isPathAllowed(res.body, LADDER_USER_AGENT, u.pathname);
  } catch {
    return true; // malformed URL or fetch failure → allowed
  }
}
