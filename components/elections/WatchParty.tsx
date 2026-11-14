import {
  useMemo,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Play,
} from 'lucide-react';
import { parseEmbed } from '@/lib/elections/streams';
import { useLiveStreams } from './useLiveStreams';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/**
 * Watch the night: featured streams (configured server-side) or any YouTube /
 * Twitch link you paste. The player loads only after a click — no third-party
 * requests, no autoplay, until you ask — and the iframe URL is built from the
 * parsed id, never from the pasted text.
 */
export function WatchParty() {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const [
    url,
    setUrl,
  ] =
    useState(
      '',
    );
  const [
    active,
    setActive,
  ] =
    useState<{
      url: string;
      label: string;
    } | null>(
      null,
    );
  const [
    bad,
    setBad,
  ] =
    useState(
      false,
    );

  const streams =
    useLiveStreams();
  const arrival =
    useArrival(
      streams.length >
        0,
    );

  const embed =
    useMemo(
      () =>
        active
          ? parseEmbed(
              active.url,
            )
          : null,
      [
        active,
      ],
    );
  const src =
    embed &&
    typeof location !==
      'undefined'
      ? embed.src(
          location.hostname,
        )
      : null;

  const submit =
    (
      e: React.FormEvent,
    ) => {
      e.preventDefault();
      if (
        parseEmbed(
          url.trim(),
        )
      ) {
        setBad(
          false,
        );
        setActive(
          {
            url: url.trim(),
            label:
              t(
                'watch.custom',
                {
                  defaultValue:
                    'Your stream',
                },
              ),
          },
        );
      } else {
        setBad(
          true,
        );
      }
    };

  return (
    <div className="el-stack">
      {src &&
      embed ? (
        <div
          className="el-box"
          style={{
            padding: 0,
            background:
              '#000',
          }}
        >
          <div
            style={{
              position:
                'relative',
              aspectRatio:
                '16 / 9',
            }}
          >
            <iframe
              title={t(
                'watch.frame',
                {
                  defaultValue:
                    'Live stream: {{label}}',
                  label:
                    active?.label ??
                    embed.label,
                },
              )}
              src={
                src
              }
              style={{
                position:
                  'absolute',
                inset: 0,
                width:
                  '100%',
                height:
                  '100%',
                border: 0,
              }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          </div>
        </div>
      ) : (
        <div
          className="el-box el-proj"
          style={{
            margin: 0,
          }}
        >
          <p
            className="el-eyebrow"
            style={{
              margin: 0,
            }}
          >
            {streams.length
              ? t(
                  'watch.idle',
                  {
                    defaultValue:
                      'Pick a stream or paste a YouTube or Twitch link. Nothing loads until you do.',
                  },
                )
              : t(
                  'watch.none',
                  {
                    defaultValue:
                      'No newsroom is live right now — we check every few minutes. Paste a YouTube or Twitch link to watch anything else.',
                  },
                )}
          </p>
        </div>
      )}

      {streams.length ? (
        <div
          className={cn(
            'el-pick-row',
            arrival,
          )}
          role="group"
          aria-label={t(
            'watch.live',
            {
              defaultValue:
                'Live now',
            },
          )}
        >
          {streams.map(
            (
              s,
            ) => (
              <button
                key={
                  s.url
                }
                type="button"
                className="el-btn el-btn--sm"
                aria-pressed={
                  active?.url ===
                  s.url
                }
                onClick={() => {
                  setBad(
                    false,
                  );
                  setActive(
                    {
                      url: s.url,
                      label:
                        s.label,
                    },
                  );
                }}
              >
                <Play
                  size={
                    14
                  }
                  aria-hidden
                />
                {
                  s.label
                }
                {s.auto ? (
                  <span className="el-chip el-chip--ink">
                    {t(
                      'watch.liveTag',
                      {
                        defaultValue:
                          'Live',
                      },
                    )}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}

      <form
        onSubmit={
          submit
        }
        className="el-pick-row"
        style={{
          flexWrap:
            'nowrap',
        }}
      >
        <label
          className="el-sr"
          htmlFor="el-stream-url"
        >
          {t(
            'watch.label',
            {
              defaultValue:
                'Stream link',
            },
          )}
        </label>
        <input
          id="el-stream-url"
          className="el-input"
          inputMode="url"
          placeholder={t(
            'watch.ph',
            {
              defaultValue:
                'youtube.com/watch?v=… or twitch.tv/…',
            },
          )}
          value={
            url
          }
          onChange={(
            e,
          ) =>
            setUrl(
              e
                .target
                .value,
            )
          }
          aria-invalid={
            bad
          }
          style={{
            flex: 1,
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          className="el-btn el-btn--pink"
          disabled={
            !url.trim()
          }
        >
          {t(
            'watch.go',
            {
              defaultValue:
                'Watch',
            },
          )}
        </button>
      </form>
      {bad ? (
        <p
          className="el-eyebrow"
          role="alert"
        >
          {t(
            'watch.bad',
            {
              defaultValue:
                'That is not a YouTube or Twitch link we can embed.',
            },
          )}
        </p>
      ) : null}

      <div className="el-pick-row">
        {embed ? (
          <a
            className="el-btn el-btn--sm el-btn--ghost"
            href={
              embed.watchUrl
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink
              size={
                14
              }
              aria-hidden
            />
            {t(
              'watch.open',
              {
                defaultValue:
                  'Open on {{site}}',
                site: embed.label,
              },
            )}
          </a>
        ) : null}
        <Link
          className="el-btn el-btn--sm el-btn--ghost"
          to="/rmhtube"
        >
          {t(
            'watch.together',
            {
              defaultValue:
                'Watch together on RMHTube',
            },
          )}
        </Link>
      </div>
    </div>
  );
}
