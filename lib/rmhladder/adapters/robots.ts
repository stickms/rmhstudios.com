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
      if (r.prefix === '' || !path.startsWith(r.prefix)) continue;
      if (r.prefix.length > matchLen) { matchLen = r.prefix.length; verdict = r.allow; }
    }
  }
  return verdict;
}

export async function checkRobots(url: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const u = new URL(url);
  const res = await politeFetch(`${u.origin}/robots.txt`, { fetchImpl });
  if (!res.ok) return true; // no robots.txt → allowed
  const { LADDER_USER_AGENT } = await import('./http');
  return isPathAllowed(res.body, LADDER_USER_AGENT, u.pathname);
}
