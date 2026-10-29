/**
 * Talking: the chat (HudChat — recent lines fade after ten seconds; Y opens
 * "Say :", U opens "Say (TEAM) :", Enter sends, Esc cancels) and the voice
 * menus (Z, X, C — eight lines each, 1–8 to speak, 0 or Esc to close).
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudChatLine } from '@/lib/tf2-game/client/hud-state';
import { TF2_LIMITS } from '@/lib/tf2-game/net/events';
import { useMenuNav } from '../menu-nav';
import { useVoiceMenus } from '../strings';
import { usePanelStyle } from '../use-hud';

/** Seconds a line stays visible while the chat is closed. */
export const CHAT_LINE_TIME = 10;

export function Chat({
  lines,
  now,
  input,
  onSend,
  onClose,
}: {
  lines: HudChatLine[];
  now: number;
  /** Open input mode, or null when the chat is just the recent lines. */
  input: 'all' | 'team' | null;
  onSend: (text: string, teamOnly: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudChat');
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input) field.current?.focus({ preventScroll: true });
  }, [input]);
  if (!style) return null;
  const shown = input ? lines.slice(-30) : lines.filter((l) => now - l.at <= CHAT_LINE_TIME).slice(-6);
  return (
    <div className="tf2g-panel" style={style}>
      <div className="tf2g-chat" data-open={input !== null}>
        <div className="tf2g-chat-lines" role="log" aria-live="polite" aria-label={t('chat_aria', { defaultValue: 'Chat' })}>
          {shown.map((l) => (
            <div key={l.id} className={`tf2g-chat-line tf2g-team-${l.team}${l.system ? ' tf2g-chat-system' : ''}`}>
              {l.system ? (
                l.text
              ) : (
                <>
                  {l.dead ? <span>{t('chat_dead', { defaultValue: '*DEAD* ' })}</span> : null}
                  {l.teamOnly ? <span>{t('chat_team', { defaultValue: '(TEAM) ' })}</span> : null}
                  <b>{l.name}</b>
                  {' : '}
                  {l.text}
                </>
              )}
            </div>
          ))}
        </div>
        {input ? (
          <form
            className="tf2g-chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (text) onSend(text, input === 'team');
              setDraft('');
              onClose();
            }}
          >
            <label htmlFor="tf2g-chat-field">
              {input === 'team' ? t('chat_say_team', { defaultValue: 'Say (TEAM) :' }) : t('chat_say', { defaultValue: 'Say :' })}
            </label>
            <input
              id="tf2g-chat-field"
              ref={field}
              value={draft}
              maxLength={TF2_LIMITS.CHAT_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraft('');
                  onClose();
                }
              }}
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function VoiceMenu({ menu, onPick, onClose }: { menu: 0 | 1 | 2; onPick: (item: number) => void; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const menus = useVoiceMenus();
  const style = usePanelStyle('HudMenu');
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, true, onClose, { focusFirst: false });
  if (!style) return null;
  const m = menus[menu];
  return (
    <div className="tf2g-panel tf2g-interactive" style={style}>
      <div ref={ref} className="tf2g-menu-list" role="menu" aria-label={m.title}>
        <div className="tf2g-menu-box">
          <div className="tf2g-menu-title">{m.title}</div>
          {m.items.map((label, i) => (
            <button key={i} type="button" role="menuitem" className="tf2g-menu-item" data-menu-item onClick={() => onPick(i)}>
              <kbd>{i + 1}.</kbd>
              <span>{label}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className="tf2g-menu-item" data-menu-item onClick={onClose}>
            <kbd>0.</kbd>
            <span>{t('menu_cancel', { defaultValue: 'Cancel' })}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
