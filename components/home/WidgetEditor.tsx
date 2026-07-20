'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';

import { SortableList } from '@/components/ui/sortable-list';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { useLayoutStore } from '@/stores/layoutStore';
import {
  WIDGET_KINDS,
  WIDGET_CATALOG,
  DEFAULT_HOME_STACK,
  type WidgetKind,
  type HomeStackItem,
} from '@/lib/home-widgets';
import { iconFor } from './layout-icons';

/**
 * WidgetEditor (§15) — reorder the home widgets (G2 SortableList, so touch and
 * keyboard reorder with ▲/▼ buttons), remove them, and add hidden ones back.
 * Controlled entirely by the layout store; renders inline (settings page) or
 * inside the G1 Sheet (rail "Edit layout"). All actions persist + mirror.
 */
export function WidgetEditor() {
  const { t } = useTranslation('c-layout');
  const homeStack = useLayoutStore((s) => s.homeStack);
  const hydrated = useLayoutStore((s) => s.hydrated);
  const setHomeStack = useLayoutStore((s) => s.setHomeStack);
  const addWidget = useLayoutStore((s) => s.addWidget);
  const removeWidget = useLayoutStore((s) => s.removeWidget);

  useEffect(() => {
    useLayoutStore.getState().hydrate();
  }, []);

  const enabled = new Set(homeStack.map((w) => w.kind));
  const available = WIDGET_KINDS.filter((k) => !enabled.has(k));

  // SortableList needs a stable string `id`; use the widget kind.
  const rows = homeStack.map((w) => ({ id: w.kind, ...w }));

  const labelFor = (kind: WidgetKind) =>
    t(`widget-${kind}`, { defaultValue: WIDGET_CATALOG[kind].label });

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-site-text">
            {t('your-widgets', { defaultValue: 'Your widgets' })}
          </h3>
          <button
            type="button"
            onClick={() => setHomeStack(DEFAULT_HOME_STACK)}
            className="text-xs text-site-text-muted underline-offset-2 hover:text-site-text hover:underline"
          >
            {t('reset', { defaultValue: 'Reset to default' })}
          </button>
        </div>

        {hydrated && rows.length ? (
          <SortableList
            items={rows}
            onReorder={(next) => setHomeStack(next.map(({ id: _id, ...w }) => w as HomeStackItem))}
            itemLabel={(r) => labelFor(r.kind)}
            renderItem={(r) => {
              const Icon = iconFor(WIDGET_CATALOG[r.kind].iconName);
              return (
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{labelFor(r.kind)}</span>
                  <IconButton
                    icon={X}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeWidget(r.kind)}
                    label={t('remove-widget', { defaultValue: 'Remove {{name}}', name: labelFor(r.kind) })}
                  />
                </div>
              );
            }}
          />
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('no-widgets', { defaultValue: 'No widgets — add some below.' })}
          </p>
        )}
      </section>

      {available.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-site-text">
            {t('add-widgets', { defaultValue: 'Add widgets' })}
          </h3>
          <div className="flex flex-wrap gap-2">
            {available.map((kind) => {
              const Icon = iconFor(WIDGET_CATALOG[kind].iconName);
              return (
                <Button
                  key={kind}
                  variant="outline"
                  size="sm"
                  onClick={() => addWidget(kind)}
                  className="gap-1.5"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {labelFor(kind)}
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
