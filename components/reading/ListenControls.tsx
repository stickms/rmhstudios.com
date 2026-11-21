/**
 * The Listen controller (feature 12). Loaded on the first press of the toolbar's
 * Listen button, so the article route's chunk carries none of it. Mounting it
 * starts reading; unmounting it (Stop, the end of the article, navigation, the
 * tab closing) stops the voice. Nothing listens or ticks while it is not mounted.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { toast } from '@/lib/toast';
import {
  createReader,
  type Reader,
  type ReaderState,
} from '@/lib/audio/read-aloud';
import {
  buildSegments,
  collectSpeechBlocks,
  type SpeechSegment,
} from '@/lib/reading/speech-text';
import {
  LISTEN_RATES,
  readListenPrefs,
  writeListenPrefs,
  type ListenPrefs,
} from '@/lib/reading/listen-prefs';

/** Elements a click must not turn into a jump: links, controls, footnotes. */
const NO_JUMP =
  'a,button,input,textarea,select,summary,[data-rf-skip]';

function pageLanguage(): string {
  return (
    document
      .documentElement
      .lang ||
    'en'
  );
}

/** Scroll `el` into view only when it is outside the viewport; never smoothly (R5). */
function revealIfHidden(
  el: Element,
) {
  const r =
    el.getBoundingClientRect();
  if (
    r.top >=
      0 &&
    r.bottom <=
      window.innerHeight
  )
    return;
  el.scrollIntoView(
    {
      block:
        'center',
      behavior:
        'auto',
    },
  );
}

function VoiceMenu({
  voiceURI,
  onChoose,
}: {
  voiceURI:
    | string
    | null;
  onChoose: (
    uri:
      | string
      | null,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'read-aloud',
    );
  const anchor =
    useRef<HTMLButtonElement>(
      null,
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    voices,
    setVoices,
  ] =
    useState<
      SpeechSynthesisVoice[]
    >(
      [],
    );

  // getVoices() is empty until `voiceschanged`; listen only while the menu is open.
  useEffect(() => {
    if (
      !open
    )
      return;
    const synth =
      window.speechSynthesis;
    const base =
      pageLanguage()
        .toLowerCase()
        .split(
          '-',
        )[0];
    const read =
      () =>
        setVoices(
          synth
            .getVoices()
            .filter(
              (
                v,
              ) =>
                v.lang
                  .toLowerCase()
                  .split(
                    /[-_]/,
                  )[0] ===
                base,
            ),
        );
    read();
    synth.addEventListener(
      'voiceschanged',
      read,
    );
    return () =>
      synth.removeEventListener(
        'voiceschanged',
        read,
      );
  }, [
    open,
  ]);

  return (
    <>
      <Button
        ref={
          anchor
        }
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-haspopup="menu"
        aria-expanded={
          open
        }
        aria-label={t(
          'voice',
          {
            defaultValue:
              'Voice',
          },
        )}
        onClick={() =>
          setOpen(
            (
              o,
            ) =>
              !o,
          )
        }
      >
        <Volume2
          aria-hidden
        />
      </Button>
      <AnchoredMenu
        open={
          open
        }
        onClose={() =>
          setOpen(
            false,
          )
        }
        anchorRef={
          anchor
        }
        label={t(
          'voice',
          {
            defaultValue:
              'Voice',
          },
        )}
        className="w-64"
      >
        <MenuItem
          checked={
            voiceURI ===
            null
          }
          onSelect={() => {
            onChoose(
              null,
            );
            setOpen(
              false,
            );
          }}
        >
          {t(
            'voice-default',
            {
              defaultValue:
                'System default',
            },
          )}
        </MenuItem>
        {voices.map(
          (
            v,
          ) => (
            <MenuItem
              key={
                v.voiceURI
              }
              checked={
                voiceURI ===
                v.voiceURI
              }
              hint={
                v.lang
              }
              onSelect={() => {
                onChoose(
                  v.voiceURI,
                );
                setOpen(
                  false,
                );
              }}
            >
              {
                v.name
              }
            </MenuItem>
          ),
        )}
      </AnchoredMenu>
    </>
  );
}

function SpeedMenu({
  rate,
  onChoose,
}: {
  rate: number;
  onChoose: (
    rate: number,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'read-aloud',
    );
  const anchor =
    useRef<HTMLButtonElement>(
      null,
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const label =
    t(
      'speed',
      {
        defaultValue:
          'Speed',
      },
    );
  return (
    <>
      <Button
        ref={
          anchor
        }
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={
          open
        }
        aria-label={`${label}: ${rate}×`}
        onClick={() =>
          setOpen(
            (
              o,
            ) =>
              !o,
          )
        }
      >
        <span className="font-mono">{`${rate}×`}</span>
      </Button>
      <AnchoredMenu
        open={
          open
        }
        onClose={() =>
          setOpen(
            false,
          )
        }
        anchorRef={
          anchor
        }
        label={
          label
        }
        className="w-32"
      >
        {LISTEN_RATES.map(
          (
            r,
          ) => (
            <MenuItem
              key={
                r
              }
              checked={
                r ===
                rate
              }
              onSelect={() => {
                onChoose(
                  r,
                );
                setOpen(
                  false,
                );
              }}
            >
              {`${r}×`}
            </MenuItem>
          ),
        )}
      </AnchoredMenu>
    </>
  );
}

export default function ListenControls({
  rootRef,
  onClose,
}: {
  /** The element holding the article's rendered text. */
  rootRef: RefObject<HTMLElement | null>;
  /** Called when listening is over (Stop, the end, or nothing to read). */
  onClose: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'read-aloud',
    );
  const [
    prefs,
    setPrefs,
  ] =
    useState<ListenPrefs>(
      readListenPrefs,
    );
  const [
    state,
    setState,
  ] =
    useState<ReaderState>(
      'idle',
    );
  const [
    current,
    setCurrent,
  ] =
    useState(
      0,
    );
  const [
    total,
    setTotal,
  ] =
    useState(
      0,
    );
  const readerRef =
    useRef<Reader | null>(
      null,
    );
  const prefsRef =
    useRef(
      prefs,
    );
  prefsRef.current =
    prefs;
  // Latest strings and close handler for the one-time setup below.
  const latest =
    useRef(
      {
        t,
        onClose,
      },
    );
  latest.current =
    {
      t,
      onClose,
    };

  useEffect(() => {
    const root =
      rootRef.current;
    const {
      t: tr,
    } =
      latest.current;
    const segments: SpeechSegment<Element>[] =
      root
        ? buildSegments(
            collectSpeechBlocks(
              root,
            ),
            {
              codeSkipped:
                tr(
                  'code-skipped',
                  {
                    defaultValue:
                      'Code block skipped',
                  },
                ),
              image:
                (
                  alt,
                ) =>
                  tr(
                    'image-alt',
                    {
                      alt,
                      defaultValue:
                        'Image: {{alt}}',
                    },
                  ),
            },
          )
        : [];
    const reader =
      root &&
      segments.length >
        0
        ? createReader(
            segments.map(
              (
                s,
              ) =>
                s.text,
            ),
            {
              rate: prefsRef
                .current
                .rate,
              voiceURI:
                prefsRef
                  .current
                  .voiceURI,
              onStateChange:
                (
                  next,
                ) => {
                  setState(
                    next,
                  );
                  if (
                    next ===
                      'idle' ||
                    next ===
                      'ended'
                  )
                    latest.current.onClose();
                },
              onParagraph:
                (
                  index,
                ) => {
                  const el =
                    segments[
                      index
                    ]
                      ?.element;
                  root
                    .querySelector(
                      '[data-speaking]',
                    )
                    ?.removeAttribute(
                      'data-speaking',
                    );
                  if (
                    !el
                  )
                    return;
                  el.setAttribute(
                    'data-speaking',
                    '',
                  );
                  revealIfHidden(
                    el,
                  );
                  setCurrent(
                    index,
                  );
                },
            },
          )
        : null;
    if (
      !root ||
      !reader
    ) {
      toast.info(
        tr(
          'nothing-to-read',
          {
            defaultValue:
              'There is no text to read here.',
          },
        ),
      );
      latest.current.onClose();
      return;
    }
    readerRef.current =
      reader;
    setTotal(
      segments.length,
    );

    // Click a paragraph to jump there; leave links, controls and selections alone.
    const onClick =
      (
        e: MouseEvent,
      ) => {
        const target =
          e.target;
        if (
          !(
            target instanceof
            Element
          ) ||
          target.closest(
            NO_JUMP,
          ) ||
          !window.getSelection()
            ?.isCollapsed
        )
          return;
        let hit =
          -1;
        segments.forEach(
          (
            s,
            i,
          ) => {
            if (
              s.element.contains(
                target,
              )
            )
              hit =
                i;
          },
        );
        if (
          hit >=
          0
        )
          reader.play(
            hit,
          );
      };
    root.addEventListener(
      'click',
      onClick,
    );
    const onPageHide =
      () =>
        reader.stop();
    window.addEventListener(
      'pagehide',
      onPageHide,
    );

    // Lock-screen and headset controls.
    const session =
      'mediaSession' in
      navigator
        ? navigator.mediaSession
        : null;
    const handlers: Array<
      [
        MediaSessionAction,
        () => void,
      ]
    > =
      [
        [
          'play',
          () => {
            if (
              reader.state ===
              'paused'
            )
              reader.play();
          },
        ],
        [
          'pause',
          () =>
            reader.pause(),
        ],
        [
          'stop',
          () =>
            reader.stop(),
        ],
        [
          'previoustrack',
          () =>
            reader.play(
              Math.max(
                0,
                reader.index -
                  1,
              ),
            ),
        ],
        [
          'nexttrack',
          () =>
            reader.play(
              reader.index +
                1,
            ),
        ],
      ];
    if (
      session
    ) {
      session.metadata =
        new MediaMetadata(
          {
            title:
              document
                .querySelector(
                  'h1',
                )
                ?.textContent?.trim() ||
              document.title,
            artist:
              tr(
                'site-name',
                {
                  defaultValue:
                    'RMH Studios',
                },
              ),
          },
        );
      for (const [
        action,
        handler,
      ] of handlers)
        try {
          session.setActionHandler(
            action,
            handler,
          );
        } catch {
          // This browser does not offer that action.
        }
    }

    reader.play(
      0,
    );
    return () => {
      root.removeEventListener(
        'click',
        onClick,
      );
      window.removeEventListener(
        'pagehide',
        onPageHide,
      );
      reader.destroy();
      readerRef.current =
        null;
      root
        .querySelector(
          '[data-speaking]',
        )
        ?.removeAttribute(
          'data-speaking',
        );
      if (
        session
      ) {
        for (const [
          action,
        ] of handlers)
          try {
            session.setActionHandler(
              action,
              null,
            );
          } catch {
            // Nothing was set.
          }
        session.metadata =
          null;
      }
    };
  }, [
    rootRef,
  ]);

  const update =
    useCallback(
      (
        next: ListenPrefs,
      ) => {
        setPrefs(
          next,
        );
        writeListenPrefs(
          next,
        );
        readerRef.current?.setRate(
          next.rate,
        );
        readerRef.current?.setVoice(
          next.voiceURI,
        );
      },
      [],
    );

  const paused =
    state ===
    'paused';
  return (
    <div
      role="group"
      aria-label={t(
        'listen',
        {
          defaultValue:
            'Listen',
        },
      )}
      className="inline-flex flex-wrap items-center gap-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={
          paused
        }
        className={
          paused
            ? 'bg-site-bg-subtle'
            : undefined
        }
        aria-label={t(
          'pause',
          {
            defaultValue:
              'Pause',
          },
        )}
        onClick={() => {
          const r =
            readerRef.current;
          if (
            paused
          )
            r?.play();
          else
            r?.pause();
        }}
      >
        <Pause
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={
          current <=
          0
        }
        aria-label={t(
          'previous-paragraph',
          {
            defaultValue:
              'Previous paragraph',
          },
        )}
        onClick={() =>
          readerRef.current?.play(
            Math.max(
              0,
              current -
                1,
            ),
          )
        }
      >
        <SkipBack
          className="rtl:rotate-180"
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t(
          'next-paragraph',
          {
            defaultValue:
              'Next paragraph',
          },
        )}
        onClick={() => {
          if (
            current +
              1 >=
            total
          )
            readerRef.current?.stop();
          else
            readerRef.current?.play(
              current +
                1,
            );
        }}
      >
        <SkipForward
          className="rtl:rotate-180"
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t(
          'stop',
          {
            defaultValue:
              'Stop',
          },
        )}
        onClick={() =>
          readerRef.current?.stop()
        }
      >
        <Square
          aria-hidden
        />
      </Button>
      <SpeedMenu
        rate={
          prefs.rate
        }
        onChoose={(
          rate,
        ) =>
          update(
            {
              ...prefs,
              rate,
            },
          )
        }
      />
      <VoiceMenu
        voiceURI={
          prefs.voiceURI
        }
        onChoose={(
          voiceURI,
        ) =>
          update(
            {
              ...prefs,
              voiceURI,
            },
          )
        }
      />
      <span
        role="status"
        aria-live="polite"
        className="t-meta"
      >
        {total >
        0
          ? t(
              'status',
              {
                current:
                  current +
                  1,
                total,
                defaultValue:
                  'Reading paragraph {{current}} of {{total}}',
              },
            )
          : null}
      </span>
    </div>
  );
}
