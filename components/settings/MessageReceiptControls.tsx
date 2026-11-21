import {
  useId,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import {
  setReadReceiptsApi,
  type ReadReceiptSettings,
} from '@/lib/messages/read-receipts.contract';
import { readReceiptsQuery } from '@/lib/messages/read-receipts.queries';

/**
 * Sprint 06 #17 — "Show when I have read direct messages" and "Show when I am typing", Settings > Privacy.
 * Both on by default. Either one off hides that signal in every conversation, both ways; the server applies
 * it (`lib/chat-plus/receipts.server.ts`), this only saves the preference.
 */
export function MessageReceiptControls() {
  const {
    t,
  } =
    useTranslation(
      'read-receipts',
    );
  const readId =
    useId();
  const readHintId =
    useId();
  const typingId =
    useId();
  const typingHintId =
    useId();
  const queryClient =
    useQueryClient();
  const query =
    readReceiptsQuery();
  const {
    data,
    isPending,
    isError,
  } =
    useQuery(
      query,
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  const ready =
    !isPending &&
    !isError &&
    !!data;

  const change =
    async (
      patch: Partial<ReadReceiptSettings>,
    ) => {
      setSaving(
        true,
      );
      const previous =
        data;
      if (
        data
      )
        queryClient.setQueryData(
          query.queryKey,
          {
            ...data,
            ...patch,
          },
        );
      try {
        const saved =
          await api(
            setReadReceiptsApi,
            {
              body: patch,
            },
          );
        queryClient.setQueryData(
          query.queryKey,
          saved,
        );
        void queryClient.invalidateQueries(
          {
            queryKey:
              [
                'chat-meta',
              ],
          },
        );
      } catch {
        queryClient.setQueryData(
          query.queryKey,
          previous,
        );
        toast.error(
          t(
            'save-failed',
            {
              defaultValue:
                'Could not save that setting',
            },
          ),
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  return (
    <SettingsSection
      title={t(
        'title',
        {
          defaultValue:
            'Messages',
        },
      )}
      description={
        isError
          ? t(
              'load-failed',
              {
                defaultValue:
                  'Could not load these settings. Reload the page to try again.',
              },
            )
          : t(
              'reciprocal',
              {
                defaultValue:
                  'These work both ways: when you turn one off, you also stop seeing it from other people.',
              },
            )
      }
    >
      <div className="settings-row">
        <span className="settings-row__text">
          <span
            id={
              readId
            }
            className="settings-row__name block"
          >
            {t(
              'show-read',
              {
                defaultValue:
                  'Show when I have read direct messages',
              },
            )}
          </span>
          <span
            id={
              readHintId
            }
            className="settings-row__hint block"
          >
            {t(
              'show-read-hint',
              {
                defaultValue:
                  'When this is off, nobody sees "Seen" in any of your conversations.',
              },
            )}
          </span>
        </span>
        <Switch
          checked={
            data?.readReceipts ??
            true
          }
          onCheckedChange={(
            v,
          ) =>
            void change(
              {
                readReceipts:
                  v,
              },
            )
          }
          disabled={
            !ready ||
            saving
          }
          aria-labelledby={
            readId
          }
          aria-describedby={
            readHintId
          }
        />
      </div>
      <div className="settings-row">
        <span className="settings-row__text">
          <span
            id={
              typingId
            }
            className="settings-row__name block"
          >
            {t(
              'show-typing',
              {
                defaultValue:
                  'Show when I am typing',
              },
            )}
          </span>
          <span
            id={
              typingHintId
            }
            className="settings-row__hint block"
          >
            {t(
              'show-typing-hint',
              {
                defaultValue:
                  'When this is off, nobody sees a typing indicator in any of your conversations.',
              },
            )}
          </span>
        </span>
        <Switch
          checked={
            data?.typingIndicators ??
            true
          }
          onCheckedChange={(
            v,
          ) =>
            void change(
              {
                typingIndicators:
                  v,
              },
            )
          }
          disabled={
            !ready ||
            saving
          }
          aria-labelledby={
            typingId
          }
          aria-describedby={
            typingHintId
          }
        />
      </div>
    </SettingsSection>
  );
}
