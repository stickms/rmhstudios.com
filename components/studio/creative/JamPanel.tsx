'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Lock, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useJamStore } from '@/lib/studio/jam/store';
import { useStudioStore } from '@/lib/studio/store';
import { joinJam, leaveJam, saveLocalProject, startJam } from '@/lib/studio/jam/client';

/** F13 — start or join a live jam, see who is here and which tracks they hold. */
export default function JamPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('f-creative');
  const jam = useJamStore();
  const tracks = useStudioStore((s) => s.tracks);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const isHost = jam.myId !== null && jam.myId === jam.hostUserId;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('jam-error', { defaultValue: 'Could not reach the jam' }),
      );
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (id: string) => jam.peers.find((p) => p.userId === id)?.name ?? '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('jam-title', { defaultValue: 'Live jam' })}
          </DialogTitle>
        </DialogHeader>

        {jam.status !== 'live' ? (
          <div className="space-y-4">
            <p className="text-sm text-site-text-muted">
              {t('jam-intro', {
                defaultValue:
                  'Edit one project with up to 3 friends. MIDI and pattern tracks are shared; audio recordings stay on your device.',
              })}
            </p>
            <Button variant="accent" disabled={busy} onClick={() => void run(startJam)}>
              {t('jam-start', { defaultValue: 'Start a jam from this project' })}
            </Button>
            <div className="glass-pane space-y-2 rounded-site p-3">
              <p className="text-xs text-site-text-muted">
                {t('jam-join-hint', {
                  defaultValue:
                    'Or join with a room code. Your open project is saved to your library first.',
                })}
              </p>
              <div className="flex gap-2">
                <Input
                  className="glass-inset font-mono uppercase tracking-widest"
                  maxLength={10}
                  placeholder={t('jam-code', { defaultValue: 'Room code' })}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <Button
                  disabled={busy || code.trim().length < 4}
                  onClick={() => void run(() => joinJam(code))}
                >
                  {t('jam-join', { defaultValue: 'Join' })}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-lg tracking-widest text-site-text">{jam.code}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(jam.code ?? '');
                  toast.success(t('jam-copied', { defaultValue: 'Code copied' }));
                }}
              >
                <Copy />
                {t('jam-copy', { defaultValue: 'Copy' })}
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {jam.peers.map((p) => (
                <li key={p.userId} className="flex justify-between text-site-text">
                  <span>{p.name}</span>
                  {p.isHost && (
                    <span className="text-xs text-site-text-dim">
                      {t('jam-host', { defaultValue: 'host' })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-1 text-xs font-medium text-site-text-muted">
                {t('jam-tracks', { defaultValue: 'Track editors' })}
              </p>
              <ul className="space-y-1 text-xs text-site-text-muted">
                {tracks
                  .filter((tr) => tr.type !== 'audio')
                  .map((tr) => (
                    <li key={tr.id} className="flex items-center justify-between">
                      <span>{tr.name}</span>
                      <span className="flex items-center gap-1">
                        {jam.locks[tr.id] ? (
                          <>
                            <Lock className="h-3 w-3" aria-hidden />
                            {jam.locks[tr.id] === jam.myId
                              ? t('jam-you', { defaultValue: 'you' })
                              : nameOf(jam.locks[tr.id])}
                          </>
                        ) : (
                          t('jam-free', { defaultValue: 'free' })
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-site-text-dim">
                {t('jam-lock-hint', {
                  defaultValue:
                    'Editing a track locks it for you until you pause for a few seconds.',
                })}
              </p>
            </div>
            <div className="flex gap-2">
              {isHost && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void saveLocalProject().then(() =>
                      toast.success(
                        t('jam-saved', { defaultValue: 'Snapshot saved to your library' }),
                      ),
                    )
                  }
                >
                  <Save />
                  {t('jam-save', { defaultValue: 'Save snapshot' })}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  leaveJam();
                  onClose();
                }}
              >
                {isHost
                  ? t('jam-end', { defaultValue: 'End jam' })
                  : t('jam-leave', { defaultValue: 'Leave' })}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
