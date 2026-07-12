'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
export function DeleteBlogButton({ slug, title }: { slug: string; title: string }) {
  const { t } = useTranslation('c-admin');
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this post?' }),
      description: t('delete-confirm', {
        defaultValue: 'Deleting "{{title}}" cannot be undone.',
        title,
      }),
      confirmLabel: t('delete-post', { defaultValue: 'Delete Post' }),
      danger: true,
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/blog?slug=${slug}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || t('delete-failed', { defaultValue: 'Failed to delete post' }),
        );
      }

      toast.success(t('delete-success', { defaultValue: 'Deleted blog post: {{slug}}.', slug }));
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || t('generic-error', { defaultValue: 'An error occurred' }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-site-danger hover:text-site-danger hover:bg-site-danger/10"
      title={t('delete-post', { defaultValue: 'Delete Post' })}
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  );
}
