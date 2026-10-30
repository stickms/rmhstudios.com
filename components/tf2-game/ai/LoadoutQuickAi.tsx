/**
 * Quick AI for the in-game loadout view: a one-line prompt and chips picked from the live match
 * ("Counter their Sniper", "Counter the Sniper Rifle" after it killed you twice, "Rocket-jump set",
 * "What's good on ctf_2fort?", "Fun festive look").
 *
 * Signed in, it asks `POST /api/tf2-loadout/ai` with the match appended as data (`context`: map, mode,
 * round, your class and team, the enemy classes from the scoreboard, what has been killing you — no
 * player names; lib/tf2-game/client/ai/match-context.ts). The answer's equips are checked against the
 * catalog on the server. Signed out — or when the AI is unavailable — the item-name matcher
 * (`heuristicSuggest`) answers locally. "Equip" puts the items into this class's loadout under the
 * game's rules and sends it through the view's own flow (HudCommand `loadout`), so it goes on at the
 * next respawn or resupply, at once in your respawn room; "Undo" restores the loadout before.
 */
'use client';

import { Shirt, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { Btn, Pill } from '@/components/tf2-hud/ui';
import ItemTile from '@/components/tf2-hud/loadout/ItemTile';
import { CLASS_DEFAULT } from '@/components/tf2-hud/loadout/labels';
import { ApiError } from '@/lib/tf2-hud/api';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import { ASSISTANT_LIMITS, heuristicSuggest, type AiAction } from '@/lib/tf2-loadout/ai-core';
import type { LoadoutSlots, TfClass } from '@/lib/tf2-loadout/catalog-types';
import { loadoutWarnings } from '@/lib/tf2-loadout/rules';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { applyLoadoutActions } from '@/lib/tf2-game/client/ai/loadout-quick';
import { matchContextFrom } from '@/lib/tf2-game/client/ai/match-context';
import { loadoutSuggestions, type LoadoutSuggestion } from '@/lib/tf2-game/client/ai/suggestions';
import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import { useHudContext, useHudState } from '../use-hud';
import { deathLogFor } from './death-log';
import {
  ASK_DEBOUNCE_MS,
  ChipRow,
  LiveRegion,
  Note,
  Progress,
  QuickBarFrame,
  QuickPrompt,
  type ChipItem,
} from './QuickBar';

interface Answer {
  text: string;
  actions: AiAction[];
  /** Answered by the local name matcher, not the AI. */
  local: boolean;
}

export function loadoutChipLabel(t: TFunction, s: LoadoutSuggestion): string {
  const cls = s.params?.cls ? CLASS_DEFAULT[s.params.cls] : '';
  switch (s.id) {
    case 'counter-class':
      return t('ai_loadout_chip_counter', { defaultValue: 'Counter their {{cls}}', cls });
    case 'counter-weapon':
      return t('ai_loadout_chip_counter_weapon', {
        defaultValue: 'Counter the {{weapon}}',
        weapon: s.params?.weapon ?? '',
      });
    case 'jump-set':
      return s.params?.cls === 'demoman'
        ? t('ai_loadout_chip_sticky_jump', { defaultValue: 'Sticky-jump set' })
        : t('ai_loadout_chip_rocket_jump', { defaultValue: 'Rocket-jump set' });
    case 'map':
      return t('ai_loadout_chip_map', { defaultValue: "What's good on {{map}}?", map: s.params?.map ?? '' });
    case 'festive':
      return t('ai_loadout_chip_festive', { defaultValue: 'Fun festive look' });
    case 'spooky':
      return t('ai_loadout_chip_spooky', { defaultValue: 'Spooky Halloween look' });
  }
}

export default function LoadoutQuickAi({
  idx,
  cls,
  slots,
  onChange,
}: {
  idx: CatalogIndex;
  /** The class tab the view is editing (may differ from the class being played). */
  cls: TfClass;
  slots: LoadoutSlots;
  /** The view's own edit (saves the class's draft). */
  onChange: (slots: LoadoutSlots) => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const { store } = useHudContext();
  const state = useHudState();
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const { catalog } = idx;
  const deaths = useMemo(() => deathLogFor(store), [store]);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ cls: TfClass; slots: LoadoutSlots; sent: boolean } | null>(null);
  const [sent, setSent] = useState<{ cls: number; at: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [signIn, setSignIn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAsk = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);
  // A different class tab is a different loadout: its answers and undo do not carry over.
  useEffect(() => {
    abortRef.current?.abort();
    setAnswer(null);
    setUndo(null);
    setError(null);
  }, [cls]);

  const ctx = useMemo(
    () => matchContextFrom(state, deaths()),
    // The context is read when asked; recompute only with what the chips show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.match.map, state.match.mode, state.scoreboard, state.killfeed, state.local?.cls, state.local?.team],
  );
  const suggestions = useMemo(
    () => loadoutSuggestions(cls, ctx).filter((s) => signedIn || s.localWords),
    [cls, ctx, signedIn],
  );

  const local = (message: string, words: string, why: 'signed-out' | 'unavailable'): Answer => {
    const fb = heuristicSuggest(catalog, cls, `${message} ${words}`.trim(), slots);
    const text = fb.actions.length
      ? why === 'signed-out'
        ? t('ai_loadout_local', {
            defaultValue: 'Items whose names match (sign in for the AI):',
          })
        : t('ai_loadout_fallback', {
            defaultValue: 'The AI is not available right now, so these are items whose names match:',
          })
      : why === 'signed-out'
        ? t('ai_loadout_local_none', {
            defaultValue: 'Nothing matched by name. Sign in to ask the AI, or try a theme or a weapon name.',
          })
        : t('ai_loadout_fallback_none', {
            defaultValue: 'The AI is not available right now and nothing matched by name.',
          });
    return { text, actions: fb.actions, local: true };
  };

  const show = (a: Answer) => {
    setAnswer(a);
    const names = a.actions.map((x) => idx.item(x.item)?.n).filter(Boolean).join(', ');
    setAnnounce(names ? `${a.text} ${names}` : a.text);
  };

  const ask = async (raw: string, suggestion?: LoadoutSuggestion) => {
    const message = raw.trim().slice(0, ASSISTANT_LIMITS.message);
    const now = Date.now();
    if (!message || busy || now - lastAsk.current < ASK_DEBOUNCE_MS) return;
    lastAsk.current = now;
    setError(null);
    setAnswer(null);
    if (!signedIn) {
      show(local(message, suggestion?.localWords ?? '', 'signed-out'));
      return;
    }
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    try {
      const res = await loadoutApi.ask(
        {
          tfClass: cls,
          slots,
          message,
          history: [],
          context: matchContextFrom(store.getSnapshot(), deaths()),
        },
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      if ('unavailable' in res) show(local(message, suggestion?.localWords ?? '', 'unavailable'));
      else show({ text: res.reply, actions: res.actions, local: false });
      setText('');
    } catch (e) {
      if (ctl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) setSignIn(true);
      const msg =
        status === 402
          ? t('ai_limit', { defaultValue: "You have used this month's AI allowance." })
          : status === 429
            ? t('ai_rate', { defaultValue: 'Too many requests. Wait a moment and try again.' })
            : status === 503
              ? t('ai_loadout_no_catalog', { defaultValue: 'The item catalog is not ready yet. Try again shortly.' })
              : t('ai_error', { defaultValue: 'Something went wrong asking the AI. Nothing was changed.' });
      setError(msg);
      setAnnounce(msg);
    } finally {
      if (abortRef.current === ctl) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setAnnounce(t('ai_cancelled', { defaultValue: 'Cancelled.' }));
  };

  const playing = state.local && state.local.cls > 0 ? (CLASS_NAMES[state.local.cls] as TfClass) : null;
  const clsIndex = (CLASS_NAMES as readonly string[]).indexOf(cls);

  /** The view's own equip: the draft first, then the match when it would take it. */
  const send = (next: LoadoutSlots): boolean => {
    onChange(next);
    const ok = !!state.local && state.local.team >= 2 && loadoutWarnings(catalog, cls, next).length === 0;
    if (ok) {
      store.send({ kind: 'loadout', cls, slots: next });
      setSent({ cls: clsIndex, at: state.now });
    }
    return ok;
  };

  const equip = (actions: AiAction[]) => {
    const r = applyLoadoutActions(catalog, slots, actions);
    if (!r.equipped.length) return;
    const was = slots;
    const ok = send(r.slots);
    setUndo({ cls, slots: was, sent: ok });
    const msg = ok
      ? t('ai_loadout_equipped', { defaultValue: 'Equipped {{names}}.', names: r.equipped.join(', ') })
      : t('ai_loadout_added', {
          defaultValue: 'Added {{names}} to the loadout. Pick a team (and fix any warnings) to equip it.',
          names: r.equipped.join(', '),
        });
    setAnnounce(r.replaced.length ? `${msg} ${t('ai_loadout_replaced', { defaultValue: 'Replaced {{names}}.', names: r.replaced.join(', ') })}` : msg);
    setAnswer(null);
  };

  const undoEquip = () => {
    if (!undo || undo.cls !== cls) return;
    if (undo.sent) send(undo.slots);
    else onChange(undo.slots);
    setUndo(null);
    setAnnounce(t('ai_loadout_undone', { defaultValue: 'Undone: the loadout is back as it was.' }));
  };

  // The match's answer to our last equip (the same rule the view states).
  const reply =
    state.loadout && sent && state.loadout.cls === sent.cls && state.loadout.at >= sent.at ? state.loadout : null;
  const status = !reply
    ? null
    : reply.status === 'refused'
      ? { tone: 'danger' as const, text: t('ai_loadout_refused', { defaultValue: 'The game refused it ({{reason}}).', reason: reply.reason ?? '?' }) }
      : reply.cls !== state.local?.cls
        ? { tone: 'info' as const, text: t('ai_loadout_other_class', { defaultValue: 'Goes on when you next spawn as {{cls}}.', cls: CLASS_DEFAULT[cls] }) }
        : state.local?.loadoutPending
          ? {
              tone: 'info' as const,
              text: state.local.alive
                ? t('ai_loadout_resupply', { defaultValue: 'Applies at next resupply.' })
                : t('ai_loadout_respawn', { defaultValue: 'Applies when you respawn.' }),
            }
          : { tone: 'success' as const, text: t('ai_loadout_on', { defaultValue: 'Equipped.' }) };

  const chips: ChipItem[] = suggestions.map((s) => {
    const label = loadoutChipLabel(t, s);
    return {
      key: `${s.id}:${s.params?.cls ?? ''}${s.params?.weapon ?? ''}`,
      label,
      hint: signedIn ? undefined : t('ai_loadout_local_hint', { defaultValue: 'matches item names, no AI' }),
      onPick: () => void ask(label, s),
    };
  });

  return (
    <QuickBarFrame title={t('ai_loadout_title', { defaultValue: 'Quick AI' })}>
      <QuickPrompt
        value={text}
        onChange={setText}
        onSubmit={() => void ask(text)}
        onCancel={cancel}
        busy={busy}
        maxLength={ASSISTANT_LIMITS.message}
        label={t('ai_loadout_prompt_label', { defaultValue: 'Ask for a loadout idea' })}
        placeholder={t('ai_loadout_placeholder', { defaultValue: 'Counter their Sniper, a festive look…' })}
      />
      <ChipRow chips={chips} disabled={busy} label={t('ai_suggestions', { defaultValue: 'Suggestions' })} />
      {!signedIn ? (
        <Note>
          {t('ai_loadout_signed_out', {
            defaultValue: 'Signed out, answers match item names. Sign in to ask the AI about this match.',
          })}{' '}
          <button
            type="button"
            className="text-(--app-accent-text) underline pointer-coarse:min-h-11"
            onClick={() => setSignIn(true)}
          >
            {t('ai_sign_in', { defaultValue: 'Sign in' })}
          </button>
        </Note>
      ) : null}
      {busy ? <Progress>{t('ai_loadout_thinking', { defaultValue: 'Thinking about this match…' })}</Progress> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      {answer ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) p-2">
          <p className="text-xs break-words">{answer.text}</p>
          {answer.actions.length ? (
            <>
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {answer.actions.map((a) => {
                  const item = idx.item(a.item);
                  if (!item) return null;
                  const paint = a.paint !== undefined ? idx.paint(a.paint) : undefined;
                  return (
                    <li key={`${a.slot}-${a.item}`} className="flex min-w-0 flex-col gap-0.5">
                      <ItemTile item={item} paint={paint} />
                      <span className="truncate text-[11px] font-semibold pointer-coarse:text-xs" title={item.n}>
                        {item.n}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Btn size="sm" variant="primary" icon={Shirt} data-menu-item onClick={() => equip(answer.actions)}>
                  {t('ai_loadout_equip', { defaultValue: 'Equip' })}
                </Btn>
                <Btn size="sm" variant="ghost" data-menu-item onClick={() => setAnswer(null)}>
                  {t('ai_discard', { defaultValue: 'Discard' })}
                </Btn>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {undo && undo.cls === cls ? (
        <div className="flex flex-wrap items-center gap-2">
          {status ? <Pill tone={status.tone}>{status.text}</Pill> : null}
          {!status && playing === cls && state.local?.inSpawnRoom ? (
            <Note>{t('ai_loadout_spawn', { defaultValue: 'In your respawn room: it goes on at once.' })}</Note>
          ) : null}
          <Btn size="xs" variant="ghost" icon={Undo2} data-menu-item onClick={undoEquip}>
            {t('ai_undo', { defaultValue: 'Undo' })}
          </Btn>
        </div>
      ) : null}
      <LiveRegion text={announce} />
      {signIn ? (
        <SignInRequiredDialog
          open
          onClose={() => setSignIn(false)}
          feature={t('ai_feature_loadout', { defaultValue: 'Ask the AI for loadouts' })}
        />
      ) : null}
    </QuickBarFrame>
  );
}
