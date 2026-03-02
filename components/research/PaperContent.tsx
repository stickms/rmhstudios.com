'use client';

import dynamic from 'next/dynamic';
import type { ResearchArticle } from '@/lib/research';

const FlowStatesPaper = dynamic(() =>
  import('./papers/flow-states').then((m) => m.FlowStatesPaper)
);
const RLRoguelikePaper = dynamic(() =>
  import('./papers/rl-roguelike').then((m) => m.RLRoguelikePaper)
);
const AdaptiveDifficultyPaper = dynamic(() =>
  import('./papers/adaptive-difficulty').then((m) => m.AdaptiveDifficultyPaper)
);
const ErgodicMarkovPaper = dynamic(() =>
  import('./papers/ergodic-markov').then((m) => m.ErgodicMarkovPaper)
);
const PersistentHomologyPaper = dynamic(() =>
  import('./papers/persistent-homology').then((m) => m.PersistentHomologyPaper)
);
const StatMechMARLPaper = dynamic(() =>
  import('./papers/stat-mech-marl').then((m) => m.StatMechMARLPaper)
);

const paperComponents: Record<string, React.ComponentType> = {
  'neural-correlates-flow-states': FlowStatesPaper,
  'reinforcement-learning-roguelike': RLRoguelikePaper,
  'adaptive-difficulty-player-retention': AdaptiveDifficultyPaper,
  'ergodic-markov-level-design': ErgodicMarkovPaper,
  'persistent-homology-gan-assets': PersistentHomologyPaper,
  'statistical-mechanics-multiagent-rl': StatMechMARLPaper,
};

export function PaperContent({ article }: { article: ResearchArticle }) {
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
        {article.journal}, Vol.&nbsp;{article.volume}, Issue&nbsp;
        {article.issue}, pp.&nbsp;{article.pages} &mdash;{' '}
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
        DOI: {article.doi}
      </p>

      <hr className="border-gray-300 mb-6" />

      {/* Abstract */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
        <h2
          className="font-bold mb-2"
          style={{ fontSize: '12pt' }}
        >
          Abstract
        </h2>
        <p
          className="text-gray-800 text-justify"
          style={{ fontSize: '10pt' }}
        >
          {article.abstract}
        </p>

        {/* Keywords */}
        <p className="mt-3" style={{ fontSize: '9pt' }}>
          <strong>Keywords:</strong>{' '}
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
        {Body ? <Body /> : <p>Paper content not found.</p>}
      </div>
    </div>
  );
}
