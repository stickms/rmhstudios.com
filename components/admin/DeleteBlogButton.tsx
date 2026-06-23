'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
export function DeleteBlogButton({ slug, title }: { slug: string, title: string }) {
    const { t } = useTranslation("c-admin");
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm(t("delete-confirm", { defaultValue: "Are you sure you want to delete \"{{title}}\"? This cannot be undone.", title }))) {
            return;
        }

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin/blog?slug=${slug}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || t("delete-failed", { defaultValue: "Failed to delete post" }));
            }

            toast.success(t("delete-success", { defaultValue: "Deleted blog post: {{slug}}.", slug }));
            window.location.reload();
        } catch (error: any) {
             toast.error(error.message || t("generic-error", { defaultValue: "An error occurred" }));
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
            className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
            title={t("delete-post", { defaultValue: "Delete Post" })}
        >
            <Trash2 className="w-4 h-4" />
        </Button>
    );
}
