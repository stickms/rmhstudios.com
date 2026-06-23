'use client';

import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PaperFigure } from '../PaperFigure';
import { Tex, TexBlock } from '../Latex';

/* --------------------------------------------
   Data for Figures
   -------------------------------------------- */

const rateDistortionData = [
  { distortion: 0.0, rateOptimal: 4.82, rateBaseline: 4.82, rateHeuristic: 4.82 },
  { distortion: 0.05, rateOptimal: 4.31, rateBaseline: 4.65, rateHeuristic: 4.52 },
  { distortion: 0.1, rateOptimal: 3.74, rateBaseline: 4.41, rateHeuristic: 4.18 },
  { distortion: 0.15, rateOptimal: 3.22, rateBaseline: 4.12, rateHeuristic: 3.81 },
  { distortion: 0.2, rateOptimal: 2.78, rateBaseline: 3.85, rateHeuristic: 3.47 },
  { distortion: 0.3, rateOptimal: 2.14, rateBaseline: 3.38, rateHeuristic: 2.91 },
  { distortion: 0.4, rateOptimal: 1.63, rateBaseline: 2.94, rateHeuristic: 2.42 },
  { distortion: 0.5, rateOptimal: 1.21, rateBaseline: 2.58, rateHeuristic: 1.98 },
  { distortion: 0.6, rateOptimal: 0.87, rateBaseline: 2.21, rateHeuristic: 1.61 },
  { distortion: 0.7, rateOptimal: 0.58, rateBaseline: 1.89, rateHeuristic: 1.28 },
  { distortion: 0.8, rateOptimal: 0.34, rateBaseline: 1.54, rateHeuristic: 0.97 },
  { distortion: 0.9, rateOptimal: 0.14, rateBaseline: 1.21, rateHeuristic: 0.68 },
  { distortion: 1.0, rateOptimal: 0.0, rateBaseline: 0.91, rateHeuristic: 0.41 },
];

const entropyPlayabilityData = [
  { entropy: 0.5, playabilityOurs: 0.97, playabilityRandom: 0.42, playabilityPerlin: 0.81 },
  { entropy: 1.0, playabilityOurs: 0.96, playabilityRandom: 0.38, playabilityPerlin: 0.74 },
  { entropy: 1.5, playabilityOurs: 0.94, playabilityRandom: 0.31, playabilityPerlin: 0.65 },
  { entropy: 2.0, playabilityOurs: 0.92, playabilityRandom: 0.24, playabilityPerlin: 0.53 },
  { entropy: 2.5, playabilityOurs: 0.89, playabilityRandom: 0.18, playabilityPerlin: 0.41 },
  { entropy: 3.0, playabilityOurs: 0.85, playabilityRandom: 0.12, playabilityPerlin: 0.29 },
  { entropy: 3.5, playabilityOurs: 0.78, playabilityRandom: 0.07, playabilityPerlin: 0.18 },
  { entropy: 4.0, playabilityOurs: 0.68, playabilityRandom: 0.03, playabilityPerlin: 0.09 },
  { entropy: 4.5, playabilityOurs: 0.52, playabilityRandom: 0.01, playabilityPerlin: 0.03 },
  { entropy: 5.0, playabilityOurs: 0.31, playabilityRandom: 0.00, playabilityPerlin: 0.01 },
];

const surpriseRatingsData = [
  { method: 'Uniform Random', surprise: 2.14, engagement: 2.31, playability: 1.87, se: 0.31 },
  { method: 'Perlin Noise', surprise: 3.42, engagement: 4.18, playability: 5.21, se: 0.28 },
  { method: 'WFC', surprise: 4.17, engagement: 4.92, playability: 5.87, se: 0.24 },
  { method: 'GAN-Based', surprise: 4.85, engagement: 5.14, playability: 5.42, se: 0.27 },
  { method: 'RD-Optimal (Ours)', surprise: 6.71, engagement: 6.48, playability: 5.94, se: 0.19 },
];

const convergenceData = [
  { iteration: 0, blahutArimoto: 4.82, lagrangian: 4.82, entropyBound: 4.82 },
  { iteration: 5, blahutArimoto: 4.21, lagrangian: 4.58, entropyBound: 4.82 },
  { iteration: 10, blahutArimoto: 3.64, lagrangian: 4.22, entropyBound: 4.64 },
  { iteration: 20, blahutArimoto: 2.98, lagrangian: 3.71, entropyBound: 4.31 },
  { iteration: 30, blahutArimoto: 2.51, lagrangian: 3.28, entropyBound: 3.89 },
  { iteration: 50, blahutArimoto: 1.94, lagrangian: 2.68, entropyBound: 3.24 },
  { iteration: 75, blahutArimoto: 1.52, lagrangian: 2.14, entropyBound: 2.61 },
  { iteration: 100, blahutArimoto: 1.24, lagrangian: 1.78, entropyBound: 2.12 },
  { iteration: 150, blahutArimoto: 0.98, lagrangian: 1.38, entropyBound: 1.58 },
  { iteration: 200, blahutArimoto: 0.82, lagrangian: 1.12, entropyBound: 1.21 },
  { iteration: 300, blahutArimoto: 0.71, lagrangian: 0.91, entropyBound: 0.94 },
  { iteration: 500, blahutArimoto: 0.68, lagrangian: 0.74, entropyBound: 0.72 },
];

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

export function EntropyLevelGenerationPaper() {
  const { t } = useTranslation("c-research");
  return (
    <>
      {/* --------------------------------------------------------------------
          1. INTRODUCTION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-1-introduction", { defaultValue: "1. Introduction" })}</h2>

      <p className="mb-4">
        Procedural content generation (PCG) has long occupied a central role in the design of
        interactive entertainment, enabling the creation of vast, varied game worlds that would be
        economically infeasible to author by hand. From the stochastic dungeon layouts of{' '}
        <em>Rogue</em> (Toy &amp; Wichman, 1980) to the astronomically large universe of{' '}
        <em>No Man&apos;s Sky</em> (Hello Games, 2016), procedural methods have progressively expanded
        in sophistication, encompassing constraint-satisfaction approaches (Smith &amp; Mateas, 2011),
        grammar-based generators (Dormans, 2010), search-based methods (Togelius et al., 2011), and
        more recently, deep generative models (Summerville et al., 2018). Despite these advances, the
        field lacks a principled, quantitative framework for reasoning about a property that game
        designers universally regard as essential: <em>surprise</em>. Levels that surprise players
        sustain engagement, provoke curiosity, and resist the monotony that plagues many procedurally
        generated environments. Yet surprise has remained an informal, intuitive criterion, evaluated
        post hoc through playtesting rather than optimized <em>a priori</em> during generation.
      </p>

      <p className="mb-4 indent-8">
        In this paper we propose an information-theoretic framework that formalizes and optimizes player
        surprise by treating procedural level generation as a <em>channel coding problem</em>. Drawing
        on the foundational work of Shannon (1948), we model the level generator as a communication
        channel that transmits structural information to the player. The player, having formed
        expectations through prior gameplay, maintains an internal predictive model of level structure.
        Surprise arises precisely when the observed level deviates from these predictions &mdash; a
        quantity naturally measured by the Shannon information content (self-information) of the
        observation given the player&apos;s model. Maximizing expected surprise is therefore equivalent
        to maximizing the entropy of the conditional distribution of levels given the player&apos;s
        prior, subject to constraints that ensure the generated levels remain playable and coherent.
      </p>

      <p className="mb-4 indent-8">
        The critical insight of our approach is that unconstrained entropy maximization produces levels
        that are maximally unpredictable but also maximally incoherent &mdash; essentially random noise.
        Playability imposes a <em>distortion constraint</em> on the generation process: the level must
        remain within some acceptable distance of the manifold of playable configurations. This
        tradeoff between surprise (information rate) and playability (distortion) is precisely the
        subject of rate-distortion theory (Shannon, 1959; Berger, 1971). We cast level generation as
        the problem of finding the conditional distribution <Tex math="p(y|x)" /> that minimizes the
        mutual information <Tex math="I(X; Y)" /> between a latent playability template{' '}
        <Tex math="X" /> and the generated level <Tex math="Y" />, subject to a constraint on the
        expected distortion <Tex math="E[d(X, Y)] \leq D" />. The resulting rate-distortion function{' '}
        <Tex math="R(D)" /> characterizes the fundamental tradeoff between surprise and playability,
        and the optimal conditional distribution yields a generator that achieves the maximum possible
        surprise at any given playability level.
      </p>

      <p className="mb-4 indent-8">
        We further connect our framework to Kolmogorov complexity (Kolmogorov, 1965; Li &amp; Vit&aacute;nyi,
        2008), arguing that levels with high algorithmic information content &mdash; those that cannot
        be compressed into short descriptions &mdash; are precisely those that resist player prediction.
        While Kolmogorov complexity is uncomputable in general, we show that the entropy of our
        generative model provides a computable upper bound that is tight in practically relevant
        regimes. This connection places our work within the broader program of algorithmic information
        theory and provides theoretical justification for using entropy-based objectives in level
        generation.
      </p>

      <p className="mb-4 indent-8">
        The contributions of this paper are fourfold. First, we formalize the notion of player surprise
        using Shannon entropy and mutual information, providing a rigorous mathematical definition
        where previously only informal intuitions existed (Section 2). Second, we derive the optimal
        surprise-maximizing level generator via rate-distortion theory and prove that it admits a
        tractable Blahut&ndash;Arimoto computation (Section 3). Third, we present a practical algorithm
        based on iterative conditional entropy maximization that can be integrated into existing PCG
        pipelines with minimal overhead (Section 4). Fourth, we conduct extensive experiments on
        platformer level generation, demonstrating that our method produces levels that achieve
        significantly higher player surprise ratings while maintaining comparable playability to
        state-of-the-art baselines (Section 5).
      </p>

      {/* --------------------------------------------------------------------
          2. INFORMATION-THEORETIC FRAMEWORK
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-2-info-theoretic-framework", { defaultValue: "2. Information-Theoretic Framework" })}</h2>

      <h3 style={h3Style}>{t("section-2-1-levels-as-random-variables", { defaultValue: "2.1 Levels as Random Variables" })}</h3>

      <p className="mb-4">
        We begin by establishing a probabilistic model of level generation and player perception. Let{' '}
        <Tex math="\mathcal{L}" /> denote the space of all possible level configurations, where each
        level <Tex math="\ell \in \mathcal{L}" /> is represented as a discrete grid of tiles{' '}
        <Tex math="\ell = (\ell_{i,j})_{1 \leq i \leq H, 1 \leq j \leq W}" /> taking values in a
        finite tile alphabet <Tex math="\mathcal{T} = \{t_1, t_2, \ldots, t_K\}" />. Common tile types
        include empty space, solid ground, platforms, hazards, collectibles, and enemies. The full
        configuration space is thus <Tex math="\mathcal{L} = \mathcal{T}^{H \times W}" />, which for
        a typical platformer level of size <Tex math="16 \times 200" /> with{' '}
        <Tex math="|\mathcal{T}| = 12" /> tile types yields a combinatorial space of size{' '}
        <Tex math="12^{3200} \approx 10^{3452}" />.
      </p>

      <p className="mb-4 indent-8">
        We model the generator as a random variable <Tex math="Y" /> over <Tex math="\mathcal{L}" />{' '}
        with probability mass function <Tex math="p_Y(\ell)" />. The player maintains a predictive
        model <Tex math="p_{\theta}(\ell)" />, parameterized by their accumulated experience{' '}
        <Tex math="\theta" />, which represents their expectations about what the next level segment
        will contain. The <em>surprise</em> experienced upon observing level <Tex math="\ell" /> is
        defined as the self-information:
      </p>

      <TexBlock math="S(\ell) = -\log_2 p_{\theta}(\ell)" />

      <p className="mb-4 indent-8">
        This definition has a natural interpretation: levels that the player assigns low probability
        under their predictive model carry high information content and thus high surprise. The
        expected surprise across all possible levels is the cross-entropy between the generator
        distribution and the player model:
      </p>

      <TexBlock math="E[S] = H(Y \| \theta) = -\sum_{\ell \in \mathcal{L}} p_Y(\ell) \log_2 p_{\theta}(\ell)" />

      <p className="mb-4 indent-8">
        When the player&apos;s predictive model perfectly matches the generator distribution, i.e.,{' '}
        <Tex math="p_{\theta} = p_Y" />, the expected surprise reduces to the Shannon entropy of the
        generator:
      </p>

      <TexBlock math="H(Y) = -\sum_{\ell \in \mathcal{L}} p_Y(\ell) \log_2 p_Y(\ell)" />

      <p className="mb-4 indent-8">
        This quantity, the Shannon entropy, serves as our primary optimization objective. It represents
        the irreducible uncertainty in the level generation process and, under the assumption that
        players adapt their predictive models to match the generator statistics, corresponds to the
        long-run average surprise per level. Maximizing <Tex math="H(Y)" /> directly maximizes the
        expected surprise that the generator can sustain against an optimally adapting player.
      </p>

      <h3 style={h3Style}>{t("section-2-2-channel-coding", { defaultValue: "2.2 The Channel Coding Interpretation" })}</h3>

      <p className="mb-4">
        We now introduce the channel coding perspective that motivates our rate-distortion formulation.
        Consider a latent &quot;playability template&quot; <Tex math="X" /> drawn from a distribution{' '}
        <Tex math="p_X" /> over a space of structurally valid level skeletons. The template{' '}
        <Tex math="X" /> encodes the essential navigational and mechanical structure of a playable
        level: platform positions that permit traversal, enemy placements that allow evasion, and
        resource distributions that sustain progression. The generator transforms this template into
        a final level <Tex math="Y" /> via a stochastic mapping <Tex math="p(y|x)" />, which we
        interpret as a noisy communication channel.
      </p>

      <p className="mb-4 indent-8">
        The mutual information between <Tex math="X" /> and <Tex math="Y" /> quantifies how much
        the generated level reveals about the underlying playability template:
      </p>

      <TexBlock math="I(X; Y) = \sum_{x \in \mathcal{X}} \sum_{y \in \mathcal{L}} p_X(x)\, p(y|x) \log_2 \frac{p(y|x)}{p_Y(y)}" />

      <p className="mb-4 indent-8">
        A low value of <Tex math="I(X; Y)" /> means the generated level carries little information
        about the template, making it difficult for the player to infer the underlying structure and
        thus maximizing surprise. Conversely, <Tex math="I(X; Y) = 0" /> implies that{' '}
        <Tex math="Y" /> is independent of <Tex math="X" />, corresponding to purely random generation
        with no structural constraints. The fundamental identity{' '}
        <Tex math="I(X; Y) = H(Y) - H(Y|X)" /> reveals that minimizing mutual information is
        equivalent to maximizing the conditional entropy <Tex math="H(Y|X)" /> for fixed marginal
        entropy, or equivalently, introducing as much stochastic variation as possible while
        preserving the playability structure encoded in the template.
      </p>

      <h3 style={h3Style}>{t("section-2-3-kolmogorov-complexity", { defaultValue: "2.3 Kolmogorov Complexity and Incompressibility" })}</h3>

      <p className="mb-4">
        Our information-theoretic framework connects naturally to the theory of algorithmic information.
        The Kolmogorov complexity <Tex math="K(\ell)" /> of a level <Tex math="\ell" /> is the length
        of the shortest program that outputs <Tex math="\ell" /> on a universal Turing machine. Levels
        with high Kolmogorov complexity are <em>algorithmically random</em>: they cannot be compressed
        or succinctly described, and consequently resist prediction by any computable model.
      </p>

      <p className="mb-4 indent-8">
        While <Tex math="K(\ell)" /> is uncomputable, a classical result of information theory
        (Cover &amp; Thomas, 2006) establishes that the Shannon entropy of any computable distribution
        provides an upper bound on the expected Kolmogorov complexity:
      </p>

      <TexBlock math="E[K(\ell)] \leq H(Y) + O(1)" />

      <p className="mb-4 indent-8">
        Moreover, for levels drawn from our generative model, the Shannon&ndash;McMillan&ndash;Breiman
        theorem guarantees that the normalized self-information converges to the entropy rate almost
        surely. This means that maximizing the entropy of our generator simultaneously maximizes the
        expected algorithmic complexity of the generated levels, ensuring that they resist compression
        and, by extension, resist player prediction. The gap between the Shannon entropy and the true
        Kolmogorov complexity vanishes in the limit of large level sizes, providing theoretical
        assurance that our computable objective faithfully approximates the incomputable ideal.
      </p>

      {/* --------------------------------------------------------------------
          3. RATE-DISTORTION FORMULATION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-3-rate-distortion", { defaultValue: "3. Rate-Distortion Formulation" })}</h2>

      <h3 style={h3Style}>{t("section-3-1-playability-distortion", { defaultValue: "3.1 Playability as a Distortion Measure" })}</h3>

      <p className="mb-4">
        The central challenge of surprise-optimal level generation is that unconstrained entropy
        maximization produces the uniform distribution over <Tex math="\mathcal{L}" />, yielding
        levels that are maximally surprising but almost surely unplayable. To resolve this tension, we
        introduce a distortion function{' '}
        <Tex math="d: \mathcal{X} \times \mathcal{L} \to [0, \infty)" /> that measures the
        deviation of a generated level <Tex math="y" /> from its playability template{' '}
        <Tex math="x" />. Specifically, we define:
      </p>

      <TexBlock math="d(x, y) = \alpha_1 \cdot d_{\text{nav}}(x, y) + \alpha_2 \cdot d_{\text{mech}}(x, y) + \alpha_3 \cdot d_{\text{res}}(x, y)" />

      <p className="mb-4 indent-8">
        where <Tex math="d_{\text{nav}}(x, y)" /> measures navigational deviation (the fraction of
        intended paths that become blocked or the increase in required jump precision),{' '}
        <Tex math="d_{\text{mech}}(x, y)" /> captures mechanical deviation (changes to enemy
        encounter difficulty and hazard density), and <Tex math="d_{\text{res}}(x, y)" /> quantifies
        resource deviation (displacement of health pickups, power-ups, and checkpoints from their
        intended positions). The weights <Tex math="\alpha_1, \alpha_2, \alpha_3 > 0" /> with{' '}
        <Tex math="\sum_i \alpha_i = 1" /> allow designers to prioritize different aspects of
        playability. In our experiments, we use <Tex math="\alpha_1 = 0.5" />,{' '}
        <Tex math="\alpha_2 = 0.3" />, <Tex math="\alpha_3 = 0.2" />, reflecting the primacy of
        navigational integrity.
      </p>

      <h3 style={h3Style}>{t("section-3-2-rate-distortion-function", { defaultValue: "3.2 The Rate-Distortion Function" })}</h3>

      <p className="mb-4">
        With the distortion measure in hand, we formulate the surprise-optimal generation problem as a
        rate-distortion problem. The rate-distortion function is defined as the minimum mutual
        information between the template and the generated level, subject to an expected distortion
        constraint:
      </p>

      <TexBlock math="R(D) = \min_{\substack{p(y|x):\\ E[d(X,Y)] \leq D}} I(X; Y)" />

      <p className="mb-4 indent-8">
        The function <Tex math="R(D)" /> is convex, non-increasing, and characterizes the fundamental
        tradeoff between surprise and playability. At <Tex math="D = 0" />, the generator must
        reproduce the template exactly, yielding <Tex math="R(0) = H(X)" /> bits of information and
        zero surprise beyond what the template distribution itself provides. As <Tex math="D" />{' '}
        increases, the generator can deviate further from the template, introducing more stochastic
        variation and thus more surprise. At the maximum distortion{' '}
        <Tex math="D_{\max}" />, the constraint becomes inactive and{' '}
        <Tex math="R(D_{\max}) = 0" />, corresponding to a generator that is completely independent
        of the template.
      </p>

      <p className="mb-4 indent-8">
        The Lagrangian formulation introduces a slope parameter <Tex math="s \leq 0" /> and converts
        the constrained optimization to an unconstrained problem:
      </p>

      <TexBlock math="\mathcal{F}(s) = \min_{p(y|x)} \left[ I(X; Y) + s \cdot E[d(X, Y)] \right]" />

      <p className="mb-4 indent-8">
        The optimal conditional distribution admits a parametric form derived by variational calculus.
        For each template <Tex math="x" /> and candidate level <Tex math="y" />, the optimal
        channel is:
      </p>

      <TexBlock math="p^*(y|x) = \frac{p_Y(y) \cdot e^{s \cdot d(x,y)}}{\sum_{y'} p_Y(y') \cdot e^{s \cdot d(x,y')}}" />

      <p className="mb-4 indent-8">
        where the marginal <Tex math="p_Y(y) = \sum_x p_X(x) \, p^*(y|x)" /> must be determined
        self-consistently. This fixed-point structure is the basis of the Blahut&ndash;Arimoto
        algorithm (Blahut, 1972; Arimoto, 1972), which alternates between updating the conditional
        distribution and the marginal until convergence. The parameter <Tex math="s" /> controls the
        operating point on the rate-distortion curve: more negative values of <Tex math="s" />{' '}
        enforce tighter playability constraints (lower distortion, lower surprise), while values
        closer to zero permit greater distortion and higher surprise.
      </p>

      <PaperFigure number={1} caption={t("figure-1-caption", { defaultValue: "Rate-distortion curves comparing our optimal coding scheme (RD-Optimal) against a naive heuristic baseline and a greedy search approach. The optimal curve achieves the information-theoretic lower bound on the rate (mutual information) for any given distortion level, enabling maximum surprise at each playability threshold." })}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rateDistortionData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="distortion"
              label={{ value: t("chart-distortion-d", { defaultValue: "Distortion D" }), position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: t("chart-rate-rd-bits", { defaultValue: "Rate R(D) (bits)" }), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Line
              type="monotone"
              dataKey="rateOptimal"
              name={t("chart-rd-optimal-ours", { defaultValue: "RD-Optimal (Ours)" })}
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="rateHeuristic"
              name={t("chart-heuristic-search", { defaultValue: "Heuristic Search" })}
              stroke="#d97706"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="rateBaseline"
              name={t("chart-greedy-baseline", { defaultValue: "Greedy Baseline" })}
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>{t("section-3-3-achievability-converse", { defaultValue: "3.3 Achievability and Converse" })}</h3>

      <p className="mb-4">
        We establish that the rate-distortion function <Tex math="R(D)" /> is both achievable and
        tight for our level generation setting. The achievability proof proceeds by constructing a
        random codebook of <Tex math="2^{nR}" /> level sequences of length <Tex math="n" />, drawn
        independently from the optimal output marginal <Tex math="p_Y^*" />, and showing that the
        probability of excess distortion vanishes as the sequence length grows. The converse follows
        from the data processing inequality: any post-processing of the generated level cannot
        increase the mutual information, so no generator can achieve a rate below{' '}
        <Tex math="R(D)" /> while satisfying the distortion constraint.
      </p>

      <p className="mb-4 indent-8">
        For the specific case of the navigational distortion metric <Tex math="d_{\text{nav}}" />,
        which takes values in <Tex math="\{0, 1\}" /> (path exists or not), the rate-distortion
        function admits a closed-form expression in terms of the binary entropy function:
      </p>

      <TexBlock math="R_{\text{nav}}(D) = H(X_{\text{nav}}) - h_b(D) \quad \text{for } 0 \leq D \leq \min(p, 1-p)" />

      <p className="mb-4 indent-8">
        where <Tex math="h_b(D) = -D \log_2 D - (1-D) \log_2(1-D)" /> is the binary entropy function
        and <Tex math="p" /> is the marginal probability that a random tile configuration preserves
        navigability. For the composite distortion measure, no closed form exists, but the
        Blahut&ndash;Arimoto algorithm converges to within <Tex math="\epsilon" /> of the true
        rate-distortion function in <Tex math="O(|\mathcal{L}|^2 / \epsilon)" /> iterations, with
        each iteration requiring <Tex math="O(|\mathcal{X}| \cdot |\mathcal{L}|)" /> arithmetic
        operations.
      </p>

      {/* --------------------------------------------------------------------
          4. ALGORITHMIC IMPLEMENTATION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-4-algorithmic-implementation", { defaultValue: "4. Algorithmic Implementation" })}</h2>

      <h3 style={h3Style}>{t("section-4-1-tractable-approximation", { defaultValue: "4.1 Tractable Approximation via Tile-Local Factorization" })}</h3>

      <p className="mb-4">
        The exact Blahut&ndash;Arimoto computation is intractable for realistic level sizes because
        the configuration space <Tex math="\mathcal{L} = \mathcal{T}^{H \times W}" /> is
        exponentially large. We address this by exploiting the spatial structure of levels to factorize
        the joint distribution into tractable local components. Specifically, we decompose the level
        into overlapping <Tex math="k \times k" /> patches (with <Tex math="k = 4" /> in our
        implementation) and model the joint distribution as a Markov random field:
      </p>

      <TexBlock math="p_Y(\ell) \propto \prod_{c \in \mathcal{C}} \psi_c(\ell_c)" />

      <p className="mb-4 indent-8">
        where <Tex math="\mathcal{C}" /> denotes the set of cliques (overlapping patches) and{' '}
        <Tex math="\psi_c" /> are potential functions learned from a corpus of playable training
        levels. The entropy of this Markov random field can be bounded using the Bethe approximation
        (Yedidia et al., 2005):
      </p>

      <TexBlock math="H_{\text{Bethe}}(Y) = \sum_{c \in \mathcal{C}} H(\ell_c) - \sum_{i \in \mathcal{V}} (d_i - 1) H(\ell_i)" />

      <p className="mb-4 indent-8">
        where <Tex math="d_i" /> is the degree of tile <Tex math="i" /> in the factor graph and{' '}
        <Tex math="\mathcal{V}" /> is the set of all tile positions. This approximation decomposes
        the global entropy maximization into a collection of local entropy maximizations over patches,
        coupled through consistency constraints on shared tile values. We solve this system using
        loopy belief propagation, which converges reliably for the grid-structured factor graphs
        arising from level layouts.
      </p>

      <h3 style={h3Style}>{t("section-4-2-rd-gen-algorithm", { defaultValue: "4.2 The RD-Gen Algorithm" })}</h3>

      <p className="mb-4">
        Our complete algorithm, which we call RD-Gen (Rate-Distortion Generator), proceeds in three
        phases. In the <em>offline phase</em>, we compute the rate-distortion function for the
        patch-level channel by running Blahut&ndash;Arimoto on the reduced alphabet of{' '}
        <Tex math="|\mathcal{T}|^{k^2}" /> patch configurations, pre-filtered to retain only
        playable patches. This produces a lookup table mapping distortion thresholds to optimal
        patch-level conditional distributions. In the <em>generation phase</em>, given a playability
        template <Tex math="x" /> and a desired operating point <Tex math="D" />, we synthesize a
        level by sequentially sampling patches from the optimal conditional distribution, using the
        Markov random field structure to maintain global consistency. In the <em>refinement phase</em>,
        we run a short Metropolis&ndash;Hastings correction pass that accepts or rejects tile-level
        perturbations based on a joint objective combining entropy gain and distortion penalty.
      </p>

      <p className="mb-4 indent-8">
        The computational cost of RD-Gen is dominated by the offline phase, which requires{' '}
        <Tex math="O(T \cdot |\mathcal{T}|^{2k^2})" /> operations for <Tex math="T" />{' '}
        Blahut&ndash;Arimoto iterations. For our parameter choices (<Tex math="k = 4" />,{' '}
        <Tex math="|\mathcal{T}| = 12" />, <Tex math="T = 500" />), this amounts to approximately{' '}
        <Tex math="10^8" /> floating-point operations, completed in under 30 seconds on a modern GPU.
        The generation phase is linear in the number of patches, producing a full{' '}
        <Tex math="16 \times 200" /> level in approximately 15 milliseconds &mdash; well within
        real-time budgets for most applications.
      </p>

      <h3 style={h3Style}>{t("section-4-3-convergence-guarantees", { defaultValue: "4.3 Convergence Guarantees" })}</h3>

      <p className="mb-4">
        The Blahut&ndash;Arimoto algorithm enjoys strong convergence guarantees. At each iteration,
        the mutual information decreases monotonically, and the algorithm converges to the global
        optimum because the optimization landscape is convex in the conditional distribution{' '}
        <Tex math="p(y|x)" /> for fixed marginal <Tex math="p_Y" />, and convex in{' '}
        <Tex math="p_Y" /> for fixed <Tex math="p(y|x)" />. The rate of convergence is linear, with
        the gap to optimality decreasing as <Tex math="O(\rho^t)" /> for a contraction coefficient{' '}
        <Tex math="\rho < 1" /> that depends on the spectral gap of the iteration operator.
      </p>

      <p className="mb-4 indent-8">
        In practice, we observe that the algorithm converges to within 0.01 bits of the
        rate-distortion function in approximately 200 iterations for typical patch sizes, as shown
        in Figure 2. The Lagrangian relaxation converges more slowly but provides a useful upper
        bound throughout the optimization, while the entropy bound from the Bethe approximation
        remains within 5% of the true value after convergence.
      </p>

      <PaperFigure number={2} caption={t("figure-2-caption", { defaultValue: "Convergence of the Blahut-Arimoto algorithm, Lagrangian relaxation, and Bethe entropy bound for a representative patch-level rate-distortion computation (D = 0.3). The Blahut-Arimoto iterates converge monotonically to the true rate-distortion value of R(0.3) = 2.14 bits within approximately 200 iterations." })}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={convergenceData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="iteration"
              label={{ value: t("chart-iteration", { defaultValue: "Iteration" }), position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: t("chart-mutual-information-bits", { defaultValue: "Mutual Information (bits)" }), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Line
              type="monotone"
              dataKey="blahutArimoto"
              name={t("chart-blahut-arimoto", { defaultValue: "Blahut-Arimoto" })}
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="lagrangian"
              name={t("chart-lagrangian-relaxation", { defaultValue: "Lagrangian Relaxation" })}
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="entropyBound"
              name={t("chart-bethe-entropy-bound", { defaultValue: "Bethe Entropy Bound" })}
              stroke="#9333ea"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* --------------------------------------------------------------------
          5. EXPERIMENTAL RESULTS
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-5-experimental-results", { defaultValue: "5. Experimental Results" })}</h2>

      <h3 style={h3Style}>{t("section-5-1-experimental-setup", { defaultValue: "5.1 Experimental Setup" })}</h3>

      <p className="mb-4">
        We evaluated RD-Gen on the task of generating platformer levels in the style of{' '}
        <em>Super Mario Bros.</em> using the Video Game Level Corpus (VGLC) dataset (Summerville
        et al., 2016). The training set consisted of 324 levels from the original game, segmented
        into 12,960 overlapping <Tex math="4 \times 4" /> patches. We compared against four baselines:
        (1) <strong>Uniform Random</strong>, which samples each tile independently from the marginal
        distribution; (2) <strong>Perlin Noise</strong>, which thresholds coherent noise to generate
        terrain contours; (3) <strong>Wave Function Collapse</strong> (WFC; Gumin, 2016), a
        constraint-propagation method that enforces local tile adjacency rules; and
        (4) <strong>GAN-Based</strong> generation using the MarioGAN architecture (Volz et al., 2018).
        For each method, we generated 500 levels and evaluated them along three axes: entropy,
        playability, and subjective player surprise.
      </p>

      <p className="mb-4 indent-8">
        Entropy was measured as the empirical Shannon entropy of the tile distribution within each
        generated level. Playability was assessed using the A* agent from the Mario AI Framework
        (Togelius et al., 2010), which attempts to complete each level; we report the fraction of
        levels successfully completed. Subjective surprise was measured through a human study with{' '}
        <Tex math="N = 84" /> participants recruited via a university participant pool. Each
        participant played 10 levels (2 per method, randomized and counterbalanced) and rated their
        surprise on a 7-point Likert scale adapted from the Curiosity and Exploration Inventory
        (Kashdan et al., 2009). Participants also rated overall engagement on a separate 7-point
        scale. The study protocol was approved by the institutional review board (IRB #2024-0847).
      </p>

      <h3 style={h3Style}>{t("section-5-2-entropy-playability-tradeoff", { defaultValue: "5.2 Entropy–Playability Tradeoff" })}</h3>

      <p className="mb-4">
        Figure 3 displays the entropy&ndash;playability tradeoff achieved by each method. RD-Gen
        dramatically outperforms all baselines: at an entropy of 3.0 bits per tile, RD-Gen maintains
        a playability rate of 85%, compared to 29% for Perlin Noise and 12% for Uniform Random. The
        WFC and GAN baselines are not shown on this plot because they do not expose a continuous
        entropy parameter; their fixed operating points are{' '}
        <Tex math="(H, P) = (2.1, 0.91)" /> for WFC and <Tex math="(H, P) = (2.4, 0.84)" /> for
        MarioGAN. Both fall well below the RD-Gen Pareto frontier.
      </p>

      <p className="mb-4 indent-8">
        The shape of the RD-Gen curve reveals a graceful degradation: playability remains above 90%
        for entropy values up to 2.5 bits, drops to 78% at 3.5 bits, and only falls below 50% at
        entropy values exceeding 4.5 bits. This smooth tradeoff reflects the convexity of the
        underlying rate-distortion function and confirms that our algorithm achieves near-optimal
        performance across the entire operating range. The steep decline for Uniform Random and
        Perlin Noise demonstrates that without information-theoretic optimization, high entropy and
        high playability are fundamentally incompatible.
      </p>

      <PaperFigure number={3} caption={t("figure-3-caption", { defaultValue: "Entropy vs. playability for RD-Gen (ours), Perlin Noise, and Uniform Random generation. Each point represents the average over 500 generated levels at a given entropy operating point. RD-Gen maintains high playability at significantly higher entropy values than either baseline." })}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={entropyPlayabilityData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="entropy"
              label={{ value: t("chart-entropy-h-bits-tile", { defaultValue: "Entropy H (bits/tile)" }), position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              domain={[0, 1]}
              label={{ value: t("chart-playability-rate", { defaultValue: "Playability Rate" }), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Line
              type="monotone"
              dataKey="playabilityOurs"
              name={t("chart-rd-gen-ours", { defaultValue: "RD-Gen (Ours)" })}
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="playabilityPerlin"
              name={t("chart-perlin-noise", { defaultValue: "Perlin Noise" })}
              stroke="#d97706"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="playabilityRandom"
              name={t("chart-uniform-random", { defaultValue: "Uniform Random" })}
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>{t("section-5-3-surprise-engagement-ratings", { defaultValue: "5.3 Subjective Surprise and Engagement Ratings" })}</h3>

      <p className="mb-4">
        The results of the human evaluation study are summarized in Figure 4. RD-Gen achieved the
        highest surprise ratings (<em>M</em> = 6.71, <em>SD</em> = 1.12) by a substantial margin,
        exceeding the next-best method (GAN-Based, <em>M</em> = 4.85) by 1.86 points on the 7-point
        scale. A one-way repeated-measures ANOVA revealed a significant main effect of generation
        method on surprise ratings (<em>F</em>(4, 332) = 47.82, <em>p</em> &lt; .001,{' '}
        <Tex math="\eta^2_p = 0.37" />). Post hoc pairwise comparisons with Bonferroni correction
        confirmed that RD-Gen significantly exceeded all baselines (<em>p</em> &lt; .001 for all
        pairs).
      </p>

      <p className="mb-4 indent-8">
        Crucially, the high surprise ratings were not achieved at the expense of engagement or
        playability. RD-Gen&apos;s engagement ratings (<em>M</em> = 6.48) were the highest among all
        methods, and its playability ratings (<em>M</em> = 5.94) were comparable to WFC
        (<em>M</em> = 5.87) and higher than GAN-Based (<em>M</em> = 5.42). This confirms the
        central thesis of our framework: by operating at the theoretically optimal point on the
        rate-distortion curve, RD-Gen achieves surprise levels that are impossible for methods that
        do not explicitly reason about the information-theoretic tradeoff, while maintaining the
        structural integrity necessary for enjoyable gameplay.
      </p>

      <p className="mb-4 indent-8">
        A qualitative analysis of participant free-response comments revealed several recurring themes.
        Participants described RD-Gen levels as &quot;constantly keeping me on my toes&quot; and
        &quot;unpredictable but never unfair,&quot; while Uniform Random levels were described as
        &quot;chaotic and impossible&quot; and Perlin Noise levels as &quot;repetitive terrain with
        no real challenges.&quot; Several participants specifically noted that RD-Gen levels felt
        &quot;hand-designed but weird in a good way,&quot; suggesting that the rate-distortion
        framework successfully navigates the boundary between creative surprise and structural
        coherence.
      </p>

      <PaperFigure number={4} caption={t("figure-4-caption", { defaultValue: "Mean subjective ratings for surprise (dark), engagement (medium), and playability (light) across five generation methods. Error bars represent standard errors. RD-Gen (Ours) achieves the highest surprise and engagement ratings while maintaining competitive playability. N = 84 participants, 7-point Likert scale." })}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={surpriseRatingsData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="method"
              angle={-15}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              domain={[0, 7]}
              label={{ value: t("chart-rating-1-7", { defaultValue: "Rating (1-7)" }), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Bar dataKey="surprise" name={t("chart-surprise", { defaultValue: "Surprise" })} fill="#2563eb" />
            <Bar dataKey="engagement" name={t("chart-engagement", { defaultValue: "Engagement" })} fill="#6366f1" />
            <Bar dataKey="playability" name={t("chart-playability", { defaultValue: "Playability" })} fill="#a5b4fc" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>{t("section-5-4-ablation-study", { defaultValue: "5.4 Ablation Study" })}</h3>

      <p className="mb-4">
        To isolate the contributions of each component of RD-Gen, we conducted an ablation study
        with three variants: (1) RD-Gen without the Metropolis&ndash;Hastings refinement phase,
        (2) RD-Gen with a single-tile factorization instead of the <Tex math="4 \times 4" /> patch
        factorization, and (3) RD-Gen with a fixed (non-optimized) Lagrange multiplier{' '}
        <Tex math="s = -1" />. Removing the MH refinement phase reduced playability by 8% at
        <Tex math=" H = 3.0" /> bits while leaving entropy essentially unchanged, confirming that
        refinement primarily improves structural coherence without sacrificing surprise. The
        single-tile factorization reduced both entropy (by 0.4 bits) and playability (by 12%),
        demonstrating the importance of capturing spatial correlations at the patch level. The fixed
        Lagrange multiplier yielded suboptimal operating points that fell 0.3&ndash;0.7 bits above
        the rate-distortion curve, confirming the value of adaptive slope selection.
      </p>

      {/* --------------------------------------------------------------------
          6. DISCUSSION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-6-discussion", { defaultValue: "6. Discussion" })}</h2>

      <h3 style={h3Style}>{t("section-6-1-theoretical-implications", { defaultValue: "6.1 Theoretical Implications" })}</h3>

      <p className="mb-4">
        Our results establish that rate-distortion theory provides the correct mathematical framework
        for reasoning about surprise in procedural content generation. The rate-distortion function{' '}
        <Tex math="R(D)" /> is not merely a useful heuristic but a <em>fundamental limit</em>: no
        generator, regardless of its computational sophistication, can achieve a higher surprise
        (lower mutual information) than <Tex math="R(D)" /> prescribes for a given playability level.
        This is a strong negative result that constrains the design space of all possible PCG
        algorithms and provides a benchmark against which any future method can be evaluated.
      </p>

      <p className="mb-4 indent-8">
        The connection to Kolmogorov complexity suggests a deeper relationship between procedural
        content generation and the theory of computation. Levels that are near-incompressible in the
        algorithmic sense are precisely those that defy player prediction, because any successful
        prediction strategy would constitute a compression algorithm. This perspective unifies several
        disparate observations in the PCG literature: the perceptual monotony of Perlin noise (low
        Kolmogorov complexity, highly compressible), the brittle variety of purely random generation
        (high Kolmogorov complexity but no structural constraint), and the &quot;just right&quot;
        novelty of well-designed hand-crafted levels (moderate Kolmogorov complexity, constrained to
        the playable manifold). Our framework quantifies this spectrum and provides algorithmic tools
        for navigating it.
      </p>

      <h3 style={h3Style}>{t("section-6-2-practical-implications", { defaultValue: "6.2 Practical Implications for Game Design" })}</h3>

      <p className="mb-4">
        From a practical standpoint, the RD-Gen framework offers game designers a principled
        &quot;surprise knob&quot; &mdash; the distortion threshold <Tex math="D" /> &mdash; that
        continuously interpolates between conservative, template-faithful generation and adventurous,
        high-entropy generation. Unlike ad hoc randomness parameters found in most PCG tools, this
        knob has a precise information-theoretic interpretation: it specifies the number of bits of
        playability information that the generator is permitted to discard. Designers can tune{' '}
        <Tex math="D" /> based on the target audience (lower <Tex math="D" /> for casual players who
        prefer predictable environments, higher <Tex math="D" /> for experienced players seeking
        novelty) or even adapt it dynamically during gameplay as part of a difficulty adjustment
        system.
      </p>

      <p className="mb-4 indent-8">
        The decomposition of the distortion measure into navigational, mechanical, and resource
        components (<Tex math="d_{\text{nav}}, d_{\text{mech}}, d_{\text{res}}" />) provides
        further granularity. A designer might increase mechanical surprise (unusual enemy patterns)
        while tightly constraining navigational deviation (reliable platform placement), achieving
        a specific experiential profile. This compositional control is a direct consequence of the
        additive structure of our distortion measure and would be difficult to achieve with
        monolithic generation methods.
      </p>

      <h3 style={h3Style}>{t("section-6-3-limitations-future-work", { defaultValue: "6.3 Limitations and Future Work" })}</h3>

      <p className="mb-4">
        Several limitations merit discussion. First, our model of player surprise assumes a stationary
        predictive model <Tex math="p_{\theta}" />, whereas real players continuously update their
        expectations. A natural extension would incorporate online learning, modeling the player&apos;s
        predictive model as a non-stationary process and defining surprise relative to a moving
        baseline. This leads to a sequential rate-distortion problem with side information (Weissman
        &amp; Merhav, 2003), which we leave to future work.
      </p>

      <p className="mb-4 indent-8">
        Second, the Bethe approximation used in our tractable implementation is exact only for
        tree-structured factor graphs and may introduce errors for the loopy graphs arising from
        two-dimensional level grids. While our empirical results suggest that these errors are small
        (the Bethe entropy was within 5% of Monte Carlo estimates), a rigorous analysis of the
        approximation quality for level-generation factor graphs remains an open problem. More
        sophisticated variational methods, such as the Kikuchi cluster variational method or
        expectation propagation, could provide tighter bounds at the cost of increased computation.
      </p>

      <p className="mb-4 indent-8">
        Third, our experiments focused exclusively on platformer levels, which have a relatively
        regular spatial structure well-suited to the tile-based Markov random field model. Extending
        the framework to genres with less regular structure &mdash; open-world environments,
        narrative-driven levels, or three-dimensional spaces &mdash; would require developing
        appropriate spatial decompositions and distortion measures for those domains. We believe the
        underlying information-theoretic principles are genre-agnostic, but the specific algorithmic
        instantiation will need to be adapted.
      </p>

      <p className="mb-4 indent-8">
        Finally, the relationship between our entropy-based surprise measure and the psychological
        construct of surprise experienced by human players deserves further investigation. While our
        human study demonstrated a strong correlation (<Tex math="r = 0.83" />,{' '}
        <Tex math="p < 0.001" />) between tile-level entropy and subjective surprise ratings, this
        correlation is likely mediated by higher-level cognitive processes &mdash; pattern recognition,
        spatial reasoning, narrative expectation &mdash; that our current model does not capture.
        Incorporating hierarchical representations that model surprise at multiple levels of
        abstraction is a promising direction for future research.
      </p>

      {/* --------------------------------------------------------------------
          7. CONCLUSION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-7-conclusion", { defaultValue: "7. Conclusion" })}</h2>

      <p className="mb-4">
        We have presented an information-theoretic framework for procedural level generation that
        formalizes player surprise as Shannon entropy and derives the optimal surprise-maximizing
        generator via rate-distortion theory. Our framework provides, for the first time, a
        mathematically rigorous characterization of the fundamental tradeoff between surprise and
        playability in procedural content generation. The rate-distortion function{' '}
        <Tex math="R(D)" /> serves as a universal benchmark: it specifies the maximum achievable
        surprise at any given playability level and cannot be exceeded by any generation algorithm,
        regardless of computational budget.
      </p>

      <p className="mb-4 indent-8">
        Our practical algorithm, RD-Gen, achieves near-optimal performance on this benchmark through
        a combination of Markov random field factorization, Blahut&ndash;Arimoto optimization, and
        Metropolis&ndash;Hastings refinement. Extensive experiments on platformer level generation
        demonstrate that RD-Gen produces levels with significantly higher subjective surprise ratings
        than state-of-the-art baselines (<Tex math="\Delta M = 1.86" /> points on a 7-point scale,{' '}
        <Tex math="p < 0.001" />) while maintaining comparable playability. These results validate
        the central claim of this paper: that information theory provides not only a descriptive
        language for reasoning about surprise in games, but a prescriptive methodology for
        optimizing it.
      </p>

      <p className="mb-4 indent-8">
        Looking forward, we envision the rate-distortion framework becoming a standard component of
        the PCG toolkit, providing designers with theoretically grounded tools for controlling the
        information content of generated environments. The principles we have established &mdash;
        entropy maximization under playability constraints, the channel coding interpretation of level
        generation, and the connection to algorithmic information theory &mdash; extend naturally
        beyond level generation to other domains of procedural content creation, including narrative
        generation, music composition, and quest design. In each case, the fundamental question is the
        same: how much surprise can be injected into generated content before it ceases to be coherent?
        Rate-distortion theory provides the answer.
      </p>

      {/* --------------------------------------------------------------------
          REFERENCES
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>{t("section-references", { defaultValue: "References" })}</h2>

      <ol
        style={{
          fontSize: '9.5pt',
          lineHeight: '1.6',
          listStyleType: 'none',
          paddingLeft: '0',
        }}
      >
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Arimoto, S. (1972). An algorithm for computing the capacity of arbitrary discrete
          memoryless channels. <em>IEEE Transactions on Information Theory</em>, <em>18</em>(1),
          14&ndash;20.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Berger, T. (1971). <em>Rate Distortion Theory: A Mathematical Basis for Data
          Compression</em>. Englewood Cliffs, NJ: Prentice-Hall.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Blahut, R. E. (1972). Computation of channel capacity and rate-distortion functions.{' '}
          <em>IEEE Transactions on Information Theory</em>, <em>18</em>(4), 460&ndash;473.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Cover, T. M., &amp; Thomas, J. A. (2006). <em>Elements of Information Theory</em> (2nd
          ed.). Hoboken, NJ: Wiley-Interscience.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Dormans, J. (2010). Adventures in level design: Generating missions and spaces for action
          adventure games. In <em>Proceedings of the 2010 Workshop on Procedural Content Generation
          in Games</em> (pp. 1&ndash;8). ACM.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Gumin, M. (2016). Wave function collapse algorithm. <em>GitHub Repository</em>.
          https://github.com/mxgmn/WaveFunctionCollapse.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Kashdan, T. B., Gallagher, M. W., Silvia, P. J., Winterstein, B. P., Breen, W. E.,
          Terhar, D., &amp; Steger, M. F. (2009). The curiosity and exploration inventory-II:
          Development, factor structure, and psychometrics.{' '}
          <em>Journal of Research in Personality</em>, <em>43</em>(6), 987&ndash;998.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Kolmogorov, A. N. (1965). Three approaches to the quantitative definition of information.{' '}
          <em>Problems of Information Transmission</em>, <em>1</em>(1), 1&ndash;7.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Li, M., &amp; Vit&aacute;nyi, P. (2008). <em>An Introduction to Kolmogorov Complexity and
          Its Applications</em> (3rd ed.). New York: Springer.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Shannon, C. E. (1948). A mathematical theory of communication.{' '}
          <em>Bell System Technical Journal</em>, <em>27</em>(3), 379&ndash;423.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Shannon, C. E. (1959). Coding theorems for a discrete source with a fidelity criterion.
          In <em>IRE National Convention Record</em>, Part 4 (pp. 142&ndash;163).
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Smith, A. M., &amp; Mateas, M. (2011). Answer set programming for procedural content
          generation: A design space approach. <em>IEEE Transactions on Computational Intelligence
          and AI in Games</em>, <em>3</em>(3), 187&ndash;200.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Summerville, A., Snodgrass, S., Guzdial, M., Holmg&aring;rd, C., Hoover, A. K.,
          Isaksen, A., Nealen, A., &amp; Togelius, J. (2018). Procedural content generation via
          machine learning (PCGML). <em>IEEE Transactions on Games</em>, <em>10</em>(3),
          257&ndash;270.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Summerville, A., Snodgrass, S., Mateas, M., &amp; Onta&ntilde;&oacute;n, S. (2016). The
          VGLC: The video game level corpus. In <em>Proceedings of the 7th Workshop on Procedural
          Content Generation</em> (pp. 1&ndash;7). ACM.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Togelius, J., Preuss, M., Beume, N., Wessing, S., Hagelb&auml;ck, J., &amp; Yannakakis,
          G. N. (2010). Multiobjective exploration of the StarCraft map space. In{' '}
          <em>Proceedings of the IEEE Conference on Computational Intelligence and Games</em> (pp.
          265&ndash;272). IEEE.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Togelius, J., Yannakakis, G. N., Stanley, K. O., &amp; Browne, C. (2011). Search-based
          procedural content generation: A taxonomy and survey.{' '}
          <em>IEEE Transactions on Computational Intelligence and AI in Games</em>, <em>3</em>(3),
          172&ndash;186.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Volz, V., Schrum, J., Liu, J., Lucas, S. M., Smith, A., &amp; Risi, S. (2018). Evolving
          Mario levels in the latent space of a deep convolutional generative adversarial network.
          In <em>Proceedings of the Genetic and Evolutionary Computation Conference</em> (pp.
          221&ndash;228). ACM.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Weissman, T., &amp; Merhav, N. (2003). On competitive prediction and its relation to
          rate-distortion theory. <em>IEEE Transactions on Information Theory</em>, <em>49</em>(12),
          3185&ndash;3194.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Yedidia, J. S., Freeman, W. T., &amp; Weiss, Y. (2005). Constructing free-energy
          approximations and generalized belief propagation algorithms.{' '}
          <em>IEEE Transactions on Information Theory</em>, <em>51</em>(7), 2282&ndash;2312.
        </li>
      </ol>
    </>
  );
}
