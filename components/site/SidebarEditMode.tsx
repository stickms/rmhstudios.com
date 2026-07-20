'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, Eye, EyeOff } from 'lucide-react';

import { IconButton } from '@/components/ui/icon-button';
import { useLayoutStore } from '@/stores/layoutStore';
import { SIDEBAR_NAV_IDS, SIDEBAR_NAV_META } from '@/lib/home-widgets';
import { iconFor } from '@/components/home/layout-icons';

/**
 * SidebarEditMode (§15) — pin/hide the customizable sidebar destinations. Pin
 * promotes a destination into the main rail; hide removes it from the rail
 * (still reachable via "More", the command palette, and its URL — §2.6, never
 * strand a surface). Backed by the cross-device layout store; applies
 * identically to the desktop sidebar and the mobile drawer (one data source).
 */
export function SidebarEditMode() {
  const { t } = useTranslation('feed');
  const { t: tl } = useTranslation('c-layout');
  const sidebar = useLayoutStore((s) => s.sidebar);
  const togglePin = useLayoutStore((s) => s.togglePin);
  const toggleHidden = useLayoutStore((s) => s.toggleHidden);

  useEffect(() => {
    useLayoutStore.getState().hydrate();
  }, []);

  return (
    <ul className="divide-y divide-site-border">
      {SIDEBAR_NAV_IDS.map((id) => {
        const meta = SIDEBAR_NAV_META[id];
        const Icon = iconFor(meta.iconName);
        const name = t(meta.tKey, { defaultValue: meta.label });
        const isPinned = sidebar.pinned.includes(id);
        const isHidden = sidebar.hidden.includes(id);
        return (
          <li key={id} className="flex items-center gap-3 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-site-text">{name}</span>
            <IconButton
              icon={Pin}
              size="icon-sm"
              variant={isPinned ? 'accent' : 'ghost'}
              aria-pressed={isPinned}
              onClick={() => togglePin(id)}
              label={
                isPinned
                  ? tl('unpin', { defaultValue: 'Unpin {{name}}', name })
                  : tl('pin', { defaultValue: 'Pin {{name}}', name })
              }
            />
            <IconButton
              icon={isHidden ? EyeOff : Eye}
              size="icon-sm"
              variant={isHidden ? 'accent' : 'ghost'}
              aria-pressed={isHidden}
              onClick={() => toggleHidden(id)}
              label={
                isHidden
                  ? tl('unhide', { defaultValue: 'Show {{name}}', name })
                  : tl('hide', { defaultValue: 'Hide {{name}}', name })
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
