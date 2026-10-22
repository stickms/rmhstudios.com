'use client';

/**
 * Global runtime for the delight package. After the page is idle it reads the
 * public config (April Fools flag, hunt live?) — cached in localStorage for ten
 * minutes — and mounts the two things that depend on it. With nothing active it
 * renders nothing and never loads another chunk.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';
import { FOOLS_FLAG_KEY, FOOLS_OFF_KEY } from '@/lib/delight/season';
import type { DelightConfig } from '@/lib/delight/shared';

const CFG_KEY = 'rmh-delight-cfg';
const TTL_MS = 10 * 60_000;

const HuntMarker = lazy(() => import('@/components/delight/HuntMarker'));
const FoolsPill = lazy(() => import('@/components/delight/FoolsPill'));

function readCache(): DelightConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null') as
      (DelightConfig & { at: number }) | null;
    return c && Date.now() - c.at < TTL_MS ? c : null;
  } catch {
    return null;
  }
}

export function DelightMount() {
  const idle = useIdleReady();
  const { data: session } = useSession();
  const [cfg, setCfg] = useState<DelightConfig | null>(null);
  const [fools, setFools] = useState(false);

  useEffect(() => {
    if (!idle) return;
    let alive = true;
    const apply = (c: DelightConfig) => {
      if (!alive) return;
      setCfg(c);
      let off = false;
      try {
        localStorage.setItem(FOOLS_FLAG_KEY, c.fools ? '1' : '0');
        off = localStorage.getItem(FOOLS_OFF_KEY) === '1';
      } catch {
        /* storage blocked: the class simply is not remembered */
      }
      document.documentElement.classList.toggle('fools', c.fools && !off);
      setFools(c.fools && !off);
    };
    const cached = readCache();
    if (cached) {
      apply(cached);
      return () => {
        alive = false;
      };
    }
    fetch('/api/delight/config')
      .then((r) => (r.ok ? (r.json() as Promise<DelightConfig>) : null))
      .then((c) => {
        if (!c) return;
        try {
          localStorage.setItem(CFG_KEY, JSON.stringify({ ...c, at: Date.now() }));
        } catch {
          /* ignore */
        }
        apply(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [idle]);

  if (!cfg) return null;
  return (
    <Suspense fallback={null}>
      {fools && (
        <FoolsPill
          onOff={() => {
            try {
              localStorage.setItem(FOOLS_OFF_KEY, '1');
            } catch {
              /* ignore */
            }
            document.documentElement.classList.remove('fools');
            setFools(false);
          }}
        />
      )}
      {cfg.hunt && session && <HuntMarker />}
    </Suspense>
  );
}
