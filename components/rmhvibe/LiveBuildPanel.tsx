/**
 * LiveBuildPanel — what the model is doing while a vibe is built: the progress
 * view (thinking, then the file list) and a Code tab that shows each file's
 * source as it streams. While writing, the file being written is selected and
 * pinned to the bottom unless the reader scrolled up or picked another file.
 */

import {
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

export function LiveBuildPanel({
  thinking,
  content,
  phase,
  className = '',
}: {
  thinking: string;
  content: string;
  phase:
    | 'thinking'
    | 'writing'
    | 'done';
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'pages',
    );
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
                        setPicked(
                          name,
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
