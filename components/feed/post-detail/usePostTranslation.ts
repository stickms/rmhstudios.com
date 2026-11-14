import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  AI_TIMEOUT_MS,
  api,
} from '@/lib/contract/client';
import { translatePostApi } from '@/lib/ai/ai.contract';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';

export interface PostTranslation {
  translatedText:
    | string
    | null;
  showTranslated: boolean;
  translating: boolean;
  handleTranslate: () => Promise<void>;
}

/** On-demand translation of the post body into the site language, toggled from the overflow menu. */
export function usePostTranslation(
  postId: string,
): PostTranslation {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const locale =
    useLocaleStore(
      (
        s,
      ) =>
        s.locale,
    );
  const [
    translatedText,
    setTranslatedText,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    showTranslated,
    setShowTranslated,
  ] =
    useState(
      false,
    );
  const [
    translating,
    setTranslating,
  ] =
    useState(
      false,
    );

  // Drop any cached translation when the site language changes, so the next
  //"Translate"re-translates into the newly selected language.
  useEffect(() => {
    setTranslatedText(
      null,
    );
    setShowTranslated(
      false,
    );
  }, [
    locale,
  ]);

  const handleTranslate =
    async () => {
      if (
        translatedText
      ) {
        setShowTranslated(
          (
            s,
          ) =>
            !s,
        );
        return;
      }
      setTranslating(
        true,
      );
      try {
        const data =
          await api(
            translatePostApi,
            {
              params:
                {
                  id: postId,
                },
              query:
                {
                  to: LOCALE_TO_LANGUAGE_NAME[
                    locale
                  ],
                },
              timeoutMs:
                AI_TIMEOUT_MS,
            },
          );
        if (
          data.text
        ) {
          setTranslatedText(
            data.text,
          );
          setShowTranslated(
            true,
          );
        }
      } catch {
        toast.error(
          t(
            'translate-error',
            {
              defaultValue:
                'Could not translate this post.',
            },
          ),
        );
      } finally {
        setTranslating(
          false,
        );
      }
    };

  return {
    translatedText,
    showTranslated,
    translating,
    handleTranslate,
  };
}
