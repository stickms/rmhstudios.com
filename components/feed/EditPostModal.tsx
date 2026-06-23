'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  initialContent: string;
  onSaved: (content: string) => void;
}

/** Edit your own post's text. Prior versions are preserved server-side. */
export function EditPostModal({ open, onOpenChange, postId, initialContent, onSaved }: EditPostModalProps) {
  const { t } = useTranslation("feed");
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const remaining = MAX_RMHARK_LENGTH - content.length;

  const save = async () => {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_RMHARK_LENGTH) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onSaved(trimmed);
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
        <div className="flex items-center justify-between">
          <span className={`text-xs ${remaining < 0 ? 'text-site-danger' : 'text-site-text-dim'}`}>{remaining}</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel", { defaultValue: "Cancel" })}</Button>
          <Button variant="accent" onClick={save} disabled={saving || !content.trim() || remaining < 0}>
            {saving ? t("saving", { defaultValue: "Saving…" }) : t("save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
