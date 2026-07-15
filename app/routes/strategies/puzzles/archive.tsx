import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";
import { useMemo } from 'react';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/puzzles/archive')({
  component: ArchivePage,
});

interface ArchiveSceneProps extends Record<string, unknown> {
  title: string;
  description: string;
  comingSoon: string;
}

function ArchiveScene({ title, description, comingSoon }: ArchiveSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
          <CanvasText style="text-sm text-[#52525B]">{description}</CanvasText>
          <Box style={tw('flex flex-col items-center w-full py-16')}>
            <CanvasText style="text-sm text-[rgba(255,255,255,0.3)]">{comingSoon}</CanvasText>
          </Box>
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function ArchiveMirror({ title, description, comingSoon }: ArchiveSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>{comingSoon}</p>
    </div>
  );
}

function ArchivePage() {
  const { t } = useTranslation("r-strategies");
  const sceneProps: ArchiveSceneProps = useMemo(() => ({
    title: t("puzzle-archive", { defaultValue: "Puzzle Archive" }),
    description: t("archive-description", { defaultValue: "Browse past puzzles. History is classified until it isn't." }),
    comingSoon: t("archive-coming-soon", { defaultValue: "Archive coming in Phase 1: First Light" }),
  }), [t]);

  return (
    <CanvasPage
      routeId="/strategies/puzzles/archive"
      scene={ArchiveScene}
      sceneProps={sceneProps}
      mirror={<ArchiveMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
