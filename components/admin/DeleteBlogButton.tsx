import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { deleteBlogPostApi } from '@/lib/admin/admin-tools.contract';
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
      try {
        await api(deleteBlogPostApi, { query: { slug } });
      } catch (error) {
        throw new Error(
          serverError(error) || t('delete-failed', { defaultValue: 'Failed to delete post' }),
          { cause: error },
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
    <IconButton
      icon={Trash2}
      label={t('delete-post', { defaultValue: 'Delete Post' })}
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-site-danger hover:bg-site-danger/10 hover:text-site-danger"
    />
  );
}
