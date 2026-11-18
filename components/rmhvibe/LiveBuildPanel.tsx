/**
 * LiveBuildPanel — what the model is doing while a vibe is built: the progress
 * view (thinking, then the file list) and a Code tab that shows each file's
 * source as it streams. While writing, the file being written is selected and
 * pinned to the bottom unless the reader scrolled up or picked another file.
 *
 * Progress and Code are two views of one area, so they stay a `Tabs` strip with
 * `tabpanel`s (not a radio group); the inactive panel renders empty and `hidden` so the
 * tab's `aria-controls` always resolves. A caller that renders the panel in more than one
 * place (a bottom sheet, a side column) lends it one `useLiveBuildView()` so the choice
 * survives the move.
 */

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import { parsePartialProject } from '@/lib/rmhvibe/vibe-project';
import { ThinkingStream } from '@/components/rmhvibe/ThinkingStream';
import { VibeProgress } from '@/components/rmhvibe/VibeProgress';
import '@/components/rmhvibe/vibe.css';

type PanelTab =
  | 'progress'
  | 'code';

export interface LiveBuildView {
  tab: PanelTab;
  setTab: (
    tab: PanelTab,
  ) => void;
  /** A file the reader chose; null follows the file being written. */
  picked:
    | string
    | null;
  setPicked: (
    name:
      | string
      | null,
  ) => void;
}

export function useLiveBuildView(): LiveBuildView {
  const [
    tab,
    setTab,
  ] =
    useState<PanelTab>(
      'progress',
    );
  const [
    picked,
    setPicked,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  return {
    tab,
    setTab,
    picked,
    setPicked,
  };
}

export function LiveBuildPanel({
  thinking,
  content,
  phase,
  className = '',
  view,
}: {
  thinking: string;
  content: string;
  phase:
    | 'thinking'
    | 'writing'
    | 'done';
  className?: string;
  /** Lifted view state; omitted, the panel keeps its own. */
  view?: LiveBuildView;
}) {
  const {
    t,
  } =
    useTranslation(
      'pages',
    );
  const own =
    useLiveBuildView();
  const {
    tab,
    setTab,
    picked,
    setPicked,
  } =
    view ??
    own;

  const project =
    useMemo(
      () =>
        parsePartialProject(
          content,
        ),
      [
        content,
      ],
    );
  const names =
    useMemo(
      () =>
        Object.keys(
          project.files,
        ),
      [
        project.files,
      ],
    );
  // A pick that no longer exists (a new build began) is dropped, so following resumes.
  useEffect(() => {
    if (
      picked &&
      !(
        picked in
        project.files
      )
    )
      setPicked(
        null,
      );
  }, [
    picked,
    project.files,
    setPicked,
  ]);
  // A pick wins only while that file still exists; otherwise follow the writer.
  const selected =
    picked &&
    picked in
      project.files
      ? picked
      : phase ===
            'writing' &&
          project.writing
        ? project.writing
        : (names[
            names.length -
              1
          ] ??
          null);
  const source =
    selected
      ? (project
          .files[
          selected
        ] ??
        '')
      : '';

  return (
    <div
      className={`vibe-build ${className}`.trim()}
    >
      <Tabs
        size="sm"
        aria-label={t(
          'live-tabs-label',
          {
            defaultValue:
              'Build details',
          },
        )}
        idBase="vibe-build"
        value={
          tab
        }
        onChange={(
          id,
        ) =>
          setTab(
            id as PanelTab,
          )
        }
        tabs={[
          {
            id: 'progress',
            label:
              t(
                'live-tab-progress',
                {
                  defaultValue:
                    'Progress',
                },
              ),
          },
          {
            id: 'code',
            label:
              t(
                'live-tab-code',
                {
                  defaultValue:
                    'Code',
                },
              ),
          },
        ]}
      />
      {tab ===
      'progress' ? (
        <div
          role="tabpanel"
          id="vibe-build-panel-progress"
          aria-labelledby="vibe-build-tab-progress"
          className="vibe-build__pane"
        >
          {content ? (
            <VibeProgress
              content={
                content
              }
              className="vibe-progress--sm"
            />
          ) : (
            <ThinkingStream
              text={
                thinking
              }
              className="vibe-think--sm"
            />
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="vibe-build-panel-code"
          aria-labelledby="vibe-build-tab-code"
          className="vibe-build__pane"
        >
          {names.length ===
          0 ? (
            <p className="vibe-build__empty">
              {t(
                'live-no-files',
                {
                  defaultValue:
                    'No files yet.',
                },
              )}
            </p>
          ) : (
            <>
              <div className="vibe-build__files">
                {names.map(
                  (
                    name,
                  ) => (
                    <button
                      key={
                        name
                      }
                      type="button"
                      aria-pressed={
                        name ===
                        selected
                      }
                      className="vibe-build__file"
                      onClick={() =>
                        // Returning to the newest file hands the view back to the writer.
                        setPicked(
                          name ===
                            names[
                              names.length -
                                1
                            ]
                            ? null
                            : name,
                        )
                      }
                    >
                      {
                        name
                      }
                    </button>
                  ),
                )}
              </div>
              <CodeView
                key={
                  selected ??
                  ''
                }
                source={
                  source
                }
              />
            </>
          )}
        </div>
      )}
      <div
        role="tabpanel"
        hidden
        id={`vibe-build-panel-${tab === 'progress' ? 'code' : 'progress'}`}
        aria-labelledby={`vibe-build-tab-${tab === 'progress' ? 'code' : 'progress'}`}
      />
    </div>
  );
}

/**
 * The source viewer. Its own component so the stick-to-bottom effects attach
 * when the scroll container actually exists (the Code tab mounts late), and
 * keyed by file so switching files resets the scroll and the pin.
 */
function CodeView({
  source,
}: {
  source: string;
}) {
  const {
    containerRef,
    contentRef,
  } =
    useStickToBottom<
      HTMLDivElement,
      HTMLPreElement
    >();
  return (
    <div
      ref={
        containerRef
      }
      className="vibe-build__code"
    >
      <pre
        ref={
          contentRef
        }
      >
        <code>
          {
            source
          }
        </code>
      </pre>
    </div>
  );
}
