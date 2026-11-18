/**
 * The running frame of a feed vibe card. Split out of `VibeEmbedCard` so the frame, the
 * bridge and `vibe.css` load only when a reader presses Run, never with the feed.
 */
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { VibeFrame } from '@/components/rmhvibe/VibeFrame';
import { VibeStyles } from '@/components/rmhvibe/VibeStyles';
import { useVibeBridge } from '@/components/rmhvibe/useVibeBridge';
import { createVibeHostHandlers } from '@/components/rmhvibe/vibe-host-handlers';
import {
  resolveTweakValues,
  type TweakSpec,
} from '@/lib/rmhvibe/tweaks';

/** The feed frame is scripts only: no forms, modals or pointer lock, and never same-origin. */
const FEED_SANDBOX =
  'allow-scripts';

export default function VibeEmbedRunner({
  slug,
  html,
  title,
  tweakSpec,
  tweakValues,
}: {
  slug: string;
  html: string;
  title: string;
  tweakSpec: TweakSpec[];
  tweakValues: Record<
    string,
    unknown
  >;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhvibe',
    );
  const [
    frame,
    setFrame,
  ] =
    useState<HTMLIFrameElement | null>(
      null,
    );
  const handlers =
    useMemo(
      () =>
        createVibeHostHandlers(
          slug,
        ),
      [
        slug,
      ],
    );
  const {
    post,
  } =
    useVibeBridge(
      frame,
      {
        kind: 'feed',
        ...handlers,
      },
    );
  const values =
    useMemo(
      () =>
        resolveTweakValues(
          tweakSpec,
          tweakValues,
        ),
      [
        tweakSpec,
        tweakValues,
      ],
    );

  // The saved knob values go to every new frame, as the viewer does.
  useEffect(() => {
    if (
      frame &&
      tweakSpec.length
    )
      post(
        'tweaks',
        values,
      );
  }, [
    frame,
    tweakSpec,
    values,
    post,
  ]);

  return (
    <div className="absolute inset-0">
      <VibeStyles />
      <VibeFrame
        html={
          html
        }
        title={
          title ||
          t(
            'vibe-frame-title',
            {
              defaultValue:
                'Vibe',
            },
          )
        }
        sandbox={
          FEED_SANDBOX
        }
        onFrame={
          setFrame
        }
      />
    </div>
  );
}
