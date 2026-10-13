import { useEffect, useState } from 'react';
import { hostOfUrl, outHref, type LinkRisk } from '@/lib/safety/link-risk';

// Module-level batcher: every link on a page asks once, in one request.
const known = new Map<string, LinkRisk>();
const waiting = new Map<string, Array<(r: LinkRisk) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const hosts = [...waiting.keys()].slice(0, 20);
  const batch = new Map(hosts.map((h) => [h, waiting.get(h)!]));
  hosts.forEach((h) => waiting.delete(h));
  fetch('/api/links/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hosts }),
  })
    .then((r) => (r.ok ? r.json() : { risk: {} }))
    .catch(() => ({ risk: {} }))
    .then((d: { risk?: Record<string, LinkRisk> }) => {
      for (const [h, cbs] of batch) {
        const risk = d.risk?.[h] ?? 'ok';
        known.set(h, risk);
        cbs.forEach((cb) => cb(risk));
      }
    });
  if (waiting.size > 0) timer = setTimeout(flush, 30);
}

function lookup(host: string, cb: (r: LinkRisk) => void) {
  const hit = known.get(host);
  if (hit) return cb(hit);
  const list = waiting.get(host) ?? [];
  list.push(cb);
  waiting.set(host, list);
  if (!timer) timer = setTimeout(flush, 30);
}

/**
 * An external link in user content. Renders the plain destination first (no
 * layout change, works without JS); once the host is classified, a denylisted
 * or newly seen domain is routed through the /out interstitial instead.
 */
export function SafeLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [risk, setRisk] = useState<LinkRisk>('ok');
  useEffect(() => {
    const host = hostOfUrl(href);
    if (host) lookup(host, setRisk);
  }, [href]);
  return (
    <a
      href={risk === 'ok' ? href : outHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {children}
    </a>
  );
}
