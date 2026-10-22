import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import {
  NEW_DOMAIN_MS,
  URL_IN_TEXT,
  hostAndParents,
  hostOfUrl,
  isTrusted,
  normalizeHost,
  type LinkRisk,
} from './link-risk';

const TTL_MS = 60_000;

/**
 * Classify hosts for the /out interstitial. `deny` = on the admin denylist;
 * `new` = first shown on the site in the last 72h (see `recordLinkDomains`) and
 * not allow-listed/trusted; everything else `ok`. Read-only.
 */
export async function classifyHosts(rawHosts: string[]): Promise<Record<string, LinkRisk>> {
  const out: Record<string, LinkRisk> = {};
  const todo: string[] = [];
  for (const raw of new Set(rawHosts)) {
    const host = normalizeHost(raw);
    if (!host) continue;
    const hit = apiCache.get<LinkRisk>(`linkrisk:${host}`);
    if (hit) out[raw] = hit;
    else todo.push(host);
  }
  if (todo.length === 0) return out;

  const candidates = [...new Set(todo.flatMap(hostAndParents))];
  const [rules, seen] = await Promise.all([
    prisma.linkDomainRule.findMany({
      where: { domain: { in: candidates } },
      select: { domain: true, kind: true },
    }),
    prisma.seenLinkDomain.findMany({
      where: { domain: { in: todo } },
      select: { domain: true, firstSeenAt: true },
    }),
  ]);
  const kindOf = new Map(rules.map((r) => [r.domain, r.kind]));
  const firstSeen = new Map(seen.map((s) => [s.domain, s.firstSeenAt.getTime()]));
  const now = Date.now();

  for (const host of todo) {
    const parents = hostAndParents(host);
    let risk: LinkRisk = 'ok';
    if (parents.some((d) => kindOf.get(d) === 'DENY')) risk = 'deny';
    else if (!isTrusted(host) && !parents.some((d) => kindOf.get(d) === 'ALLOW')) {
      const t = firstSeen.get(host);
      if (t !== undefined && now - t < NEW_DOMAIN_MS) risk = 'new';
    }
    apiCache.set(`linkrisk:${host}`, risk, TTL_MS);
    out[host] = risk;
  }
  // Map back any raw (un-normalised) input keys the caller used.
  for (const raw of rawHosts) {
    const host = normalizeHost(raw);
    if (host && out[host] && !out[raw]) out[raw] = out[host];
  }
  return out;
}

/** Called when a post/comment is created: remember when each linked domain first appeared. */
export async function recordLinkDomains(text: string): Promise<void> {
  try {
    const hosts = new Set<string>();
    for (const m of text.match(URL_IN_TEXT) ?? []) {
      const h = hostOfUrl(m);
      if (h && !isTrusted(h)) hosts.add(h);
      if (hosts.size >= 10) break;
    }
    if (hosts.size === 0) return;
    await prisma.seenLinkDomain.createMany({
      data: [...hosts].map((domain) => ({ domain })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('[link-risk] record failed:', (err as Error)?.message);
  }
}

export const listLinkRules = () =>
  prisma.linkDomainRule.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });

export async function upsertLinkRule(
  domain: string,
  kind: 'DENY' | 'ALLOW',
  note: string | null,
  addedById: string,
): Promise<boolean> {
  const d = normalizeHost(domain);
  if (!d) return false;
  await prisma.linkDomainRule.upsert({
    where: { domain: d },
    create: { domain: d, kind, note, addedById },
    update: { kind, note, addedById },
  });
  apiCache.invalidatePrefix('linkrisk:');
  return true;
}

export async function deleteLinkRule(domain: string): Promise<boolean> {
  const { count } = await prisma.linkDomainRule.deleteMany({ where: { domain } });
  apiCache.invalidatePrefix('linkrisk:');
  return count > 0;
}
