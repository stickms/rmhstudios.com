import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { SAHUR_WINDOW } from '@/lib/doctrine/constants';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/sahur')({
  component: SahurPage,
});

interface SahurSceneProps extends Record<string, unknown> {
  active: boolean;
  greeting: string; xpLabel: string; remainingLabel: string;
  challengeHeading: string; challengeDesc: string; playLabel: string; selfDestruct: string;
  title: string; notActive: string; notActiveDesc: string; countdownLabel: string;
  whatHappens: string; benefits: string[];
}

function SahurActive(p: SahurSceneProps) {
  return (
    <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-8')}>
      <Box style={tw('flex flex-col items-center w-full gap-4')}>
        <CanvasText style="text-4xl font-black text-[#F59E0B] text-center">{p.greeting}</CanvasText>
        <Box style={tw('flex flex-row items-center justify-center gap-4')}>
          <CanvasText style="text-sm font-bold text-[#fbbf24]">{`⚡ ${p.xpLabel}`}</CanvasText>
          <CanvasText style="text-sm text-[rgba(252,211,77,0.6)]">{`🕐 ${p.remainingLabel}`}</CanvasText>
        </Box>
      </Box>
      <Box style={tw('flex flex-col items-center w-full gap-4 p-6 rounded-site bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.2)]')}>
        <Icon node={icons.moon} size={32} color="#F59E0B" />
        <CanvasText style="text-lg font-bold text-[#fcd34d] text-center">{p.challengeHeading}</CanvasText>
        <CanvasText style="text-sm text-[rgba(252,211,77,0.6)] text-center">{p.challengeDesc}</CanvasText>
        <CanvasLink to="/strategies/puzzles" label={p.playLabel} style={tw('flex flex-row px-6 py-2.5 rounded-site-sm bg-[#F59E0B]')}>
          <CanvasText style="text-sm font-bold text-[#000000]">{p.playLabel}</CanvasText>
        </CanvasLink>
      </Box>
      <Box style={tw('flex flex-col items-center w-full')}>
        <CanvasText style="text-xs font-mono text-[rgba(245,158,11,0.3)] text-center">{p.selfDestruct}</CanvasText>
      </Box>
    </Box>
  );
}

function SahurInactive(p: SahurSceneProps) {
  return (
    <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
      <Box style={tw('flex flex-row items-center gap-2')}>
        <Icon node={icons.moon} size={20} color="rgba(255,255,255,0.3)" />
        <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{p.title}</CanvasText>
      </Box>
      <Box style={tw('flex flex-col items-center w-full gap-6 p-8 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
        <Icon node={icons.moon} size={48} color="rgba(255,255,255,0.1)" />
        <CanvasText style="text-lg font-semibold text-[rgba(255,255,255,0.6)]">{p.notActive}</CanvasText>
        <Box style={tw('w-full max-w-[448px]')}>
          <CanvasText style="text-sm text-[rgba(255,255,255,0.3)] text-center">{p.notActiveDesc}</CanvasText>
        </Box>
        <Box style={tw('flex flex-row items-center gap-2 px-4 py-2 rounded-site-sm bg-[#1C1C20]')}>
          <Icon node={icons.moon} size={14} color="rgba(255,255,255,0.3)" />
          <CanvasText style="text-sm font-mono text-[rgba(255,255,255,0.4)]">{p.countdownLabel}</CanvasText>
        </Box>
      </Box>
      <Box style={tw('flex flex-col w-full gap-2 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
        <CanvasText style="text-xs font-mono uppercase tracking-wide text-[rgba(255,255,255,0.4)]">{p.whatHappens}</CanvasText>
        {p.benefits.map((b, i) => (
          <CanvasText key={i} style="text-xs text-[rgba(255,255,255,0.3)]">{`• ${b}`}</CanvasText>
        ))}
      </Box>
    </Box>
  );
}

function SahurScene(p: SahurSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        {p.active ? <SahurActive {...p} /> : <SahurInactive {...p} />}
      </ScrollView>
    </DoctrineShell>
  );
}

function SahurMirror(p: SahurSceneProps) {
  return (
    <div>
      <h1>{p.active ? p.greeting : p.title}</h1>
      {p.active ? (
        <><p>{p.xpLabel} · {p.remainingLabel}</p><h2>{p.challengeHeading}</h2><p>{p.challengeDesc}</p><a href="/strategies/puzzles">{p.playLabel}</a></>
      ) : (
        <><h2>{p.notActive}</h2><p>{p.notActiveDesc}</p><p>{p.countdownLabel}</p><h3>{p.whatHappens}</h3><ul>{p.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul></>
      )}
    </div>
  );
}

function SahurPage() {
  const { t } = useTranslation("r-strategies");
  const { sahurActive, sahurCountdown } = useDoctrineSahur();
  const setDoctrineTheme = useDoctrineStore(s => s.setDoctrineTheme);
  useEffect(() => {
    if (sahurActive) setDoctrineTheme('sahur');
    return () => setDoctrineTheme('default');
  }, [sahurActive, setDoctrineTheme]);

  const sceneProps: SahurSceneProps = useMemo(() => ({
    active: sahurActive,
    greeting: SAHUR_WINDOW.greeting,
    xpLabel: t("xp-multiplier-label", { defaultValue: "{{multiplier}}x XP", multiplier: SAHUR_WINDOW.xpMultiplier }),
    remainingLabel: t("min-remaining", { defaultValue: "{{count}} min remaining", count: sahurCountdown }),
    challengeHeading: t("sahur-challenge-heading", { defaultValue: "Sahur Challenge" }),
    challengeDesc: t("sahur-challenge-desc", { defaultValue: "The exclusive 3 AM puzzle is available now. Complete it before the window closes. Miss it and it's gone. No archive. No second chance." }),
    playLabel: t("play-sahur-puzzle", { defaultValue: "Play Sahur Puzzle" }),
    selfDestruct: t("temporal-monopoly", { defaultValue: "TEMPORAL MONOPOLY — THIS CONTENT SELF-DESTRUCTS AT 4:00 AM" }),
    title: t("sahur-mode-title", { defaultValue: "Sahur Mode" }),
    notActive: t("not-active", { defaultValue: "Not Active" }),
    notActiveDesc: t("not-active-desc", { defaultValue: "Sahur Mode activates between 3:00–4:00 AM in your local timezone. Triple XP. Exclusive puzzles. Bat cursor. TUNG TUNG TUNG." }),
    countdownLabel: sahurCountdown > 0
      ? t("until-sahur", { defaultValue: "{{hours}}h {{minutes}}m until Sahur", hours: Math.floor(sahurCountdown / 60), minutes: sahurCountdown % 60 })
      : t("calculating", { defaultValue: "Calculating..." }),
    whatHappens: t("what-happens-heading", { defaultValue: "What happens during Sahur" }),
    benefits: [
      t("benefit-xp", { defaultValue: "All XP earned is multiplied by {{multiplier}}x", multiplier: SAHUR_WINDOW.xpMultiplier }),
      t("benefit-puzzle", { defaultValue: "An exclusive puzzle appears (no archive, no replays)" }),
      t("benefit-theme", { defaultValue: "The entire UI transforms with the Sahur theme" }),
      t("benefit-badge", { defaultValue: "Participation earns a unique daily badge on your profile" }),
      t("benefit-cursor", { defaultValue: "The cursor becomes a baseball bat" }),
    ],
  }), [t, sahurActive, sahurCountdown]);

  return (
    <CanvasPage routeId="/strategies/sahur" scene={SahurScene} sceneProps={sceneProps} mirror={<SahurMirror {...sceneProps} />} shell="fullscreen" title={sceneProps.title} />
  );
}
