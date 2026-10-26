/**
 * Save to your account, publish to the workshop, and share a link.
 */
'use client';

import { Copy, ExternalLink, Link2, Link2Off } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { useClipboard } from '@/hooks/useClipboard';
import { api, ApiError } from '@/lib/tf2-hud/api';
import type { VersionSummary, Visibility } from '@/lib/tf2-hud/api-types';
import { saveExisting, saveNew, validateForCloud, type Progress } from '@/lib/tf2-hud/cloud';
import { useEditor } from '@/lib/tf2-hud/store';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { Btn, Modal, SelectField, TextField, Toggle } from './ui';

const SITE = () => (typeof window === 'undefined' ? '' : window.location.origin);

export default function SaveShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { data: session } = useSession();
  const meta = useEditor((s) => s.meta);
  const setMeta = useEditor((s) => s.setMeta);
  const overlay = useEditor((s) => s.overlay);
  const remoteId = useEditor((s) => s.remoteId);
  const slug = useEditor((s) => s.slug);
  const baseIndex = useEditor((s) => s.baseIndex);
  const markSaved = useEditor((s) => s.markSaved);
  const setSaveState = useEditor((s) => s.setSaveState);
  const { copy } = useClipboard();
  const cloudAutosave = useTf2HudPrefs((p) => p.cloudAutosave);
  const setPref = useTf2HudPrefs((p) => p.set);

  const [visibility, setVisibility] = useState<Visibility>('PRIVATE');
  const [message, setMessage] = useState('');
  const [tags, setTags] = useState(meta.tags.join(', '));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);

  useEffect(() => {
    if (!open || !remoteId) return;
    let cancelled = false;
    void api
      .get(remoteId)
      .then((d) => {
        if (cancelled) return;
        setVisibility(d.visibility);
        setShareToken(d.shareToken);
      })
      .catch(() => undefined);
    void api
      .versions(remoteId)
      .then((v) => !cancelled && setVersions(v))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, remoteId]);

  if (open && !session) {
    return (
      <SignInRequiredDialog
        open
        onClose={() => onOpenChange(false)}
        feature={t('feature-save', { defaultValue: 'Save HUDs to your account' })}
      />
    );
  }

  const save = async () => {
    const problem = validateForCloud(overlay);
    if (problem) {
      toast.error(problem);
      return;
    }
    const tagList = tags
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    setMeta({ tags: tagList });
    setSaveState('saving');
    try {
      const nextMeta = { ...meta, tags: tagList };
      const detail = remoteId
        ? await saveExisting(remoteId, nextMeta, overlay, message || undefined, setProgress)
        : await saveNew(
            nextMeta,
            overlay,
            baseIndex?.source.commit ?? '',
            { visibility, forkOfId: useEditor.getState().forkOfId, message: message || undefined },
            setProgress,
          );
      if (remoteId && detail.visibility !== visibility) await api.update(remoteId, { visibility });
      markSaved({ id: detail.id, slug: detail.slug });
      setMessage('');
      toast.success(t('saved-account', { defaultValue: 'Saved to your account' }));
      setVersions(await api.versions(detail.id).catch(() => []));
    } catch (e) {
      setSaveState('error');
      toast.error(
        e instanceof ApiError
          ? e.message
          : t('save-failed', { defaultValue: 'Could not save. Try again.' }),
      );
    } finally {
      setProgress(null);
    }
  };

  const shareLink = shareToken ? `${SITE()}/tf2-hud/s/${shareToken}` : null;
  const publicLink =
    remoteId && slug && visibility !== 'PRIVATE' ? `${SITE()}/tf2-hud/h/${slug}` : null;

  const visLabels: Record<Visibility, string> = {
    PRIVATE: t('vis-private', { defaultValue: 'Private — only you' }),
    UNLISTED: t('vis-unlisted', { defaultValue: 'Unlisted — anyone with the link' }),
    PUBLIC: t('vis-public', { defaultValue: 'Public — shown in the workshop' }),
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !progress && onOpenChange(o)}
      title={t('save-share', { defaultValue: 'Save & share' })}
      description={t('save-share-hint', {
        defaultValue: 'Keep this HUD in your account, publish it, or send a link.',
      })}
      wide
      footer={
        <>
          <Btn variant="ghost" onClick={() => onOpenChange(false)} disabled={!!progress}>
            {t('close', { defaultValue: 'Close' })}
          </Btn>
          <Btn variant="primary" onClick={() => void save()} disabled={!!progress}>
            {progress
              ? progress.phase === 'uploading'
                ? t('uploading', {
                    defaultValue: 'Uploading {{done}}/{{total}}…',
                    done: progress.done,
                    total: progress.total,
                  })
                : t('saving', { defaultValue: 'Saving…' })
              : remoteId
                ? t('save-version', { defaultValue: 'Save new version' })
                : t('save-to-account', { defaultValue: 'Save to account' })}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('hud-name', { defaultValue: 'HUD name' })}
            <TextField
              value={meta.name}
              maxLength={80}
              onChange={(e) => setMeta({ name: e.target.value })}
              className="h-10 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('description', { defaultValue: 'Description' })}
            <textarea
              value={meta.description}
              maxLength={2000}
              rows={4}
              onChange={(e) => setMeta({ description: e.target.value })}
              className="w-full resize-y rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) p-2 text-xs text-(--app-text)"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('tags', { defaultValue: 'Tags (comma separated)' })}
            <TextField
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="minimal, dark, competitive"
            />
          </label>
        </div>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('visibility', { defaultValue: 'Visibility' })}
            <SelectField
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
            >
              {(Object.keys(visLabels) as Visibility[]).map((v) => (
                <option key={v} value={v}>
                  {visLabels[v]}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('version-note', { defaultValue: 'Version note (optional)' })}
            <TextField
              value={message}
              maxLength={200}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('version-note-ph', { defaultValue: 'What changed?' })}
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-xs text-(--app-text-muted)">
            {t('cloud-autosave', { defaultValue: 'Autosave changes to my account' })}
            <Toggle
              label={t('cloud-autosave', { defaultValue: 'Autosave changes to my account' })}
              checked={cloudAutosave}
              onChange={(v) => setPref('cloudAutosave', v)}
            />
          </label>

          {remoteId ? (
            <div className="space-y-2 rounded-(--app-radius-sm) border border-(--app-border) p-3">
              <h3 className="tf2hud-panel-head">{t('share', { defaultValue: 'Share' })}</h3>
              {publicLink ? (
                <div className="flex items-center gap-1">
                  <TextField
                    readOnly
                    value={publicLink}
                    aria-label={t('public-link', { defaultValue: 'Public link' })}
                  />
                  <Btn
                    size="sm"
                    icon={Copy}
                    onClick={() =>
                      void copy(publicLink).then(() =>
                        toast.success(t('copied', { defaultValue: 'Copied' })),
                      )
                    }
                  >
                    {t('copy', { defaultValue: 'Copy' })}
                  </Btn>
                  <a
                    href={publicLink}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('open', { defaultValue: 'Open' })}
                    className="inline-flex size-8 items-center justify-center rounded-(--app-radius-sm) text-(--app-text-muted) hover:bg-(--app-surface-hover)"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </div>
              ) : null}
              {shareLink ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <TextField
                      readOnly
                      value={shareLink}
                      aria-label={t('share-link', { defaultValue: 'Private share link' })}
                    />
                    <Btn
                      size="sm"
                      icon={Copy}
                      onClick={() =>
                        void copy(shareLink).then(() =>
                          toast.success(t('copied', { defaultValue: 'Copied' })),
                        )
                      }
                    >
                      {t('copy', { defaultValue: 'Copy' })}
                    </Btn>
                  </div>
                  <Btn
                    size="xs"
                    variant="ghost"
                    icon={Link2Off}
                    onClick={() => {
                      void api.revokeShare(remoteId).then(() => {
                        setShareToken(null);
                        toast.success(t('link-revoked', { defaultValue: 'Link revoked' }));
                      });
                    }}
                  >
                    {t('revoke-link', { defaultValue: 'Revoke link' })}
                  </Btn>
                </div>
              ) : (
                <Btn
                  size="sm"
                  icon={Link2}
                  onClick={() => {
                    void api.createShare(remoteId).then((r) => setShareToken(r.token));
                  }}
                >
                  {t('create-link', { defaultValue: 'Create share link' })}
                </Btn>
              )}
              <p className="text-[11px] text-(--app-text-dim)">
                {t('share-hint', {
                  defaultValue:
                    'A share link opens the latest saved version read-only, even for a private HUD.',
                })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-(--app-text-dim)">
              {t('save-first', { defaultValue: 'Save once to get share links.' })}
            </p>
          )}
        </div>
      </div>

      {remoteId && versions.length ? (
        <div className="mt-4">
          <h3 className="tf2hud-panel-head mb-1">
            {t('version-history', { defaultValue: 'Version history' })}
          </h3>
          <ul className="max-h-40 divide-y divide-(--app-border) overflow-y-auto rounded-(--app-radius-sm) border border-(--app-border)">
            {versions.map((v) => (
              <li
                key={v.number}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-(--app-text)">
                  v{v.number} · {v.message || t('no-note', { defaultValue: 'no note' })}
                </span>
                <span className="shrink-0 text-(--app-text-dim)">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
                <Btn
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void api.restoreVersion(remoteId, v.number).then(() => {
                      toast.success(
                        t('restored', {
                          defaultValue:
                            'Restored v{{n}} as a new version — reopen the HUD to load it.',
                          n: v.number,
                        }),
                      );
                    });
                  }}
                >
                  {t('restore', { defaultValue: 'Restore' })}
                </Btn>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
