/**
 * Roadmap Route — canvas-converted (_site shell).
 *
 * Renders the shared `roadmap` data model (reused from
 * components/roadmap/RoadmapSection.tsx) through the Konva stage: year
 * sections with milestone cards, inside CanvasSitePage under the sidebar
 * ShellScene. A semantic DOM mirror carries the same headings/text for
 * crawlers and screen readers.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { CanvasSitePage } from '@/canvas-ui/runtime/CanvasSitePage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { roadmap, type YearSection } from '@/components/roadmap/RoadmapSection';

export const Route = createFileRoute('/_site/roadmap')({
  head: () => ({
    meta: [
      { title: 'Roadmap | RMH Studios' },
      { name: 'description', content: 'The road ahead: games, community, immersive tech, and film.' },
    ],
  }),
  component: RoadmapPage,
});

interface RoadmapSceneProps extends Record<string, unknown> {
  title: string;
  intro: string;
  updateNote: string;
  sections: YearSection[];
}

function RoadmapScene({ title, intro, updateNote, sections }: RoadmapSceneProps) {
  return (
    <CanvasSitePage title={title} wide>
      <Box name="roadmap" style={tw('flex flex-col w-full p-4 gap-10')}>
        {/* Intro card */}
        <Box style={tw('flex flex-col w-full rounded-site border border-site-border bg-site-surface p-4')}>
          <CanvasText style="text-sm text-site-text-muted">{intro}</CanvasText>
        </Box>

        {sections.map((section) => (
          <Box key={section.year} name={`roadmap-${section.year}`} style={tw('flex flex-col w-full gap-4')}>
            {/* Year label with accent left border */}
            <Box style={tw('flex flex-row items-baseline gap-2 pl-3 border-l-2 border-site-accent')}>
              <CanvasText style="text-xl font-black text-site-accent">{section.year}</CanvasText>
              <CanvasText style="text-xs font-mono uppercase tracking-wide text-site-text-dim">{section.tagline}</CanvasText>
            </Box>

            {/* Milestone grid (2-up on wide) */}
            <Box style={tw('flex flex-row flex-wrap w-full gap-3')}>
              {section.milestones.map((m, i) => (
                <Box
                  key={`${section.year}-${i}`}
                  style={tw('flex flex-col rounded-site border border-site-border bg-site-surface p-5 gap-2 w-full sm:w-[360px] grow')}
                >
                  <CanvasText style="text-xs font-bold uppercase tracking-wide text-site-accent">{m.title}</CanvasText>
                  <CanvasText style="text-sm text-site-text-muted">{m.body}</CanvasText>
                </Box>
              ))}
            </Box>
          </Box>
        ))}

        <Box style={tw('flex flex-row justify-center w-full pb-4')}>
          <CanvasText style="text-xs text-site-text-dim text-center">{updateNote}</CanvasText>
        </Box>
      </Box>
    </CanvasSitePage>
  );
}

function RoadmapMirror({ title, intro, updateNote, sections }: RoadmapSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{intro}</p>
      {sections.map((section) => (
        <section key={section.year}>
          <h2>{section.year} — {section.tagline}</h2>
          {section.milestones.map((m, i) => (
            <div key={`${section.year}-${i}`}>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </div>
          ))}
        </section>
      ))}
      <p>{updateNote}</p>
    </div>
  );
}

function RoadmapPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('c-roadmap');
  const sceneProps: RoadmapSceneProps = useMemo(() => ({
    title: t('roadmap-title', { defaultValue: 'Roadmap' }),
    intro: tc('intro-body', { defaultValue: "We're an indie studio building rhythm games, deckbuilders, narrative horror, and more. Our roadmap isn't tied to one title—we're growing the catalog, Discord, and new worlds in parallel. Timelines are guides, not promises." }),
    updateNote: tc('update-note', { defaultValue: "We'll update this as we ship." }),
    sections: roadmap,
  }), [t, tc]);

  return (
    <CanvasPage
      routeId="/_site/roadmap"
      scene={RoadmapScene}
      sceneProps={sceneProps}
      mirror={<RoadmapMirror {...sceneProps} />}
      shell="site"
      title={sceneProps.title}
    />
  );
}
