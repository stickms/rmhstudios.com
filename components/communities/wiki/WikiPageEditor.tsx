/** Editing one wiki page (s09-04): `DocEditor` with the summary field, and an unsaved edit kept per page. */
import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { DocEditor, type DocDraft } from '@/components/communities/DocEditor';
import { clearDraft, readDraft, writeDraft } from '@/components/communities/wiki/draft-store';
import { useWikiText } from '@/components/communities/wiki/useWikiText';
import { updateCommunityPageApi } from '@/lib/communities/pages.contract';
import { MAX_PAGE_BODY, MAX_PAGE_TITLE } from '@/lib/communities/page-policy';
import type { CommunityPageDTO } from '@/lib/communities/pages.server';

interface WikiPageEditorProps {
  page: CommunityPageDTO;
  onDone: () => void;
}

export function WikiPageEditor({ page, onDone }: WikiPageEditorProps) {
  const { t } = useTranslation('community-wiki');
  const router = useRouter();
  const { failureText } = useWikiText();
  const [busy, setBusy] = useState(false);
  // Read once when the editor opens (client only: the editor mounts after a click or a "continue editing").
  const [start] = useState<DocDraft>(() => readDraft(page.id) ?? { title: page.title, body: page.body, summary: '' });

  const save = async (draft: DocDraft) => {
    setBusy(true);
    try {
      await api(updateCommunityPageApi, {
        params: { id: page.id },
        body: {
          title: draft.title,
          body: draft.body,
          summary: draft.summary || null,
          baseUpdatedAt: page.updatedAt,
        },
      });
      clearDraft(page.id);
      toast.success(t('saved', { defaultValue: 'Page saved' }));
      await router.invalidate();
      onDone();
    } catch (error) {
      // The draft stays: a conflict is resolved by reloading and re-applying it.
      toast.error(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DocEditor
      initialTitle={start.title}
      initialBody={start.body}
      initialSummary={start.summary}
      maxBody={MAX_PAGE_BODY}
      maxTitle={MAX_PAGE_TITLE}
      busy={busy}
      saveLabel={t('save-page', { defaultValue: 'Save page' })}
      onDraftChange={(draft) => writeDraft(page.id, draft)}
      onSave={save}
      onCancel={() => {
        clearDraft(page.id);
        onDone();
      }}
    />
  );
}
