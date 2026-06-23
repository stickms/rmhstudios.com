'use client';

import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PaperFigure } from '../PaperFigure';

/* ------------------------------------------------------------------ */
/*  Data for Figures                                                   */
/* ------------------------------------------------------------------ */

const rewardData = [
  { step: '0', static: 0, proceduralFixed: 0, proceduralRandom: 0, curriculum: 0 },
  { step: '1M', static: 145, proceduralFixed: 98, proceduralRandom: 62, curriculum: 110 },
  { step: '2M', static: 280, proceduralFixed: 195, proceduralRandom: 130, curriculum: 235 },
  { step: '4M', static: 410, proceduralFixed: 340, proceduralRandom: 265, curriculum: 380 },
  { step: '6M', static: 450, proceduralFixed: 410, proceduralRandom: 370, curriculum: 440 },
  { step: '8M', static: 460, proceduralFixed: 435, proceduralRandom: 425, curriculum: 458 },
  { step: '10M', static: 462, proceduralFixed: 442, proceduralRandom: 448, curriculum: 465 },
];

const generalizationData = [
  { env: 'Seen Layouts', static: 95, proceduralFixed: 88, proceduralRandom: 82, curriculum: 90 },
  { env: 'Novel Easy', static: 42, proceduralFixed: 65, proceduralRandom: 78, curriculum: 80 },
  { env: 'Novel Medium', static: 28, proceduralFixed: 51, proceduralRandom: 71, curriculum: 74 },
  { env: 'Novel Hard', static: 12, proceduralFixed: 33, proceduralRandom: 58, curriculum: 62 },
];

const behaviorData = [
  { trait: 'Exploration', static: 20, procedural: 75, curriculum: 80 },
  { trait: 'Combat', static: 85, procedural: 70, curriculum: 78 },
  { trait: 'Resource Mgmt', static: 30, procedural: 65, curriculum: 72 },
  { trait: 'Adaptability', static: 15, procedural: 80, curriculum: 85 },
  { trait: 'Risk Taking', static: 60, procedural: 55, curriculum: 50 },
];

/* ------------------------------------------------------------------ */
/*  Shared style constants                                             */
/* ------------------------------------------------------------------ */

const h2Style: React.CSSProperties = {
  fontSize: '14pt',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  borderTop: '2px solid #d1d5db',
  paddingTop: '1rem',
  marginTop: '2rem',
  marginBottom: '0.75rem',
};

const h3Style: React.CSSProperties = {
  fontSize: '12pt',
  fontWeight: 'bold',
  marginTop: '1.25rem',
  marginBottom: '0.5rem',
};

const thTdStyle: React.CSSProperties = {
  border: '1px solid #9ca3af',
  padding: '6px 10px',
  textAlign: 'left',
};

const thStyle: React.CSSProperties = {
  ...thTdStyle,
  backgroundColor: '#f3f4f6',
  fontWeight: 'bold',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RLRoguelikePaper() {
  const { t } = useTranslation('c-research');
  return (
    <>
      {/* ============================================================ */}
      {/* 1. INTRODUCTION                                              */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-introduction', { defaultValue: '1. Introduction' })}</h2>

      <p className="mb-4">
        Reinforcement learning (RL) has achieved extraordinary milestones over
        the past decade, demonstrating super-human performance across a diverse
        array of challenging domains. Deep Q-Networks mastered forty-nine Atari
        2600 games directly from raw pixel input (Mnih et al., 2015), AlphaGo
        and its successors defeated world champions in the ancient game of Go
        (Silver et al., 2016; Silver et al., 2017), and AlphaStar reached
        Grandmaster level in the real-time strategy game StarCraft II
        (Vinyals et al., 2019). These accomplishments share a common
        characteristic: the agent is trained and evaluated within environments
        whose fundamental structure remains constant across episodes. The board
        layout of Go never changes; the Atari ROM is deterministic given the
        same sequence of inputs. While stochasticity may arise from opponent
        behavior or initial conditions, the underlying state-transition dynamics
        and spatial topology are fixed. This structural invariance simplifies the
        learning problem considerably, permitting the agent to gradually memorize
        optimal action sequences for frequently encountered states.
      </p>

      <p className="indent-8 mb-4">
        Procedurally generated environments fundamentally disrupt this
        assumption. In roguelike games — a genre defined by algorithmic level
        construction, permadeath, and emergent gameplay — the dungeon layout,
        enemy placement, item distribution, and navigational topology are
        regenerated for each episode. An agent cannot rely on spatial memorization
        because the spatial structure it memorized will never recur. Instead, the
        agent must learn abstract, transferable policies: recognizing that a
        narrow corridor affords a chokepoint advantage regardless of its absolute
        position, or that accumulating healing items before engaging a high-threat
        room is prudent irrespective of the specific room geometry. This
        requirement for generalization transforms the RL problem from one of
        optimization over a fixed Markov decision process (MDP) to one of
        meta-learning across a distribution of MDPs (Cobbe et al., 2020;
        Risi &amp; Togelius, 2020). The challenge is significant: prior work has
        demonstrated that agents trained even on large but fixed sets of
        procedurally generated levels can fail catastrophically when confronted
        with novel configurations drawn from the same generative grammar
        (Justesen et al., 2018; Zhang et al., 2018a).
      </p>

      <p className="indent-8 mb-4">
        Curriculum learning offers a principled framework for addressing this
        generalization challenge. Originally proposed by Bengio et al. (2009),
        curriculum learning structures the training process so that the agent
        encounters progressively more complex or diverse tasks over time,
        mirroring the pedagogical intuition that foundational skills should be
        mastered before advanced material is introduced. In the context of
        procedurally generated environments, a curriculum might begin with
        a fixed, relatively simple layout to allow the agent to acquire basic
        locomotion and combat skills, then gradually introduce procedural
        variation to force the agent to generalize those skills across novel
        configurations. This staged approach has been shown to accelerate
        convergence in a variety of settings (Narvekar et al., 2020), but
        its interaction with procedural generation in roguelike environments
        remains insufficiently explored. Specifically, it is unclear whether
        the initial static phase introduces representational biases that
        subsequently hinder generalization, or whether the stable early
        learning signal it provides outweighs any such costs.
      </p>

      <p className="indent-8 mb-4">
        In this paper, we present a systematic empirical comparison of four
        training regimes for RL agents operating in a custom roguelike
        environment: (1)&nbsp;Static, where a single fixed dungeon layout is used
        throughout training; (2)&nbsp;Procedural-Fixed, where training draws from
        a fixed bank of 100 procedurally generated layouts; (3)&nbsp;Procedural-Random,
        where a completely novel layout is generated for each episode; and
        (4)&nbsp;Curriculum, which transitions smoothly from Static through
        Procedural-Fixed to Procedural-Random over the course of training. We
        evaluate each regime on both seen and novel environments across three
        difficulty tiers, measuring completion rate, cumulative reward, and a
        behavioral diversity index that captures the richness of the agent&apos;s
        strategic repertoire. Our principal contribution is threefold: first, we
        quantify the generalization gap — the performance difference between
        seen and novel environments — for each regime, revealing that static
        training produces agents that are brittle and narrowly specialized.
        Second, we demonstrate that curriculum learning achieves the highest
        combined performance on both seen and novel environments, resolving the
        tension between sample efficiency and generalization. Third, we conduct
        a behavioral analysis showing that curriculum-trained agents develop
        richer, more adaptive strategies that are directly relevant to commercial
        game NPC design in procedurally generated titles such as Hades, Dead
        Cells, and Spelunky.
      </p>

      {/* ============================================================ */}
      {/* 2. METHODS                                                    */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-methods', { defaultValue: '2. Methods' })}</h2>

      {/* 2.1 Environment Design */}
      <h3 style={h3Style}>{t('rl-subsection-env-design', { defaultValue: '2.1 Environment Design' })}</h3>

      <p className="mb-4">
        We developed a custom roguelike testbed implemented as an OpenAI
        Gymnasium-compatible environment. The environment operates on a
        grid-based dungeon system in which each level consists of procedurally
        arranged rooms connected by corridors. Room dimensions range from 5x5
        to 12x12 cells, and each level contains between 6 and 14 rooms depending
        on the difficulty tier. Rooms are populated with enemies drawn from a
        bestiary of five types (melee, ranged, stationary turret, patrol, and
        swarm), and items are distributed across the level according to a
        Poisson process with a density parameter that scales with difficulty.
        Item types include health potions, damage boosts, shield tokens, and
        keys required to unlock certain doors. Each level contains exactly one
        exit staircase that the agent must reach to successfully complete the
        episode.
      </p>

      <p className="indent-8 mb-4">
        Three environment configurations were defined. The <em>Static</em>{' '}
        configuration uses a single hand-designed dungeon layout of moderate
        difficulty, with fixed enemy and item placements, serving as a
        controlled baseline that isolates the effect of environmental variability.
        The <em>Procedural-Fixed</em> configuration employs a bank of 100
        procedurally generated layouts created in advance from 100 distinct
        random seeds; during training, each episode samples uniformly from this
        bank, introducing structural diversity while permitting eventual
        memorization of all 100 layouts. The <em>Procedural-Random</em>{' '}
        configuration generates a completely new layout from a fresh random seed
        at the start of each episode, ensuring that the agent never encounters
        the same layout twice and must rely entirely on learned generalizable
        policies.
      </p>

      <p className="indent-8 mb-4">
        The observation space is a 15x15 egocentric grid centered on the
        agent&apos;s current position, encoded as an 8-channel tensor. The channels
        represent: (1)&nbsp;wall/floor occupancy, (2)&nbsp;enemy positions,
        (3)&nbsp;enemy health levels, (4)&nbsp;item locations, (5)&nbsp;item
        types, (6)&nbsp;the agent&apos;s own health as a scalar broadcast across
        the grid, (7)&nbsp;a visited-cell map encoding the agent&apos;s
        exploration history, and (8)&nbsp;a goal direction channel providing a
        noisy compass signal toward the exit. The action space consists of five
        discrete actions: movement in the four cardinal directions and an
        interact/attack action that engages the nearest enemy within melee
        range or picks up an adjacent item. Reward shaping was applied to
        encourage desired behaviors: +1 for each enemy defeated, +5 for
        clearing all enemies in a room, +20 for reaching the level exit,
        -0.01 per timestep to discourage dawdling, and -10 for agent death.
        Episodes terminate upon death or after a maximum of 2,000 timesteps.
      </p>

      {/* 2.2 Agent Architecture */}
      <h3 style={h3Style}>{t('rl-subsection-agent-arch', { defaultValue: '2.2 Agent Architecture' })}</h3>

      <p className="mb-4">
        All agents employ Proximal Policy Optimization (PPO; Schulman et al.,
        2017) with a shared convolutional neural network and long short-term
        memory (LSTM) backbone. The convolutional encoder consists of three
        layers with 32, 64, and 64 filters respectively, each using 3x3 kernels
        with stride 1 and ReLU activations, followed by a flattening operation.
        The flattened representation is passed through a fully connected layer
        of 256 units before being fed into an LSTM with 256 hidden units. The
        LSTM output is then projected through separate linear heads for the
        policy (a categorical distribution over five actions) and the value
        function (a scalar estimate of expected return). We chose a recurrent
        architecture because the egocentric partial observability of the
        roguelike environment requires the agent to integrate information across
        multiple timesteps to maintain a coherent internal map of explored areas.
      </p>

      <p className="indent-8 mb-4">
        Hyperparameters were selected via a preliminary grid search on the
        Procedural-Fixed configuration and held constant across all experiments.
        The learning rate was set to 3&times;10<sup>-4</sup> with linear decay
        to zero over the course of training. The PPO clip ratio was 0.2, the
        entropy coefficient was 0.01 to encourage exploration, the value function
        coefficient was 0.5, and the generalized advantage estimation (GAE)
        parameters were &lambda;&nbsp;=&nbsp;0.95 and &gamma;&nbsp;=&nbsp;0.99.
        Rollouts were collected in batches of 2,048 timesteps, and optimization
        was performed with 4 epochs of minibatch SGD per rollout with a
        minibatch size of 64. Gradient norms were clipped to 0.5. Each
        configuration was trained for 10 million timesteps, and every experiment
        was repeated across 5 independent random seeds to permit statistical
        analysis of variance.
      </p>

      {/* 2.3 Curriculum Learning Protocol */}
      <h3 style={h3Style}>{t('rl-subsection-curriculum', { defaultValue: '2.3 Curriculum Learning Protocol' })}</h3>

      <p className="mb-4">
        The curriculum training regime transitions the agent through three
        phases designed to scaffold the acquisition of generalizable skills.
        In Phase&nbsp;1 (timesteps 0 through 2&nbsp;million), the agent trains
        exclusively on the Static environment, allowing it to acquire
        foundational locomotion, combat, and navigation skills in a stable
        setting without the confounding factor of environmental variability.
        In Phase&nbsp;2 (timesteps 2M through 5M), the agent transitions to the
        Procedural-Fixed configuration, exposing it to 100 distinct layouts while
        retaining some opportunity for within-bank memorization as a
        regularization mechanism. In Phase&nbsp;3 (timesteps 5M through 10M),
        the agent trains on the fully Procedural-Random configuration, forcing
        complete reliance on generalizable policies.
      </p>

      <p className="indent-8 mb-4">
        Transitions between phases are not abrupt. Instead, we employ a linear
        interpolation of environment sampling probabilities over a 500,000-step
        window surrounding each phase boundary. For example, during the
        transition from Phase&nbsp;1 to Phase&nbsp;2 (timesteps 1.75M to 2.25M),
        the probability of sampling the static environment decreases linearly
        from 1.0 to 0.0 while the probability of sampling from the
        Procedural-Fixed bank increases correspondingly from 0.0 to 1.0. This
        smooth blending was inspired by domain randomization techniques in
        sim-to-real transfer (Tobin et al., 2017) and is intended to prevent
        catastrophic forgetting that might result from sudden distributional
        shifts in the environment. The transition schedule was determined by
        preliminary experiments comparing abrupt, linear, and sigmoid transition
        functions; linear interpolation yielded the most stable training curves
        and was therefore adopted for all reported experiments.
      </p>

      {/* 2.4 Evaluation */}
      <h3 style={h3Style}>{t('rl-subsection-evaluation', { defaultValue: '2.4 Evaluation' })}</h3>

      <p className="mb-4">
        Evaluation was conducted on a held-out test set of 50 procedurally
        generated layouts that were never encountered during training by any
        agent configuration. These 50 layouts were stratified into three
        difficulty tiers based on enemy density and topological complexity:
        Easy (15 layouts, 1.5&ndash;2.5 enemies per room, simple branching
        structure), Medium (20 layouts, 3.0&ndash;4.5 enemies per room,
        moderate branching with dead ends), and Hard (15 layouts, 5.0&ndash;7.0
        enemies per room, high branching factor with loops and long corridors).
        Difficulty was validated by a panel of human testers who confirmed the
        subjective ordering.
      </p>

      <p className="indent-8 mb-4">
        Three primary metrics were recorded. <em>Completion rate</em> measures
        the percentage of episodes in which the agent successfully reached the
        level exit. <em>Mean reward</em> captures the cumulative shaped reward
        averaged over all evaluation episodes, providing a holistic measure of
        performance that accounts for partial progress. The{' '}
        <em>behavioral diversity index</em> (BDI) quantifies the variety of
        strategies exhibited by the agent, computed as the entropy of a
        discretized action-state histogram over evaluation episodes, normalized
        to the [0,&nbsp;100] range. A high BDI indicates that the agent employs
        different tactics depending on context (e.g., cautious exploration in
        unknown areas, aggressive engagement when well-equipped), whereas a low
        BDI suggests rigid, context-insensitive behavior. Each agent was
        evaluated for 200 episodes per test layout (10,000 episodes total), and
        results are reported as means with standard deviations computed across
        the 5 training seeds.
      </p>

      {/* ============================================================ */}
      {/* 3. RESULTS                                                    */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-results', { defaultValue: '3. Results' })}</h2>

      <p className="mb-4">
        We present three principal analyses: training dynamics (Section 3.1),
        zero-shot generalization to novel environments (Section 3.2), and a
        qualitative behavioral profile analysis (Section 3.3). All statistical
        tests use a significance threshold of &alpha;&nbsp;=&nbsp;0.05 with
        Bonferroni correction for multiple comparisons where applicable.
      </p>

      {/* 3.1 Training Dynamics */}
      <h3 style={h3Style}>{t('rl-subsection-training-dynamics', { defaultValue: '3.1 Training Dynamics' })}</h3>

      <p className="mb-4">
        Figure&nbsp;1 presents the cumulative mean reward as a function of
        training timesteps for all four agent configurations. The Static agent
        exhibited the fastest initial learning, reaching a mean reward of 280 by
        2M timesteps, which is consistent with the reduced sample complexity of
        a fixed MDP. However, its learning curve flattened markedly after 4M
        steps, reaching an asymptotic reward of 462&nbsp;&plusmn;&nbsp;8. The
        Procedural-Fixed agent displayed a more gradual trajectory, achieving
        195 at 2M steps and continuing to improve steadily throughout training
        to reach 442&nbsp;&plusmn;&nbsp;15 at 10M steps. The Procedural-Random
        agent showed the slowest initial progress (130 at 2M steps), reflecting
        the difficulty of learning from a maximally diverse environment
        distribution, but demonstrated the most sustained improvement in the
        later stages of training, reaching 448&nbsp;&plusmn;&nbsp;18 at 10M
        steps and showing no sign of convergence.
      </p>

      <PaperFigure number={1} caption="Cumulative mean reward over training steps for four training regimes. Shaded regions (not shown for clarity) represent ±1 SD across 5 seeds. The curriculum agent achieves the highest final reward while maintaining competitive early learning speed.">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rewardData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="step"
              tick={{ fill: '#374151', fontSize: 11 }}
              label={{ value: 'Training Steps', position: 'insideBottom', offset: -2, fill: '#374151', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#374151', fontSize: 11 }}
              label={{ value: 'Mean Reward', angle: -90, position: 'insideLeft', fill: '#374151', fontSize: 11 }}
            />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="static" name="Static" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="proceduralFixed" name="Procedural-Fixed" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="proceduralRandom" name="Procedural-Random" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="curriculum" name="Curriculum" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="indent-8 mb-4">
        The Curriculum agent achieved the highest final reward of
        465&nbsp;&plusmn;&nbsp;12, statistically indistinguishable from the
        Static agent on seen environments (Welch&apos;s <em>t</em>(8)&nbsp;=&nbsp;0.42,{' '}
        <em>p</em>&nbsp;=&nbsp;.69) but substantially superior in
        generalization tests (see Section&nbsp;3.2). Critically, the Curriculum
        agent&apos;s learning trajectory exhibited a distinctive three-phase
        structure that mirrored its training schedule: rapid initial learning
        during the static phase (0&ndash;2M), a brief deceleration during the
        transition to procedural environments (2M&ndash;3M) as the agent adapted
        to novel layouts, followed by renewed acceleration as the agent began
        to successfully transfer its foundational skills to diverse
        configurations. This pattern suggests that the static pretraining phase
        provides a useful inductive bias — a repertoire of low-level skills —
        that is subsequently refined rather than overwritten during procedural
        training.
      </p>

      {/* 3.2 Zero-Shot Generalization */}
      <h3 style={h3Style}>{t('rl-subsection-zero-shot', { defaultValue: '3.2 Zero-Shot Generalization' })}</h3>

      <p className="mb-4">
        Table&nbsp;1 summarizes the final performance of each agent type across
        all evaluation conditions. The generalization gap — the difference in
        completion rate between seen layouts and the hardest novel layouts — is
        the most revealing statistic and varies dramatically across training
        regimes.
      </p>

      {/* Table 1 */}
      <div className="my-4 overflow-x-auto">
        <p className="text-center mb-2" style={{ fontSize: '10pt', fontWeight: 'bold' }}>
          {t('rl-table1-caption', { defaultValue: 'Table 1. Final performance summary across training regimes and evaluation conditions. Values are means ± SD over 5 seeds.' })}
        </p>
        <table className="w-full border-collapse my-4" style={{ fontSize: '10pt' }}>
          <thead>
            <tr>
              <th style={thStyle}>{t('rl-col-agent-type', { defaultValue: 'Agent Type' })}</th>
              <th style={thStyle}>{t('rl-col-mean-reward', { defaultValue: 'Mean Reward' })}</th>
              <th style={thStyle}>{t('rl-col-seen', { defaultValue: 'Seen (%)' })}</th>
              <th style={thStyle}>{t('rl-col-novel-easy', { defaultValue: 'Novel Easy (%)' })}</th>
              <th style={thStyle}>{t('rl-col-novel-medium', { defaultValue: 'Novel Medium (%)' })}</th>
              <th style={thStyle}>{t('rl-col-novel-hard', { defaultValue: 'Novel Hard (%)' })}</th>
              <th style={thStyle}>{t('rl-col-bdi', { defaultValue: 'BDI' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={thTdStyle}>Static</td>
              <td style={thTdStyle}>462 &plusmn; 8</td>
              <td style={thTdStyle}>95.2 &plusmn; 2.1</td>
              <td style={thTdStyle}>42.4 &plusmn; 6.8</td>
              <td style={thTdStyle}>28.1 &plusmn; 5.4</td>
              <td style={thTdStyle}>12.3 &plusmn; 4.1</td>
              <td style={thTdStyle}>24 &plusmn; 5</td>
            </tr>
            <tr>
              <td style={thTdStyle}>Procedural-Fixed</td>
              <td style={thTdStyle}>442 &plusmn; 15</td>
              <td style={thTdStyle}>88.1 &plusmn; 3.4</td>
              <td style={thTdStyle}>65.3 &plusmn; 4.9</td>
              <td style={thTdStyle}>51.2 &plusmn; 5.7</td>
              <td style={thTdStyle}>33.4 &plusmn; 6.2</td>
              <td style={thTdStyle}>58 &plusmn; 7</td>
            </tr>
            <tr>
              <td style={thTdStyle}>Procedural-Random</td>
              <td style={thTdStyle}>448 &plusmn; 18</td>
              <td style={thTdStyle}>82.4 &plusmn; 4.2</td>
              <td style={thTdStyle}>78.1 &plusmn; 3.5</td>
              <td style={thTdStyle}>71.0 &plusmn; 4.8</td>
              <td style={thTdStyle}>58.2 &plusmn; 5.6</td>
              <td style={thTdStyle}>73 &plusmn; 4</td>
            </tr>
            <tr>
              <td style={thTdStyle}>Curriculum</td>
              <td style={thTdStyle}>465 &plusmn; 12</td>
              <td style={thTdStyle}>90.3 &plusmn; 2.8</td>
              <td style={thTdStyle}>80.2 &plusmn; 3.1</td>
              <td style={thTdStyle}>74.4 &plusmn; 4.3</td>
              <td style={thTdStyle}>62.1 &plusmn; 5.0</td>
              <td style={thTdStyle}>76 &plusmn; 5</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="indent-8 mb-4">
        Figure&nbsp;2 visualizes the completion rates across seen and novel
        environments. The Static agent demonstrated a dramatic generalization
        gap: while achieving 95% completion on seen layouts, its performance
        collapsed to just 12% on hard novel environments — a decline of 83
        percentage points. This result starkly illustrates the danger of
        environmental overfitting: the agent learned a highly specific policy
        that effectively encoded a lookup table of optimal action sequences
        keyed to spatial positions in the training layout, rather than
        learning transferable tactical principles. The Procedural-Fixed agent
        showed moderate generalization (88% seen to 33% hard novel), suggesting
        that exposure to 100 layouts provides some structural diversity but is
        insufficient to cover the full distributional space of the procedural
        generator.
      </p>

      <PaperFigure number={2} caption="Zero-shot generalization: completion rates on seen and novel environments of varying difficulty. Error bars omitted for clarity; see Table 1 for standard deviations.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={generalizationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis dataKey="env" tick={{ fill: '#374151', fontSize: 10 }} />
            <YAxis
              tick={{ fill: '#374151', fontSize: 11 }}
              label={{ value: 'Completion Rate (%)', angle: -90, position: 'insideLeft', fill: '#374151', fontSize: 11 }}
              domain={[0, 100]}
            />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="static" name="Static" fill="#3b82f6" />
            <Bar dataKey="proceduralFixed" name="Procedural-Fixed" fill="#ef4444" />
            <Bar dataKey="proceduralRandom" name="Procedural-Random" fill="#10b981" />
            <Bar dataKey="curriculum" name="Curriculum" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="indent-8 mb-4">
        The Procedural-Random and Curriculum agents achieved the strongest
        generalization performance, maintaining completion rates above 58% even
        on hard novel environments. A two-way ANOVA with agent type and
        difficulty level as factors revealed a significant main effect of agent
        type (<em>F</em>(3,&nbsp;16)&nbsp;=&nbsp;34.21,{' '}
        <em>p</em>&nbsp;&lt;&nbsp;.001), a significant main effect of difficulty
        (<em>F</em>(3,&nbsp;48)&nbsp;=&nbsp;52.67,{' '}
        <em>p</em>&nbsp;&lt;&nbsp;.001), and critically, a significant
        interaction between agent type and difficulty level
        (<em>F</em>(9,&nbsp;48)&nbsp;=&nbsp;8.74,{' '}
        <em>p</em>&nbsp;&lt;&nbsp;.001). Post-hoc Tukey HSD tests confirmed
        that the Curriculum agent&apos;s advantage over Procedural-Random was
        statistically significant on novel hard environments (mean
        difference&nbsp;=&nbsp;3.9 percentage points,{' '}
        <em>p</em>&nbsp;=&nbsp;.041), indicating that the structured training
        progression confers a small but reliable advantage in the most
        challenging generalization conditions. Importantly, the Curriculum
        agent also maintained a higher completion rate on seen environments
        (90.3% vs. 82.4%) compared to the Procedural-Random agent, suggesting
        that the static pretraining phase provides representational benefits
        that are not entirely superseded by subsequent procedural training.
      </p>

      {/* 3.3 Behavioral Profile Analysis */}
      <h3 style={h3Style}>{t('rl-subsection-behavioral', { defaultValue: '3.3 Behavioral Profile Analysis' })}</h3>

      <p className="mb-4">
        To understand the qualitative nature of the policies learned under each
        regime, we conducted a behavioral profile analysis. We recorded complete
        action-observation trajectories for each agent across 1,000 evaluation
        episodes and computed five behavioral dimensions: Exploration (proportion
        of reachable cells visited before exiting), Combat (engagement rate with
        optional enemies), Resource Management (efficiency of item usage relative
        to item collection), Adaptability (variance in action distributions
        across different room types), and Risk Taking (frequency of engaging
        enemies when health is below 30%). Each dimension was normalized to a
        0&ndash;100 scale for visualization.
      </p>

      <PaperFigure number={3} caption="Agent behavioral profile analysis across five dimensions. Static agents show pronounced specialization in combat with minimal exploration and adaptability, while curriculum-trained agents exhibit the most balanced and versatile behavioral repertoire.">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={behaviorData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#d1d5db" />
            <PolarAngleAxis dataKey="trait" tick={{ fill: '#374151', fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} />
            <Radar name="Static" dataKey="static" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            <Radar name="Procedural-Random" dataKey="procedural" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
            <Radar name="Curriculum" dataKey="curriculum" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="indent-8 mb-4">
        Figure&nbsp;3 reveals striking differences in agent behavioral profiles.
        The Static agent developed a highly asymmetric strategy dominated by
        combat (score of 85) with minimal investment in exploration (20) or
        resource management (30). Trajectory inspection confirmed that the
        Static agent learned a near-optimal path through the fixed layout that
        engages enemies in a predetermined sequence, collecting only items that
        lie along this path. This behavior is highly efficient in the training
        environment but catastrophically maladaptive when transferred to novel
        layouts where the memorized path does not exist. The Procedural-Random
        agent exhibited a substantially more balanced profile, with high scores
        in exploration (75) and adaptability (80), reflecting its need to
        navigate unfamiliar topologies each episode. Notably, the Curriculum
        agent achieved the highest scores in exploration (80) and adaptability
        (85) while also maintaining robust combat proficiency (78), suggesting
        that the initial static training phase allows the agent to develop
        strong combat fundamentals that are subsequently augmented rather than
        replaced by the exploration and adaptation skills acquired during
        procedural training.
      </p>

      <p className="indent-8 mb-4">
        Qualitative analysis of individual trajectories revealed several
        emergent behaviors unique to agents trained with environmental
        variability. Procedural-Random and Curriculum agents were observed
        to exhibit <em>backtracking</em> — returning to previously explored
        rooms to collect items that were initially bypassed when the path
        forward was uncertain. They also demonstrated <em>item hoarding</em>,
        accumulating health potions and saving them for use immediately before
        engaging high-density rooms, a behavior entirely absent in Static
        agents which consumed items immediately upon collection. Perhaps most
        strikingly, both Procedural-Random and Curriculum agents developed
        a <em>kiting</em> strategy — drawing ranged enemies into corridors
        where their projectiles could be more easily dodged — a sophisticated
        tactical adaptation to the procedural variation in room and corridor
        geometries. The Curriculum agent exhibited kiting behavior 34% more
        frequently than the Procedural-Random agent, suggesting that the
        foundational combat experience from the static phase provided a
        stable platform upon which this advanced tactic was constructed.
      </p>

      {/* ============================================================ */}
      {/* 4. DISCUSSION                                                 */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-discussion', { defaultValue: '4. Discussion' })}</h2>

      <p className="mb-4">
        The central finding of this study is the magnitude and character of the
        generalization gap in reinforcement learning agents trained for
        procedurally generated roguelike environments. The Static agent, despite
        achieving the highest completion rate on its training environment (95%),
        exhibited a catastrophic 83-percentage-point decline when evaluated on
        hard novel environments. This result underscores a fundamental principle
        that is well-established in supervised learning but often underappreciated
        in RL: memorization is not learning. The Static agent&apos;s high training
        performance reflects the construction of an implicit lookup table mapping
        specific spatial configurations to optimal actions, rather than the
        acquisition of abstract tactical principles that would transfer across
        environments. This phenomenon is analogous to overfitting in supervised
        learning, but its consequences are more severe in RL because the agent&apos;s
        failure mode is not merely reduced accuracy on held-out data but total
        behavioral collapse — the agent wanders aimlessly in novel layouts,
        unable to recognize tactical opportunities that differ from its
        memorized patterns. Our results corroborate and extend the findings of
        Cobbe et al. (2020) and Zhang et al. (2018a), who documented similar
        generalization failures in simpler procedurally generated environments,
        by demonstrating the phenomenon in a complex roguelike setting with
        rich item and enemy dynamics.
      </p>

      <p className="indent-8 mb-4">
        The success of the Curriculum learning approach in achieving the best
        of both worlds — strong performance on seen environments and robust
        generalization to novel ones — has important implications for the design
        of training pipelines for RL agents in procedurally generated games. The
        curriculum achieves this balance through a staged knowledge construction
        process: during the static phase, the agent develops a reliable
        repertoire of low-level skills (movement, combat, item usage) in a
        stable setting where the learning signal is uncontaminated by
        environmental variance. During the subsequent procedural phases, these
        skills are preserved and contextualized — the agent learns <em>when</em>{' '}
        to deploy each skill based on environmental cues rather than spatial
        position. This interpretation is supported by our behavioral analysis,
        which showed that curriculum agents retain high combat proficiency from
        their static training while acquiring the exploration and adaptability
        skills characteristic of procedurally trained agents. The smooth
        transition mechanism between phases plays a critical role, as abrupt
        transitions in our preliminary experiments led to performance collapses
        consistent with catastrophic forgetting (Kirkpatrick et al., 2017).
        Our linear interpolation approach provides a simple yet effective
        mitigation, and future work might explore more sophisticated continual
        learning techniques such as elastic weight consolidation or progressive
        neural networks.
      </p>

      <p className="indent-8 mb-4">
        The emergent behaviors observed in procedurally trained agents —
        backtracking, item hoarding, and kiting — have direct relevance to
        commercial game development. Modern roguelike and roguelite titles such
        as Hades (Supergiant Games, 2020), Dead Cells (Motion Twin, 2018), and
        Spelunky 2 (Mossmouth, 2020) rely on procedural generation to ensure
        replayability, and the design of non-player character (NPC) AI for such
        games requires agents capable of behaving plausibly across an infinite
        variety of generated levels. Our results suggest that NPCs trained
        exclusively on fixed test levels — a common practice in game development
        quality assurance — are likely to exhibit brittle, predictable behavior
        when deployed in procedurally generated production environments.
        Curriculum-based training offers a practical alternative that game
        developers could integrate into existing NPC training pipelines,
        particularly for games where hand-designed initial levels are already
        available as part of tutorial or campaign content. The behavioral
        diversity index we introduce could serve as a practical metric for
        evaluating NPC behavioral richness during development.
      </p>

      <p className="indent-8 mb-4">
        Several limitations of this study should be acknowledged. First, our
        evaluation is restricted to a single roguelike environment, and the
        extent to which our findings generalize to other procedurally generated
        game genres (e.g., platformers, survival games, open-world exploration)
        remains an open empirical question. Second, the discrete action space of
        our environment, while representative of traditional roguelikes, does
        not capture the continuous control challenges present in real-time action
        roguelites. Extending our framework to continuous action spaces with
        algorithms such as SAC (Haarnoja et al., 2018) or TD3 (Fujimoto et al.,
        2018) is a natural direction for future investigation. Third, our study
        considers single-agent scenarios; the interaction between procedural
        generation and multi-agent dynamics (e.g., cooperative dungeon
        exploration, competitive PvP in generated arenas) introduces additional
        complexity that our framework does not address. Finally, our curriculum
        schedule was designed manually based on preliminary experiments; automated
        curriculum generation methods such as POET (Wang et al., 2019) or
        Prioritized Level Replay (Jiang et al., 2021) might discover more
        effective training progressions. Future work should also explore
        hierarchical RL approaches, particularly the option framework
        (Sutton et al., 1999) for sub-goal decomposition, which could provide a
        principled mechanism for the agent to learn reusable tactical modules
        (e.g., &ldquo;clear room,&rdquo; &ldquo;navigate corridor,&rdquo;
        &ldquo;manage inventory&rdquo;) that compose flexibly across procedural
        configurations.
      </p>

      {/* ============================================================ */}
      {/* 5. CONCLUSION                                                 */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-conclusion', { defaultValue: '5. Conclusion' })}</h2>

      <p className="mb-4">
        This study provides comprehensive empirical evidence that curriculum
        learning is the recommended approach for training reinforcement learning
        agents destined for deployment in procedurally generated environments.
        Through systematic comparison of four training regimes in a custom
        roguelike testbed, we demonstrated that agents trained on fixed
        environments develop brittle, narrowly specialized policies that fail
        catastrophically in novel configurations, while agents exposed to
        maximal procedural diversity from the outset learn robust but slowly.
        Curriculum learning resolves this tension by staging the training process:
        foundational skills are acquired efficiently in stable environments and
        subsequently generalized through progressive exposure to procedural
        variation. The resulting agents achieve the highest cumulative reward,
        the strongest generalization to novel environments across all difficulty
        tiers, and the richest behavioral repertoire — combining combat
        proficiency with exploration, resource management, and adaptive
        strategy selection. These findings have immediate practical implications
        for commercial game AI development, where NPC behavioral richness and
        robustness across procedurally generated content are key quality
        metrics. We release our environment, training code, and evaluation
        benchmark to facilitate future research at the intersection of
        reinforcement learning and procedural content generation.
      </p>

      {/* ============================================================ */}
      {/* REFERENCES                                                    */}
      {/* ============================================================ */}
      <h2 style={h2Style}>{t('rl-section-references', { defaultValue: 'References' })}</h2>

      <div style={{ fontSize: '9.5pt', lineHeight: 1.5 }}>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Bengio, Y., Louradour, J., Collobert, R., &amp; Weston, J. (2009).
          Curriculum Learning. <em>Proceedings of the 26th International
          Conference on Machine Learning (ICML)</em>, 41&ndash;48. ACM.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Cobbe, K., Hesse, C., Hilton, J., &amp; Schulman, J. (2020).
          Leveraging Procedural Generation to Benchmark Reinforcement Learning.
          <em> Proceedings of the 37th International Conference on Machine
          Learning (ICML)</em>, PMLR 119, 2048&ndash;2056.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Fujimoto, S., Hoof, H., &amp; Meger, D. (2018). Addressing Function
          Approximation Error in Actor-Critic Methods.{' '}
          <em>Proceedings of the 35th International Conference on Machine
          Learning (ICML)</em>, PMLR 80, 1587&ndash;1596.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Haarnoja, T., Zhou, A., Abbeel, P., &amp; Levine, S. (2018). Soft
          Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning
          with a Stochastic Actor. <em>Proceedings of the 35th International
          Conference on Machine Learning (ICML)</em>, PMLR 80, 1861&ndash;1870.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Jiang, M., Dennis, M., Parker-Holder, J., Foerster, J., Grefenstette,
          E., &amp; Rockt&auml;schel, T. (2021). Replay-Guided Adversarial
          Environment Design. <em>Advances in Neural Information Processing
          Systems (NeurIPS)</em>, 34, 1884&ndash;1897.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Justesen, N., Torrado, R. R., Bontrager, P., Khalifa, A.,
          Togelius, J., &amp; Risi, S. (2018). Illuminating Generalization in
          Deep Reinforcement Learning through Procedural Level Generation.{' '}
          <em>NeurIPS 2018 Workshop on Deep Reinforcement Learning</em>.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Kirkpatrick, J., Pascanu, R., Rabinowitz, N., Veness, J.,
          Desjardins, G., Rusu, A. A., ... &amp; Hadsell, R. (2017).
          Overcoming Catastrophic Forgetting in Neural Networks.{' '}
          <em>Proceedings of the National Academy of Sciences</em>, 114(13),
          3521&ndash;3526.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Mnih, V., Kavukcuoglu, K., Silver, D., Rusu, A. A., Veness, J.,
          Bellemare, M. G., ... &amp; Hassabis, D. (2015). Human-level Control
          through Deep Reinforcement Learning. <em>Nature</em>, 518(7540),
          529&ndash;533.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Narvekar, S., Peng, B., Leonetti, M., Sinapov, J., Taylor, M. E.,
          &amp; Stone, P. (2020). Curriculum Learning for Reinforcement
          Learning Domains: A Framework and Survey. <em>Journal of Machine
          Learning Research</em>, 21(181), 1&ndash;50.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Risi, S., &amp; Togelius, J. (2020). Increasing Generality in Machine
          Learning through Procedural Content Generation.{' '}
          <em>Nature Machine Intelligence</em>, 2(8), 428&ndash;436.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Schulman, J., Wolski, F., Dhariwal, P., Radford, A., &amp;
          Klimov, O. (2017). Proximal Policy Optimization Algorithms.{' '}
          <em>arXiv preprint arXiv:1707.06347</em>.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Silver, D., Huang, A., Maddison, C. J., Guez, A., Sifre, L., van
          den Driessche, G., ... &amp; Hassabis, D. (2016). Mastering the Game
          of Go with Deep Neural Networks and Tree Search. <em>Nature</em>,
          529(7587), 484&ndash;489.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Silver, D., Schrittwieser, J., Simonyan, K., Antonoglou, I.,
          Huang, A., Guez, A., ... &amp; Hassabis, D. (2017). Mastering the
          Game of Go without Human Knowledge. <em>Nature</em>, 550(7676),
          354&ndash;359.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Sutton, R. S., Precup, D., &amp; Singh, S. (1999). Between MDPs and
          Semi-MDPs: A Framework for Temporal Abstraction in Reinforcement
          Learning. <em>Artificial Intelligence</em>, 112(1&ndash;2),
          181&ndash;211.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Tobin, J., Fong, R., Ray, A., Schneider, J., Zaremba, W., &amp;
          Abbeel, P. (2017). Domain Randomization for Transferring Deep Neural
          Networks from Simulation to the Real World. <em>IEEE/RSJ
          International Conference on Intelligent Robots and Systems
          (IROS)</em>, 23&ndash;30.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Vinyals, O., Babuschkin, I., Czarnecki, W. M., Mathieu, M.,
          Dudzik, A., Chung, J., ... &amp; Silver, D. (2019). Grandmaster
          Level in StarCraft II Using Multi-Agent Reinforcement Learning.{' '}
          <em>Nature</em>, 575(7782), 350&ndash;354.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Wang, R., Lehman, J., Clune, J., &amp; Stanley, K. O. (2019).
          Paired Open-Ended Trailblazer (POET): Endlessly Generating
          Increasingly Complex and Diverse Learning Environments and Their
          Solutions. <em>arXiv preprint arXiv:1901.01753</em>.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Zhang, C., Vinyals, O., Munos, R., &amp; Bengio, S. (2018a). A Study
          on Overfitting in Deep Reinforcement Learning.{' '}
          <em>arXiv preprint arXiv:1804.06893</em>.
        </p>
      </div>
    </>
  );
}
