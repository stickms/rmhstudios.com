import {
  useId,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import {
  HttpError,
  serverError,
} from '@/lib/http';
import { sendFeedbackApi } from '@/lib/feedback.contract';
import { recentClientErrorMessages } from '@/lib/client-errors';
import {
  ASSISTIVE_TECH,
  CONTEXT_CAPS,
  FEEDBACK_CATEGORIES,
  type AssistiveTech,
  type FeedbackCategory,
} from '@/lib/feedback-schema';
import {
  CONTEXT_ITEMS,
  collectContext,
  pickContext,
  type ContextItem,
} from '@/lib/feedback/inbox';

/**
 * The feedback form, shared by the shake sheet and the dialog opened from Help and the settings index. It shows the
 * context it would attach, one checkbox per item, and sends only what is ticked.
 */
export function FeedbackForm({
  onSent,
  className,
}: {
  onSent: () => void;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feedback-inbox',
    );
  const uid =
    useId();
  const [
    category,
    setCategory,
  ] =
    useState<FeedbackCategory>(
      'bug',
    );
  const [
    message,
    setMessage,
  ] =
    useState(
      '',
    );
  const [
    tech,
    setTech,
  ] =
    useState<
      | AssistiveTech
      | ''
    >(
      '',
    );
  const [
    context,
  ] =
    useState(
      () =>
        collectContext(
          window,
          recentClientErrorMessages(),
        ),
    );
  const [
    where,
    setWhere,
  ] =
    useState(
      context.path,
    );
  const [
    ticked,
    setTicked,
  ] =
    useState<
      ReadonlySet<ContextItem>
    >(
      new Set(
        CONTEXT_ITEMS,
      ),
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const categoryLabels: Record<
    FeedbackCategory,
    string
  > =
    {
      bug: t(
        'category-bug',
        {
          defaultValue:
            'Bug',
        },
      ),
      accessibility:
        t(
          'category-accessibility',
          {
            defaultValue:
              'Accessibility',
          },
        ),
      feature:
        t(
          'category-feature',
          {
            defaultValue:
              'Idea',
          },
        ),
      general:
        t(
          'category-general',
          {
            defaultValue:
              'General',
          },
        ),
      other:
        t(
          'category-other',
          {
            defaultValue:
              'Other',
          },
        ),
    };
  const techLabels: Record<
    AssistiveTech,
    string
  > =
    {
      screen_reader:
        t(
          'tech-screen-reader',
          {
            defaultValue:
              'Screen reader',
          },
        ),
      magnifier:
        t(
          'tech-magnifier',
          {
            defaultValue:
              'Magnifier',
          },
        ),
      voice_control:
        t(
          'tech-voice-control',
          {
            defaultValue:
              'Voice control',
          },
        ),
      keyboard:
        t(
          'tech-keyboard',
          {
            defaultValue:
              'Keyboard only',
          },
        ),
      switch:
        t(
          'tech-switch',
          {
            defaultValue:
              'Switch device',
          },
        ),
      other:
        t(
          'tech-other',
          {
            defaultValue:
              'Something else',
          },
        ),
    };
  const itemLabels: Record<
    ContextItem,
    string
  > =
    {
      path: t(
        'context-path',
        {
          defaultValue:
            'Page',
        },
      ),
      viewport:
        t(
          'context-viewport',
          {
            defaultValue:
              'Screen size',
          },
        ),
      edition:
        t(
          'context-edition',
          {
            defaultValue:
              'Day or Night',
          },
        ),
      locale:
        t(
          'context-locale',
          {
            defaultValue:
              'Language',
          },
        ),
      build:
        t(
          'context-build',
          {
            defaultValue:
              'Site version',
          },
        ),
      errors:
        t(
          'context-errors',
          {
            defaultValue:
              'Recent errors',
          },
        ),
    };
  const itemValue =
    (
      item: ContextItem,
    ): string => {
      if (
        item ===
        'errors'
      ) {
        return context
          .errors
          .length
          ? context.errors.join(
              ' / ',
            )
          : t(
              'context-errors-none',
              {
                defaultValue:
                  'None in this tab',
              },
            );
      }
      if (
        item ===
        'build'
      )
        return t(
          'context-build-value',
          {
            defaultValue:
              'The version you are using',
          },
        );
      return context[
        item
      ];
    };

  const toggle =
    (
      item: ContextItem,
      on: boolean,
    ) =>
      setTicked(
        (
          prev,
        ) => {
          const next =
            new Set(
              prev,
            );
          if (
            on
          )
            next.add(
              item,
            );
          else
            next.delete(
              item,
            );
          return next;
        },
      );

  async function submit() {
    setBusy(
      true,
    );
    try {
      // Collected again now, so the page and errors are those of the moment of sending.
      const fresh =
        collectContext(
          window,
          recentClientErrorMessages(),
        );
      const picked =
        pickContext(
          fresh,
          ticked,
        );
      const trimmedWhere =
        where.trim();
      await api(
        sendFeedbackApi,
        {
          body: {
            category,
            message,
            ...(category ===
              'accessibility' &&
            tech
              ? {
                  assistiveTech:
                    tech,
                }
              : {}),
            ...(Object.keys(
              picked,
            )
              .length >
              0 ||
            (category ===
              'accessibility' &&
              trimmedWhere)
              ? {
                  context:
                    {
                      ...picked,
                      ...(category ===
                        'accessibility' &&
                      trimmedWhere
                        ? {
                            where:
                              trimmedWhere,
                          }
                        : {}),
                    },
                }
              : {}),
          },
        },
      );
      toast.success(
        t(
          'sent',
          {
            defaultValue:
              'Thanks, feedback sent.',
          },
        ),
      );
      setMessage(
        '',
      );
      onSent();
    } catch (e) {
      if (
        e instanceof
          HttpError &&
        e.status ===
          401
      ) {
        toast.error(
          t(
            'sign-in',
            {
              defaultValue:
                'Sign in to send feedback.',
            },
          ),
        );
      } else {
        toast.error(
          serverError(
            e,
          ) ??
            t(
              'failed',
              {
                defaultValue:
                  'Could not send feedback.',
              },
            ),
        );
      }
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <form
      className={
        className ??
        'space-y-4'
      }
      onSubmit={(
        e,
      ) => {
        e.preventDefault();
        if (
          !busy &&
          message.trim()
            .length >=
            10
        )
          void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label
          htmlFor={`${uid}-category`}
        >
          {t(
            'field-category',
            {
              defaultValue:
                'Category',
            },
          )}
        </Label>
        <Select
          id={`${uid}-category`}
          value={
            category
          }
          onChange={(
            e,
          ) =>
            setCategory(
              e
                .target
                .value as FeedbackCategory,
            )
          }
        >
          {FEEDBACK_CATEGORIES.map(
            (
              c,
            ) => (
              <option
                key={
                  c
                }
                value={
                  c
                }
              >
                {
                  categoryLabels[
                    c
                  ]
                }
              </option>
            ),
          )}
        </Select>
      </div>

      {category ===
        'accessibility' && (
        <>
          <div className="space-y-1.5">
            <Label
              htmlFor={`${uid}-tech`}
            >
              {t(
                'field-tech',
                {
                  defaultValue:
                    'What were you using?',
                },
              )}
            </Label>
            <Select
              id={`${uid}-tech`}
              value={
                tech
              }
              onChange={(
                e,
              ) =>
                setTech(
                  e
                    .target
                    .value as
                    | AssistiveTech
                    | '',
                )
              }
            >
              <option value="">
                {t(
                  'tech-none',
                  {
                    defaultValue:
                      'Not sure or none',
                  },
                )}
              </option>
              {ASSISTIVE_TECH.map(
                (
                  a,
                ) => (
                  <option
                    key={
                      a
                    }
                    value={
                      a
                    }
                  >
                    {
                      techLabels[
                        a
                      ]
                    }
                  </option>
                ),
              )}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`${uid}-where`}
            >
              {t(
                'field-where',
                {
                  defaultValue:
                    'Where',
                },
              )}
            </Label>
            <Input
              id={`${uid}-where`}
              value={
                where
              }
              maxLength={
                CONTEXT_CAPS.where
              }
              onChange={(
                e,
              ) =>
                setWhere(
                  e
                    .target
                    .value,
                )
              }
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor={`${uid}-message`}
        >
          {t(
            'field-message',
            {
              defaultValue:
                'What happened?',
            },
          )}
        </Label>
        <Textarea
          id={`${uid}-message`}
          value={
            message
          }
          onChange={(
            e,
          ) =>
            setMessage(
              e
                .target
                .value,
            )
          }
          rows={
            5
          }
          maxLength={
            2000
          }
          placeholder={t(
            'message-placeholder',
            {
              defaultValue:
                'At least 10 characters',
            },
          )}
        />
      </div>

      {category ===
        'feature' && (
        <p className="t-meta">
          {t(
            'feature-hint',
            {
              defaultValue:
                'Ideas are also voted on at the',
            },
          )}{' '}
          <Link
            to="/roadmap"
            className="underline"
          >
            {t(
              'feature-link',
              {
                defaultValue:
                  'roadmap',
              },
            )}
          </Link>

          .
        </p>
      )}

      <fieldset className="space-y-1 border-t border-site-border pt-3">
        <legend className="t-label pr-2">
          {t(
            'context-legend',
            {
              defaultValue:
                'Sent with your feedback',
            },
          )}
        </legend>
        <p className="t-meta pb-1">
          {t(
            'context-hint',
            {
              defaultValue:
                'Untick anything you do not want to send.',
            },
          )}
        </p>
        {CONTEXT_ITEMS.map(
          (
            item,
          ) => (
            <div
              key={item}
              className="flex items-start gap-3 py-1.5 pointer-coarse:py-2.5"
            >
              <input
                id={`${uid}-ctx-${item}`}
                type="checkbox"
                checked={ticked.has(item)}
                onChange={(e) => toggle(item, e.target.checked)}
                aria-describedby={`${uid}-ctx-${item}-value`}
                className="mt-0.5 size-4 shrink-0 accent-site-text pointer-coarse:size-5"
              />
              <span className="min-w-0">
                <label htmlFor={`${uid}-ctx-${item}`} className="t-body block">
                  {itemLabels[item]}
                </label>
                <span id={`${uid}-ctx-${item}-value`} className="t-meta block break-words">
                  {itemValue(item)}
                </span>
              </span>
            </div>
          ),
        )}
      </fieldset>

      <Button
        type="submit"
        className="w-full"
        loading={
          busy
        }
        disabled={
          busy ||
          message.trim()
            .length <
            10
        }
      >
        {t(
          'send',
          {
            defaultValue:
              'Send feedback',
          },
        )}
      </Button>
    </form>
  );
}
