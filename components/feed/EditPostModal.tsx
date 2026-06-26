'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { GifPicker } from './GifPicker';
import { GifEmbed } from './GifEmbed';

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  initialContent: string;
  initialGifUrl?: string | null;
  onSaved: (content: string, gifUrl: string | null) => void;
}

/** Edit your own post's text. Prior versions are preserved server-side. */
export function EditPostModal({ open, onOpenChange, postId, initialContent, initialGifUrl, onSaved }: EditPostModalProps) {
  const { t } = useTranslation("feed");
  const [content, setContent] = useState(initialContent);
  const [gifUrl, setGifUrl] = useState<string>(initialGifUrl ?? '');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const remaining = MAX_RMHARK_LENGTH - content.length;

  const save = async () => {
    const trimmed = content.trim();
    if ((!trimmed && !gifUrl.trim()) || trimmed.length > MAX_RMHARK_LENGTH) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: trimmed, gifUrl: gifUrl.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onSaved(trimmed, gifUrl.trim() || null);
        onOpenChange(false);
        toast.success(t("post-updated", { defaultValue: "Post updated" }));
      } else {
        toast.error(data.error || t("could-not-update-post", { defaultValue: "Could not update post" }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("edit-post-title", { defaultValue: "Edit post" })}</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          aria-label={t("edit-post-content-label", { defaultValue: "Edit post content" })}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text focus:border-site-accent focus:outline-none"
        />
        {/* GIF section */}
        <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">{t("gif-heading", { defaultValue: "GIF" })}</span>
            {gifUrl.trim() && (
              <button
                type="button"
                onClick={() => { setGifUrl(''); setShowGifPicker(false); }}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                aria-label={t("remove-gif-aria", { defaultValue: "Remove GIF" })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {gifUrl.trim() ? (
            <div className="relative">
              <GifEmbed url={gifUrl.trim()} />
              <button
                type="button"
                onClick={() => { setGifUrl(''); setShowGifPicker(true); }}
                aria-label={t("swap-gif-aria", { defaultValue: "Swap GIF" })}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors text-xs px-2"
              >
                {t("swap", { defaultValue: "Swap" })}
              </button>
            </div>
          ) : showGifPicker ? (
            <GifPicker onSelect={(u) => { setGifUrl(u); setShowGifPicker(false); }} />
          ) : (
            <button
              type="button"
              onClick={() => setShowGifPicker(true)}
              className="text-xs text-site-accent hover:underline"
            >
              {t("add-gif", { defaultValue: "Add GIF" })}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs ${remaining < 0 ? 'text-site-danger' : 'text-site-text-dim'}`}>{remaining}</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel", { defaultValue: "Cancel" })}</Button>
          <Button variant="accent" onClick={save} disabled={saving || (!content.trim() && !gifUrl.trim()) || remaining < 0}>
            {saving ? t("saving", { defaultValue: "Saving…" }) : t("save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
