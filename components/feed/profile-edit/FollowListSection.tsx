import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import {
  FOLLOW_LIST_VISIBILITIES,
  type FollowListVisibility,
} from '@/lib/social/follow-list-privacy';

// Its own file because the string extractor reads one namespace per file.
/** Who may browse the followers and following lists. Counts stay public, so the section says so. */
export function FollowListSection({
  value:
    current,
  onChange,
}: {
  value: string;
  onChange: (
    value: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'follow-list-privacy',
    );
  // Literal keys, so the extractor sees every one (a key built at run time is invisible to it).
  const followListChoices: Record<
    FollowListVisibility,
    {
      label: string;
      hint: string;
    }
  > =
    {
      everyone:
        {
          label:
            t(
              'everyone',
              {
                defaultValue:
                  'Everyone',
              },
            ),
          hint: t(
            'everyone-hint',
            {
              defaultValue:
                'Anyone can browse these lists.',
            },
          ),
        },
      mutuals:
        {
          label:
            t(
              'mutuals',
              {
                defaultValue:
                  'People I follow back',
              },
            ),
          hint: t(
            'mutuals-hint',
            {
              defaultValue:
                'Only people who follow you and whom you follow can browse these lists.',
            },
          ),
        },
      me: {
        label:
          t(
            'me',
            {
              defaultValue:
                'Only me',
            },
          ),
        hint: t(
          'me-hint',
          {
            defaultValue:
              'Nobody else can browse these lists.',
          },
        ),
      },
    };
  return (
    <section className="rounded-site p-5">
      <fieldset>
        <legend className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-bg-subtle text-site-accent">
            <Users
              className="size-4"
              aria-hidden
            />
          </span>
          <span>
            <span className="block font-semibold text-site-text">
              {t(
                'legend',
                {
                  defaultValue:
                    'Who can see your followers and following',
                },
              )}
            </span>
            <span className="block text-sm text-site-text-muted">
              {t(
                'counts-stay-visible',
                {
                  defaultValue:
                    'Your counts stay visible',
                },
              )}
            </span>
          </span>
        </legend>
        <div className="flex flex-col gap-1">
          {FOLLOW_LIST_VISIBILITIES.map(
            (
              value,
            ) => (
              <div
                key={
                  value
                }
                className="flex min-h-11 items-start gap-3 py-1"
              >
                <input
                  id={`profile-follow-list-${value}`}
                  type="radio"
                  name="profile-follow-list-visibility"
                  value={
                    value
                  }
                  checked={
                    value ===
                    current
                  }
                  onChange={() =>
                    onChange(
                      value,
                    )
                  }
                  aria-describedby={`profile-follow-list-${value}-hint`}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-site-accent"
                />
                <div>
                  <label
                    htmlFor={`profile-follow-list-${value}`}
                    className="block cursor-pointer text-sm text-site-text"
                  >
                    {
                      followListChoices[
                        value
                      ]
                        .label
                    }
                  </label>
                  <p
                    id={`profile-follow-list-${value}-hint`}
                    className="text-xs text-site-text-muted"
                  >
                    {
                      followListChoices[
                        value
                      ]
                        .hint
                    }
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      </fieldset>
    </section>
  );
}
