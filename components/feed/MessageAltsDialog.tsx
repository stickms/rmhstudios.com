import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AltTextEditor } from '@/components/feed/AltTextEditor';
import { api } from '@/lib/contract/client';
import { editMessageAltsApi } from '@/lib/messages/message-actions.contract';

/**
 * "Edit descriptions" on a message you sent: the editor with every image of the
 * message, saved through the alt route (a direct or a group chat). The server
 * checks the sender and the 24-hour window; a refusal is shown in the dialog.
 */
export function MessageAltsDialog({
  chatId,
  messageId,
  imageUrls,
  imageAlts,
  restoreFocusTo,
  onSaved,
  onClose,
}: {
  chatId: string;
  messageId: string;
  imageUrls: string[];
  imageAlts: string[];
  restoreFocusTo?: () => HTMLElement | null;
  onSaved: (imageAlts: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('message-alt-text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AltTextEditor
      images={imageUrls.map((url, i) => ({
        url,
        number: i + 1,
        value: imageAlts[i] ?? '',
      }))}
      title={t('edit-title', {
        defaultValue: 'Image descriptions',
      })}
      saveLabel={t('save', {
        defaultValue: 'Save',
      })}
      saving={saving}
      error={error}
      {...(restoreFocusTo
        ? {
            restoreFocusTo,
          }
        : {})}
      onClose={onClose}
      onSave={async (values) => {
        setSaving(true);
        setError(null);
        try {
          const res = await api(editMessageAltsApi, {
            params: {
              conversationId: chatId,
            },
            body: {
              messageId,
              imageAlts: values.map((v) => v.trim()),
            },
          });
          onSaved(res.imageAlts);
          onClose();
        } catch {
          setError(
            t('save-failed', {
              defaultValue: 'Could not save the descriptions. Try again.',
            }),
          );
          setSaving(false);
        }
      }}
    />
  );
}
