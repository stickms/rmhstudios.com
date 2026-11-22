import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

import { IconButton } from '@/components/ui/icon-button';
import { SortableList } from '@/components/ui/sortable-list';
import { useLayoutStore } from '@/stores/layoutStore';
import { SIDEBAR_HIDEABLE_IDS } from '@/lib/home-widgets';
import { SECTION_NAV_IDS, SIDEBAR_NAV, orderNavItems, type NavItem } from '@/lib/sidebar-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';

/**
 * SidebarEditMode (§15) — arrange the desktop sidebar's list of places (G2
 * SortableList, so touch and keyboard reorder with the ▲/▼ buttons) and hide the
 * ones you don't use. The section words at the top of the sidebar (Feed, Explore,
 * Games, Inbox) are fixed and not listed here, and Admin is always last. Hidden
 * places stay reachable from the globe, `/sections`, search and their URL (§2.6,
 * never strand a surface). Backed by the cross-device layout store, which
 * `components/shell/Sidebar.tsx` reads through `sidebarPlaces()`.
 */

const ORDERABLE = SIDEBAR_NAV.filter((i) => i.id !== '/admin' && !SECTION_NAV_IDS.has(i.id));
const HIDEABLE = new Set<string>(SIDEBAR_HIDEABLE_IDS);

export function SidebarEditMode() {
  const { t } = useTranslation('feed');
  const { t: tl } = useTranslation('c-layout');
  const order = useLayoutStore((s) => s.sidebar.order);
  const hidden = useLayoutStore((s) => s.sidebar.hidden);
  const hydrated = useLayoutStore((s) => s.hydrated);
  const setSidebarOrder = useLayoutStore((s) => s.setSidebarOrder);
  const toggleHidden = useLayoutStore((s) => s.toggleHidden);
  const resetSidebar = useLayoutStore((s) => s.resetSidebar);
  // Steel M9: the saved order is read on the client, so the list replaces a skeleton.
  const arrival = useArrival(hydrated);

  useEffect(() => {
    useLayoutStore.getState().hydrate();
  }, []);

  const nameFor = (item: NavItem) =>
    t(item.tKey, {
      defaultValue: item.label,
    });
  // SortableList needs a stable string `id`; carry the nav item alongside it.
  const rows = orderNavItems(ORDERABLE, order).map((item) => ({
    id: item.id,
    item,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-site-text-muted">
          {tl('sidebar-places-hint', {
            defaultValue: 'Drag to reorder. Hide a place with the eye; it stays on the globe and in search.',
          })}
        </p>
        <button
          type="button"
          onClick={resetSidebar}
          className="shrink-0 text-xs text-site-text-muted underline-offset-2 hover:text-site-text hover:underline"
        >
          {tl('reset', {
            defaultValue: 'Reset to default',
          })}
        </button>
      </div>

      {hydrated ? (
        <SortableList
          className={arrival}
          items={rows}
          onReorder={(next) => setSidebarOrder(next.map((r) => r.id))}
          itemLabel={(r) => nameFor(r.item)}
          renderItem={(r) => {
            const { item } = r;
            const Icon = item.icon;
            const name = nameFor(item);
            const hideable = HIDEABLE.has(item.id);
            const isHidden = hidden.includes(item.id);
            return (
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${isHidden ? 'text-site-text-muted' : 'text-site-text'}`}
                >
                  {name}
                </span>
                {hideable ? (
                  <IconButton
                    icon={isHidden ? EyeOff : Eye}
                    size="icon-sm"
                    variant={isHidden ? 'default' : 'ghost'}
                    aria-pressed={isHidden}
                    onClick={() => toggleHidden(item.id)}
                    label={
                      isHidden
                        ? tl('unhide', {
                            defaultValue: 'Show {{name}}',
                            name,
                          })
                        : tl('hide', {
                            defaultValue: 'Hide {{name}}',
                            name,
                          })
                    }
                  />
                ) : null}
              </div>
            );
          }}
        />
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
    </div>
  );
}
