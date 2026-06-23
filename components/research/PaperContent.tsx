'use client';

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResearchArticle } from '@/lib/research';

/* ── Volume 1 ────────────────────────────────────────────────────── */
const QuantumNashPaper = lazy(() =>
  import('./papers/quantum-nash').then((m) => ({ default: m.QuantumNashPaper }))
);
const NeuromorphicNPCPaper = lazy(() =>
  import('./papers/neuromorphic-npc').then((m) => ({ default: m.NeuromorphicNPCPaper }))
);
const EmergentNarrativePaper = lazy(() =>
  import('./papers/emergent-narrative').then((m) => ({ default: m.EmergentNarrativePaper }))
);

/* ── Volume 2 ────────────────────────────────────────────────────── */
const CoevolutionaryEcosystemsPaper = lazy(() =>
  import('./papers/coevolutionary-ecosystems').then(
    (m) => ({ default: m.CoevolutionaryEcosystemsPaper })
  )
);
const EntropyLevelGenerationPaper = lazy(() =>
  import('./papers/entropy-level-generation').then(
    (m) => ({ default: m.EntropyLevelGenerationPaper })
  )
);
const RiemannianMatchmakingPaper = lazy(() =>
  import('./papers/riemannian-matchmaking').then(
    (m) => ({ default: m.RiemannianMatchmakingPaper })
  )
);

/* ── Volume 3 ────────────────────────────────────────────────────── */
const FlowStatesPaper = lazy(() =>
  import('./papers/flow-states').then((m) => ({ default: m.FlowStatesPaper }))
);
const RLRoguelikePaper = lazy(() =>
  import('./papers/rl-roguelike').then((m) => ({ default: m.RLRoguelikePaper }))
);
const AdaptiveDifficultyPaper = lazy(() =>
  import('./papers/adaptive-difficulty').then((m) => ({ default: m.AdaptiveDifficultyPaper }))
);

/* ── Volume 4 ────────────────────────────────────────────────────── */
const ErgodicMarkovPaper = lazy(() =>
  import('./papers/ergodic-markov').then((m) => ({ default: m.ErgodicMarkovPaper }))
);
const PersistentHomologyPaper = lazy(() =>
  import('./papers/persistent-homology').then((m) => ({ default: m.PersistentHomologyPaper }))
);
const StatMechMARLPaper = lazy(() =>
  import('./papers/stat-mech-marl').then((m) => ({ default: m.StatMechMARLPaper }))
);

const paperComponents: Record<string, React.ComponentType> = {
  /* Vol 1 */
  'quantum-nash-equilibrium': QuantumNashPaper,
  'neuromorphic-npc-cognition': NeuromorphicNPCPaper,
  'emergent-narrative-llm': EmergentNarrativePaper,
  /* Vol 2 */
  'coevolutionary-agent-ecosystems': CoevolutionaryEcosystemsPaper,
  'entropy-optimal-level-generation': EntropyLevelGenerationPaper,
  'riemannian-skill-matchmaking': RiemannianMatchmakingPaper,
  /* Vol 3 */
  'neural-correlates-flow-states': FlowStatesPaper,
  'reinforcement-learning-roguelike': RLRoguelikePaper,
  'adaptive-difficulty-player-retention': AdaptiveDifficultyPaper,
  /* Vol 4 */
  'ergodic-markov-level-design': ErgodicMarkovPaper,
  'persistent-homology-gan-assets': PersistentHomologyPaper,
  'statistical-mechanics-multiagent-rl': StatMechMARLPaper,
};

export function PaperContent({ article }: { article: ResearchArticle }) {
  const { t } = useTranslation("c-research");
  const Body = paperComponents[article.slug];

  return (
    <div style={{ lineHeight: 1.6 }}>
      {/* Title */}
      <h1
        className="text-center font-bold leading-tight mb-2"
        style={{ fontSize: '22pt' }}
      >
        {article.title}
      </h1>

      {/* Authors */}
      <p
        className="text-center mb-1"
        style={{ fontSize: '12pt' }}
      >
        {article.authors.join(', ')}
      </p>

      {/* Affiliation */}
      <p
        className="text-center italic text-gray-600 mb-1"
        style={{ fontSize: '10pt' }}
      >
        {article.affiliation}
      </p>

      {/* Journal, Volume, Date */}
      <p
        className="text-center text-gray-500 mb-1"
        style={{ fontSize: '9pt' }}
      >
        {article.journal}, {t("vol-label", { defaultValue: "Vol." })}&nbsp;{article.volume}, {t("issue-label", { defaultValue: "Issue" })}&nbsp;
        {article.issue}, {t("pp-label", { defaultValue: "pp." })}&nbsp;{article.pages} &mdash;{' '}
        {new Date(article.date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>

      {/* DOI */}
      <p
        className="text-center text-gray-500 mb-6"
        style={{ fontSize: '9pt' }}
      >
        {t("doi-label", { defaultValue: "DOI:" })} {article.doi}
      </p>

      <hr className="border-gray-300 mb-6" />

      {/* Abstract */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
        <h2
          className="font-bold mb-2"
          style={{ fontSize: '12pt' }}
        >
          {t("abstract-heading", { defaultValue: "Abstract" })}
        </h2>
        <p
          className="text-gray-800 text-justify"
          style={{ fontSize: '10pt' }}
        >
          {article.abstract}
        </p>

        {/* Keywords */}
        <p className="mt-3" style={{ fontSize: '9pt' }}>
          <strong>{t("keywords-label", { defaultValue: "Keywords:" })}</strong>{' '}
          <span className="italic text-gray-600">
            {article.keywords.join(', ')}
          </span>
        </p>
      </div>

      {/* Paper body */}
      <div
        className="text-justify"
        style={{ fontSize: '11pt' }}
      >
        {Body ? <Suspense fallback={null}><Body /></Suspense> : <p>{t("paper-not-found", { defaultValue: "Paper content not found." })}</p>}
      </div>
    </div>
  );
}
