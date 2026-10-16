'use client';

import { useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

/**
 * Z2 — the hidden clue marker. The server only answers for the page that hides
 * the signed-in member's current clue, so on every other page this renders nothing.
 */
export default function HuntMarker() {
  const { t } = useTranslation('f-delight');
  const { pathname } = useLocation();
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(null);
    setOpen(false);
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    let alive = true;
    fetch(`/api/hunt/marker?path=${encodeURIComponent(path)}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ marker: { text: string } | null }>) : null))
      .then((d) => alive && setText(d?.marker?.text ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!text) return null;
  return (
    <div className="fixed bottom-24 end-3 z-40 flex flex-col items-end gap-2">
      {open && (
        <p className="glass-overlay max-w-64 rounded-site p-3 text-sm text-site-text" role="status">
          {text}
        </p>
      )}
      <IconButton
        icon={Sparkles}
        variant="ghost"
        size="icon-sm"
        className="opacity-40 hover:opacity-100 focus-visible:opacity-100"
        label={t('marker-label', { defaultValue: 'A hidden clue' })}
        onClick={() => setOpen((v) => !v)}
      />
    </div>
  );
}
