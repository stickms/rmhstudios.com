/**
 * The HUD assistant: describe what you want ("make the health bar bigger and blue") and it works out
 * which files that touches, proposes key-level changes, and shows exactly what would change — each
 * key with its old and new value — before anything is applied. Applying is one undo step. If the model
 * is unavailable or cannot do the request, the panel says so and points at the editor's own tools.
 * A phone gets a full-height sheet, a desktop a dialog.
 */
'use client';

import { Check, Send, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  applyChanges,
  excerptForAi,
  HUD_AI_LIMITS,
  type AppliedChange,
  type HudChange,
  type RejectedChange,
} from '@/lib/tf2-hud/ai-core';
import { api, ApiError } from '@/lib/tf2-hud/api';
import type { AiContext } from '@/lib/tf2-hud/ai-context';
import { useEditor } from '@/lib/tf2-hud/store';
import { Btn, Modal, TextField } from './ui';

interface Proposal {
  changes: HudChange[];
  applied: AppliedChange[];
  rejected: RejectedChange[];
  /** Suggestions dropped before they got this far (malformed, or for a file that was not shown). */
  malformed: number;
  state: 'pending' | 'applied' | 'discarded';
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  proposal?: Proposal;
}

const COLOUR = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(\d{1,3}))?\s*$/;

function Swatch({ value }: { value: string | null }) {
  const m = value ? COLOUR.exec(value) : null;
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Math.min(255, Number(m[4])) / 255;
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-sm border border-(--app-border-bright)"
      style={{ background: `rgb(${m[1]} ${m[2]} ${m[3]} / ${a})` }}
    />
  );
}

/** "HudPlayerHealth › xpos": the key path without the file's own root block. */
const label = (c: { path: string[] }): string => c.path.slice(1).join(' › ') || c.path[0];

/** HUD files worth offering to the model: panel layouts, the scheme and the global layout. */
function offeredPaths(all: string[]): string[] {
  return all
    .filter(
      (p) =>
        /^resource\/ui\/[^/]+\.res$/i.test(p) ||
        /^resource\/clientscheme\.res$/i.test(p) ||
        /^scripts\/hudlayout\.res$/i.test(p),
    )
    .slice(0, HUD_AI_LIMITS.paths);
}

export default function HudAssistant({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { data: session } = useSession();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [step, setStep] = useState<'select' | 'edit' | null>(null);
  const [signIn, setSignIn] = useState(false);
  /** What the conversation is about (a panel, a problem, the scheme), until the player removes it. */
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const request = useEditor((s) => s.assistantRequest);
  const takenNonce = useRef(0);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, step]);

  const add = (m: Omit<Message, 'id'>): number => {
    const id = nextId.current++;
    setMessages((cur) => [...cur, { ...m, id }]);
    return id;
  };
  const patch = (id: number, f: (m: Message) => Message) =>
    setMessages((cur) => cur.map((m) => (m.id === id ? f(m) : m)));

  const chips = ctx
    ? [
        t('hud-ai-chip-explain', { defaultValue: 'Explain what this does' }),
        t('hud-ai-chip-readable', { defaultValue: 'Make it easier to read' }),
        t('hud-ai-chip-match', { defaultValue: 'Make it match the rest of the HUD' }),
      ]
    : [
        t('hud-ai-chip-health', { defaultValue: 'Make the health number bigger' }),
        t('hud-ai-chip-colour', { defaultValue: 'Change the main colour to blue' }),
        t('hud-ai-chip-ammo', { defaultValue: 'Move the ammo display to the left' }),
        t('hud-ai-chip-theme', { defaultValue: 'Give the whole HUD a dark teal and amber look' }),
      ];

  const unavailable = () =>
    add({
      role: 'assistant',
      text: t('hud-ai-unavailable', {
        defaultValue:
          'The assistant is not available right now. You can still change colours in the Scheme panel and positions and sizes in the Inspector.',
      }),
    });

  const send = async (raw: string, withContext: AiContext | null = ctx) => {
    const message = raw.trim().slice(0, HUD_AI_LIMITS.message);
    if (!message || step) return;
    if (!session) {
      setSignIn(true);
      return;
    }
    setText('');
    add({ role: 'user', text: message });
    const history = messages
      .slice(-HUD_AI_LIMITS.history)
      .map((m) => ({ role: m.role, content: m.text.slice(0, HUD_AI_LIMITS.historyChars) }));
    const store = useEditor.getState();
    try {
      // A request that comes with its files (a selected panel, a problem) does not need to ask which files.
      const known = withContext?.files.filter((f) => store.hasFile(f)) ?? [];
      setStep(known.length ? 'edit' : 'select');
      const picked = known.length
        ? { files: known }
        : await api.aiSelect({ message, paths: offeredPaths(store.paths()), history });
      if ('unavailable' in picked) {
        unavailable();
        return;
      }
      if (!picked.files.length) {
        add({
          role: 'assistant',
          text: t('hud-ai-no-files', {
            defaultValue:
              'I could not tell which part of the HUD that touches. Try naming it — health, ammo, the crosshair, the scoreboard — or a colour.',
          }),
        });
        return;
      }

      setStep('edit');
      await store.ensureFiles(picked.files);
      const current: Record<string, string> = {};
      for (const p of picked.files) {
        const txt = useEditor.getState().readText(p);
        if (txt !== undefined) current[p] = txt;
      }
      const shown = Object.entries(current).map(([path, txt]) => ({
        path,
        text: excerptForAi(path, txt),
      }));
      if (!shown.length) {
        unavailable();
        return;
      }
      const res = await api.aiEdit({ message, files: shown, history, context: withContext?.notes });
      if ('unavailable' in res) {
        unavailable();
        return;
      }
      // A dry run against the real files: what the player is told is what would actually change.
      const dry = applyChanges(current, res.changes);
      add({
        role: 'assistant',
        text:
          res.summary || t('hud-ai-no-summary', { defaultValue: 'Here is what I would change.' }),
        proposal: {
          changes: res.changes,
          applied: dry.applied,
          rejected: dry.rejected,
          malformed: res.malformed,
          state: 'pending',
        },
      });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) setSignIn(true);
      add({
        role: 'assistant',
        text:
          status === 402
            ? t('ai-limit', { defaultValue: "You have used this month's AI allowance." })
            : status === 429
              ? t('ai-rate', { defaultValue: 'Too many requests. Wait a moment and try again.' })
              : t('hud-ai-error', {
                  defaultValue: 'Something went wrong asking the assistant. Nothing was changed.',
                }),
      });
    } finally {
      setStep(null);
    }
  };

  // A button elsewhere asked something (about a panel, a problem, the scheme): take it, and send it if it says so.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!request || request.nonce === takenNonce.current) return;
    takenNonce.current = request.nonce;
    setCtx(request.context ?? null);
    if (request.prompt) {
      if (request.autoSend) void sendRef.current(request.prompt, request.context ?? null);
      else setText(request.prompt);
    }
    useEditor.getState().clearAssistantRequest();
  }, [request]);

  const apply = (m: Message) => {
    const pr = m.proposal;
    if (!pr) return;
    const store = useEditor.getState();
    const files: Record<string, string> = {};
    for (const c of pr.changes) {
      const txt = store.readText(c.file);
      if (txt !== undefined) files[c.file] = txt;
    }
    // Re-run on the current text, in case the player edited something since the proposal.
    const done = applyChanges(files, pr.changes);
    if (!Object.keys(done.files).length) {
      patch(m.id, (x) => ({
        ...x,
        proposal: { ...pr, applied: done.applied, state: 'discarded' },
      }));
      return;
    }
    store.applyBatch(`AI: ${m.text.slice(0, 60)}`, done.files);
    patch(m.id, (x) => ({ ...x, proposal: { ...pr, applied: done.applied, state: 'applied' } }));
  };

  const undo = (m: Message) => {
    useEditor.getState().undo();
    patch(m.id, (x) =>
      x.proposal ? { ...x, proposal: { ...x.proposal, state: 'discarded' } } : x,
    );
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        sheet={!isDesktop}
        wide
        title={t('hud-ai-title', { defaultValue: 'HUD assistant' })}
        description={t('hud-ai-intro', {
          defaultValue:
            'Describe what you want. You will see exactly what would change before anything is applied.',
        })}
        footer={
          <div className="flex w-full flex-col gap-2">
            {ctx ? (
              <p className="flex items-center gap-1.5 text-xs text-(--app-text-muted)">
                <span className="min-w-0 truncate">
                  {t('hud-ai-about', { defaultValue: 'About: {{what}}', what: ctx.label })}
                </span>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center rounded-(--app-radius-sm) p-0.5 hover:bg-(--app-surface-hover)"
                  aria-label={t('hud-ai-forget', { defaultValue: 'Stop talking about this' })}
                  onClick={() => setCtx(null)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </p>
            ) : null}
            <form
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
            >
              <TextField
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={HUD_AI_LIMITS.message}
                placeholder={t('hud-ai-placeholder', { defaultValue: 'What should change?' })}
                aria-label={t('hud-ai-placeholder', { defaultValue: 'What should change?' })}
                enterKeyHint="send"
                className="min-w-0 flex-1"
              />
              <Btn
                type="submit"
                variant="primary"
                icon={Send}
                disabled={step !== null || !text.trim()}
              >
                {t('ai-send', { defaultValue: 'Send' })}
              </Btn>
            </form>
          </div>
        }
      >
        <div className="flex min-h-48 flex-col gap-3" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="flex items-center gap-2 text-sm text-(--app-text-muted)">
                <Sparkles className="size-4 shrink-0 text-(--app-accent)" aria-hidden />
                {t('ai-try', { defaultValue: 'Try one of these, or type your own:' })}
              </p>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <Btn key={c} size="sm" onClick={() => void send(c)}>
                    {c}
                  </Btn>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'ms-auto max-w-[85%] rounded-(--app-radius-sm) bg-(--app-accent)/15 px-3 py-2 text-sm'
                  : 'max-w-full rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2 text-sm'
              }
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {m.proposal ? (
                <div className="mt-2 flex flex-col gap-2">
                  {m.proposal.applied.length ? (
                    <p className="text-xs font-semibold text-(--app-text-muted)">
                      {m.proposal.state === 'applied'
                        ? t('hud-ai-what-changed', { defaultValue: 'What changed' })
                        : t('hud-ai-what-would', { defaultValue: 'What would change' })}
                    </p>
                  ) : null}
                  {m.proposal.applied.length ? (
                    <ul className="flex flex-col gap-1.5 text-xs">
                      {m.proposal.applied.map((c, i) => (
                        <li
                          key={i}
                          className="rounded-(--app-radius-sm) border border-(--app-border) px-2 py-1.5"
                        >
                          <span className="block truncate text-(--app-text-dim)" title={c.file}>
                            {c.file.split('/').pop()}
                          </span>
                          <span className="block break-words font-semibold">{label(c)}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-(--app-text-muted)">
                            <Swatch value={c.before} />
                            <span className="break-all">
                              {c.before ?? t('hud-ai-unset', { defaultValue: '(not set)' })}
                            </span>
                            <span aria-hidden>→</span>
                            <Swatch value={c.after} />
                            <span className="break-all">
                              {c.after ?? t('hud-ai-removed', { defaultValue: '(removed)' })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-(--app-text-dim)">
                      {t('hud-ai-nothing', {
                        defaultValue: 'Nothing in the files needs to change.',
                      })}
                    </p>
                  )}
                  {m.proposal.rejected.length + m.proposal.malformed ? (
                    <p className="text-xs text-(--app-warning)">
                      {t('hud-ai-skipped', {
                        defaultValue:
                          '{{count}} suggested change could not be used and was skipped.',
                        count: m.proposal.rejected.length + m.proposal.malformed,
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {m.proposal.state === 'pending' && m.proposal.applied.length ? (
                      <>
                        <Btn size="sm" variant="primary" icon={Check} onClick={() => apply(m)}>
                          {t('hud-ai-apply', { defaultValue: 'Apply to my HUD' })}
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patch(m.id, (x) =>
                              x.proposal
                                ? { ...x, proposal: { ...x.proposal, state: 'discarded' } }
                                : x,
                            )
                          }
                        >
                          {t('hud-ai-discard', { defaultValue: 'Discard' })}
                        </Btn>
                      </>
                    ) : null}
                    {m.proposal.state === 'applied' ? (
                      <>
                        <span className="flex items-center gap-1 text-xs text-(--app-success)">
                          <Check className="size-4" aria-hidden />
                          {t('hud-ai-applied', { defaultValue: 'Applied. One undo reverts it.' })}
                        </span>
                        <Btn size="sm" variant="ghost" icon={Undo2} onClick={() => undo(m)}>
                          {t('ai-undo', { defaultValue: 'Undo' })}
                        </Btn>
                      </>
                    ) : null}
                    {m.proposal.state === 'discarded' ? (
                      <span className="text-xs text-(--app-text-dim)">
                        {t('hud-ai-discarded', { defaultValue: 'Not applied.' })}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {step ? (
            <p role="status" className="text-sm text-(--app-text-dim)">
              {step === 'select'
                ? t('hud-ai-finding', { defaultValue: 'Finding the right files…' })
                : t('hud-ai-editing', { defaultValue: 'Working out the changes…' })}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>
      </Modal>
      {signIn ? (
        <SignInRequiredDialog
          open
          onClose={() => setSignIn(false)}
          feature={t('feature-hud-ai', { defaultValue: 'Use the HUD assistant' })}
        />
      ) : null}
    </>
  );
}
