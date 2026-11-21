/** N3 — the questions a new member sees in a sheet right after joining. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  communityApi,
  plusFetch,
} from '@/components/communities/plus-api';
import { RulesList } from '@/components/communities/CommunityRules';
import type { OnboardingQuestionDTO } from '@/lib/communities/plus';
import type { CommunityRuleDTO } from '@/lib/communities/rules';

export function OnboardingSheet({
  slug,
  communityName,
  questions,
  rules = [],
  onDone,
  onSkip,
}: {
  slug: string;
  communityName: string;
  questions: OnboardingQuestionDTO[];
  /** s03-13: shown above the questions (or alone, when there are none). */
  rules?: CommunityRuleDTO[];
  onDone: () => void;
  onSkip: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-communities-plus',
    );
  const {
    t: tr,
  } =
    useTranslation(
      'community-rules',
    );
  const [
    picked,
    setPicked,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  const complete =
    questions.every(
      (
        q,
      ) =>
        picked[
          q
            .id
        ],
    );

  const submit =
    async () => {
      setSaving(
        true,
      );
      const res =
        await plusFetch(
          communityApi(
            slug,
            '/onboarding',
          ),
          'POST',
          {
            answers:
              questions.map(
                (
                  q,
                ) => ({
                  questionId:
                    q.id,
                  optionId:
                    picked[
                      q
                        .id
                    ],
                }),
              ),
          },
        );
      setSaving(
        false,
      );
      if (
        !res.ok
      ) {
        toast.error(
          res.error ||
            t(
              'onboarding-error',
              {
                defaultValue:
                  "Couldn't save your answers",
              },
            ),
        );
        return;
      }
      toast.success(
        t(
          'onboarding-saved',
          {
            defaultValue:
              'Welcome aboard',
          },
        ),
      );
      onDone();
    };

  return (
    <Sheet
      open
      onOpenChange={(
        open,
      ) =>
        !open &&
        onSkip()
      }
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t(
              'onboarding-title',
              {
                name: communityName,
                defaultValue:
                  'Welcome to {{name}}',
              },
            )}
          </SheetTitle>
        </SheetHeader>
        {rules.length >
          0 && (
          <section
            aria-label={tr(
              'rules-label',
              {
                defaultValue:
                  'Community rules',
              },
            )}
            className="mt-2"
          >
            <h3 className="t-label mb-1">
              {tr(
                'rules-title',
                {
                  defaultValue:
                    'Rules',
                },
              )}
            </h3>
            <RulesList
              rules={
                rules
              }
              className="max-h-[45vh] overflow-y-auto"
            />
          </section>
        )}
        {questions.length >
          0 && (
          <p className="text-sm text-site-text-muted">
            {t(
              'onboarding-intro',
              {
                defaultValue:
                  'A few quick questions so we can tailor your feed. You can skip these.',
              },
            )}
          </p>
        )}
        <div className="mt-4 flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1">
          {questions.map(
            (
              q,
            ) => (
              <fieldset
                key={
                  q.id
                }
              >
                <legend className="mb-2 text-sm font-semibold text-site-text">
                  {
                    q.prompt
                  }
                </legend>
                <div className="flex flex-col gap-1.5">
                  {q.options.map(
                    (
                      o,
                    ) => (
                      <label
                        key={
                          o.id
                        }
                        className="flex cursor-pointer items-center gap-3 rounded-site px-3 py-2.5 text-sm text-site-text has-[:checked]:ring-2 has-[:checked]:ring-site-accent"
                      >
                        <input
                          type="radio"
                          name={`onb-${q.id}`}
                          value={
                            o.id
                          }
                          checked={
                            picked[
                              q
                                .id
                            ] ===
                            o.id
                          }
                          onChange={() =>
                            setPicked(
                              (
                                p,
                              ) => ({
                                ...p,
                                [q.id]:
                                  o.id,
                              }),
                            )
                          }
                          className="accent-[var(--site-accent)]"
                        />
                        <span>
                          {
                            o.label
                          }
                        </span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            ),
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {questions.length >
          0 ? (
            <>
              <Button
                variant="ghost"
                onClick={
                  onSkip
                }
                disabled={
                  saving
                }
              >
                {t(
                  'onboarding-skip',
                  {
                    defaultValue:
                      'Skip for now',
                  },
                )}
              </Button>
              <Button
                variant="primary"
                onClick={
                  submit
                }
                loading={
                  saving
                }
                disabled={
                  !complete
                }
              >
                {t(
                  'onboarding-done',
                  {
                    defaultValue:
                      'Done',
                  },
                )}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={
                onSkip
              }
            >
              {tr(
                'rules-got-it',
                {
                  defaultValue:
                    'Got it',
                },
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
