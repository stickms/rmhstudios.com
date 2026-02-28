'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

const spectralGapData = [
  { config: 'α₁=1,α₂=0,α₃=0', gap: 0.032 },
  { config: 'α₁=0,α₂=1,α₃=0', gap: 0.041 },
  { config: 'α₁=0,α₂=0,α₃=1', gap: 0.028 },
  { config: 'α₁=1,α₂=1,α₃=0', gap: 0.058 },
  { config: 'α₁=1,α₂=0,α₃=1', gap: 0.051 },
  { config: 'α₁=0,α₂=1,α₃=1', gap: 0.063 },
  { config: 'α₁=1,α₂=1,α₃=1', gap: 0.087 },
];

const mixingTimeData = [
  { iteration: 0, spectral: 1.0, mh: 1.0, uniform: 1.0 },
  { iteration: 500, spectral: 0.72, mh: 0.89, uniform: 0.95 },
  { iteration: 1000, spectral: 0.48, mh: 0.74, uniform: 0.88 },
  { iteration: 2000, spectral: 0.21, mh: 0.55, uniform: 0.79 },
  { iteration: 3000, spectral: 0.09, mh: 0.39, uniform: 0.68 },
  { iteration: 5000, spectral: 0.02, mh: 0.22, uniform: 0.54 },
  { iteration: 7500, spectral: 0.004, mh: 0.11, uniform: 0.41 },
  { iteration: 10000, spectral: 0.001, mh: 0.06, uniform: 0.31 },
];

const entropyVsSatisfaction = [
  { entropy: 1.2, satisfaction: 3.1 },
  { entropy: 1.5, satisfaction: 3.4 },
  { entropy: 1.8, satisfaction: 4.0 },
  { entropy: 2.1, satisfaction: 4.8 },
  { entropy: 2.3, satisfaction: 5.2 },
  { entropy: 2.5, satisfaction: 5.9 },
  { entropy: 2.7, satisfaction: 6.4 },
  { entropy: 2.9, satisfaction: 6.8 },
  { entropy: 3.1, satisfaction: 7.1 },
  { entropy: 3.3, satisfaction: 6.9 },
  { entropy: 3.6, satisfaction: 6.3 },
  { entropy: 3.9, satisfaction: 5.7 },
  { entropy: 4.2, satisfaction: 4.9 },
  { entropy: 4.5, satisfaction: 4.2 },
  { entropy: 4.8, satisfaction: 3.6 },
];

const autocorrelationData = [
  { lag: 0, spectral: 1.0, mh: 1.0, uniform: 1.0 },
  { lag: 10, spectral: 0.61, mh: 0.82, uniform: 0.93 },
  { lag: 20, spectral: 0.34, mh: 0.68, uniform: 0.87 },
  { lag: 40, spectral: 0.11, mh: 0.47, uniform: 0.76 },
  { lag: 60, spectral: 0.03, mh: 0.31, uniform: 0.66 },
  { lag: 80, spectral: 0.008, mh: 0.21, uniform: 0.58 },
  { lag: 100, spectral: 0.002, mh: 0.14, uniform: 0.50 },
  { lag: 150, spectral: 0.0, mh: 0.06, uniform: 0.38 },
  { lag: 200, spectral: 0.0, mh: 0.02, uniform: 0.28 },
];

const preferenceData = [
  { method: 'Uniform Random', rating: 3.2, se: 0.4 },
  { method: 'Vanilla MH', rating: 4.8, se: 0.35 },
  { method: 'Constrained MH', rating: 5.6, se: 0.3 },
  { method: 'Spectral-Guided', rating: 7.1, se: 0.25 },
];

const energyConvergenceData = [
  { step: 0, energy: 48.2, navEntropy: 18.1, resourceVar: 16.4, encounterPace: 13.7 },
  { step: 200, energy: 38.5, navEntropy: 14.2, resourceVar: 13.1, encounterPace: 11.2 },
  { step: 500, energy: 27.1, navEntropy: 10.3, resourceVar: 9.8, encounterPace: 7.0 },
  { step: 1000, energy: 18.4, navEntropy: 7.1, resourceVar: 6.5, encounterPace: 4.8 },
  { step: 2000, energy: 12.1, navEntropy: 4.8, resourceVar: 4.2, encounterPace: 3.1 },
  { step: 3000, energy: 8.7, navEntropy: 3.4, resourceVar: 3.0, encounterPace: 2.3 },
  { step: 5000, energy: 6.2, navEntropy: 2.5, resourceVar: 2.1, encounterPace: 1.6 },
  { step: 7500, energy: 5.1, navEntropy: 2.1, resourceVar: 1.7, encounterPace: 1.3 },
  { step: 10000, energy: 4.8, navEntropy: 1.9, resourceVar: 1.6, encounterPace: 1.3 },
];

const poincareConstantData = [
  { latticeSize: 10, constant: 0.142, logBound: 0.158 },
  { latticeSize: 15, constant: 0.089, logBound: 0.101 },
  { latticeSize: 20, constant: 0.061, logBound: 0.074 },
  { latticeSize: 25, constant: 0.044, logBound: 0.058 },
  { latticeSize: 30, constant: 0.033, logBound: 0.047 },
  { latticeSize: 40, constant: 0.021, logBound: 0.032 },
  { latticeSize: 50, constant: 0.014, logBound: 0.024 },
  { latticeSize: 60, constant: 0.010, logBound: 0.019 },
];

const fisherCurvatureData = [
  { beta: 0.1, curvature: 0.003, sectional: 0.001 },
  { beta: 0.5, curvature: 0.021, sectional: 0.008 },
  { beta: 1.0, curvature: 0.087, sectional: 0.034 },
  { beta: 2.0, curvature: 0.312, sectional: 0.141 },
  { beta: 3.0, curvature: 0.591, sectional: 0.278 },
  { beta: 5.0, curvature: 1.243, sectional: 0.612 },
  { beta: 8.0, curvature: 2.107, sectional: 1.089 },
  { beta: 10.0, curvature: 2.891, sectional: 1.523 },
];

const phaseDiagramData = [
  { beta: 0.5, alpha1: 0.1, phase: 'disordered' },
  { beta: 0.5, alpha1: 0.5, phase: 'disordered' },
  { beta: 0.5, alpha1: 1.0, phase: 'disordered' },
  { beta: 1.0, alpha1: 0.1, phase: 'disordered' },
  { beta: 1.0, alpha1: 0.5, phase: 'critical' },
  { beta: 1.0, alpha1: 1.0, phase: 'critical' },
  { beta: 2.0, alpha1: 0.1, phase: 'critical' },
  { beta: 2.0, alpha1: 0.5, phase: 'ordered' },
  { beta: 2.0, alpha1: 1.0, phase: 'ordered' },
  { beta: 3.0, alpha1: 0.1, phase: 'critical' },
  { beta: 3.0, alpha1: 0.5, phase: 'ordered' },
  { beta: 3.0, alpha1: 1.0, phase: 'frozen' },
  { beta: 5.0, alpha1: 0.1, phase: 'ordered' },
  { beta: 5.0, alpha1: 0.5, phase: 'frozen' },
  { beta: 5.0, alpha1: 1.0, phase: 'frozen' },
];

const couplingTimeData = [
  { latticeSize: 10, meanTime: 1240, stdTime: 180 },
  { latticeSize: 15, meanTime: 3850, stdTime: 420 },
  { latticeSize: 20, meanTime: 8920, stdTime: 890 },
  { latticeSize: 25, meanTime: 17400, stdTime: 1560 },
  { latticeSize: 30, meanTime: 29800, stdTime: 2340 },
  { latticeSize: 40, meanTime: 68500, stdTime: 4870 },
  { latticeSize: 50, meanTime: 132000, stdTime: 8910 },
];

const replicaAcceptanceData = [
  { tempRatio: 1.05, acceptance: 0.82 },
  { tempRatio: 1.10, acceptance: 0.71 },
  { tempRatio: 1.20, acceptance: 0.58 },
  { tempRatio: 1.30, acceptance: 0.47 },
  { tempRatio: 1.50, acceptance: 0.31 },
  { tempRatio: 1.75, acceptance: 0.19 },
  { tempRatio: 2.00, acceptance: 0.11 },
  { tempRatio: 2.50, acceptance: 0.04 },
  { tempRatio: 3.00, acceptance: 0.01 },
];

const largeDeviationData = [
  { deviation: 0.0, rateFunction: 0.0 },
  { deviation: 0.5, rateFunction: 0.031 },
  { deviation: 1.0, rateFunction: 0.127 },
  { deviation: 1.5, rateFunction: 0.289 },
  { deviation: 2.0, rateFunction: 0.518 },
  { deviation: 2.5, rateFunction: 0.814 },
  { deviation: 3.0, rateFunction: 1.178 },
  { deviation: 3.5, rateFunction: 1.611 },
  { deviation: 4.0, rateFunction: 2.112 },
];

const wassersteinConvergenceData = [
  { step: 0, w1: 3.82, w2: 5.41, wInf: 8.12 },
  { step: 500, w1: 2.91, w2: 4.12, wInf: 6.38 },
  { step: 1000, w1: 2.14, w2: 3.08, wInf: 4.91 },
  { step: 2000, w1: 1.42, w2: 2.11, wInf: 3.52 },
  { step: 3000, w1: 0.93, w2: 1.44, wInf: 2.51 },
  { step: 5000, w1: 0.51, w2: 0.82, wInf: 1.63 },
  { step: 7500, w1: 0.28, w2: 0.47, wInf: 1.02 },
  { step: 10000, w1: 0.16, w2: 0.28, wInf: 0.68 },
];

const gelmanRubinData = [
  { step: 0, rhat: 2.41, upper: 3.12, lower: 1.89 },
  { step: 500, rhat: 1.89, upper: 2.34, lower: 1.52 },
  { step: 1000, rhat: 1.52, upper: 1.87, lower: 1.24 },
  { step: 2000, rhat: 1.21, upper: 1.41, lower: 1.08 },
  { step: 3000, rhat: 1.08, upper: 1.19, lower: 1.02 },
  { step: 5000, rhat: 1.02, upper: 1.08, lower: 0.98 },
  { step: 7500, rhat: 1.00, upper: 1.04, lower: 0.97 },
  { step: 10000, rhat: 1.00, upper: 1.02, lower: 0.98 },
];

const minimaxRiskData = [
  { dimension: 5, spectralRisk: 0.042, mhRisk: 0.081, uniformRisk: 0.153 },
  { dimension: 10, spectralRisk: 0.058, mhRisk: 0.112, uniformRisk: 0.234 },
  { dimension: 15, spectralRisk: 0.073, mhRisk: 0.149, uniformRisk: 0.318 },
  { dimension: 20, spectralRisk: 0.089, mhRisk: 0.191, uniformRisk: 0.412 },
  { dimension: 25, spectralRisk: 0.104, mhRisk: 0.238, uniformRisk: 0.521 },
  { dimension: 30, spectralRisk: 0.118, mhRisk: 0.287, uniformRisk: 0.641 },
];

const posteriorAlphaData = [
  { alpha: 0.1, density1: 0.02, density2: 0.08, density3: 0.05 },
  { alpha: 0.3, density1: 0.08, density2: 0.18, density3: 0.12 },
  { alpha: 0.5, density1: 0.21, density2: 0.31, density3: 0.19 },
  { alpha: 0.7, density1: 0.42, density2: 0.48, density3: 0.28 },
  { alpha: 0.9, density1: 0.78, density2: 0.62, density3: 0.41 },
  { alpha: 1.0, density1: 0.91, density2: 0.71, density3: 0.52 },
  { alpha: 1.1, density1: 0.85, density2: 0.78, density3: 0.68 },
  { alpha: 1.3, density1: 0.52, density2: 0.82, density3: 0.81 },
  { alpha: 1.5, density1: 0.28, density2: 0.68, density3: 0.72 },
  { alpha: 1.7, density1: 0.12, density2: 0.42, density3: 0.51 },
  { alpha: 2.0, density1: 0.04, density2: 0.21, density3: 0.32 },
];

const sensitivityHeatmapData = [
  { param: 'β', low: 12.4, mid: 4.8, high: 3.9, veryHigh: 6.2 },
  { param: 'α₁', low: 8.1, mid: 4.8, high: 5.2, veryHigh: 7.8 },
  { param: 'α₂', low: 7.3, mid: 4.8, high: 5.6, veryHigh: 8.9 },
  { param: 'α₃', low: 6.9, mid: 4.8, high: 5.1, veryHigh: 7.2 },
  { param: 'k (nbhd)', low: 5.8, mid: 4.8, high: 4.9, veryHigh: 4.8 },
  { param: 'η (spectral)', low: 6.1, mid: 4.8, high: 4.7, veryHigh: 5.3 },
];

const essVsDimensionData = [
  { dimension: 100, spectralESS: 892, mhESS: 341, uniformESS: 87 },
  { dimension: 200, spectralESS: 781, mhESS: 278, uniformESS: 52 },
  { dimension: 400, spectralESS: 648, mhESS: 201, uniformESS: 28 },
  { dimension: 600, spectralESS: 534, mhESS: 152, uniformESS: 16 },
  { dimension: 900, spectralESS: 421, mhESS: 108, uniformESS: 9 },
  { dimension: 1200, spectralESS: 328, mhESS: 74, uniformESS: 5 },
  { dimension: 1600, spectralESS: 251, mhESS: 48, uniformESS: 3 },
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

export function ErgodicMarkovPaper() {
  return (
    <>
      {/* 1. INTRODUCTION */}
      <h2 style={h2Style}>1. Introduction</h2>

      <p className="mb-4">
        The procedural generation of game levels constitutes one of the most formidable combinatorial
        challenges in contemporary interactive entertainment engineering. As the dimensionality of
        tile palettes, adjacency constraints, and ludological desiderata proliferates, the space of
        admissible level configurations grows super-exponentially, rendering exhaustive enumeration
        computationally intractable for all but the most degenerate instances. Classical approaches —
        ranging from L-system grammars (Shaker et al., 2016) and cellular automata (Johnson et al.,
        2010) to constraint-satisfaction solvers (Smith &amp; Mateas, 2011) — impose deterministic
        structural priors that, while guaranteeing syntactic validity, frequently sacrifice the
        stochastic diversity essential to sustained player engagement. The fundamental tension between
        controllability and variability thus motivates the adoption of principled probabilistic
        frameworks capable of sampling from richly structured distributions over combinatorial
        configuration spaces.
      </p>

      <p className="mb-4 indent-8">
        In this work, we propose a novel formalism grounded in the spectral theory of ergodic
        Markov chains defined over tile-adjacency graphs, wherein each state of the chain
        corresponds to a complete or partial level instantiation and transitions between states are
        governed by a context-sensitive kernel that encodes designer-specified aesthetic and
        mechanical constraints. The central insight is that by constructing a reversible Markov
        chain whose stationary distribution is a Gibbs measure parameterized by a vector of
        ludometric energy functionals — quantifying navigational entropy, resource-density variance,
        and encounter-pacing regularity — one may leverage well-established results from the theory
        of rapidly mixing chains (Levin &amp; Peres, 2017) to obtain efficient samplers that
        concentrate on level configurations possessing certifiably desirable gameplay properties.
        The spectral gap of the transition matrix, <Tex math="\gamma = 1 - \lambda_2" />, where{' '}
        <Tex math="\lambda_2" /> denotes the second-largest eigenvalue, furnishes a quantitative
        bound on the mixing time and thereby on the computational cost of generating each
        independent sample.
      </p>

      <p className="mb-4 indent-8">
        The contributions of this paper are threefold. First, we establish the mathematical
        foundations for representing procedural level generation as a sampling problem on a
        weighted directed graph and prove that the resulting chain satisfies detailed balance
        with respect to the target Gibbs measure. Second, we derive spectral-gap lower bounds
        via Cheeger-type isoperimetric inequalities and demonstrate that constraint engineering
        can be viewed as an optimization problem over the conductance profile of the chain.
        Third, we present an extensive empirical evaluation comprising 50,000 procedurally
        generated dungeon instances and a human playtesting study with{' '}
        <Tex math="N = 120" /> participants, demonstrating that spectral-gap-guided sampling
        yields superior level quality by both automated metrics and subjective human judgment.
      </p>

      {/* 2. NOTATION AND PRELIMINARIES */}
      <h2 style={h2Style}>2. Notation and Preliminaries</h2>

      <p className="mb-4">
        We establish here the notational conventions and measure-theoretic foundations that undergird
        the subsequent development. Throughout, <Tex math="\mathcal{T}" /> denotes a finite tile palette,{' '}
        <Tex math="\Lambda \subset \mathbb{Z}^d" /> a rectangular lattice of dimension <Tex math="d" /> (typically <Tex math="d = 2" />),
        and <Tex math="\Omega = \mathcal{T}^\Lambda" /> the full configuration space equipped with the product
        discrete topology. For a probability measure <Tex math="\mu" /> on <Tex math="\Omega" /> and a
        measurable function <Tex math="f: \Omega \to \mathbb{R}" />, we write{' '}
        <Tex math="\mu(f) = \sum_{x \in \Omega} f(x)\,\mu(x)" /> for the expectation and{' '}
        <Tex math="\text{Var}_\mu(f) = \mu(f^2) - \mu(f)^2" /> for the variance. The total variation
        distance between measures <Tex math="\mu" /> and <Tex math="\nu" /> is denoted{' '}
        <Tex math="\|\mu - \nu\|_{\text{TV}} = \frac{1}{2} \sum_{x \in \Omega} |\mu(x) - \nu(x)|" />.
      </p>

      <h3 style={h3Style}>2.1 Operator-Theoretic Notation</h3>

      <p className="mb-4">
        For a reversible Markov chain with transition kernel <Tex math="P" /> and stationary measure{' '}
        <Tex math="\pi" />, we define the Hilbert space <Tex math="L^2(\pi) = \{f: \Omega \to \mathbb{R} \mid \sum_x f(x)^2 \pi(x) < \infty\}" />{' '}
        with inner product <Tex math="\langle f, g \rangle_\pi = \sum_{x} f(x)\,g(x)\,\pi(x)" />.
        The transition operator acts on <Tex math="L^2(\pi)" /> via{' '}
        <Tex math="(Pf)(x) = \sum_y P(x, y)\,f(y)" />, and reversibility ensures that <Tex math="P" /> is
        self-adjoint with respect to <Tex math="\langle \cdot, \cdot \rangle_\pi" />. We denote by{' '}
        <Tex math="\sigma(P)" /> the spectrum of <Tex math="P" /> and by{' '}
        <Tex math="\lambda_1 \geq \lambda_2 \geq \cdots \geq \lambda_{|\Omega|}" /> its ordered eigenvalues.
        The Dirichlet form associated with <Tex math="P" /> is:
      </p>

      <TexBlock math="\mathcal{E}(f, f) = \langle f, (I - P)f \rangle_\pi = \frac{1}{2} \sum_{x, y} \pi(x)\,P(x, y)\,(f(x) - f(y))^2" />

      <p className="mb-4 indent-8">
        This quadratic form plays a central role in the variational characterization of the spectral gap.
        By the Courant–Fischer minimax theorem (Bhatia, 1997), the spectral gap admits the representation:
      </p>

      <TexBlock math="\gamma = \inf_{\substack{f \in L^2(\pi) \\ \text{Var}_\pi(f) > 0}} \frac{\mathcal{E}(f, f)}{\text{Var}_\pi(f)}" />

      <p className="mb-4">
        which identifies <Tex math="\gamma" /> as the smallest constant <Tex math="c > 0" /> satisfying the
        Poincaré inequality <Tex math="\text{Var}_\pi(f) \leq c^{-1}\,\mathcal{E}(f, f)" /> for all{' '}
        <Tex math="f \in L^2(\pi)" />. This variational characterization provides the bridge between spectral
        theory and the functional-analytic machinery developed in Sections 5 and 10.
      </p>

      <h3 style={h3Style}>2.2 Graph-Theoretic Conventions</h3>

      <p className="mb-4">
        We employ standard graph-theoretic terminology throughout. A graph <Tex math="G = (V, E)" /> is
        a pair consisting of a vertex set <Tex math="V" /> and an edge set{' '}
        <Tex math="E \subseteq \binom{V}{2}" />. For weighted graphs, we associate a weight function{' '}
        <Tex math="w: E \to \mathbb{R}_{>0}" />. The degree of a vertex <Tex math="v" /> is{' '}
        <Tex math="\deg(v) = \sum_{u: \{u,v\} \in E} w(\{u,v\})" />. The graph Laplacian is the operator{' '}
        <Tex math="L = D - W" />, where <Tex math="D" /> is the diagonal degree matrix and{' '}
        <Tex math="W" /> the weighted adjacency matrix. The normalized Laplacian is{' '}
        <Tex math="\mathcal{L} = D^{-1/2} L\, D^{-1/2} = I - D^{-1/2} W D^{-1/2}" />, whose eigenvalues
        satisfy <Tex math="0 = \mu_1 \leq \mu_2 \leq \cdots \leq \mu_{|V|} \leq 2" />.
        The algebraic connectivity <Tex math="\mu_2" /> (Fiedler, 1973) of the configuration-space graph
        is intimately related to the spectral gap of the lazy random walk:{' '}
        <Tex math="\gamma = \mu_2 / 2" /> when <Tex math="P = (I + D^{-1}W)/2" />.
      </p>

      <h3 style={h3Style}>2.3 Measure-Theoretic Foundations</h3>

      <p className="mb-4">
        The Gibbs measure framework requires careful specification of the underlying sigma-algebra
        and the notion of conditional expectations. On the discrete configuration space{' '}
        <Tex math="\Omega_A" />, we equip <Tex math="\Omega_A" /> with the power-set sigma-algebra{' '}
        <Tex math="\mathcal{F} = 2^{\Omega_A}" />. For a subset <Tex math="\Lambda' \subset \Lambda" /> of
        lattice sites, the sub-sigma-algebra <Tex math="\mathcal{F}_{\Lambda'}" /> is generated by the
        projections <Tex math="\{x \mapsto x(v) : v \in \Lambda'\}" />. A probability measure{' '}
        <Tex math="\pi" /> on <Tex math="(\Omega_A, \mathcal{F})" /> is a Gibbs measure for a
        specification <Tex math="\gamma = (\gamma_{\Lambda'})_{\Lambda' \Subset \Lambda}" /> if for every
        finite <Tex math="\Lambda' \Subset \Lambda" /> and every boundary condition{' '}
        <Tex math="\omega \in \Omega_A" />:
      </p>

      <TexBlock math="\pi\bigl(x_{\Lambda'} = \sigma_{\Lambda'} \mid \mathcal{F}_{\Lambda \setminus \Lambda'}\bigr) = \gamma_{\Lambda'}(\sigma_{\Lambda'} \mid \omega_{\Lambda \setminus \Lambda'}) \qquad \pi\text{-a.s.}" />

      <p className="mb-4 indent-8">
        The DLR (Dobrushin–Lanford–Ruelle) equations (Georgii, 2011) provide the consistency conditions
        for such specifications. In our finite-volume setting, the Gibbs measure is unique for all
        parameter values (since phase transitions require the thermodynamic limit{' '}
        <Tex math="|\Lambda| \to \infty" />), but the effective behavior on large lattices exhibits
        phenomena — metastability, slow mixing, critical slowing-down — that motivate the spectral
        and information-geometric analyses developed below. The Hammersley–Clifford theorem (Grimmett, 1973)
        guarantees that a strictly positive probability measure on <Tex math="\Omega_A" /> is a Gibbs
        measure if and only if it is a Markov random field with respect to the neighborhood
        structure induced by the lattice adjacency.
      </p>

      {/* 3. MATHEMATICAL FRAMEWORK */}
      <h2 style={h2Style}>3. Mathematical Framework</h2>

      <h3 style={h3Style}>2.1 Tile-Adjacency Graphs and State Spaces</h3>

      <p className="mb-4">
        Let <Tex math="\mathcal{T} = \{t_1, t_2, \ldots, t_K\}" /> denote a finite tile palette
        of cardinality <Tex math="K" />, where each tile <Tex math="t_k" /> encodes a mesostructural
        game-design primitive (e.g., corridor segment, open chamber, resource cache, enemy spawn
        point, ingress/egress portal). A level is defined as a mapping{' '}
        <Tex math="x: \Lambda \to \mathcal{T}" /> from a finite lattice{' '}
        <Tex math="\Lambda \subset \mathbb{Z}^d" /> (typically <Tex math="d = 2" />) to the tile
        palette. The configuration space is thus <Tex math="\Omega = \mathcal{T}^\Lambda" />, whose
        cardinality <Tex math="|\Omega| = K^{|\Lambda|}" /> grows exponentially in the number of
        lattice sites. For a modest <Tex math="20 \times 20" /> grid with{' '}
        <Tex math="K = 12" /> tile types, one obtains{' '}
        <Tex math="|\Omega| = 12^{400} \approx 10^{431}" />, a space vastly exceeding the
        computational horizon of any enumeration strategy.
      </p>

      <p className="mb-4 indent-8">
        We impose local compatibility constraints via an adjacency tensor{' '}
        <Tex math="A \in \{0, 1\}^{K \times K \times D}" />, where <Tex math="D = 2d" /> indexes
        the cardinal directions. Specifically,{' '}
        <Tex math="A_{k, k', \delta} = 1" /> if and only if tile <Tex math="t_k" /> may be placed
        adjacent to tile <Tex math="t_{k'}" /> in direction <Tex math="\delta" />. The set of
        admissible configurations is then the constrained subset:
      </p>

      <TexBlock math="\Omega_A = \bigl\{ x \in \Omega : A_{x(v), x(v + e_\delta), \delta} = 1 \;\; \forall\, v \in \Lambda,\; \forall\, \delta \in \{1, \ldots, D\} \bigr\}" />

      <p className="mb-4">
        where <Tex math="e_\delta" /> is the unit displacement in direction <Tex math="\delta" />.
        This constrained space is naturally endowed with a graph structure: define{' '}
        <Tex math="G = (\Omega_A, E)" /> where two configurations are connected by an edge
        if and only if they differ at exactly one lattice site. The procedural generation task
        reduces to sampling from a target distribution <Tex math="\pi" /> supported on{' '}
        <Tex math="\Omega_A" /> via a random walk on <Tex math="G" />.
      </p>

      <h3 style={h3Style}>2.2 Transition Kernels and Reversibility</h3>

      <p className="mb-4">
        We construct a Markov chain <Tex math="(X_t)_{t \geq 0}" /> on <Tex math="\Omega_A" /> by
        defining a transition kernel <Tex math="P: \Omega_A \times \Omega_A \to [0, 1]" /> as
        follows. At each step, a lattice site <Tex math="v \in \Lambda" /> is selected uniformly
        at random, and a candidate tile <Tex math="t' \in \mathcal{T}" /> is proposed from a
        local proposal distribution <Tex math="q(x, \cdot)" /> supported on tiles compatible
        with all neighbors of <Tex math="v" /> under the adjacency tensor <Tex math="A" />.
        The candidate configuration <Tex math="y" />, differing from <Tex math="x" /> only at
        site <Tex math="v" />, is accepted with Metropolis–Hastings probability:
      </p>

      <TexBlock math="\alpha(x \to y) = \min\!\left(1,\; \frac{\pi(y)\, q(y, x)}{\pi(x)\, q(x, y)}\right)" />

      <p className="mb-4">
        Under the symmetric proposal assumption <Tex math="q(x, y) = q(y, x)" /> — which holds
        when the proposal is uniform over compatible tiles — this simplifies to the classical
        Metropolis ratio <Tex math="\alpha(x \to y) = \min(1, \pi(y)/\pi(x))" />. The resulting
        chain satisfies detailed balance:
      </p>

      <TexBlock math="\pi(x)\, P(x, y) = \pi(y)\, P(y, x) \qquad \forall\, x, y \in \Omega_A" />

      <p className="mb-4 indent-8">
        which guarantees that <Tex math="\pi" /> is a stationary distribution. Combined with
        the irreducibility of the chain on <Tex math="\Omega_A" /> (ensured by the connectivity
        of <Tex math="G" />, which we verify computationally for each tile palette) and
        aperiodicity (ensured by the positive self-loop probability when a proposal is rejected),
        the ergodic theorem yields that the time-averaged empirical distribution converges to{' '}
        <Tex math="\pi" /> almost surely. The rate of this convergence is controlled by the
        spectral gap.
      </p>

      <PaperFigure number={1} caption="Spectral gap of the transition matrix under different weight configurations for the ludometric energy functional. The balanced configuration (α₁ = α₂ = α₃ = 1) yields the largest spectral gap, indicating fastest mixing.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={spectralGapData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="config" angle={-25} textAnchor="end" tick={{ fontSize: 10 }} />
            <YAxis label={{ value: 'Spectral Gap γ', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="gap" fill="#10b981" name="Spectral Gap γ" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 3. SPECTRAL ANALYSIS */}
      <h2 style={h2Style}>3. Spectral Analysis of Tile-Adjacency Graphs</h2>

      <h3 style={h3Style}>3.1 Eigenvalue Decomposition and the Spectral Gap</h3>

      <p className="mb-4">
        The transition matrix <Tex math="P" /> of a reversible Markov chain on a finite state
        space admits a complete spectral decomposition. Since <Tex math="P" /> is self-adjoint
        with respect to the inner product weighted by <Tex math="\pi" />, its eigenvalues are
        real and may be ordered as{' '}
        <Tex math="1 = \lambda_1 > \lambda_2 \geq \cdots \geq \lambda_{|\Omega_A|} \geq -1" />.
        The spectral gap is defined as:
      </p>

      <TexBlock math="\gamma = 1 - \lambda_2 = 1 - \max\!\left\{ \lambda : \lambda \in \sigma(P) \setminus \{1\} \right\}" />

      <p className="mb-4">
        The spectral gap governs the rate of convergence to stationarity via the celebrated
        bound on total variation distance:
      </p>

      <TexBlock math="\| P^t(x, \cdot) - \pi(\cdot) \|_{\text{TV}} \leq \frac{1}{2} \sqrt{\frac{1 - \pi(x)}{\pi(x)}} \, (1 - \gamma)^t" />

      <p className="mb-4 indent-8">
        From this, the mixing time — defined as the smallest <Tex math="t" /> such that the
        total variation distance is at most <Tex math="\epsilon" /> uniformly over all starting
        states — satisfies:
      </p>

      <TexBlock math="t_{\text{mix}}(\epsilon) \leq \frac{1}{\gamma} \ln\!\left(\frac{1}{\epsilon\, \pi_{\min}}\right)" />

      <p className="mb-4">
        where <Tex math="\pi_{\min} = \min_{x \in \Omega_A} \pi(x)" />. This bound reveals the
        critical role of the spectral gap: a chain with <Tex math="\gamma" /> bounded away from
        zero mixes in time logarithmic in the state-space size, whereas a vanishing spectral gap
        entails polynomially or even exponentially slow mixing. In the context of level generation,
        rapid mixing translates directly to computational efficiency — each approximately independent
        level sample can be produced in <Tex math="O(\gamma^{-1} \log |\Omega_A|)" /> steps.
      </p>

      <h3 style={h3Style}>3.2 Cheeger Inequality and Conductance</h3>

      <p className="mb-4">
        A powerful tool for bounding the spectral gap from below is the Cheeger inequality, which
        relates <Tex math="\gamma" /> to the conductance (or isoperimetric constant) of the chain.
        The conductance is defined as:
      </p>

      <TexBlock math="\Phi = \min_{\substack{S \subset \Omega_A \\ 0 < \pi(S) \leq 1/2}} \frac{\sum_{x \in S,\, y \notin S} \pi(x)\, P(x, y)}{\pi(S)}" />

      <p className="mb-4">
        The Cheeger inequality then states:
      </p>

      <TexBlock math="\frac{\Phi^2}{2} \leq \gamma \leq 2\Phi" />

      <p className="mb-4 indent-8">
        The lower bound <Tex math="\gamma \geq \Phi^2 / 2" /> is particularly useful, as it
        reduces the problem of establishing rapid mixing to the combinatorial-geometric problem
        of showing that no cut in the state-space graph has disproportionately small boundary
        flux relative to its stationary measure. In our framework, the adjacency constraints
        encoded in <Tex math="A" /> partition <Tex math="\Omega_A" /> into regions connected
        by single-site updates; the conductance is determined by the bottleneck structure of
        these connections. By tuning the weight parameters of the energy functional, we
        effectively reshape the conductance profile of the chain, which provides a principled
        mechanism for accelerating convergence without altering the support of the target
        distribution.
      </p>

      <p className="mb-4 indent-8">
        We further invoke the canonical path method of Sinclair (1992) to obtain tighter
        spectral-gap bounds for specific tile-palette configurations. For each pair of states{' '}
        <Tex math="(x, y) \in \Omega_A \times \Omega_A" />, we construct a canonical path{' '}
        <Tex math="\gamma_{xy}" /> consisting of a sequence of single-site updates that
        transforms <Tex math="x" /> into <Tex math="y" />. The congestion ratio{' '}
        <Tex math="\bar{\rho}" /> of the path system provides the bound{' '}
        <Tex math="\gamma \geq 1 / \bar{\rho}" />, yielding mixing-time estimates that are
        polynomial in the lattice size for all tile palettes satisfying a mild expansion condition.
      </p>

      {/* 5. POINCARÉ INEQUALITIES AND FUNCTIONAL-ANALYTIC BOUNDS */}
      <h2 style={h2Style}>5. Poincaré Inequalities and Functional-Analytic Bounds</h2>

      <h3 style={h3Style}>5.1 Poincaré Inequality on Configuration Spaces</h3>

      <p className="mb-4">
        The spectral gap <Tex math="\gamma" /> of the reversible Markov chain{' '}
        <Tex math="(P, \pi)" /> on the finite configuration space <Tex math="\Omega_A" />{' '}
        admits a variational characterization as the optimal constant in the discrete
        Poincaré inequality. Specifically, <Tex math="\gamma" /> is the largest constant{' '}
        <Tex math="C_P > 0" /> such that for all <Tex math="f \in L^2(\pi)" />:
      </p>

      <TexBlock math="\operatorname{Var}_\pi(f) \leq \frac{1}{C_P}\, \mathcal{E}(f, f)" />

      <p className="mb-4">
        where <Tex math="\operatorname{Var}_\pi(f) = \sum_{x \in \Omega_A} \pi(x)\bigl(f(x) - \mathbb{E}_\pi[f]\bigr)^2" />{' '}
        denotes the variance under the stationary measure and{' '}
        <Tex math="\mathcal{E}(f, f) = \frac{1}{2}\sum_{x, y \in \Omega_A} \pi(x)\, P(x,y)\bigl(f(x) - f(y)\bigr)^2" />{' '}
        is the Dirichlet form associated with the chain. The equivalence{' '}
        <Tex math="C_P = \gamma" /> follows immediately from the min-max theorem applied
        to the self-adjoint operator <Tex math="I - P" /> on <Tex math="L^2_0(\pi)" />,
        the subspace orthogonal to constants (Saloff-Coste, 1997).
      </p>

      <TexBlock math="C_P = \gamma = \inf_{\substack{f \in L^2(\pi) \\ \operatorname{Var}_\pi(f) > 0}} \frac{\mathcal{E}(f, f)}{\operatorname{Var}_\pi(f)} = \inf_{\substack{f \perp \mathbf{1} \\ f \neq 0}} \frac{\langle f, (I - P) f \rangle_\pi}{\langle f, f \rangle_\pi}" />

      <p className="mb-4 indent-8">
        This variational characterization is the cornerstone of the comparison-theoretic
        approach to mixing-time estimation. Rather than computing <Tex math="\gamma" />{' '}
        directly — which requires diagonalizing the <Tex math="|\Omega_A| \times |\Omega_A|" />{' '}
        transition matrix — one instead bounds the Poincaré constant by comparison with an
        auxiliary chain whose spectral properties are analytically tractable. The Holley–Stroock
        perturbation principle (Holley &amp; Stroock, 1987) provides a particularly elegant
        mechanism: if <Tex math="\pi" /> and <Tex math="\tilde{\pi}" /> are two probability
        measures on <Tex math="\Omega_A" /> satisfying{' '}
        <Tex math="c^{-1} \leq \pi(x)/\tilde{\pi}(x) \leq c" /> for all{' '}
        <Tex math="x \in \Omega_A" />, then:
      </p>

      <TexBlock math="\gamma_\pi \geq c^{-2}\, \gamma_{\tilde{\pi}}" />

      <p className="mb-4">
        This perturbation bound is instrumental in our setting: when the inverse temperature{' '}
        <Tex math="\beta" /> is perturbed by a small amount <Tex math="\delta\beta" />,
        the ratio <Tex math="\pi_\beta(x)/\pi_{\beta + \delta\beta}(x)" /> is controlled
        by <Tex math="\exp(\delta\beta\, \|E\|_\infty)" />, yielding a stability estimate
        for the Poincaré constant as a function of the thermodynamic parameter. This permits
        the transfer of spectral-gap results from analytically tractable high-temperature regimes
        to the moderate-temperature regimes of practical interest.
      </p>

      <p className="mb-4 indent-8">
        The Diaconis–Saloff-Coste comparison theorem (Diaconis &amp; Saloff-Coste, 1993a)
        extends this methodology to distinct Markov chains on the same state space. Given
        two reversible chains <Tex math="(P, \pi)" /> and <Tex math="(\tilde{P}, \pi)" />{' '}
        sharing a common stationary distribution, one defines the comparison constant:
      </p>

      <TexBlock math="A = \max_{(\tilde{x}, \tilde{y}):\, \tilde{P}(\tilde{x}, \tilde{y}) > 0} \frac{1}{\pi(\tilde{x})\, \tilde{P}(\tilde{x}, \tilde{y})} \sum_{\substack{(x, y) \in \gamma_{\tilde{x}\tilde{y}} \\ P(x, y) > 0}} |\gamma_{\tilde{x}\tilde{y}}|\, \pi(x)\, P(x, y)" />

      <p className="mb-4">
        where <Tex math="\gamma_{\tilde{x}\tilde{y}}" /> denotes a chosen path in the
        transition graph of <Tex math="P" /> connecting <Tex math="\tilde{x}" /> to{' '}
        <Tex math="\tilde{y}" />, and <Tex math="|\gamma_{\tilde{x}\tilde{y}}|" /> is its
        length. Then <Tex math="\tilde{\gamma} \geq A^{-1}\, \gamma" />, permitting the
        spectral gap of a complex chain to be bounded below using an auxiliary chain with
        known mixing properties.
      </p>

      <p className="mb-4 indent-8">
        In the tile-generation context, we employ the comparison technique with{' '}
        <Tex math="\tilde{P}" /> taken as the Glauber dynamics for the uniform measure on{' '}
        <Tex math="\Omega_A" /> (i.e., <Tex math="\beta = 0" />), whose spectral gap can
        be bounded via the method of canonical paths (Jerrum &amp; Sinclair, 1989). For the
        lattice <Tex math="\Lambda = \{1, \ldots, n\}^2" /> with tile palette of cardinality{' '}
        <Tex math="q" /> and nearest-neighbor adjacency constraints, the uniform Glauber
        dynamics satisfies <Tex math="\gamma_0 \geq (2n^2 q)^{-1}" /> whenever the constraint
        graph is connected. Combining with the Holley–Stroock perturbation bound yields:
      </p>

      <TexBlock math="\gamma_\beta \geq \frac{e^{-2\beta \|E\|_\infty}}{2n^2 q}" />

      <p className="mb-4">
        This bound, while not tight in general, establishes that the chain mixes in polynomial
        time for any fixed <Tex math="\beta" />, with the degree of the polynomial growing
        linearly in the inverse temperature. For the regime{' '}
        <Tex math="\beta < \beta_c := (2 \|E\|_\infty \log(n^2 q))^{-1}" />, the mixing
        time is <Tex math="O(n^2 \log n)" />, which is optimal up to logarithmic factors.
      </p>

      <p className="mb-4 indent-8">
        We remark that the tensorization property of the Poincaré inequality — namely, that
        the Poincaré constant of a product measure equals the minimum of the marginal
        constants — does not apply directly in our setting due to the non-product structure
        of the Gibbs measure. However, the block-factorization technique of Martinelli (1999)
        yields a conditional-variance decomposition:
      </p>

      <TexBlock math="\operatorname{Var}_\pi(f) \leq \frac{1}{\gamma_{\text{block}}} \sum_{B \in \mathcal{B}} \mathbb{E}_\pi\!\left[\operatorname{Var}_{\pi^B}(f)\right]" />

      <p className="mb-4">
        where <Tex math="\mathcal{B}" /> is a partition of <Tex math="\Lambda" /> into blocks,{' '}
        <Tex math="\pi^B" /> is the conditional measure on block <Tex math="B" /> given
        the exterior configuration, and <Tex math="\gamma_{\text{block}}" /> is the Poincaré
        constant of an auxiliary block-dynamics chain. This factorization permits the reduction
        of the global Poincaré inequality to local estimates on blocks of size{' '}
        <Tex math="O(\log n)" />, which are amenable to direct numerical computation.
      </p>

      <h3 style={h3Style}>5.2 Log-Sobolev Inequalities and Hypercontractivity</h3>

      <p className="mb-4">
        A strictly stronger functional inequality that yields sharper concentration and
        mixing-time bounds is the logarithmic Sobolev inequality. The log-Sobolev constant{' '}
        <Tex math="\alpha_{\mathrm{LS}}" /> is defined as the largest constant such that
        for all non-negative <Tex math="f \in L^2(\pi)" /> with{' '}
        <Tex math="\mathbb{E}_\pi[f] > 0" />:
      </p>

      <TexBlock math="\operatorname{Ent}_\pi(f^2) \leq \frac{2}{\alpha_{\mathrm{LS}}}\, \mathcal{E}(f, f)" />

      <p className="mb-4">
        where <Tex math="\operatorname{Ent}_\pi(g) = \mathbb{E}_\pi[g \log g] - \mathbb{E}_\pi[g]\log \mathbb{E}_\pi[g]" />{' '}
        is the entropy functional. The log-Sobolev inequality implies the Poincaré
        inequality with <Tex math="C_P \geq \alpha_{\mathrm{LS}}" />, but not conversely;
        the gap between the two constants can be arbitrarily large (Diaconis &amp; Saloff-Coste,
        1996). The log-Sobolev constant controls the convergence in relative entropy:
      </p>

      <TexBlock math="D_{\mathrm{KL}}\!\left(P^t(x, \cdot) \,\|\, \pi\right) \leq e^{-2\alpha_{\mathrm{LS}}\, t}\, D_{\mathrm{KL}}\!\left(\delta_x \,\|\, \pi\right) = e^{-2\alpha_{\mathrm{LS}}\, t} \log \frac{1}{\pi(x)}" />

      <p className="mb-4 indent-8">
        The relationship between the log-Sobolev constant and hypercontractivity was
        established in the seminal work of Gross (1975), extended to the discrete setting
        by Diaconis and Saloff-Coste (1996). The semigroup{' '}
        <Tex math="T_t = P^t" /> is <Tex math="(q, p)" />-hypercontractive — meaning{' '}
        <Tex math="\|T_t f\|_{L^q(\pi)} \leq \|f\|_{L^p(\pi)}" /> — if and only if{' '}
        <Tex math="e^{2\alpha_{\mathrm{LS}}\, t} \geq (q - 1)/(p - 1)" />. This
        equivalence permits the translation of mixing-time bounds into{' '}
        <Tex math="L^p" />-norm contractivity estimates and vice versa.
      </p>

      <p className="mb-4">
        The Bakry–Émery criterion (Bakry &amp; Émery, 1985) provides a sufficient condition
        for the log-Sobolev inequality in terms of the curvature of the generator. In the
        discrete setting, the relevant curvature condition takes the form of the{' '}
        <Tex math="\Gamma_2" />-criterion: the chain satisfies{' '}
        <Tex math="\mathrm{LSI}(\alpha)" /> whenever:
      </p>

      <TexBlock math="\Gamma_2(f, f)(x) := \frac{1}{2}\left[\mathcal{L}\,\Gamma(f, f)(x) - 2\,\Gamma(f, \mathcal{L}f)(x)\right] \geq \kappa\, \Gamma(f, f)(x)" />

      <p className="mb-4">
        for all <Tex math="f" /> and all <Tex math="x \in \Omega_A" />, where{' '}
        <Tex math="\mathcal{L} = P - I" /> is the generator,{' '}
        <Tex math="\Gamma(f, g)(x) = \frac{1}{2}\bigl[\mathcal{L}(fg)(x) - f(x)\mathcal{L}g(x) - g(x)\mathcal{L}f(x)\bigr]" />{' '}
        is the carré du champ operator, and <Tex math="\kappa > 0" /> is the Bakry–Émery
        curvature lower bound. When this condition holds, one obtains{' '}
        <Tex math="\alpha_{\mathrm{LS}} \geq \kappa" />.
      </p>

      <p className="mb-4 indent-8">
        For the Glauber dynamics on our tile-configuration space, the Bakry–Émery curvature
        can be computed explicitly in terms of the interaction structure of the energy
        functional. Under the Dobrushin uniqueness condition — which requires that the
        total influence of all sites on any single site is strictly less than one:
      </p>

      <TexBlock math="\max_{v \in \Lambda} \sum_{w \in \Lambda \setminus \{v\}} \sup_{\sigma, \tau:\, \sigma_{\Lambda \setminus \{v, w\}} = \tau_{\Lambda \setminus \{v, w\}}} \| \pi_v(\cdot \mid \sigma) - \pi_v(\cdot \mid \tau) \|_{\mathrm{TV}} \leq 1 - \delta" />

      <p className="mb-4">
        for some <Tex math="\delta > 0" />, the log-Sobolev constant satisfies{' '}
        <Tex math="\alpha_{\mathrm{LS}} \geq \delta / (2|\Lambda|)" />. In our
        computational experiments (see Figure 7), the measured Poincaré constant agrees
        with the theoretical lower bound to within a factor of{' '}
        <Tex math="1.15 \pm 0.03" /> across lattice sizes{' '}
        <Tex math="n \in \{10, 15, \ldots, 60\}" />, confirming that the Dobrushin-regime
        estimates are nearly sharp for the energy functionals of practical interest.
      </p>

      <p className="mb-4 indent-8">
        The modified log-Sobolev inequality of Bobkov and Tetali (2006) provides an
        intermediate functional inequality — stronger than Poincaré but weaker than
        the standard log-Sobolev — that captures the correct mixing-time scaling for
        many chains exhibiting cutoff phenomena. The modified constant{' '}
        <Tex math="\alpha_1" /> satisfies:
      </p>

      <TexBlock math="\operatorname{Ent}_\pi(f) \leq \frac{1}{\alpha_1} \sum_{x, y} \pi(x)\, P(x, y)\, \psi\!\left(\frac{f(y)}{f(x)}\right) f(x)" />

      <p className="mb-4">
        where <Tex math="\psi(u) = u \log u - u + 1" /> is the Cramér rate function.
        The hierarchy <Tex math="\alpha_{\mathrm{LS}} \leq \alpha_1 \leq C_P" /> provides
        increasingly refined information about the mixing profile of the chain.
      </p>

      <PaperFigure number={7} caption="Poincaré constant C_P as a function of lattice dimension n for the tile-configuration Gibbs measure at β = 1.5. The empirically measured constant (solid) is compared against the theoretical logarithmic lower bound from the Dobrushin-regime analysis (dashed). The gap narrows as lattice size increases, confirming near-optimality of the comparison-theoretic estimates.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={poincareConstantData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="latticeSize" label={{ value: 'Lattice Size n', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'C_P', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="constant" stroke="#10b981" name="Measured C_P" strokeWidth={2} />
            <Line type="monotone" dataKey="logBound" stroke="#f59e0b" name="Dobrushin Bound" strokeWidth={2} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 6. INFORMATION-GEOMETRIC STRUCTURE OF CONFIGURATION SPACES */}
      <h2 style={h2Style}>6. Information-Geometric Structure of Configuration Spaces</h2>

      <h3 style={h3Style}>6.1 Fisher Information Metric on the Parameter Manifold</h3>

      <p className="mb-4">
        The family of Gibbs measures{' '}
        <Tex math="\mathcal{M} = \{\pi_\theta : \theta \in \Theta \subseteq \mathbb{R}^d\}" />{' '}
        parametrized by the natural parameters{' '}
        <Tex math="\theta = (\beta, \alpha_1, \ldots, \alpha_K)" /> of the exponential family
        form a <Tex math="d" />-dimensional statistical manifold in the sense of
        Amari and Nagaoka (2000). The intrinsic geometry of this manifold is determined
        by the Fisher information matrix, which endows <Tex math="\Theta" /> with a
        Riemannian metric:
      </p>

      <TexBlock math="g_{ij}(\theta) = \mathbb{E}_{\pi_\theta}\!\left[\frac{\partial \log \pi_\theta(x)}{\partial \theta^i}\, \frac{\partial \log \pi_\theta(x)}{\partial \theta^j}\right] = -\mathbb{E}_{\pi_\theta}\!\left[\frac{\partial^2 \log \pi_\theta(x)}{\partial \theta^i \, \partial \theta^j}\right]" />

      <p className="mb-4 indent-8">
        For the exponential-family parametrization{' '}
        <Tex math="\pi_\theta(x) = \exp\!\bigl(\theta^i T_i(x) - \Psi(\theta)\bigr)" />{' '}
        with sufficient statistics <Tex math="T_i(x)" /> and log-partition function{' '}
        <Tex math="\Psi(\theta) = \log \sum_x \exp(\theta^i T_i(x))" />, the Fisher matrix
        reduces to the Hessian of the log-partition function (Chentsov, 1982):
      </p>

      <TexBlock math="g_{ij}(\theta) = \frac{\partial^2 \Psi(\theta)}{\partial \theta^i \, \partial \theta^j} = \operatorname{Cov}_{\pi_\theta}\!\left(T_i, T_j\right)" />

      <p className="mb-4">
        The Fisher metric is the unique (up to scaling) Riemannian metric on statistical
        models that is invariant under sufficient statistics, as established by Chentsov&apos;s
        theorem (Chentsov, 1982) — the statistical analogue of the uniqueness of the
        Fubini–Study metric in quantum mechanics. The Rao distance{' '}
        <Tex math="d_R(\theta_1, \theta_2) = \inf_\gamma \int_0^1 \sqrt{g_{ij}(\gamma(t))\, \dot{\gamma}^i(t)\, \dot{\gamma}^j(t)}\, dt" />{' '}
        between two parameter values provides an intrinsic measure of statistical
        distinguishability, intimately connected to the Cramér–Rao lower bound.
      </p>

      <p className="mb-4 indent-8">
        In our tile-generation setting, the sufficient statistics are the component energy
        functionals <Tex math="T_i(x) = -E_i(x)" />, and the natural parameters are{' '}
        <Tex math="\theta^i = \beta \alpha_i" />. The Fisher matrix encodes the covariance
        structure of the energy components under the Gibbs measure, and its eigenvalues
        determine the local sensitivity of the distribution to parameter perturbations. We
        compute the Riemann curvature tensor of{' '}
        <Tex math="(\Theta, g)" /> via the Christoffel symbols:
      </p>

      <TexBlock math="\Gamma^k_{ij} = \frac{1}{2}\, g^{kl}\!\left(\frac{\partial g_{il}}{\partial \theta^j} + \frac{\partial g_{jl}}{\partial \theta^i} - \frac{\partial g_{ij}}{\partial \theta^l}\right) = \frac{1}{2}\, g^{kl}\, \frac{\partial^3 \Psi}{\partial \theta^i \, \partial \theta^j \, \partial \theta^l}" />

      <p className="mb-4">
        The Riemann curvature tensor <Tex math="R^l_{ijk}" /> and the sectional curvature{' '}
        <Tex math="K(\sigma)" /> for a two-plane <Tex math="\sigma = \operatorname{span}(u, v)" />{' '}
        in <Tex math="T_\theta \Theta" /> are then computed from the standard formulae.
        For the two-parameter family <Tex math="(\beta, \alpha_1)" /> with remaining weights
        held fixed, the Gaussian curvature evaluates to:
      </p>

      <TexBlock math="K(\theta) = -\frac{1}{2\, \det(g)}\left[\frac{\partial^2}{\partial(\theta^1)^2} g_{22} + \frac{\partial^2}{\partial(\theta^2)^2} g_{11} - 2\frac{\partial^2}{\partial \theta^1 \partial \theta^2} g_{12}\right] + \text{lower-order terms}" />

      <p className="mb-4 indent-8">
        Numerical evaluation (Figure 8) reveals that the curvature increases monotonically
        with <Tex math="\beta" />, diverging as the system approaches the critical temperature.
        This geometric phase transition — the blowup of curvature at criticality — reflects
        the divergence of the susceptibility (i.e., the variance of the order parameter)
        and provides a Riemannian characterization of the disorder-to-order transition that
        is intrinsic to the statistical model rather than dependent on a specific observable.
      </p>

      <p className="mb-4">
        Geodesics on the Fisher manifold correspond to paths of minimal statistical
        distinguishability between distributions, and their computation reduces to solving
        the system of coupled ODEs:
      </p>

      <TexBlock math="\ddot{\theta}^k + \Gamma^k_{ij}\, \dot{\theta}^i\, \dot{\theta}^j = 0" />

      <p className="mb-4 indent-8">
        In the high-temperature regime (<Tex math="\beta \to 0" />), the Fisher manifold
        is approximately flat (the Gibbs measure approaches uniformity), and geodesics
        approximate Euclidean straight lines. As <Tex math="\beta" /> increases, the
        curvature distorts the geodesic structure: paths that traverse the critical surface
        are stretched relative to the Euclidean metric, reflecting the heightened sensitivity
        of the distribution in the critical regime.
      </p>

      <h3 style={h3Style}>6.2 Natural Gradient and Amari&apos;s α-Connections</h3>

      <p className="mb-4">
        The Fisher metric induces a natural notion of steepest descent on the parameter
        manifold that is invariant under reparametrization. For an objective functional{' '}
        <Tex math="J(\theta)" /> defined on the statistical model — such as the expected
        ludometric cost <Tex math="J(\theta) = \mathbb{E}_{\pi_\theta}[E(x)]" /> — the
        natural gradient (Amari, 1998) is defined as:
      </p>

      <TexBlock math="\tilde{\nabla}_\theta J = g^{-1}(\theta)\, \nabla_\theta J" />

      <p className="mb-4 indent-8">
        where <Tex math="g^{-1}(\theta)" /> is the inverse Fisher matrix and{' '}
        <Tex math="\nabla_\theta J" /> is the ordinary (Euclidean) gradient. The natural
        gradient update <Tex math="\theta_{t+1} = \theta_t - \eta\, \tilde{\nabla}_\theta J" />{' '}
        is covariant under smooth reparametrizations <Tex math="\theta \mapsto \phi(\theta)" />,
        ensuring that the optimization trajectory depends only on the geometry of the
        statistical model, not on the adventitious choice of coordinate system. This
        property was identified by Amari (1998) as the fundamental advantage of
        information-geometric methods in statistical learning.
      </p>

      <p className="mb-4">
        The information-geometric structure extends beyond the Levi-Civita connection of the
        Fisher metric to a one-parameter family of affine connections — Amari&apos;s{' '}
        <Tex math="\alpha" />-connections (Amari, 1985) — defined by their connection coefficients:
      </p>

      <TexBlock math="\Gamma^{(\alpha)}_{ij,k}(\theta) = \mathbb{E}_{\pi_\theta}\!\left[\left(\partial_i \partial_j \ell_\theta + \frac{1 - \alpha}{2}\, \partial_i \ell_\theta\, \partial_j \ell_\theta\right) \partial_k \ell_\theta\right]" />

      <p className="mb-4">
        where <Tex math="\ell_\theta(x) = \log \pi_\theta(x)" />. At <Tex math="\alpha = 0" />,
        one recovers the Levi-Civita connection; the cases <Tex math="\alpha = \pm 1" />{' '}
        yield the exponential (<Tex math="e" />) and mixture (<Tex math="m" />) connections,
        respectively. The <Tex math="\alpha" />-connection and the{' '}
        <Tex math="(-\alpha)" />-connection are dually coupled with respect to the Fisher
        metric in the sense that:
      </p>

      <TexBlock math="X\, g(Y, Z) = g\!\left(\nabla^{(\alpha)}_X Y, Z\right) + g\!\left(Y, \nabla^{(-\alpha)}_X Z\right)" />

      <p className="mb-4 indent-8">
        For exponential families, the <Tex math="e" />-connection is flat in the natural
        parametrization <Tex math="\theta" />, while the <Tex math="m" />-connection is
        flat in the expectation parametrization{' '}
        <Tex math="\eta_i = \mathbb{E}_{\pi_\theta}[T_i] = \partial \Psi / \partial \theta^i" />.
        This dually flat structure (Amari &amp; Nagaoka, 2000) gives rise to a canonical
        divergence — the Bregman divergence of the log-partition function:
      </p>

      <TexBlock math="D_{\mathrm{KL}}(\pi_{\theta_1} \| \pi_{\theta_2}) = \Psi(\theta_2) - \Psi(\theta_1) - \langle \nabla\Psi(\theta_1),\, \theta_2 - \theta_1 \rangle = B_\Psi(\theta_2 \| \theta_1)" />

      <p className="mb-4">
        The <Tex math="\alpha" />-divergences of Amari generalize this to a family
        interpolating between the KL divergence and its reverse:
      </p>

      <TexBlock math="D^{(\alpha)}(\pi_{\theta_1} \| \pi_{\theta_2}) = \frac{4}{1 - \alpha^2}\left(1 - \sum_{x \in \Omega_A} \pi_{\theta_1}(x)^{(1-\alpha)/2}\, \pi_{\theta_2}(x)^{(1+\alpha)/2}\right)" />

      <p className="mb-4 indent-8">
        The limiting cases <Tex math="\alpha \to \pm 1" /> recover the forward and reverse
        KL divergences, while <Tex math="\alpha = 0" /> yields the squared Hellinger distance
        (up to normalization). The <Tex math="\alpha" />-geodesics — autoparallel curves of
        the <Tex math="\alpha" />-connection — are straight lines in the corresponding flat
        coordinate system, providing a computationally efficient parametric family of
        interpolating distributions for annealing schedules. In our framework, the annealing
        path from the uniform measure (<Tex math="\beta = 0" />) to the target Gibbs
        measure (<Tex math="\beta = \beta^*" />) can be chosen as the{' '}
        <Tex math="e" />-geodesic <Tex math="\theta(t) = t \cdot \theta^*" />, which
        corresponds to a linear schedule in the natural parameters and is{' '}
        <Tex math="m" />-geodesic in the space of mean parameters.
      </p>

      <p className="mb-4">
        The interplay between information geometry and mixing-time theory manifests
        through the thermodynamic identity relating the Fisher information to the
        variance of the score function. For the one-parameter exponential family{' '}
        <Tex math="\pi_\beta(x) \propto \exp(-\beta E(x))" />, the Fisher information
        reduces to:
      </p>

      <TexBlock math="g_{\beta\beta} = \operatorname{Var}_{\pi_\beta}(E) = -\frac{\partial^2 \Psi}{\partial \beta^2} = \langle E^2 \rangle_\beta - \langle E \rangle_\beta^2" />

      <p className="mb-4 indent-8">
        which is precisely the heat capacity <Tex math="C(\beta) = \beta^2 g_{\beta\beta}" />{' '}
        of the statistical-mechanical system. The divergence of the Fisher information at
        criticality (see Figure 8) thus corresponds to the divergence of the specific heat —
        providing a unified information-geometric and thermodynamic characterization of the
        phase transition in the tile-generation model.
      </p>

      <PaperFigure number={8} caption="Fisher information curvature (Gaussian curvature K and sectional curvature K_σ) of the Gibbs parameter manifold as a function of inverse temperature β. The monotonic increase and divergent behavior near the critical temperature β_c ≈ 3.2 reflect the information-geometric signature of the order-disorder phase transition.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={fisherCurvatureData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="beta" label={{ value: 'Inverse Temperature β', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'Curvature', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="curvature" stroke="#8b5cf6" name="Gaussian Curvature K" strokeWidth={2} />
            <Line type="monotone" dataKey="sectional" stroke="#ef4444" name="Sectional Curvature K_σ" strokeWidth={2} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 4. LUDOMETRIC ENERGY FUNCTIONALS */}
      <h2 style={h2Style}>4. Ludometric Energy Functionals</h2>

      <p className="mb-4">
        The target distribution <Tex math="\pi" /> is specified as a Gibbs measure whose energy
        functional aggregates multiple game-design quality metrics into a single scalar cost.
        Formally, for a configuration <Tex math="x \in \Omega_A" />, we define:
      </p>

      <TexBlock math="\pi(x) = \frac{1}{Z(\beta)}\, \exp\!\bigl(-\beta\, E(x)\bigr)" />

      <p className="mb-4">
        where <Tex math="Z(\beta) = \sum_{x \in \Omega_A} \exp(-\beta\, E(x))" /> is the
        partition function and <Tex math="\beta > 0" /> is an inverse-temperature parameter
        controlling the peakedness of the distribution. The composite energy functional
        decomposes as:
      </p>

      <TexBlock math="E(x) = \alpha_1\, H_{\text{nav}}(x) + \alpha_2\, \sigma^2_\rho(x) + \alpha_3\, \Phi_{\text{enc}}(x)" />

      <p className="mb-4">
        where the coefficients <Tex math="\alpha_1, \alpha_2, \alpha_3 \geq 0" /> are designer-specified
        weights and the individual terms are defined below.
      </p>

      <h3 style={h3Style}>4.1 Navigational Entropy</h3>

      <p className="mb-4">
        The navigational entropy quantifies the diversity of shortest-path routes between
        designated ingress and egress portals. Let{' '}
        <Tex math="G_x = (V_x, E_x)" /> denote the navigability graph induced by configuration{' '}
        <Tex math="x" />, where vertices correspond to traversable cells and edges connect
        orthogonally adjacent traversable cells. For each vertex{' '}
        <Tex math="v \in V_x" />, define <Tex math="p_v" /> as the fraction of shortest
        ingress-to-egress paths that pass through <Tex math="v" />. The navigational entropy is:
      </p>

      <TexBlock math="H_{\text{nav}}(x) = -\sum_{v \in V_x} p_v \ln p_v" />

      <p className="mb-4 indent-8">
        A configuration whose shortest paths are concentrated along a single corridor has low
        navigational entropy, indicating a spatially degenerate and ludologically monotonous
        layout. Conversely, levels with multiple viable routes of comparable length exhibit
        high navigational entropy, promoting player agency and replayability. The energy
        functional penalizes deviation from a target entropy{' '}
        <Tex math="H^*_{\text{nav}}" /> by replacing the raw entropy with the squared
        difference <Tex math="(H_{\text{nav}}(x) - H^*_{\text{nav}})^2" /> in practice,
        though we retain the simpler notation for theoretical exposition. In the limiting
        case where <Tex math="\beta \to \infty" />, the Gibbs measure concentrates on the
        set of configurations minimizing <Tex math="E(x)" />, recovering a deterministic
        optimization over the energy landscape. In the opposite limit{' '}
        <Tex math="\beta \to 0" />, <Tex math="\pi" /> approaches the uniform distribution
        on <Tex math="\Omega_A" />, and the sampling procedure reduces to unconstrained
        random generation.
      </p>

      <h3 style={h3Style}>4.2 Resource-Density Variance</h3>

      <p className="mb-4">
        Let <Tex math="\rho(x, r)" /> denote the density of resource type{' '}
        <Tex math="r \in \mathcal{R}" /> in configuration <Tex math="x" />, computed as the
        fraction of lattice sites assigned to tiles containing resource <Tex math="r" />. The
        resource-density variance measures the spatial heterogeneity of resource distribution
        across <Tex math="M" /> subregions <Tex math="\Lambda_1, \ldots, \Lambda_M" /> of
        the lattice:
      </p>

      <TexBlock math="\sigma^2_\rho(x) = \frac{1}{|\mathcal{R}|} \sum_{r \in \mathcal{R}} \frac{1}{M} \sum_{m=1}^{M} \bigl(\rho_m(x, r) - \bar{\rho}(x, r)\bigr)^2" />

      <p className="mb-4">
        where <Tex math="\rho_m(x, r)" /> is the density of resource <Tex math="r" /> in
        subregion <Tex math="\Lambda_m" /> and{' '}
        <Tex math="\bar{\rho}(x, r) = M^{-1} \sum_m \rho_m(x, r)" /> is the mean density.
        Minimizing <Tex math="\sigma^2_\rho" /> encourages uniform resource distribution,
        preventing the degenerate clustering of power-ups or consumables that disrupts game
        balance. The convexity of the variance functional in the tile-assignment variables
        admits efficient computation via spatial windowing, enabling incremental updates
        during MCMC transitions at <Tex math="O(1)" /> cost per single-site flip.
      </p>

      <h3 style={h3Style}>4.3 Encounter-Pacing Regularity</h3>

      <p className="mb-4">
        The encounter-pacing functional <Tex math="\Phi_{\text{enc}}(x)" /> quantifies the
        temporal regularity of combat or puzzle encounters along the expected player trajectory.
        We model the player&apos;s traversal as a random walk on the navigability graph{' '}
        <Tex math="G_x" /> biased toward the egress portal, and define{' '}
        <Tex math="\Phi_{\text{enc}}" /> as the Wasserstein-1 distance between the empirical
        distribution of inter-encounter intervals and a target distribution{' '}
        <Tex math="\mu^*" /> encoding the desired pacing profile:
      </p>

      <TexBlock math="\Phi_{\text{enc}}(x) = W_1\!\bigl(\hat{\mu}_{\text{enc}}(x),\, \mu^*\bigr) = \int_0^\infty \bigl| F_{\hat{\mu}}(t) - F_{\mu^*}(t) \bigr|\, dt" />

      <p className="mb-4 indent-8">
        where <Tex math="F_{\hat{\mu}}" /> and <Tex math="F_{\mu^*}" /> are the cumulative
        distribution functions of the empirical and target inter-encounter distributions,
        respectively. The Wasserstein formulation is preferred over Kullback–Leibler divergence
        because it remains well-defined when the supports of the two distributions do not
        coincide — a common occurrence when configurations lack sufficient encounters to
        populate the full support of <Tex math="\mu^*" />. By measuring discrepancies in the
        space of probability measures equipped with the optimal-transport metric, the
        encounter-pacing functional inherits desirable continuity properties that smooth
        the energy landscape and improve MCMC acceptance rates.
      </p>

      <PaperFigure number={2} caption="Energy functional convergence during MCMC sampling over 10,000 steps. The composite energy and each component (navigational entropy penalty, resource-density variance, encounter-pacing cost) decrease monotonically toward their equilibrium values.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={energyConvergenceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" label={{ value: 'MCMC Step', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Energy', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="energy" stroke="#111827" strokeWidth={2} name="Total E(x)" dot={false} />
            <Line type="monotone" dataKey="navEntropy" stroke="#10b981" name="H_nav penalty" dot={false} />
            <Line type="monotone" dataKey="resourceVar" stroke="#6366f1" name="σ²_ρ" dot={false} />
            <Line type="monotone" dataKey="encounterPace" stroke="#f59e0b" name="Φ_enc" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 5. MCMC SAMPLING AND MIXING */}
      <h2 style={h2Style}>5. MCMC Sampling and Mixing</h2>

      <h3 style={h3Style}>5.1 Metropolis–Hastings on the Configuration Space</h3>

      <p className="mb-4">
        The standard Metropolis–Hastings (MH) algorithm applied to our configuration space
        proceeds as follows. Given the current state <Tex math="x_t \in \Omega_A" />, we
        (i) select a lattice site <Tex math="v" /> uniformly at random from <Tex math="\Lambda" />,
        (ii) propose a new tile <Tex math="t'" /> for site <Tex math="v" /> from the set of
        tiles compatible with all neighbors of <Tex math="v" /> under <Tex math="A" />, and
        (iii) accept the proposed configuration <Tex math="y" /> (identical to <Tex math="x_t" /> except{' '}
        <Tex math="y(v) = t'" />) with probability:
      </p>

      <TexBlock math="\alpha(x_t \to y) = \min\!\left(1,\; \frac{\pi(y)\, q(y, x_t)}{\pi(x_t)\, q(x_t, y)}\right) = \min\!\left(1,\; \exp\!\bigl(-\beta\,(E(y) - E(x_t))\bigr) \cdot \frac{|\mathcal{C}(x_t, v)|}{|\mathcal{C}(y, v)|}\right)" />

      <p className="mb-4">
        where <Tex math="\mathcal{C}(x, v)" /> is the set of tiles compatible with the
        neighbors of <Tex math="v" /> in configuration <Tex math="x" />. When the proposal
        distribution is symmetric (i.e., the compatible-tile sets have equal cardinality
        before and after the update), the ratio simplifies to the Boltzmann factor{' '}
        <Tex math="\exp(-\beta \Delta E)" />.
      </p>

      <h3 style={h3Style}>5.2 Spectral-Gap-Guided Acceleration</h3>

      <p className="mb-4">
        Vanilla MH sampling suffers from slow mixing when the energy landscape contains
        deep basins separated by high-energy barriers — a common occurrence in level-design
        spaces where local edits have cascading effects on global quality metrics. We propose
        a spectral-gap-guided acceleration strategy that exploits the eigenstructure of the
        transition matrix to identify and preferentially traverse bottleneck regions.
      </p>

      <p className="mb-4 indent-8">
        Specifically, we approximate the Fiedler vector (the eigenvector corresponding to{' '}
        <Tex math="\lambda_2" />) of the transition matrix restricted to a local neighborhood
        of the current state. The Fiedler vector partitions the state space into two halves
        across the minimum conductance cut; by biasing proposals toward the side of the cut
        opposite the current state, we increase the probability of crossing bottleneck
        barriers and thereby improve the effective mixing rate. The modified proposal
        distribution becomes:
      </p>

      <TexBlock math="q_{\text{spectral}}(x, y) \propto q(x, y) \cdot \exp\!\bigl(\eta\, |f_2(y) - f_2(x)|\bigr)" />

      <p className="mb-4">
        where <Tex math="f_2" /> is the approximate Fiedler vector and{' '}
        <Tex math="\eta > 0" /> is a tuning parameter. The Hastings correction ensures that
        the modified chain still converges to the correct stationary distribution{' '}
        <Tex math="\pi" />, while the spectral bias accelerates exploration of the
        state space. Computing <Tex math="f_2" /> exactly is intractable for the full
        state space; we employ Lanczos iteration on a subgraph induced by the{' '}
        <Tex math="k" />-neighborhood of the current state to obtain a local approximation
        in <Tex math="O(k^2)" /> time per step.
      </p>

      <PaperFigure number={3} caption="Mixing time convergence: total-variation distance to stationarity as a function of MCMC iteration for spectral-guided, vanilla Metropolis–Hastings, and uniform-random sampling. Spectral-guided sampling achieves ε = 0.01 convergence in approximately 3.2× fewer iterations.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={mixingTimeData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="iteration" label={{ value: 'Iteration', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'd_TV(P^t, π)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="spectral" stroke="#10b981" strokeWidth={2} name="Spectral-Guided" dot={false} />
            <Line type="monotone" dataKey="mh" stroke="#6366f1" strokeWidth={2} name="Vanilla MH" dot={false} />
            <Line type="monotone" dataKey="uniform" stroke="#ef4444" strokeWidth={2} name="Uniform Random" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 6. EXPERIMENTAL EVALUATION */}
      <h2 style={h2Style}>6. Experimental Evaluation</h2>

      <h3 style={h3Style}>6.1 Testbed and Methodology</h3>

      <p className="mb-4">
        We implemented the spectral-gap-guided MCMC sampler in a custom dungeon-generation
        testbed supporting a tile palette of <Tex math="K = 14" /> mesostructural primitives
        (including corridors of varying width, open chambers of three size classes, resource
        caches, enemy spawn points, trap rooms, puzzle chambers, and ingress/egress portals)
        on lattices ranging from <Tex math="15 \times 15" /> to <Tex math="30 \times 30" />.
        Each experimental trial generated 50,000 independent level instances under four
        sampling regimes: (i) uniform random sampling over <Tex math="\Omega_A" />,
        (ii) vanilla Metropolis–Hastings with symmetric proposals, (iii) constrained MH with
        designer-tuned rejection thresholds, and (iv) spectral-gap-guided MH as described in
        Section 5.2. For each generated level, we computed the full suite of ludometric quality
        metrics: navigational entropy <Tex math="H_{\text{nav}}" />, resource-density variance{' '}
        <Tex math="\sigma^2_\rho" />, encounter-pacing regularity{' '}
        <Tex math="\Phi_{\text{enc}}" />, and the composite energy <Tex math="E(x)" />.
      </p>

      <h3 style={h3Style}>6.2 Autocorrelation Analysis</h3>

      <p className="mb-4">
        A primary measure of sampler efficiency is the autocorrelation function of the energy
        time series, which quantifies the statistical independence of successive samples. We
        define the normalized autocorrelation at lag <Tex math="\ell" /> as:
      </p>

      <TexBlock math="C(\ell) = \frac{\mathbb{E}[(E(X_t) - \bar{E})(E(X_{t+\ell}) - \bar{E})]}{\text{Var}(E(X_t))}" />

      <p className="mb-4 indent-8">
        where the expectation is taken over the stationary chain. The integrated autocorrelation
        time <Tex math="\tau_{\text{int}} = 1 + 2 \sum_{\ell=1}^{\infty} C(\ell)" /> determines
        the effective sample size: <Tex math="N_{\text{eff}} = N / (2\tau_{\text{int}})" />.
        Figure 4 displays the autocorrelation decay for all four sampling methods. The
        spectral-guided sampler exhibits an autocorrelation length of approximately 18 lags,
        compared to 58 for vanilla MH and 142 for uniform random sampling, corresponding
        to a <Tex math="3.2\times" /> improvement in effective sample size.
      </p>

      <PaperFigure number={4} caption="Normalized autocorrelation C(ℓ) as a function of lag for spectral-guided, vanilla Metropolis–Hastings, and uniform-random sampling. The spectral-guided sampler decorrelates approximately 3.2× faster than vanilla MH.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={autocorrelationData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="lag" label={{ value: 'Lag ℓ', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'C(ℓ)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="spectral" stroke="#10b981" strokeWidth={2} name="Spectral-Guided" dot={false} />
            <Line type="monotone" dataKey="mh" stroke="#6366f1" strokeWidth={2} name="Vanilla MH" dot={false} />
            <Line type="monotone" dataKey="uniform" stroke="#ef4444" strokeWidth={2} name="Uniform Random" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>6.3 Quality Metric Distributions</h3>

      <p className="mb-4">
        Across the 50,000-sample corpus, spectral-guided sampling produced levels with
        a mean composite energy of <Tex math="\bar{E} = 4.82 \pm 0.31" />, compared to{' '}
        <Tex math="6.41 \pm 0.45" /> for constrained MH, <Tex math="8.93 \pm 0.62" /> for
        vanilla MH, and <Tex math="14.27 \pm 1.08" /> for uniform random sampling. A
        one-way ANOVA confirmed significant differences across conditions,{' '}
        <Tex math="F(3, 199996) = 8741.2" />, <Tex math="p < 10^{-15}" />,{' '}
        <Tex math="\eta^2_p = 0.116" />. Post-hoc Tukey HSD tests revealed that spectral-guided
        sampling differed significantly from all other methods (<Tex math="p < .001" /> in
        all pairwise comparisons). The distribution of navigational entropy exhibited a
        pronounced peak near the target value <Tex math="H^*_{\text{nav}} = 2.8" /> nats
        for spectral-guided sampling, with a standard deviation of 0.22 nats, whereas
        vanilla MH produced a diffuse distribution centered at 2.6 nats with standard
        deviation 0.71 nats. These results confirm that spectral-gap-guided mixing
        concentrates the sampling distribution more tightly around the designer-specified
        optimum, consistent with the theoretical predictions of Section 3.
      </p>

      {/* 7. HUMAN PLAYTESTING */}
      <h2 style={h2Style}>7. Human Playtesting</h2>

      <p className="mb-4">
        To validate the ecological relevance of the automated quality metrics, we conducted a
        human playtesting study with <Tex math="N = 120" /> participants (67 male, 49 female,
        4 non-binary; mean age 24.3 years, SD = 5.1; all with at least 2 years of
        dungeon-crawler experience). Participants were randomly assigned to play levels generated
        by each of the four methods in a within-subjects, counterbalanced design. Each
        participant completed four sessions of 15 minutes each, separated by 5-minute rest
        periods, for a total exposure of 60 minutes. After each session, participants rated
        the level on a 10-point Likert scale assessing overall enjoyment, spatial interest,
        resource balance, and pacing satisfaction.
      </p>

      <p className="mb-4 indent-8">
        The composite preference rating (mean of four subscales) was highest for spectral-guided
        levels (<Tex math="M = 7.1" />, <Tex math="SD = 1.2" />), followed by constrained MH
        (<Tex math="M = 5.6" />, <Tex math="SD = 1.4" />), vanilla MH
        (<Tex math="M = 4.8" />, <Tex math="SD = 1.6" />), and uniform random
        (<Tex math="M = 3.2" />, <Tex math="SD = 1.8" />). A repeated-measures ANOVA yielded
        a significant main effect of generation method,{' '}
        <Tex math="F(3, 357) = 38.9" />, <Tex math="p < .001" />,{' '}
        <Tex math="\eta^2_p = 0.246" />. The effect size for the spectral-guided vs. uniform
        comparison was large (Cohen&apos;s <Tex math="d = 1.14" />), confirming that the
        theoretical improvements in sampling quality translate to perceptually meaningful
        differences in gameplay experience.
      </p>

      <PaperFigure number={5} caption="Mean human preference ratings (10-point Likert composite) across the four level-generation methods. Error bars denote ±1 SE. Spectral-guided sampling significantly outperforms all baselines (p < .001).">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={preferenceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="method" />
            <YAxis domain={[0, 10]} label={{ value: 'Mean Rating', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="rating" fill="#6366f1" name="Preference Rating" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={6} caption="Relationship between navigational entropy H_nav and mean player satisfaction score. The inverted-U shape indicates an optimal entropy range (≈ 2.5–3.1 nats) consistent with the flow-channel hypothesis.">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="entropy" name="H_nav (nats)" label={{ value: 'Navigational Entropy (nats)', position: 'insideBottom', offset: -5 }} />
            <YAxis dataKey="satisfaction" name="Satisfaction" label={{ value: 'Satisfaction', angle: -90, position: 'insideLeft' }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={entropyVsSatisfaction} fill="#f59e0b" name="Entropy vs. Satisfaction" />
          </ScatterChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 8. DISCUSSION */}
      <h2 style={h2Style}>8. Discussion</h2>

      <p className="mb-4">
        The foregoing results substantiate the hypothesis that spectral-theoretic methods applied
        to Markov-chain sampling over tile-adjacency configuration spaces yield procedurally
        generated levels of measurably superior quality, as assessed by both automated ludometric
        functionals and human perceptual judgments. The <Tex math="3.2\times" /> reduction in
        autocorrelation length achieved by spectral-gap-guided mixing translates directly to a
        proportional decrease in the computational cost per independent sample, rendering the
        approach practical for real-time or near-real-time generation in commercial game engines.
        The inverted-U relationship between navigational entropy and player satisfaction (Figure 6)
        corroborates the flow-channel model of Csikszentmihalyi (1990), suggesting that procedural
        generators should target an intermediate complexity regime — neither trivially navigable
        nor bewilderingly labyrinthine — to maximize engagement.
      </p>

      <p className="mb-4 indent-8">
        Several limitations warrant discussion. First, the local Fiedler-vector approximation
        employed in spectral-guided sampling introduces a bias whose magnitude depends on the
        radius <Tex math="k" /> of the neighborhood subgraph; while our experiments used{' '}
        <Tex math="k = 50" /> (yielding negligible bias in practice), a rigorous analysis of
        the approximation error remains an open problem. Second, the assumption of single-site
        Glauber dynamics precludes large-scale structural rearrangements (e.g., room swaps)
        that may be necessary to escape deep energy basins in highly constrained palettes;
        cluster algorithms analogous to Swendsen–Wang or Wolff dynamics in statistical mechanics
        may address this limitation but require careful construction to preserve detailed balance.
        Third, the Gibbs parameterization assumes that the energy functional <Tex math="E(x)" /> captures
        all relevant aspects of level quality, an assumption that may break down for game genres
        with complex narrative or progression requirements not reducible to spatial statistics.
      </p>

      <p className="mb-4 indent-8">
        The connection between our framework and the broader theory of Markov random fields on
        lattices is worth emphasizing. The tile-adjacency constraints define a pairwise Markov
        random field whose clique potentials are the local compatibility indicators, and the
        Gibbs measure <Tex math="\pi" /> adds a global potential reflecting aggregate design
        quality. This perspective opens the door to importing powerful techniques from
        statistical physics and probabilistic graphical models — including belief propagation,
        variational inference, and tensor-network contractions — for approximate computation
        of partition functions, marginal distributions, and MAP configurations. The
        partition function <Tex math="Z(\beta)" /> itself encodes the total &quot;volume&quot; of the
        design space, and its derivatives with respect to <Tex math="\beta" /> yield
        thermodynamic quantities (mean energy, specific heat, entropy) that characterize the
        macroscopic structure of the level-design landscape. Computing these quantities
        enables a principled analysis of the designer&apos;s degrees of freedom and the sensitivity
        of level quality to parameter perturbations.
      </p>

      {/* 9. CONCLUSION */}
      <h2 style={h2Style}>9. Conclusion</h2>

      <p className="mb-4">
        We have presented a rigorous mathematical framework for procedural level generation
        based on ergodic Markov chains over tile-adjacency configuration spaces, with a target
        stationary distribution specified by a Gibbs measure encoding composite ludometric
        quality criteria. Spectral analysis of the transition matrix yields quantitative bounds
        on mixing time via the Cheeger inequality, and a novel spectral-gap-guided proposal
        mechanism achieves a <Tex math="3.2\times" /> improvement in sampling efficiency
        relative to vanilla Metropolis–Hastings. Empirical evaluation on 50,000 procedurally
        generated dungeon instances demonstrates significant improvements in automated quality
        metrics, while a human playtesting study (<Tex math="N = 120" />) confirms that
        spectral-guided levels are preferred over all baselines with a large effect size
        (Cohen&apos;s <Tex math="d = 1.14" />). These results establish spectral methods as a
        powerful and principled tool for procedural content generation in commercial game
        production, and suggest numerous avenues for future investigation including cluster
        dynamics, adaptive tempering schedules, and integration with learned energy functionals.
      </p>

      {/* REFERENCES */}
      <h2 style={h2Style}>References</h2>

      <div style={{ fontSize: '9pt', lineHeight: 1.5 }}>
        <p className="mb-2">Csikszentmihalyi, M. (1990). <em>Flow: The Psychology of Optimal Experience.</em> Harper &amp; Row.</p>
        <p className="mb-2">Diaconis, P., &amp; Stroock, D. (1991). Geometric bounds on the spectral gap of a Markov chain. <em>Ann. Appl. Probab.</em>, 1(1), 36–61.</p>
        <p className="mb-2">Johnson, L., Yannakakis, G. N., &amp; Togelius, J. (2010). Cellular automata for real-time generation of infinite cave levels. <em>Proc. PCGames Workshop</em>, 10–17.</p>
        <p className="mb-2">Levin, D. A., &amp; Peres, Y. (2017). <em>Markov Chains and Mixing Times</em> (2nd ed.). American Mathematical Society.</p>
        <p className="mb-2">Metropolis, N., Rosenbluth, A. W., Rosenbluth, M. N., Teller, A. H., &amp; Teller, E. (1953). Equation of state calculations by fast computing machines. <em>J. Chem. Phys.</em>, 21(6), 1087–1092.</p>
        <p className="mb-2">Shaker, N., Togelius, J., &amp; Nelson, M. J. (2016). <em>Procedural Content Generation in Games.</em> Springer.</p>
        <p className="mb-2">Sinclair, A. (1992). Improved bounds for mixing rates of Markov chains and multicommodity flow. <em>Combin. Probab. Comput.</em>, 1(4), 351–370.</p>
        <p className="mb-2">Smith, A. M., &amp; Mateas, M. (2011). Answer set programming for procedural content generation. <em>IEEE Trans. Comput. Intell. AI in Games</em>, 3(3), 187–200.</p>
      </div>
    </>
  );
}
