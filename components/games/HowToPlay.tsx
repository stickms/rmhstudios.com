import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  AI_TIMEOUT_MS,
  api,
} from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { howToPlayApi } from '@/lib/devplatform/how-to-play.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** I1 — "How do I play?" Q&A panel, collapsed until opened (no work on first paint). */
export function HowToPlay({
  gameId,
}: {
  gameId: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-devplatform',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    q,
    setQ,
  ] =
    useState(
      '',
    );
  const [
    answer,
    setAnswer,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  // The answer replaces the spinner: it fades in (M9).
  const arrival =
    useArrival(
      answer !==
        null,
    );

  async function ask() {
    setBusy(
      true,
    );
    setAnswer(
      null,
    );
    try {
      const data =
        await api(
          howToPlayApi,
          {
            body: {
              gameId,
              question:
                q,
            },
            timeoutMs:
              AI_TIMEOUT_MS,
          },
        );
      setAnswer(
        data.answer,
      );
    } catch (e) {
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'howToPlay-error',
            {
              defaultValue:
                'Could not get an answer',
            },
          ),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <section className="surface-card rounded-site p-5">
      <button
        type="button"
        onClick={() =>
          setOpen(
            (
              o,
            ) =>
              !o,
          )
        }
        aria-expanded={
          open
        }
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-site-text"
      >
        <HelpCircle
          className="h-4 w-4 text-site-accent"
          aria-hidden
        />
        {t(
          'howToPlay-title',
          {
            defaultValue:
              'How do I play?',
          },
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(
              e,
            ) => {
              e.preventDefault();
              if (
                q.trim()
                  .length >=
                2
              )
                void ask();
            }}
          >
            <Input
              value={
                q
              }
              onChange={(
                e,
              ) =>
                setQ(
                  e
                    .target
                    .value,
                )
              }
              maxLength={
                400
              }
              aria-label={t(
                'howToPlay-ask',
                {
                  defaultValue:
                    'Ask about this game',
                },
              )}
              placeholder={t(
                'howToPlay-ask',
                {
                  defaultValue:
                    'Ask about this game',
                },
              )}
            />
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={
                busy ||
                q.trim()
                  .length <
                  2
              }
            >
              {t(
                'howToPlay-submit',
                {
                  defaultValue:
                    'Ask',
                },
              )}
            </Button>
          </form>
          {busy && (
            <Spinner />
          )}
          {answer && (
            <p
              className={cn(
                'text-sm text-site-text-muted',
                arrival,
              )}
              aria-live="polite"
            >
              {
                answer
              }
            </p>
          )}
          <p className="text-xs text-site-text-muted">
            {t(
              'howToPlay-note',
              {
                defaultValue:
                  'AI answers use only this game’s description and can be incomplete.',
              },
            )}
          </p>
        </div>
      )}
    </section>
  );
}
