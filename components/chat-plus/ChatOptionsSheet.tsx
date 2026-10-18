'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Link2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ChatRef } from '@/lib/chat-plus/types';
import {
  CHAT_ACCENTS,
  CHAT_WALLPAPERS,
  accentStyle,
  encodeTheme,
  parseTheme,
  wallpaperStyle,
  type ChatAccent,
  type ChatWallpaper,
} from '@/lib/chat-plus/themes';
import type { ChatMeta } from '@/lib/chat-plus/settings.client';
import { chatMetaKey, useChatMeta } from './hooks';
import { SharedMediaPanel } from './SharedMediaPanel';
import { ChatFoldersSection } from './ChatFoldersSection';

type Tab = 'settings' | 'media' | 'links';

/** The per-chat options sheet. Lazy-loaded by {@link ChatHeaderPlus}. */
export default function ChatOptionsSheet({
  chat,
  onClose,
}: {
  chat: ChatRef;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-messaging');
  const [tab, setTab] = useState<Tab>('settings');
  const tabs: LiquidTab[] = [
    { id: 'settings', label: t('tab-settings', { defaultValue: 'Settings' }), icon: Settings2 },
    { id: 'media', label: t('tab-media', { defaultValue: 'Media' }), icon: ImageIcon },
    { id: 'links', label: t('tab-links', { defaultValue: 'Links' }), icon: Link2 },
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('options-title', { defaultValue: 'Chat options' })}</SheetTitle>
          <SheetDescription>
            {t('options-description', {
              defaultValue: 'These apply to everyone in this chat unless noted.',
            })}
          </SheetDescription>
        </SheetHeader>
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          size="sm"
          idBase="chat-options"
          aria-label={t('options-tabs', { defaultValue: 'Chat options sections' })}
        />
        <div
          role="tabpanel"
          id={`chat-options-panel-${tab}`}
          aria-labelledby={`chat-options-tab-${tab}`}
        >
          {tab === 'settings' ? (
            <SettingsPanel chat={chat} />
          ) : (
            <SharedMediaPanel chat={chat} tab={tab} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SettingsPanel({ chat }: { chat: ChatRef }) {
  const { t } = useTranslation('f-messaging');
  const qc = useQueryClient();
  const { data: meta } = useChatMeta(chat);
  const base = `/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/settings`;
  const key = chatMetaKey(chat);

  const patchMeta = (patch: Partial<ChatMeta>) =>
    qc.setQueryData<ChatMeta>(key, (old) => (old ? { ...old, ...patch } : old));

  const save = async (method: 'PATCH' | 'PUT', body: unknown, rollback: () => void) => {
    try {
      const res = await fetch(base, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'failed');
      }
    } catch {
      rollback();
      toast.error(t('settings-save-failed', { defaultValue: 'Could not save that setting' }));
    }
  };

  if (!meta) {
    return (
      <p className="py-8 text-center text-sm text-site-text-dim">
        {t('loading', { defaultValue: 'Loading…' })}
      </p>
    );
  }

  const theme = parseTheme(meta.themeKey);
  const setTheme = (next: { accent?: ChatAccent; wallpaper?: ChatWallpaper }) => {
    const before = meta.themeKey;
    const key2 = encodeTheme({ ...theme, ...next });
    patchMeta({ themeKey: key2 });
    void save('PATCH', { themeKey: key2 }, () => patchMeta({ themeKey: before }));
  };
  const setTimer = (value: string) => {
    const before = meta.disappearAfterSec;
    const next = value ? Number(value) : null;
    patchMeta({ disappearAfterSec: next });
    void save('PATCH', { disappearAfterSec: next }, () => patchMeta({ disappearAfterSec: before }));
  };
  const setPref = (field: 'hideReceipts' | 'hideTyping', hidden: boolean) => {
    const before = meta.prefs;
    patchMeta({ prefs: { ...meta.prefs, [field]: hidden } });
    void save('PUT', { [field]: hidden }, () => patchMeta({ prefs: before }));
  };

  const accentLabel: Record<ChatAccent, string> = {
    default: t('accent-default', { defaultValue: 'Default' }),
    success: t('accent-success', { defaultValue: 'Green' }),
    warning: t('accent-warning', { defaultValue: 'Amber' }),
    danger: t('accent-danger', { defaultValue: 'Red' }),
    mono: t('accent-mono', { defaultValue: 'Mono' }),
  };
  const wallpaperLabel: Record<ChatWallpaper, string> = {
    none: t('wallpaper-none', { defaultValue: 'None' }),
    aurora: t('wallpaper-aurora', { defaultValue: 'Aurora' }),
    dusk: t('wallpaper-dusk', { defaultValue: 'Dusk' }),
    paper: t('wallpaper-paper', { defaultValue: 'Paper' }),
    dots: t('wallpaper-dots', { defaultValue: 'Dots' }),
    grid: t('wallpaper-grid', { defaultValue: 'Grid' }),
  };
  const showPrivacy = chat.kind === 'dm' && !meta.isSelf;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <section aria-labelledby="opt-disappear">
        <h3 id="opt-disappear" className="text-sm font-semibold text-site-text">
          {t('disappear-title', { defaultValue: 'Disappearing messages' })}
        </h3>
        <p className="mb-2 text-xs text-site-text-dim">
          {t('disappear-help', {
            defaultValue:
              'New messages are hidden and deleted after this long. Anyone in the chat can change it, and the chat is told when they do.',
          })}
        </p>
        <Select
          aria-labelledby="opt-disappear"
          value={meta.disappearAfterSec ? String(meta.disappearAfterSec) : ''}
          onChange={(e) => setTimer(e.target.value)}
        >
          <option value="">{t('disappear-off', { defaultValue: 'Off' })}</option>
          <option value="3600">{t('disappear-1h', { defaultValue: '1 hour' })}</option>
          <option value="86400">{t('disappear-1d', { defaultValue: '1 day' })}</option>
          <option value="604800">{t('disappear-7d', { defaultValue: '7 days' })}</option>
        </Select>
      </section>

      <section aria-labelledby="opt-theme">
        <h3 id="opt-theme" className="text-sm font-semibold text-site-text">
          {t('theme-title', { defaultValue: 'Theme' })}
        </h3>
        <p className="mb-2 text-xs text-site-text-dim">
          {t('theme-help', {
            defaultValue: 'Everyone in this chat sees the same accent and wallpaper.',
          })}
        </p>
        <div
          role="radiogroup"
          aria-label={t('theme-accent', { defaultValue: 'Accent' })}
          className="mb-3 flex flex-wrap gap-2"
        >
          {CHAT_ACCENTS.map((a) => {
            const style = accentStyle({ accent: a, wallpaper: 'none' });
            const on = theme.accent === a;
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme({ accent: a })}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:ring-site-accent',
                  on
                    ? 'border-site-accent bg-site-accent-dim text-site-text'
                    : 'border-site-border text-site-text-muted hover:bg-site-surface-hover',
                )}
              >
                <span
                  aria-hidden
                  className="size-4 rounded-full border border-site-border bg-site-accent"
                  style={style}
                />
                {accentLabel[a]}
              </button>
            );
          })}
        </div>
        <div
          role="radiogroup"
          aria-label={t('theme-wallpaper', { defaultValue: 'Wallpaper' })}
          className="grid grid-cols-3 gap-2"
        >
          {CHAT_WALLPAPERS.map((w) => {
            const on = theme.wallpaper === w;
            return (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme({ wallpaper: w })}
                className={cn(
                  'flex h-16 items-end rounded-site-sm border p-1.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-site-accent',
                  on
                    ? 'border-site-accent text-site-text'
                    : 'border-site-border text-site-text-muted hover:border-site-border-bright',
                )}
                style={{
                  ...accentStyle(theme),
                  ...wallpaperStyle({ accent: theme.accent, wallpaper: w }),
                }}
              >
                <span className="rounded-site-sm bg-site-bg/70 px-1.5 py-0.5">
                  {wallpaperLabel[w]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {showPrivacy && (
        <section aria-labelledby="opt-privacy">
          <h3 id="opt-privacy" className="text-sm font-semibold text-site-text">
            {t('privacy-title', { defaultValue: 'Receipts and typing' })}
          </h3>
          <p className="mb-2 text-xs text-site-text-dim">
            {t('privacy-help', {
              defaultValue:
                'These work both ways: if you turn one off here, you also stop seeing it from the other person.',
            })}
          </p>
          <div className="flex flex-col divide-y divide-site-border">
            <label className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-site-text">
              {t('privacy-receipts', { defaultValue: 'Read receipts' })}
              <Switch
                checked={!meta.prefs.hideReceipts}
                onCheckedChange={(on) => setPref('hideReceipts', !on)}
                aria-label={t('privacy-receipts', { defaultValue: 'Read receipts' })}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-site-text">
              {t('privacy-typing', { defaultValue: 'Typing indicators' })}
              <Switch
                checked={!meta.prefs.hideTyping}
                onCheckedChange={(on) => setPref('hideTyping', !on)}
                aria-label={t('privacy-typing', { defaultValue: 'Typing indicators' })}
              />
            </label>
          </div>
        </section>
      )}

      <ChatFoldersSection chat={chat} />
    </div>
  );
}
