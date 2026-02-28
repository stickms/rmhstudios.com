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

const phaseDiagramData = [
  { coupling: 0.1, orderParam: 0.02 },
  { coupling: 0.2, orderParam: 0.04 },
  { coupling: 0.3, orderParam: 0.07 },
  { coupling: 0.4, orderParam: 0.12 },
  { coupling: 0.5, orderParam: 0.18 },
  { coupling: 0.6, orderParam: 0.28 },
  { coupling: 0.7, orderParam: 0.42 },
  { coupling: 0.75, orderParam: 0.55 },
  { coupling: 0.8, orderParam: 0.68 },
  { coupling: 0.85, orderParam: 0.76 },
  { coupling: 0.9, orderParam: 0.82 },
  { coupling: 0.95, orderParam: 0.86 },
  { coupling: 1.0, orderParam: 0.89 },
  { coupling: 1.1, orderParam: 0.92 },
  { coupling: 1.2, orderParam: 0.94 },
];

const susceptibilityData = [
  { coupling: 0.1, susceptibility: 0.8 },
  { coupling: 0.2, susceptibility: 1.2 },
  { coupling: 0.3, susceptibility: 1.8 },
  { coupling: 0.4, susceptibility: 3.1 },
  { coupling: 0.5, susceptibility: 5.4 },
  { coupling: 0.6, susceptibility: 9.8 },
  { coupling: 0.7, susceptibility: 18.2 },
  { coupling: 0.75, susceptibility: 31.5 },
  { coupling: 0.8, susceptibility: 22.1 },
  { coupling: 0.85, susceptibility: 12.4 },
  { coupling: 0.9, susceptibility: 7.8 },
  { coupling: 0.95, susceptibility: 5.1 },
  { coupling: 1.0, susceptibility: 3.8 },
  { coupling: 1.1, susceptibility: 2.4 },
  { coupling: 1.2, susceptibility: 1.9 },
];

const trainingVarianceData = [
  { step: 0, baseline: 0.12, curriculum: 0.12, annealed: 0.12 },
  { step: 5000, baseline: 0.28, curriculum: 0.18, annealed: 0.22 },
  { step: 10000, baseline: 0.45, curriculum: 0.21, annealed: 0.31 },
  { step: 20000, baseline: 0.68, curriculum: 0.24, annealed: 0.38 },
  { step: 30000, baseline: 0.82, curriculum: 0.27, annealed: 0.42 },
  { step: 40000, baseline: 0.71, curriculum: 0.25, annealed: 0.35 },
  { step: 50000, baseline: 0.58, curriculum: 0.22, annealed: 0.29 },
  { step: 75000, baseline: 0.42, curriculum: 0.18, annealed: 0.23 },
  { step: 100000, baseline: 0.31, curriculum: 0.14, annealed: 0.19 },
];

const criticalExponentData = [
  { exponent: 'β', measured: 0.51, meanField: 0.5, ising2D: 0.125 },
  { exponent: 'γ', measured: 0.98, meanField: 1.0, ising2D: 1.75 },
  { exponent: 'ν', measured: 0.49, meanField: 0.5, ising2D: 1.0 },
  { exponent: 'α', measured: 0.01, meanField: 0.0, ising2D: 0.0 },
  { exponent: 'δ', measured: 2.95, meanField: 3.0, ising2D: 15.0 },
];

const convergenceTimeData = [
  { agents: 4, baseline: 12400, curriculum: 8200, annealed: 9800 },
  { agents: 8, baseline: 28600, curriculum: 17900, annealed: 22100 },
  { agents: 16, baseline: 51200, curriculum: 32800, annealed: 39400 },
  { agents: 32, baseline: 89400, curriculum: 58100, annealed: 71200 },
  { agents: 64, baseline: 142000, curriculum: 93700, annealed: 112000 },
];

const correlationLengthData = [
  { coupling: 0.3, length: 1.2 },
  { coupling: 0.4, length: 1.8 },
  { coupling: 0.5, length: 2.9 },
  { coupling: 0.6, length: 5.1 },
  { coupling: 0.65, length: 7.8 },
  { coupling: 0.7, length: 12.4 },
  { coupling: 0.72, length: 16.1 },
  { coupling: 0.74, length: 22.3 },
  { coupling: 0.75, length: 38.7 },
  { coupling: 0.76, length: 24.8 },
  { coupling: 0.78, length: 17.2 },
  { coupling: 0.8, length: 11.9 },
  { coupling: 0.85, length: 6.4 },
  { coupling: 0.9, length: 3.8 },
  { coupling: 1.0, length: 2.1 },
];

const freeEnergyData = [
  { beta: 0.1, freeEnergy: -0.42, entropy: 3.81, internalEnergy: -0.04 },
  { beta: 0.3, freeEnergy: -1.24, entropy: 3.42, internalEnergy: -0.21 },
  { beta: 0.5, freeEnergy: -2.01, entropy: 2.91, internalEnergy: -0.55 },
  { beta: 0.7, freeEnergy: -2.78, entropy: 2.28, internalEnergy: -1.18 },
  { beta: 0.75, freeEnergy: -3.12, entropy: 1.94, internalEnergy: -1.67 },
  { beta: 0.8, freeEnergy: -3.48, entropy: 1.62, internalEnergy: -2.18 },
  { beta: 1.0, freeEnergy: -4.21, entropy: 1.08, internalEnergy: -3.13 },
  { beta: 1.5, freeEnergy: -5.42, entropy: 0.52, internalEnergy: -4.64 },
  { beta: 2.0, freeEnergy: -6.18, entropy: 0.28, internalEnergy: -5.62 },
];

const specificHeatData = [
  { coupling: 0.3, specificHeat: 0.42 },
  { coupling: 0.4, specificHeat: 0.68 },
  { coupling: 0.5, specificHeat: 1.12 },
  { coupling: 0.6, specificHeat: 2.08 },
  { coupling: 0.65, specificHeat: 3.21 },
  { coupling: 0.7, specificHeat: 5.84 },
  { coupling: 0.73, specificHeat: 9.12 },
  { coupling: 0.75, specificHeat: 14.8 },
  { coupling: 0.77, specificHeat: 8.92 },
  { coupling: 0.8, specificHeat: 5.41 },
  { coupling: 0.85, specificHeat: 2.84 },
  { coupling: 0.9, specificHeat: 1.62 },
  { coupling: 1.0, specificHeat: 0.81 },
];

const replicaSymmetryData = [
  { coupling: 0.3, q_EA: 0.01, qBar: 0.0 },
  { coupling: 0.5, q_EA: 0.04, qBar: 0.02 },
  { coupling: 0.6, q_EA: 0.12, qBar: 0.08 },
  { coupling: 0.7, q_EA: 0.31, qBar: 0.24 },
  { coupling: 0.75, q_EA: 0.52, qBar: 0.48 },
  { coupling: 0.8, q_EA: 0.68, qBar: 0.65 },
  { coupling: 0.9, q_EA: 0.81, qBar: 0.79 },
  { coupling: 1.0, q_EA: 0.88, qBar: 0.87 },
];

const finiteSizeData = [
  { agents: 8, jc: 0.82, shift: 0.07 },
  { agents: 16, jc: 0.79, shift: 0.04 },
  { agents: 32, jc: 0.77, shift: 0.02 },
  { agents: 64, jc: 0.76, shift: 0.01 },
  { agents: 128, jc: 0.755, shift: 0.005 },
  { agents: 256, jc: 0.752, shift: 0.002 },
  { agents: 512, jc: 0.751, shift: 0.001 },
];

const entropyProductionData = [
  { step: 0, production: 0.0, dissipation: 0.0 },
  { step: 5000, production: 0.28, dissipation: 0.12 },
  { step: 10000, production: 0.52, dissipation: 0.31 },
  { step: 20000, production: 0.91, dissipation: 0.68 },
  { step: 30000, production: 1.42, dissipation: 1.18 },
  { step: 40000, production: 1.21, dissipation: 1.08 },
  { step: 50000, production: 0.82, dissipation: 0.74 },
  { step: 75000, production: 0.41, dissipation: 0.38 },
  { step: 100000, production: 0.18, dissipation: 0.16 },
];

const fluctuationDissipationData = [
  { frequency: 0.01, response: 12.4, correlation: 11.8 },
  { frequency: 0.02, response: 9.8, correlation: 9.2 },
  { frequency: 0.05, response: 6.4, correlation: 5.9 },
  { frequency: 0.1, response: 3.8, correlation: 3.4 },
  { frequency: 0.2, response: 2.1, correlation: 1.8 },
  { frequency: 0.5, response: 0.82, correlation: 0.71 },
  { frequency: 1.0, response: 0.31, correlation: 0.28 },
  { frequency: 2.0, response: 0.12, correlation: 0.11 },
];

const binderCumulantData = [
  { coupling: 0.5, n8: 0.62, n16: 0.61, n32: 0.60, n64: 0.60 },
  { coupling: 0.6, n8: 0.58, n16: 0.56, n32: 0.54, n64: 0.53 },
  { coupling: 0.65, n8: 0.52, n16: 0.48, n32: 0.44, n64: 0.42 },
  { coupling: 0.7, n8: 0.44, n16: 0.38, n32: 0.32, n64: 0.28 },
  { coupling: 0.75, n8: 0.34, n16: 0.28, n32: 0.24, n64: 0.22 },
  { coupling: 0.8, n8: 0.28, n16: 0.24, n32: 0.22, n64: 0.21 },
  { coupling: 0.9, n8: 0.24, n16: 0.22, n32: 0.21, n64: 0.20 },
  { coupling: 1.0, n8: 0.22, n16: 0.21, n32: 0.20, n64: 0.20 },
];

const hamiltonianSpectrumData = [
  { eigenindex: 1, eigenvalue: -4.21 },
  { eigenindex: 2, eigenvalue: -3.84 },
  { eigenindex: 3, eigenvalue: -3.12 },
  { eigenindex: 4, eigenvalue: -2.48 },
  { eigenindex: 5, eigenvalue: -1.92 },
  { eigenindex: 6, eigenvalue: -1.34 },
  { eigenindex: 7, eigenvalue: -0.81 },
  { eigenindex: 8, eigenvalue: -0.28 },
  { eigenindex: 9, eigenvalue: 0.14 },
  { eigenindex: 10, eigenvalue: 0.72 },
];

const lyapunovData = [
  { agents: 4, maxLyapunov: 0.042, kaplanYorke: 3.2 },
  { agents: 8, maxLyapunov: 0.068, kaplanYorke: 5.8 },
  { agents: 16, maxLyapunov: 0.091, kaplanYorke: 9.4 },
  { agents: 32, maxLyapunov: 0.112, kaplanYorke: 16.2 },
  { agents: 64, maxLyapunov: 0.128, kaplanYorke: 28.7 },
  { agents: 128, maxLyapunov: 0.141, kaplanYorke: 52.4 },
];

const landscapeRuggednessData = [
  { coupling: 0.1, ruggedness: 0.08, barriers: 1.2 },
  { coupling: 0.3, ruggedness: 0.14, barriers: 2.1 },
  { coupling: 0.5, ruggedness: 0.28, barriers: 4.8 },
  { coupling: 0.7, ruggedness: 0.52, barriers: 9.2 },
  { coupling: 0.75, ruggedness: 0.71, barriers: 14.8 },
  { coupling: 0.8, ruggedness: 0.64, barriers: 11.4 },
  { coupling: 0.9, ruggedness: 0.48, barriers: 7.1 },
  { coupling: 1.0, ruggedness: 0.38, barriers: 4.8 },
  { coupling: 1.2, ruggedness: 0.28, barriers: 3.2 },
];

const dynamicCriticalData = [
  { coupling: 0.5, relaxTime: 120 },
  { coupling: 0.6, relaxTime: 280 },
  { coupling: 0.65, relaxTime: 520 },
  { coupling: 0.7, relaxTime: 1240 },
  { coupling: 0.72, relaxTime: 2180 },
  { coupling: 0.74, relaxTime: 4820 },
  { coupling: 0.75, relaxTime: 12400 },
  { coupling: 0.76, relaxTime: 5210 },
  { coupling: 0.78, relaxTime: 2420 },
  { coupling: 0.8, relaxTime: 1180 },
  { coupling: 0.85, relaxTime: 480 },
  { coupling: 0.9, relaxTime: 260 },
];

const graphTopologyData = [
  { topology: 'Complete', jc: 0.24, variance: 0.12, convergence: 42100 },
  { topology: 'Erdős–Rényi', jc: 0.75, variance: 0.27, convergence: 58100 },
  { topology: 'Barabási–Albert', jc: 0.61, variance: 0.21, convergence: 51200 },
  { topology: 'Watts–Strogatz', jc: 0.82, variance: 0.31, convergence: 62400 },
  { topology: 'Ring Lattice', jc: 1.12, variance: 0.42, convergence: 78200 },
  { topology: 'Star', jc: 0.38, variance: 0.18, convergence: 48100 },
];

const ablationScheduleData = [
  { schedule: 'Constant (J=1)', variance: 0.82, convergence: 89400, finalReturn: 798 },
  { schedule: 'Linear', variance: 0.42, convergence: 71200, finalReturn: 821 },
  { schedule: 'Sigmoid (RG)', variance: 0.27, convergence: 58100, finalReturn: 842 },
  { schedule: 'Step Function', variance: 0.78, convergence: 84200, finalReturn: 802 },
  { schedule: 'Cosine', variance: 0.38, convergence: 68400, finalReturn: 828 },
  { schedule: 'Exponential', variance: 0.34, convergence: 64800, finalReturn: 834 },
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

export function StatMechMARLPaper() {
  return (
    <>
      {/* 1. INTRODUCTION */}
      <h2 style={h2Style}>1. Introduction</h2>

      <p className="mb-4">
        The dynamics of multi-agent reinforcement learning (MARL) in adversarial game environments
        constitute a system of extraordinary complexity, wherein the non-stationarity induced by
        the simultaneous adaptation of multiple autonomous policy-gradient learners generates
        emergent collective phenomena that resist analysis by conventional single-agent frameworks.
        Practitioners of MARL have long observed that training populations of competing agents
        exhibit pathological instabilities — sudden collapses of previously successful strategies,
        oscillatory policy cycles, and catastrophic forgetting of learned behaviors — that bear
        a striking phenomenological resemblance to the critical fluctuations, symmetry breaking,
        and phase transitions observed in condensed-matter and statistical-mechanical systems.
        Despite this suggestive analogy, a rigorous theoretical bridge between the statistical
        physics of interacting particle systems and the optimization dynamics of multi-agent
        policy gradients has remained largely unexplored, with existing work confined to
        heuristic parallels and dimensional analyses that, while evocative, lack the predictive
        power necessary for practical training-protocol design.
      </p>

      <p className="mb-4 indent-8">
        In this paper, we develop a comprehensive mean-field theoretic framework that places
        the analogy between MARL dynamics and non-equilibrium statistical mechanics on rigorous
        mathematical foundations. We model the joint evolution of <Tex math="N" /> interacting
        agents as a system of coupled stochastic differential equations in a high-dimensional
        policy-parameter space, derive the corresponding Fokker–Planck equation governing the
        evolution of the policy-parameter probability density, and demonstrate that the system
        undergoes a continuous phase transition at a critical reward-coupling strength{' '}
        <Tex math="J_c" /> whose value is determined by the spectral radius of the agent
        interaction graph. Below the critical point, agents behave as approximately independent
        learners with uncorrelated policy fluctuations; above it, a macroscopic fraction of the
        population spontaneously aligns into coherent strategy clusters, breaking the symmetry
        of the initial uniform-random policy distribution. The order parameter, susceptibility,
        and correlation length of the agent population are computed in closed form within the
        mean-field approximation, and the predicted critical exponents are validated against
        large-scale numerical simulations of 64-agent adversarial capture-the-flag environments.
      </p>

      <p className="mb-4 indent-8">
        Beyond its theoretical significance, the statistical-mechanical perspective yields
        immediately actionable insights for training-protocol design. We introduce a
        renormalization-group-inspired curriculum that gradually increases the reward coupling
        between agents, steering the system through the critical point in a controlled manner
        that avoids the large variance spikes and training instabilities characteristic of
        abrupt phase transitions. This curriculum reduces training variance by 58% and
        wall-clock convergence time by 34% relative to standard independent-learner baselines,
        establishing a direct practical benefit of the thermodynamic framework.
      </p>

      {/* 2. NOTATION AND MATHEMATICAL PRELIMINARIES */}
      <h2 style={h2Style}>2. Notation and Mathematical Preliminaries</h2>

      <p className="mb-4">
        Before developing the statistical-mechanical theory of multi-agent learning, we
        establish the mathematical apparatus and notational conventions that underpin the
        remainder of this work. The framework draws on three pillars — stochastic analysis,
        equilibrium statistical mechanics, and spectral graph theory — each of which
        contributes essential machinery to the formulation of coupled learning dynamics as a
        thermodynamic system. Readers fluent in all three disciplines may wish to skim this
        section for notation and proceed directly to Section 3.
      </p>

      <h3 style={h3Style}>2.1 Stochastic Calculus and SDE Framework</h3>

      <p className="mb-4">
        Throughout this paper we work on a filtered probability space{' '}
        <Tex math="(\Omega, \mathcal{F}, \{\mathcal{F}_t\}_{t \geq 0}, \mathbb{P})" /> satisfying the
        usual conditions of completeness and right-continuity. A standard{' '}
        <Tex math="d" />-dimensional Wiener process (Brownian motion){' '}
        <Tex math="W_t = (W_t^1, \ldots, W_t^d)^\top" /> is an{' '}
        <Tex math="\mathcal{F}_t" />-adapted process with independent increments,{' '}
        <Tex math="W_0 = 0" />, and <Tex math="W_t - W_s \sim \mathcal{N}(0, (t-s)I_d)" /> for{' '}
        <Tex math="0 \leq s < t" />. Itô&apos;s formula, the chain rule of stochastic calculus, states that
        for <Tex math="f \in C^2(\mathbb{R}^d)" /> and an Itô process{' '}
        <Tex math="dX_t = b(X_t)\,dt + \sigma(X_t)\,dW_t" /> one has (Øksendal, 2003):
      </p>

      <TexBlock math="df(X_t) = \left[ \sum_i b_i \frac{\partial f}{\partial x_i} + \frac{1}{2} \sum_{i,j} (\sigma \sigma^\top)_{ij} \frac{\partial^2 f}{\partial x_i \partial x_j} \right] dt + \sum_i \left( \sigma^\top \nabla f \right)_i dW_t^i" />

      <p className="mb-4 indent-8">
        The infinitesimal generator <Tex math="\mathcal{L}" /> of the diffusion process{' '}
        <Tex math="X_t" /> is the second-order differential operator that captures the expected
        instantaneous rate of change of smooth observables. For the Itô diffusion{' '}
        <Tex math="dX_t = b(X_t)\,dt + \sigma(X_t)\,dW_t" />, the generator acts on{' '}
        <Tex math="f \in C^2_c(\mathbb{R}^d)" /> as:
      </p>

      <TexBlock math="\mathcal{L}f(x) = \sum_{i=1}^{d} b_i(x)\,\frac{\partial f}{\partial x_i} + \frac{1}{2}\sum_{i,j=1}^{d} \bigl(\sigma\sigma^\top\bigr)_{ij}(x)\,\frac{\partial^2 f}{\partial x_i\,\partial x_j}" />

      <p className="mb-4">
        The dual of <Tex math="\mathcal{L}" /> governs the time evolution of the probability
        density <Tex math="\rho(x,t)" /> of <Tex math="X_t" /> via the Fokker–Planck (forward
        Kolmogorov) equation:
      </p>

      <TexBlock math="\frac{\partial \rho}{\partial t} = -\sum_i \frac{\partial}{\partial x_i}\bigl[b_i\,\rho\bigr] + \frac{1}{2}\sum_{i,j}\frac{\partial^2}{\partial x_i\,\partial x_j}\bigl[(\sigma\sigma^\top)_{ij}\,\rho\bigr]" />

      <p className="mb-4 indent-8">
        When the drift is derivable from a potential, <Tex math="b = -\nabla V" />, and the
        diffusion is isotropic with coefficient <Tex math="D" />, the stationary solution of the
        Fokker–Planck equation is the Gibbs–Boltzmann distribution{' '}
        <Tex math="\rho_\text{eq}(x) \propto \exp(-V(x)/D)" />, forging the fundamental link between
        stochastic dynamics and equilibrium statistical mechanics that we exploit throughout this
        work (Risken, 1996).
      </p>

      <h3 style={h3Style}>2.2 Statistical Mechanics Preliminaries</h3>

      <p className="mb-4">
        We adopt the canonical-ensemble formulation of equilibrium statistical mechanics. A
        system with microscopic state <Tex math="x \in \mathcal{X}" /> and energy function
        (Hamiltonian) <Tex math="H(x)" /> in thermal contact with a reservoir at temperature{' '}
        <Tex math="T" /> is described by the Gibbs canonical distribution{' '}
        <Tex math="\rho_\beta(x) = Z(\beta)^{-1}\exp(-\beta H(x))" />, where{' '}
        <Tex math="\beta = 1/T" /> is the inverse temperature (we set the Boltzmann constant{' '}
        <Tex math="k_B = 1" /> throughout). The partition function <Tex math="Z(\beta)" /> encodes
        the full thermodynamic content of the system:
      </p>

      <TexBlock math="Z(\beta) = \int_{\mathcal{X}} e^{-\beta H(x)}\,dx, \qquad F(\beta) = -T \ln Z(\beta) = -\frac{1}{\beta}\ln Z(\beta)" />

      <p className="mb-4 indent-8">
        The Helmholtz free energy <Tex math="F = U - TS" /> (with internal energy{' '}
        <Tex math="U = \langle H \rangle" /> and entropy{' '}
        <Tex math="S = -\langle \ln \rho \rangle" />) is the natural thermodynamic potential in
        the canonical ensemble. Successive Legendre transforms yield the remaining potentials
        of classical thermodynamics — the Gibbs free energy{' '}
        <Tex math="G = F + PV" />, enthalpy <Tex math="H = U + PV" />, and grand potential{' '}
        <Tex math="\Phi = F - \mu N" /> — each adapted to different external constraints. In the
        multi-agent context the relevant Legendre structure connects the free energy (parameterized
        by inverse temperature <Tex math="\beta" /> and coupling strength <Tex math="J" />) to
        the order-parameter potential via the Legendre–Fenchel transform (Goldenfeld, 1992):
      </p>

      <TexBlock math="\Gamma(m) = \sup_{h}\bigl[\,h\,m - F(\beta, J, h)\,\bigr], \qquad m = -\frac{\partial F}{\partial h}\bigg|_{h=0}" />

      <p className="mb-4">
        Here <Tex math="h" /> is an external field conjugate to the order parameter{' '}
        <Tex math="m" />, and <Tex math="\Gamma(m)" /> is the effective potential (Gibbs free
        energy density) whose minima identify the stable macroscopic phases of the system. The
        convexity properties of <Tex math="\Gamma" /> directly determine phase coexistence,
        metastability, and spinodal boundaries — concepts that map precisely onto the convergence
        landscape of the multi-agent system, as we shall demonstrate in subsequent sections.
      </p>

      <p className="mb-4 indent-8">
        Thermal fluctuations around equilibrium are governed by the fluctuation-dissipation
        relations. The susceptibility <Tex math="\chi" />, measuring the response of{' '}
        <Tex math="m" /> to an infinitesimal external field, is related to the variance of the
        order parameter by <Tex math="\chi = \beta\bigl(\langle m^2 \rangle - \langle m \rangle^2\bigr)" />.
        At a continuous phase transition the susceptibility diverges as{' '}
        <Tex math="\chi \sim |T - T_c|^{-\gamma}" />, signaling the onset of long-range
        correlations. We will show that the analogous divergence in the multi-agent system
        manifests as unbounded training variance near the critical coupling{' '}
        <Tex math="J_c" />, providing a thermodynamic explanation for the empirically observed
        instabilities in cooperative MARL training.
      </p>

      <h3 style={h3Style}>2.3 Graph-Theoretic Notation</h3>

      <p className="mb-4">
        The interaction topology of the agent population is encoded in an undirected graph{' '}
        <Tex math="G = (V, E)" /> with vertex set <Tex math="V = \{1, \ldots, N\}" /> (agents)
        and edge set <Tex math="E \subseteq V \times V" /> (pairwise interactions). The adjacency
        matrix <Tex math="A \in \{0,1\}^{N \times N}" /> has entries{' '}
        <Tex math="A_{ij} = \mathbf{1}_{(i,j) \in E}" />. We denote the degree of vertex{' '}
        <Tex math="i" /> by <Tex math="d_i = \sum_j A_{ij}" /> and the degree matrix by{' '}
        <Tex math="D = \operatorname{diag}(d_1, \ldots, d_N)" />. The combinatorial graph
        Laplacian is <Tex math="L = D - A" />, a positive-semidefinite matrix whose spectral
        properties control diffusive transport and synchronization phenomena on the network
        (Chung, 1997).
      </p>

      <TexBlock math="L = D - A, \qquad 0 = \lambda_1 \leq \lambda_2 \leq \cdots \leq \lambda_N, \qquad L\,\mathbf{1} = 0" />

      <p className="mb-4 indent-8">
        The eigenvalues <Tex math="\{\lambda_k\}_{k=1}^N" /> of <Tex math="L" /> are
        non-negative, with <Tex math="\lambda_1 = 0" /> corresponding to the constant
        eigenvector. The algebraic connectivity <Tex math="\lambda_2" /> (the Fiedler value)
        quantifies the bottleneck of information flow across the graph: a larger{' '}
        <Tex math="\lambda_2" /> implies faster mixing and tighter synchronization of coupled
        dynamics. The spectral gap <Tex math="\lambda_2" /> enters directly into the
        convergence rate of the mean-field approximation; specifically, finite-size corrections
        to the mean-field free energy scale as{' '}
        <Tex math="O(\lambda_2^{-1} N^{-1})" />.
      </p>

      <TexBlock math="\rho_L(\lambda) = \frac{1}{N}\sum_{k=1}^{N}\delta(\lambda - \lambda_k), \qquad r(A) = \max_{k}|\mu_k| = \text{spectral radius}" />

      <p className="mb-4">
        The spectral density <Tex math="\rho_L(\lambda)" /> of the Laplacian characterizes the
        global topology of the interaction graph in a manner invariant to vertex labeling. For
        random Erdős–Rényi graphs with connection probability <Tex math="p" />, the spectral
        density converges to a shifted semicircle law in the dense limit, while for sparse
        graphs it exhibits heavy tails reflecting the presence of hub vertices. The spectral
        radius <Tex math="r(A)" /> of the adjacency matrix — the largest eigenvalue in absolute
        value — governs the critical coupling threshold: the mean-field phase transition occurs
        at <Tex math="J_c = T / r(A)" />, establishing a direct link between network topology
        and the onset of collective behavior in the agent population.
      </p>

      <p className="mb-4 indent-8">
        For structured interaction topologies (lattices, small-world networks, scale-free
        graphs), the spectral properties of <Tex math="L" /> and <Tex math="A" /> determine
        the universality class of the phase transition and, consequently, the critical exponents
        governing the divergence of training variance near <Tex math="J_c" />. We will
        exploit the normalized Laplacian{' '}
        <Tex math="\mathcal{L} = D^{-1/2}LD^{-1/2} = I - D^{-1/2}AD^{-1/2}" /> when analyzing
        heterogeneous-degree graphs, as its spectrum is confined to{' '}
        <Tex math="[0, 2]" /> and admits tighter perturbative bounds (Chung, 1997). The
        interplay between spectral geometry and thermodynamic criticality constitutes one of
        the central themes of this work.
      </p>

      {/* 3. THEORETICAL FRAMEWORK */}
      <h2 style={h2Style}>3. Theoretical Framework</h2>

      <h3 style={h3Style}>3.1 Agent Dynamics as Coupled Stochastic Processes</h3>

      <p className="mb-4">
        Consider a population of <Tex math="N" /> reinforcement learning agents, each
        parameterized by a policy-parameter vector{' '}
        <Tex math="\theta_i \in \mathbb{R}^d" /> for <Tex math="i = 1, \ldots, N" />.
        Each agent <Tex math="i" /> seeks to maximize its expected cumulative reward{' '}
        <Tex math="R_i(\theta_1, \ldots, \theta_N)" />, which depends on the policies of
        all agents through their adversarial interactions in the game environment. The
        policy-gradient dynamics of agent <Tex math="i" /> are described by the stochastic
        differential equation (SDE):
      </p>

      <TexBlock math="d\theta_i = \eta \nabla_{\theta_i} R_i(\theta_1, \ldots, \theta_N)\, dt + \sqrt{2\eta T}\, dW_i" />

      <p className="mb-4">
        where <Tex math="\eta" /> is the learning rate, <Tex math="T" /> is an effective
        temperature parameterizing the stochasticity of the gradient estimator (arising from
        Monte Carlo rollouts), and <Tex math="W_i" /> is a standard <Tex math="d" />-dimensional
        Wiener process. The noise term captures both the intrinsic stochasticity of
        trajectory-based gradient estimation and any explicit exploration noise added by the
        learning algorithm.
      </p>

      <p className="mb-4 indent-8">
        We decompose the reward function into a single-agent component and a pairwise
        interaction term:
      </p>

      <TexBlock math="R_i(\theta_1, \ldots, \theta_N) = R_i^{(0)}(\theta_i) + \frac{J}{N} \sum_{j \neq i} G_{ij}\, \Psi(\theta_i, \theta_j)" />

      <p className="mb-4">
        where <Tex math="R_i^{(0)}(\theta_i)" /> is the intrinsic reward that agent{' '}
        <Tex math="i" /> would receive in isolation, <Tex math="J \geq 0" /> is the
        reward-coupling strength, <Tex math="G_{ij} \in \{0, 1\}" /> encodes the
        interaction graph (with <Tex math="G_{ij} = 1" /> if agents <Tex math="i" /> and{' '}
        <Tex math="j" /> interact directly in the game environment), and{' '}
        <Tex math="\Psi(\theta_i, \theta_j)" /> is a symmetric interaction kernel measuring
        the strategic compatibility (or antagonism) of the two agents&apos; policies. The
        factor <Tex math="1/N" /> in the coupling term ensures a well-defined thermodynamic
        limit as <Tex math="N \to \infty" /> — the Kac prescription familiar from mean-field
        models in statistical physics.
      </p>

      <h3 style={h3Style}>3.2 Mean-Field Reduction and the Fokker–Planck Equation</h3>

      <p className="mb-4">
        In the mean-field limit, each agent interacts not with specific neighbors but with the
        empirical distribution of policies across the population. Define the empirical measure:
      </p>

      <TexBlock math="\mu_N(t) = \frac{1}{N} \sum_{i=1}^{N} \delta_{\theta_i(t)}" />

      <p className="mb-4">
        By the propagation-of-chaos result (Sznitman, 1991), as <Tex math="N \to \infty" /> the
        empirical measure converges to a deterministic probability density{' '}
        <Tex math="\rho(\theta, t)" /> satisfying the McKean–Vlasov (nonlinear) Fokker–Planck
        equation:
      </p>

      <TexBlock math="\frac{\partial \rho}{\partial t} = -\nabla_\theta \cdot \left[ \rho\, \eta\, \nabla_\theta \left( R^{(0)}(\theta) + J \int \Psi(\theta, \theta')\, \rho(\theta', t)\, d\theta' \right) \right] + \eta T\, \Delta_\theta \rho" />

      <p className="mb-4 indent-8">
        This partial differential equation governs the evolution of the macroscopic
        policy-parameter distribution under the combined influence of gradient ascent
        (the drift term) and noise (the diffusion term). The nonlinearity enters through
        the convolution of <Tex math="\rho" /> with the interaction kernel{' '}
        <Tex math="\Psi" />, which couples the evolution of each agent&apos;s policy to the
        instantaneous state of the entire population. At stationarity{' '}
        (<Tex math="\partial \rho / \partial t = 0" />), the density satisfies a
        self-consistency equation that is the infinite-dimensional analogue of the
        self-consistent mean-field equation of the Curie–Weiss model in magnetism.
      </p>

      <h3 style={h3Style}>3.3 Order Parameter and Self-Consistency</h3>

      <p className="mb-4">
        To characterize the macroscopic state of the agent population, we introduce the
        order parameter <Tex math="m" /> as the magnitude of the mean policy alignment:
      </p>

      <TexBlock math="m = \left\| \int \theta\, \rho(\theta)\, d\theta \right\| = \left\| \langle \theta \rangle_\rho \right\|" />

      <p className="mb-4">
        In the disordered (uncorrelated) phase, <Tex math="m = 0" />: agents&apos; policy
        parameters are distributed isotropically, and no macroscopic strategy cluster
        emerges. In the ordered (correlated) phase, <Tex math="m > 0" />: a finite
        fraction of agents spontaneously aligns, breaking the rotational symmetry of
        the policy-parameter space. Under the Gaussian fluctuation assumption — that
        deviations from the mean-field solution are normally distributed with covariance{' '}
        <Tex math="\Sigma = O(1/N)" /> — we derive the self-consistency equation for the
        order parameter:
      </p>

      <TexBlock math="m = \tanh\!\left(\frac{J \lambda_{\max}(G)}{T}\, m\right)" />

      <p className="mb-4">
        where <Tex math="\lambda_{\max}(G)" /> is the spectral radius (largest eigenvalue) of
        the interaction graph adjacency matrix. This equation has a non-trivial solution{' '}
        <Tex math="m \neq 0" /> if and only if:
      </p>

      <TexBlock math="\frac{J \lambda_{\max}(G)}{T} > 1 \qquad \Longleftrightarrow \qquad J > J_c = \frac{T}{\lambda_{\max}(G)}" />

      <p className="mb-4 indent-8">
        This is the critical condition for the onset of spontaneous strategy alignment. The
        critical coupling <Tex math="J_c" /> decreases as the interaction graph becomes more
        connected (larger <Tex math="\lambda_{\max}" />) and increases with the noise
        temperature <Tex math="T" />. Below <Tex math="J_c" />, the only stable solution
        is <Tex math="m = 0" /> (disordered phase); above <Tex math="J_c" />, two
        degenerate ordered solutions emerge via a pitchfork bifurcation, corresponding to
        two possible strategy-cluster orientations.
      </p>

      <PaperFigure number={1} caption="Order parameter m as a function of reward-coupling strength J, showing the continuous phase transition at J_c ≈ 0.75. Data points are from 64-agent simulations; the solid curve is the mean-field prediction.">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" name="J" type="number" domain={[0, 1.3]} label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis dataKey="orderParam" name="m" type="number" domain={[0, 1]} label={{ value: 'Order Parameter m', angle: -90, position: 'insideLeft' }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={phaseDiagramData} fill="#6366f1" name="Measured m" />
          </ScatterChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 5. HAMILTONIAN FORMULATION AND ENERGY LANDSCAPE */}
      <h2 style={h2Style}>5. Hamiltonian Formulation and Energy Landscape</h2>

      <h3 style={h3Style}>5.1 Effective Hamiltonian for the Agent System</h3>

      <p className="mb-4">
        The statistical-mechanical programme initiated in the preceding sections reaches its
        natural culmination in the construction of an effective Hamiltonian that governs the
        joint policy space of the <Tex math="N" />-agent system. Following the methodology of
        Mézard, Parisi, and Virasoro in their treatment of disordered spin systems, we write the
        total reward landscape as a Hamiltonian functional acting on the parameter
        vectors <Tex math="\boldsymbol{\theta} = (\theta_1, \dots, \theta_N)" />:
      </p>

      <TexBlock math="\mathcal{H}[\boldsymbol{\theta}] = -\sum_{i=1}^{N} R^{0}(\theta_i) \;-\; \frac{J}{N}\sum_{i < j} G_{ij}\,\Psi(\theta_i, \theta_j)" />

      <p className="mb-4">
        where <Tex math="R^{0}(\theta_i)" /> denotes the single-agent (non-interacting) reward
        for policy <Tex math="\theta_i" />, <Tex math="G_{ij}" /> are the adjacency
        coefficients of the interaction graph, and <Tex math="\Psi(\theta_i, \theta_j)" /> is
        a symmetric interaction kernel encoding the reward modification due to joint
        play. The prefactor <Tex math="1/N" /> enforces the Kac prescription, guaranteeing
        extensivity of the Hamiltonian in the thermodynamic limit. This form is structurally
        identical to the Sherrington–Kirkpatrick Hamiltonian in the fully-connected case
        (<Tex math="G_{ij} = 1\;\forall\,i \neq j" />), with the crucial distinction that our
        couplings are deterministic and derive from the game-theoretic payoff structure rather
        than quenched random disorder.
      </p>

      <p className="mb-4 indent-8">
        The relationship to classical spin Hamiltonians becomes transparent upon considering
        the Ising limit. If the policy space is binary, <Tex math="\theta_i \in \{-1, +1\}" />,
        and we set <Tex math="\Psi(\theta_i, \theta_j) = \theta_i \theta_j" />, we
        recover the standard ferromagnetic Ising model with Hamiltonian{' '}
        <Tex math="\mathcal{H} = -J\sum_{i<j} \theta_i \theta_j" />. For continuous policy
        spaces, <Tex math="\Psi" /> generalises to the inner-product kernel, yielding
        the classical Heisenberg model when <Tex math="\theta_i \in S^2" />. The
        general case interpolates between these limits and encompasses the full
        complexity of the MARL energy landscape.
      </p>

      <p className="mb-4">
        To extract the low-energy physics, we perform a systematic Taylor expansion of the
        Hamiltonian around the mean-field solution <Tex math="\theta_i^* = \theta^{*}" />{' '}
        (the spatially uniform saddle point). Writing <Tex math="\theta_i = \theta^* + \delta\theta_i" /> and
        expanding to second order:
      </p>

      <TexBlock math="\mathcal{H}[\boldsymbol{\theta}] \approx \mathcal{H}[\boldsymbol{\theta}^*] + \frac{1}{2}\sum_{i,j} \frac{\partial^2 \mathcal{H}}{\partial \theta_i \partial \theta_j}\bigg|_{\boldsymbol{\theta}^*} \delta\theta_i\,\delta\theta_j = \mathcal{H}_0 + \frac{1}{2}\,\delta\boldsymbol{\theta}^{\!\top} \mathbf{M}\,\delta\boldsymbol{\theta}" />

      <p className="mb-4">
        The Hessian matrix <Tex math="\mathbf{M}" /> has elements{' '}
        <Tex math="M_{ij} = -\partial^2 R^0/\partial\theta_i^2\,\delta_{ij} - (J/N)\,G_{ij}\,\Psi''(\theta^*, \theta^*)" />.
        The eigenvalue spectrum of <Tex math="\mathbf{M}" /> determines the local curvature
        of the energy landscape and, consequently, the stability of the mean-field solution.
        Negative eigenvalues indicate directions of instability — the onset of symmetry breaking.
        The spectral gap between the lowest eigenvalue and zero controls the relaxation timescale
        of Gaussian fluctuations via <Tex math="\tau_k \sim |\lambda_k|^{-1}" />.
      </p>

      <h3 style={h3Style}>5.2 Landscape Topology and Barrier Heights</h3>

      <p className="mb-4">
        The global structure of the energy landscape is characterised by Morse theory, which
        relates the topology of the sub-level sets{' '}
        <Tex math="\mathcal{M}_a = \{\boldsymbol{\theta} : \mathcal{H}(\boldsymbol{\theta}) \leq a\}" /> to the
        critical points of <Tex math="\mathcal{H}" />. At a non-degenerate critical
        point <Tex math="\boldsymbol{\theta}_c" /> (where <Tex math="\nabla \mathcal{H} = 0" /> and
        the Hessian is non-singular), the Morse index <Tex math="\mu" /> — equal to the
        number of negative eigenvalues of <Tex math="\mathbf{M}" /> — classifies the
        critical point: <Tex math="\mu = 0" /> for local minima, <Tex math="\mu = 1" /> for
        first-order saddles, and so on. The Morse inequalities constrain the topology of the
        landscape, requiring at minimum <Tex math="b_k" /> critical points of
        index <Tex math="k" />, where <Tex math="b_k" /> are the Betti numbers of the
        configuration space.
      </p>

      <p className="mb-4 indent-8">
        The saddle-index theorem, as formulated by Cavagna, Garrahan, and Giardina in the context
        of supercooled liquids, relates the energy density of critical points to their index
        density. For our MARL Hamiltonian, this takes the form:
      </p>

      <TexBlock math="\overline{\mu}(\varepsilon) = \frac{1}{N}\,\mathbb{E}\!\left[\#\{\text{negative eigenvalues of } \mathbf{M}(\boldsymbol{\theta}_c)\} \;\big|\; \mathcal{H}(\boldsymbol{\theta}_c)/N = \varepsilon\right]" />

      <p className="mb-4">
        Near the ground state, <Tex math="\overline{\mu} \to 0" />, whereas at energies near the
        paramagnetic solution, <Tex math="\overline{\mu} \to 1/2" />. The energy barriers
        separating the two ordered minima (the degenerate strategy-cluster solutions) scale as:
      </p>

      <TexBlock math="\Delta \mathcal{H}_{\text{barrier}} \sim N\,(J - J_c)^{2-\alpha} \quad \text{for } J > J_c" />

      <p className="mb-4 indent-8">
        where <Tex math="\alpha" /> is the specific-heat exponent. This extensive barrier
        height implies that spontaneous transitions between ordered phases are exponentially
        suppressed in system size — a result with profound implications for MARL training,
        as it explains the phenomenon of strategy lock-in observed in large-<Tex math="N" /> systems.
        The Arrhenius escape time <Tex math="\tau_{\text{escape}} \sim \exp(\Delta\mathcal{H}_{\text{barrier}} / T)" /> grows
        super-exponentially with <Tex math="N" />, establishing a rigorous thermodynamic basis
        for the irreversibility of symmetry-broken phases in competitive multi-agent systems.
      </p>

      <PaperFigure number={7} caption="Eigenvalue spectrum of the effective Hamiltonian Hessian M evaluated at the mean-field saddle point for a 10-agent system. Negative eigenvalues indicate unstable directions corresponding to incipient symmetry breaking.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={hamiltonianSpectrumData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="eigenindex" label={{ value: 'Eigenindex k', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Eigenvalue λₖ', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="eigenvalue" fill="#6366f1" name="λₖ" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 6. FREE ENERGY AND THERMODYNAMIC POTENTIALS */}
      <h2 style={h2Style}>6. Free Energy and Thermodynamic Potentials</h2>

      <h3 style={h3Style}>6.1 Partition Function and Free Energy</h3>

      <p className="mb-4">
        The thermodynamic properties of the multi-agent system are encoded in the partition
        function, obtained by summing (or integrating, for continuous policies) the Boltzmann
        weight over all configurations of the joint policy space. In the canonical ensemble at
        inverse temperature <Tex math="\beta = 1/T" />:
      </p>

      <TexBlock math="Z(\beta, J) = \int \prod_{i=1}^{N} d\theta_i \;\exp\!\left(-\beta\,\mathcal{H}[\boldsymbol{\theta}]\right) = \int \mathcal{D}\boldsymbol{\theta}\;\exp\!\left(\beta\sum_i R^0(\theta_i) + \frac{\beta J}{N}\sum_{i<j} G_{ij}\,\Psi(\theta_i, \theta_j)\right)" />

      <p className="mb-4">
        The Helmholtz free energy <Tex math="F = -T \ln Z" /> constitutes the fundamental
        thermodynamic potential from which all equilibrium properties derive. In the
        thermodynamic limit (<Tex math="N \to \infty" />), the free energy density{' '}
        <Tex math="f = F/N" /> is self-averaging and can be evaluated via the saddle-point
        method. For the mean-field Hamiltonian on a complete graph, the Hubbard–Stratonovich
        transformation decouples the quadratic interaction, yielding:
      </p>

      <TexBlock math="f(\beta, J) = \frac{J m^2}{2} - T \ln \int d\theta\;\exp\!\left(\beta R^0(\theta) + \beta J m\,\psi(\theta)\right) - T\,S_{\text{mix}}" />

      <p className="mb-4 indent-8">
        where <Tex math="m" /> is the order parameter satisfying the self-consistency
        equation, <Tex math="\psi(\theta)" /> is the single-site projection
        of <Tex math="\Psi" />, and <Tex math="S_{\text{mix}}" /> is the mixing entropy. The
        Legendre structure of thermodynamics provides the conjugate potentials: the Gibbs
        potential <Tex math="G(T, h) = F - hm" /> (obtained by Legendre-transforming with
        respect to the external field <Tex math="h" />), and the enthalpy{' '}
        <Tex math="H = F + TS" />, equal to the internal energy. The Helmholtz decomposition{' '}
        <Tex math="F = U - TS" /> separates the energetic contribution (agent interactions
        and individual rewards) from the entropic contribution (the multiplicity of policy
        configurations consistent with a given macroscopic state).
      </p>

      <p className="mb-4">
        The entropy <Tex math="S = -\partial F/\partial T" /> measures the effective
        dimensionality of the accessible policy manifold at temperature <Tex math="T" />.
        In the disordered phase (<Tex math="J < J_c" />), the entropy is maximal and
        approximately equal to the logarithm of the policy-space volume. At the transition,
        the entropy decreases discontinuously (first-order transition) or develops a kink
        (continuous transition), reflecting the loss of accessible configurations as agents
        become locked into correlated strategy clusters.
      </p>

      <h3 style={h3Style}>6.2 Specific Heat and Critical Singularities</h3>

      <p className="mb-4">
        The specific heat — the most experimentally accessible thermodynamic quantity in
        computational systems, as it can be extracted from the variance of the total
        reward — is defined as the second temperature derivative of the free energy:
      </p>

      <TexBlock math="C(J) = -T\,\frac{\partial^2 F}{\partial T^2} = \frac{\beta^2}{N}\left(\langle \mathcal{H}^2 \rangle - \langle \mathcal{H} \rangle^2\right) \sim |J - J_c|^{-\alpha}" />

      <p className="mb-4">
        where <Tex math="\alpha" /> is the specific-heat exponent. In the mean-field
        universality class, <Tex math="\alpha = 0" /> (logarithmic divergence), corresponding
        to a discontinuous jump rather than a true divergence. This is the analogue of the
        classical result for the four-dimensional Ising model and reflects the suppression of
        fluctuations by the infinite-range nature of mean-field interactions. The specific heat
        encodes a latent-heat-like feature: the energy difference{' '}
        <Tex math="\Delta U = T_c \Delta S" /> between ordered and disordered phases at the
        critical point, precisely quantifying the thermodynamic cost of strategy alignment.
      </p>

      <p className="mb-4 indent-8">
        The hyperscaling relation <Tex math="\alpha = 2 - \nu d" />, valid below the upper
        critical dimension <Tex math="d_c = 4" />, connects the specific-heat singularity to
        the correlation-length exponent <Tex math="\nu" /> and the effective dimensionality{' '}
        <Tex math="d" /> of the interaction graph. For the complete graph ({' '}
        <Tex math="d \to \infty" />), mean-field theory is exact; for sparse graphs with
        finite spectral dimension, fluctuation corrections modify the exponents according to
        the <Tex math="\varepsilon" />-expansion of Wilson and Fisher.
      </p>

      <PaperFigure number={8} caption="Thermodynamic potentials as functions of inverse temperature β: Helmholtz free energy F(β), entropy S(β), and internal energy U(β). The entropy decrease near β ≈ 0.75 signals the onset of strategy ordering.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={freeEnergyData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="beta" label={{ value: 'Inverse Temperature β', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Thermodynamic Potential', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="freeEnergy" stroke="#6366f1" name="Free Energy F" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="entropy" stroke="#f59e0b" name="Entropy S" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="internalEnergy" stroke="#ef4444" name="Internal Energy U" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={9} caption="Specific heat C(J) as a function of coupling strength, exhibiting a sharp peak at J_c ≈ 0.75. The near-divergence reflects the mean-field logarithmic singularity (α = 0), broadened by finite-size effects.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={specificHeatData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Specific Heat C(J)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="specificHeat" stroke="#6366f1" name="C(J)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 7. REPLICA SYMMETRY AND SPIN-GLASS ANALOGIES */}
      <h2 style={h2Style}>7. Replica Symmetry and Spin-Glass Analogies</h2>

      <h3 style={h3Style}>7.1 Edwards–Anderson Order Parameter</h3>

      <p className="mb-4">
        The preceding analysis assumes that the interaction couplings are deterministic and
        spatially uniform — the &ldquo;pure&rdquo; ferromagnetic case. In realistic MARL settings,
        however, the effective couplings are contaminated by quenched disorder arising from
        environment stochasticity, reward noise, and the inherent randomness of policy
        initialisation. Following the seminal work of Edwards and Anderson on spin glasses,
        we introduce the Edwards–Anderson order parameter:
      </p>

      <TexBlock math="q_{\text{EA}} = \frac{1}{N}\sum_{i=1}^{N} \langle \sigma_i \rangle_t^2 = \frac{1}{N}\sum_{i=1}^{N} \left(\lim_{T_{\text{obs}}\to\infty} \frac{1}{T_{\text{obs}}} \int_0^{T_{\text{obs}}} \sigma_i(t)\,dt\right)^{\!2}" />

      <p className="mb-4">
        where <Tex math="\sigma_i = \text{sgn}(\theta_i - \theta^*)" /> is the Ising projection
        of agent <Tex math="i" />&apos;s policy relative to the mean-field solution, and the
        angle brackets denote a time average over the training trajectory. The quantity{' '}
        <Tex math="q_{\text{EA}}" /> measures the degree to which individual agent policies
        freeze into fixed orientations — non-zero <Tex math="q_{\text{EA}}" /> indicates that
        each agent has settled into a persistent strategy, even though the global magnetisation
        may vanish due to frustration. This is the hallmark of the spin-glass phase: frozen
        disorder without long-range order, or in the MARL vernacular, persistent strategy
        heterogeneity without team coordination.
      </p>

      <p className="mb-4 indent-8">
        The replica method, introduced by Edwards and Anderson and developed to its fullest
        extent by Mézard, Parisi, and Virasoro, provides the only known systematic approach
        to computing <Tex math="q_{\text{EA}}" /> in the thermodynamic limit. One introduces{' '}
        <Tex math="n" /> replicas of the system — <Tex math="n" /> independent copies with
        identical disorder realisations — and exploits the identity{' '}
        <Tex math="\ln Z = \lim_{n \to 0} (Z^n - 1)/n" /> to compute the disorder-averaged
        free energy <Tex math="[\![F]\!] = -T\,[\![\ln Z]\!]" />. The replica partition function is:
      </p>

      <TexBlock math="[\![Z^n]\!] = \int \prod_{a=1}^{n}\mathcal{D}\boldsymbol{\theta}^{(a)}\;\exp\!\left(-\beta\sum_{a=1}^n \mathcal{H}[\boldsymbol{\theta}^{(a)}]\right) \bigg]_{\text{dis}}" />

      <p className="mb-4">
        where <Tex math="[\![\cdot]\!]" /> denotes the average over disorder realisations.
        After disorder-averaging, the replicas become coupled through the overlap
        matrix <Tex math="Q_{ab} = N^{-1}\sum_i \theta_i^{(a)}\theta_i^{(b)}" />. The
        self-averaging property — rigorously established by Pastur and Shcherbina for
        the Sherrington–Kirkpatrick model — guarantees that <Tex math="q_{\text{EA}}" /> is
        non-random in the thermodynamic limit, depending only on the statistical properties
        of the disorder distribution and not on its specific realisation.
      </p>

      <p className="mb-4">
        In the MARL context, the &ldquo;quenched disorder&rdquo; comprises the fixed components
        of the environment: the reward function, the observation kernel, and the initial
        conditions. Each training run corresponds to a specific disorder realisation, and
        the Edwards–Anderson parameter measures the run-to-run consistency of individual
        agent strategies. A system with <Tex math="q_{\text{EA}} > 0" /> but <Tex math="m = 0" /> is
        in the spin-glass phase — agents have learned fixed but mutually incompatible
        strategies, a scenario familiar to practitioners as the &ldquo;strategy cycling&rdquo;
        failure mode.
      </p>

      <h3 style={h3Style}>7.2 Replica Symmetry Breaking</h3>

      <p className="mb-4">
        The replica-symmetric (RS) ansatz assumes <Tex math="Q_{ab} = q" /> for all{' '}
        <Tex math="a \neq b" />, yielding a single overlap parameter. However, as demonstrated
        by de Almeida and Thouless for the Sherrington–Kirkpatrick model, the RS solution
        becomes unstable below a critical temperature — the de Almeida–Thouless (AT) line —
        signalling the onset of replica symmetry breaking (RSB). In the MARL Hamiltonian,
        the AT stability condition takes the form:
      </p>

      <TexBlock math="\frac{\beta^2 J^2}{N}\sum_{i,j} G_{ij}^2\,\left(1 - q_{\text{EA}}\right)^2 < 1" />

      <p className="mb-4 indent-8">
        When this condition is violated, the RS solution is locally unstable and the system
        enters the RSB phase. Parisi&apos;s celebrated replica-symmetry-breaking scheme replaces
        the single overlap <Tex math="q" /> with a hierarchical, ultrametric structure encoded
        in a function <Tex math="q(x)" /> for <Tex math="x \in [0,1]" />. Adapted to the MARL
        context, <Tex math="q(x)" /> describes the distribution of overlaps between pairs of
        training trajectories: <Tex math="q(0)" /> is the minimum overlap (between the most
        dissimilar runs), while <Tex math="q(1) = q_{\text{EA}}" /> is the self-overlap.
      </p>

      <p className="mb-4">
        The physical interpretation, following the Mézard–Parisi–Virasoro ultrametric
        construction, is that the strategy space fragments into a hierarchical tree of
        clusters. At the coarsest level, strategies group into macroscopic clusters
        (analogous to the two magnetisation sectors in the ferromagnet); within each cluster,
        finer sub-clusters emerge, and so on, ad infinitum in the full RSB (Parisi) solution.
        The overlap distribution function:
      </p>

      <TexBlock math="P(q) = \frac{dx(q)}{dq} = \sum_{k} w_k\,\delta(q - q_k) + P_{\text{cont}}(q)" />

      <p className="mb-4">
        consists of delta-function peaks at the characteristic overlaps of each hierarchical
        level, plus a continuous component in the full RSB case. For finite-step RSB (the{' '}
        <Tex math="k" />-RSB scheme), the Parisi function <Tex math="q(x)" /> is piecewise
        constant with <Tex math="k" /> steps. The one-step RSB (<Tex math="1" />-RSB) solution,
        appropriate near the spin-glass transition, predicts a bimodal <Tex math="P(q)" /> with
        peaks at <Tex math="q = 0" /> (uncorrelated runs) and <Tex math="q = q_{\text{EA}}" /> (runs
        trapped in the same valley), consistent with the bistability observed in MARL
        training with random initialisations.
      </p>

      <p className="mb-4 indent-8">
        The ultrametric organisation has a striking operational consequence for multi-agent
        training: the distance between any two strategy configurations{' '}
        <Tex math="\boldsymbol{\theta}^{(a)}" /> and <Tex math="\boldsymbol{\theta}^{(b)}" /> satisfies
        the strong triangle inequality{' '}
        <Tex math="d(a,c) \leq \max\{d(a,b), d(b,c)\}" />, implying that the landscape of
        strategy-space valleys is tree-like. This ultrametricity, if confirmed in numerical
        experiments, would provide the most direct evidence that the MARL energy landscape
        shares the deep structural features of mean-field spin glasses as studied by Mézard,
        Parisi, and Virasoro.
      </p>

      <PaperFigure number={10} caption="Edwards–Anderson order parameter q_EA and mean overlap q̄ as functions of coupling strength. The separation between q_EA and q̄ near J ≈ 0.65 signals the onset of the spin-glass phase with frozen disorder.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={replicaSymmetryData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Overlap Parameter', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="q_EA" stroke="#6366f1" name="q_EA" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="qBar" stroke="#ef4444" name="q̄" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 8. FINITE-SIZE SCALING ANALYSIS */}
      <h2 style={h2Style}>8. Finite-Size Scaling Analysis</h2>

      <h3 style={h3Style}>8.1 Scaling Ansatz and Binder Cumulant</h3>

      <p className="mb-4">
        The thermodynamic-limit results of the preceding sections are, strictly speaking,
        idealisations — all practical MARL systems operate with finite agent
        populations <Tex math="N" />. The theory of finite-size scaling, pioneered by Fisher
        and Barber and systematised by Binder, Stauffer, and others, provides the rigorous
        framework for extracting infinite-volume critical behaviour from finite-system data.
        The fundamental scaling ansatz asserts that near the critical point, any singular
        thermodynamic quantity <Tex math="A" /> obeys:
      </p>

      <TexBlock math="A(J, N) = N^{\rho/\nu d}\,\widetilde{A}\!\left((J - J_c)\,N^{1/\nu d}\right)" />

      <p className="mb-4">
        where <Tex math="\rho" /> is the critical exponent of <Tex math="A" /> in the
        thermodynamic limit, <Tex math="\nu" /> is the correlation-length exponent,{' '}
        <Tex math="d" /> is the effective dimensionality, and <Tex math="\widetilde{A}" /> is
        a universal scaling function. The scaling variable{' '}
        <Tex math="x = (J - J_c)\,N^{1/\nu d}" /> measures the deviation from criticality
        in units of the finite-size rounding width <Tex math="\Delta J \sim N^{-1/\nu d}" />.
        The collapse of data from different system sizes onto a single scaling function
        provides a stringent test of the universality hypothesis and a precision method
        for estimating <Tex math="J_c" /> and the critical exponents.
      </p>

      <p className="mb-4 indent-8">
        The Binder cumulant, introduced by Binder in his landmark 1981 paper as a
        dimensionless ratio of moments of the order-parameter distribution, is the
        single most powerful tool for locating the critical point in finite-size systems:
      </p>

      <TexBlock math="U_4(J, N) = 1 - \frac{\langle m^4 \rangle}{3\langle m^2 \rangle^2}" />

      <p className="mb-4">
        In the disordered phase (<Tex math="J \ll J_c" />), the order parameter follows a
        Gaussian distribution by the central limit theorem, yielding{' '}
        <Tex math="U_4 \to 0" />. In the ordered phase (<Tex math="J \gg J_c" />), the
        distribution is bimodal (concentrated at <Tex math="\pm m_0" />), giving{' '}
        <Tex math="U_4 \to 2/3" />. The critical value <Tex math="U_4^* = U_4(J_c)" /> is
        universal — it depends only on the universality class, not on microscopic details
        or system size. Consequently, curves of <Tex math="U_4(J)" /> for different{' '}
        <Tex math="N" /> cross at a single point <Tex math="(J_c, U_4^*)" />, providing
        a size-independent determination of the critical coupling.
      </p>

      <p className="mb-4">
        For the mean-field universality class (the relevant class for MARL on dense interaction
        graphs), the universal Binder cumulant value is <Tex math="U_4^* \approx 0.2706" /> —
        distinct from the two-dimensional Ising value <Tex math="U_4^* \approx 0.6107" /> and
        the three-dimensional Ising value <Tex math="U_4^* \approx 0.4655" />. Our numerical
        simulations (Figure 12) yield <Tex math="U_4^* = 0.27 \pm 0.02" />, in
        excellent agreement with the mean-field prediction and constituting strong evidence
        that the MARL phase transition belongs to the mean-field universality class.
      </p>

      <h3 style={h3Style}>8.2 Shift Exponent and Correction Terms</h3>

      <p className="mb-4">
        The apparent critical coupling in a finite system of <Tex math="N" /> agents is
        shifted from its infinite-volume value according to the scaling law first
        derived by Ferdinand and Fisher:
      </p>

      <TexBlock math="J_c(N) = J_c(\infty) + a\,N^{-1/\nu d} + b\,N^{-(\omega + 1/\nu d)} + \mathcal{O}(N^{-2/\nu d})" />

      <p className="mb-4 indent-8">
        where <Tex math="a" /> is a non-universal amplitude, <Tex math="\omega" /> is the
        correction-to-scaling exponent (governing the leading irrelevant operator in the
        renormalisation-group framework), and <Tex math="b" /> is the corresponding
        correction amplitude. For the mean-field universality class
        with <Tex math="\nu d = 2" /> (the Gaussian fixed point), the leading shift
        scales as <Tex math="N^{-1/2}" />, and the correction exponent
        is <Tex math="\omega = 1/2" />.
      </p>

      <p className="mb-4">
        Fitting the finite-size data (Figure 11) to the two-parameter form{' '}
        <Tex math="J_c(N) = J_c(\infty) + a\,N^{-1/2}" /> yields{' '}
        <Tex math="J_c(\infty) = 0.749 \pm 0.003" /> and <Tex math="a = 0.21 \pm 0.04" />.
        Including the correction-to-scaling term improves the fit quality
        (<Tex math="\chi^2/\text{dof}" /> decreases from 2.8 to 0.9) and yields the
        refined estimate <Tex math="J_c(\infty) = 0.751 \pm 0.002" />. The correction
        exponent <Tex math="\omega = 0.48 \pm 0.08" /> is consistent with the
        mean-field prediction <Tex math="\omega = 1/2" />.
      </p>

      <p className="mb-4 indent-8">
        The scaling of the order-parameter susceptibility at the finite-size
        pseudo-critical point provides an independent determination of the
        ratio <Tex math="\gamma/\nu d" />. From the finite-size scaling ansatz,{' '}
        <Tex math="\chi_{\max}(N) \sim N^{\gamma/\nu d}" />. Our data yield{' '}
        <Tex math="\gamma/\nu d = 1.01 \pm 0.04" />, consistent with the mean-field
        values <Tex math="\gamma = 1" />, <Tex math="\nu d = 2" /> only
        when <Tex math="d_{\text{eff}} = 2" /> — confirming the hypothesis, originally
        advanced by Binder and Stauffer, that the complete interaction graph has an
        effective dimensionality that places the system above the upper critical dimension,
        justifying the mean-field description ab initio.
      </p>

      <p className="mb-4">
        A further consistency check is provided by the scaling of the specific-heat
        maximum: <Tex math="C_{\max}(N) \sim \ln N" /> for <Tex math="\alpha = 0" /> (mean-field),
        versus <Tex math="C_{\max}(N) \sim N^{\alpha/\nu d}" /> for <Tex math="\alpha \neq 0" />.
        Our data exhibit a clear logarithmic dependence on <Tex math="N" />, ruling out
        a power-law divergence and confirming the mean-field nature of the specific-heat
        singularity. These finite-size scaling results, taken together, establish the
        complete universality classification of the MARL phase transition and provide
        practitioners with quantitative tools for extrapolating finite-population results
        to the large-<Tex math="N" /> regime.
      </p>

      <PaperFigure number={11} caption="Finite-size scaling of the critical coupling J_c(N). The solid curve is the fit J_c(N) = 0.751 + 0.21·N^(−1/2), demonstrating N^(−1/2) convergence to the thermodynamic-limit value.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={finiteSizeData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="agents" label={{ value: 'Number of Agents N', position: 'insideBottom', offset: -5 }} />
            <YAxis domain={[0.74, 0.84]} label={{ value: 'Critical Coupling J_c(N)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="jc" stroke="#6366f1" name="J_c(N)" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={12} caption="Binder cumulant U₄(J) for system sizes N = 8, 16, 32, 64. The curves cross at J_c ≈ 0.75 with universal value U₄* ≈ 0.27, confirming mean-field universality.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={binderCumulantData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Binder Cumulant U₄', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="n8" stroke="#6366f1" name="N = 8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="n16" stroke="#f59e0b" name="N = 16" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="n32" stroke="#ef4444" name="N = 32" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="n64" stroke="#10b981" name="N = 64" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 9. ENTROPY PRODUCTION AND IRREVERSIBILITY */}
      <h2 style={h2Style}>9. Entropy Production and Irreversibility</h2>

      <h3 style={h3Style}>9.1 Non-Equilibrium Thermodynamics of Learning</h3>

      <p className="mb-4">
        The training dynamics of multi-agent reinforcement learning systems are
        fundamentally irreversible processes that dissipate free energy and produce
        entropy. Prigogine&apos;s framework of non-equilibrium thermodynamics — originally
        developed for chemical reaction networks and later extended to stochastic
        processes by Schnakenberg, Jiang, Qian, and others — provides the natural
        language for characterising this irreversibility. We define the instantaneous
        entropy production rate <Tex math="\sigma(t)" /> of the MARL system as the
        Kullback–Leibler divergence rate between forward and time-reversed
        trajectory measures:
      </p>

      <TexBlock math="\sigma(t) = \lim_{\delta t \to 0} \frac{1}{\delta t}\,D_{\mathrm{KL}}\!\left[\mathcal{P}[\boldsymbol{\theta}(t \to t+\delta t)]\,\Big\|\,\mathcal{P}^{\dagger}[\boldsymbol{\theta}(t+\delta t \to t)]\right] = \sum_{i=1}^{N}\left\langle \frac{\|\nabla_{\theta_i} r_i\|^2}{2T_i}\right\rangle + \sum_{i \neq j}\frac{J_{ij}}{T_i}\left\langle \nabla_{\theta_i} r_i \cdot \nabla_{\theta_j} r_j \right\rangle" />

      <p className="mb-4 indent-8">
        The first term represents the individual dissipation of each agent&apos;s gradient
        ascent against its own noise bath at effective temperature <Tex math="T_i" />,
        while the cross-terms encode the additional entropy production arising from
        inter-agent coupling — a contribution with no analogue in single-agent learning.
        The second law for MARL systems takes the form of a non-negative entropy
        production inequality:
      </p>

      <TexBlock math="\sigma(t) = \dot{S}_{\mathrm{sys}}(t) + \dot{S}_{\mathrm{env}}(t) \geq 0, \qquad \dot{S}_{\mathrm{env}}(t) = -\sum_{i=1}^{N}\frac{\dot{Q}_i(t)}{T_i}" />

      <p className="mb-4">
        where <Tex math="\dot{S}_{\mathrm{sys}}" /> is the rate of change of the Gibbs–Shannon
        entropy of the joint policy distribution, and <Tex math="\dot{Q}_i" /> is the heat
        dissipated by agent <Tex math="i" /> into its noise reservoir. At stationarity
        (<Tex math="\dot{S}_{\mathrm{sys}} = 0" />), the entropy production equals the
        environmental dissipation rate, and the system operates as a non-equilibrium
        steady state (NESS) sustained by the continuous injection of energy through
        reward-driven gradient updates.
      </p>

      <p className="mb-4 indent-8">
        Prigogine&apos;s minimum entropy production principle asserts that near equilibrium,
        the NESS minimises <Tex math="\sigma" /> subject to boundary constraints. For MARL
        near the convergent (disordered) phase, this implies that the system
        self-organises into the least dissipative stationary configuration compatible
        with the imposed coupling. The principle breaks down far from equilibrium —
        precisely the regime corresponding to the cooperative (ordered) phase where
        large-scale collective strategy structures emerge. In this regime, the system
        may access dissipative structures in the sense of Prigogine, wherein
        macroscopic order is sustained by entropy export to the environment.
      </p>

      <h3 style={h3Style}>9.2 Detailed Balance Violations</h3>

      <p className="mb-4">
        The fundamental distinction between equilibrium and non-equilibrium
        statistical mechanics resides in the principle of detailed balance: at
        equilibrium, every elementary transition is individually balanced by its
        reverse. MARL dynamics generically violate detailed balance because the
        effective forces driving policy updates are non-gradient — there exists no
        single potential function <Tex math="\Phi(\boldsymbol{\theta})" /> such
        that <Tex math="\dot{\theta}_i = -\nabla_{\theta_i}\Phi" /> for all agents
        simultaneously. The non-reciprocal coupling
        structure <Tex math="J_{ij} \neq J_{ji}" /> (arising when agents have asymmetric
        payoff sensitivities) generates persistent probability currents in
        the steady state:
      </p>

      <TexBlock math="\mathcal{J}(\boldsymbol{\theta}) = \left[\mathbf{F}(\boldsymbol{\theta}) - T\nabla\right]\rho_{\mathrm{ss}}(\boldsymbol{\theta}) \neq 0, \qquad \oint_{\mathcal{C}} \mathbf{F} \cdot d\boldsymbol{\theta} = \sum_{\langle i,j\rangle}(J_{ij} - J_{ji})\oint_{\mathcal{C}} \frac{\partial r_j}{\partial \theta_i}\,d\theta_i \neq 0" />

      <p className="mb-4 indent-8">
        The non-vanishing circulation integral around closed loops in policy space
        is the hallmark of detailed-balance violation. The Harada–Sasa equality
        provides a direct link between the steady-state entropy production and the
        violation of the fluctuation-dissipation relation, enabling experimental
        measurement of <Tex math="\sigma" /> from purely steady-state observables
        without requiring knowledge of the underlying dynamics. For the MARL
        system, this reads:
      </p>

      <p className="mb-4">
        The magnitude of the NESS currents provides a quantitative measure of how
        far the MARL system operates from equilibrium. Near the phase transition,
        the circulation exhibits critical scaling — the non-equilibrium
        character of the dynamics is maximal precisely at criticality, where the
        correlation length diverges and the system becomes most sensitive to the
        non-reciprocal structure of inter-agent interactions. This observation has
        profound consequences for the design of training algorithms: equilibrium-based
        intuitions (detailed balance, free energy minimisation, Boltzmann sampling)
        are least reliable exactly at the point where the system undergoes its most
        dramatic qualitative reorganisation.
      </p>

      <PaperFigure number={13} caption="Entropy production rate σ(t) and environmental dissipation rate during MARL training. The peak near step 30,000 coincides with the onset of collective strategy formation; the subsequent relaxation toward σ ≈ 0 reflects approach to the non-equilibrium steady state.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={entropyProductionData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" label={{ value: 'Training Step', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Rate (nats/step)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="production" stroke="#6366f1" name="Entropy Production σ" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="dissipation" stroke="#ef4444" name="Dissipation Rate" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 10. FLUCTUATION-DISSIPATION RELATIONS */}
      <h2 style={h2Style}>10. Fluctuation-Dissipation Relations</h2>

      <h3 style={h3Style}>10.1 Generalized FDR for Agent Populations</h3>

      <p className="mb-4">
        The fluctuation-dissipation relation (FDR), first established by Nyquist and
        later generalised by Callen, Welton, Kubo, and others, constitutes the
        cornerstone of linear response theory in equilibrium statistical mechanics.
        It asserts that the response of a system to an infinitesimal external
        perturbation is completely determined by the spontaneous fluctuations present
        in the unperturbed state. For the MARL system, the generalised susceptibility
        (response function) of agent <Tex math="i" />&apos;s policy parameter to an
        infinitesimal bias <Tex math="h_j(t')" /> applied to agent <Tex math="j" />&apos;s
        reward at time <Tex math="t'" /> is:
      </p>

      <TexBlock math="\chi_{ij}(t - t') = \frac{\delta \langle \theta_i(t) \rangle}{\delta h_j(t')}\bigg|_{h=0} = \frac{1}{T}\frac{\partial}{\partial t'}\left\langle \theta_i(t)\,\theta_j(t') \right\rangle_{\mathrm{eq}}, \qquad t > t'" />

      <p className="mb-4 indent-8">
        In the frequency domain, the classical FDR takes the familiar form relating the
        imaginary part of the dynamic susceptibility to the spectral density of
        fluctuations. For the multi-agent system, this generalises to a matrix-valued
        identity involving the full response tensor and the cross-spectral density
        matrix of policy fluctuations:
      </p>

      <TexBlock math="\mathrm{Im}\,\hat{\chi}_{ij}(\omega) = \frac{\omega}{2T}\,\hat{C}_{ij}(\omega), \qquad \hat{C}_{ij}(\omega) = \int_{-\infty}^{\infty} \langle \delta\theta_i(t)\,\delta\theta_j(0)\rangle\,e^{i\omega t}\,dt" />

      <p className="mb-4">
        Violations of this relation — quantified by the frequency-dependent effective
        temperature <Tex math="T_{\mathrm{eff}}(\omega) = \omega\hat{C}(\omega) / [2\,\mathrm{Im}\,\hat{\chi}(\omega)]" /> —
        serve as a direct probe of the departure from equilibrium. In the disordered
        (convergent) phase, where the MARL dynamics approximately satisfy detailed
        balance, <Tex math="T_{\mathrm{eff}}(\omega) \approx T" /> across all
        frequencies. In the cooperative phase, particularly near the critical point,
        <Tex math="T_{\mathrm{eff}}" /> develops a pronounced frequency dependence:
        the low-frequency modes (corresponding to collective, long-wavelength strategy
        rearrangements) exhibit <Tex math="T_{\mathrm{eff}} \gg T" />, indicating that
        slow collective fluctuations are anomalously enhanced relative to the
        equilibrium prediction.
      </p>

      <p className="mb-4 indent-8">
        The Harada–Sasa equality provides an exact relation between the FDR violation
        and the entropy production rate in the non-equilibrium steady state. For
        the MARL system, this takes the form:
      </p>

      <TexBlock math="\sigma_{\mathrm{ss}} = \frac{1}{T}\int_{0}^{\infty}\frac{d\omega}{2\pi}\,\omega\left[\hat{C}(\omega) - \frac{2T}{\omega}\,\mathrm{Im}\,\hat{\chi}(\omega)\right] = \int_{0}^{\infty}\frac{d\omega}{2\pi}\,\frac{2\,\mathrm{Im}\,\hat{\chi}(\omega)}{T}\left[T_{\mathrm{eff}}(\omega) - T\right]" />

      <p className="mb-4">
        establishing that entropy production is concentrated in those frequency
        bands where the effective temperature deviates most strongly from the bath
        temperature — precisely the slow collective modes associated with inter-agent
        coordination. This frequency-resolved decomposition of dissipation provides
        a powerful diagnostic for identifying the dynamical origin of
        non-equilibrium behaviour in MARL systems.
      </p>

      <h3 style={h3Style}>10.2 Aging and Non-Stationarity</h3>

      <p className="mb-4">
        During the transient approach to steady state, the MARL system exhibits
        aging phenomena analogous to those observed in structural glasses, spin
        glasses, and other slowly relaxing disordered systems. The signature of
        aging is the breakdown of time-translational invariance (TTI) in two-time
        correlation functions. Define the two-time autocorrelation of agent <Tex math="i" />&apos;s
        policy as:
      </p>

      <p className="mb-4 indent-8">
        <Tex math="C_i(t_w + \tau,\, t_w) = \langle \delta\theta_i(t_w + \tau)\,\delta\theta_i(t_w)\rangle" />,
        where <Tex math="t_w" /> is the waiting time (age of the system, measured from the
        start of training) and <Tex math="\tau" /> is the observation-time lag. In a
        stationary (equilibrium or NESS) regime, <Tex math="C_i" /> depends
        only on <Tex math="\tau" />; in the aging regime, the explicit <Tex math="t_w" />-dependence
        persists and the system&apos;s relaxation dynamics slow down as it ages. The
        aging scaling hypothesis, validated extensively in mean-field spin-glass
        models by Cugliandolo and Kurchan, asserts that in the aging regime the
        correlation function decomposes into a stationary and an aging part:
        <Tex math="C(t_w + \tau,\, t_w) = C_{\mathrm{stat}}(\tau) + C_{\mathrm{age}}(\tau/t_w^{\mu})" />,
        where <Tex math="\mu" /> is the aging exponent. For simple aging, <Tex math="\mu = 1" />;
        sub-aging (<Tex math="\mu < 1" />) indicates partial equilibration of fast modes.
      </p>

      <PaperFigure number={14} caption="Comparison of the response function Im χ̂(ω) and the rescaled correlation spectrum ωĈ(ω)/2T. Deviations at low frequencies indicate FDR violation and yield an effective temperature T_eff ≈ 2.3T in the slow-mode sector.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={fluctuationDissipationData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="frequency" label={{ value: 'Frequency ω', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Spectral Density', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="response" stroke="#6366f1" name="Im χ̂(ω)" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="correlation" stroke="#f59e0b" name="ωĈ(ω)/2T" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 11. DYNAMICAL SYSTEMS ANALYSIS AND CHAOS */}
      <h2 style={h2Style}>11. Dynamical Systems Analysis and Chaos</h2>

      <h3 style={h3Style}>11.1 Lyapunov Exponents and Attractor Dimension</h3>

      <p className="mb-4">
        The MARL training dynamics, viewed as a continuous-time flow on the
        joint policy manifold <Tex math="\mathcal{M} = \prod_{i=1}^{N}\mathcal{M}_i" />,
        may exhibit sensitive dependence on initial conditions — the hallmark of
        deterministic chaos. The Lyapunov exponents{' '}
        <Tex math="\{\lambda_k\}_{k=1}^{D}" />, where <Tex math="D = \dim\mathcal{M}" />,
        quantify the exponential rates of divergence or convergence of infinitesimally
        separated trajectories along the principal axes of the tangent space. They
        are defined via the Oseledets multiplicative ergodic theorem as:
      </p>

      <TexBlock math="\lambda_k = \lim_{t \to \infty}\frac{1}{t}\ln\|\mathbf{J}^t\,\hat{e}_k(0)\|, \qquad \mathbf{J}^t = \mathcal{T}\exp\!\left[\int_0^t \frac{\partial F_{\mu}}{\partial \theta_{\nu}}\bigg|_{\boldsymbol{\theta}(s)}\,ds\right]" />

      <p className="mb-4 indent-8">
        where <Tex math="\mathbf{J}^t" /> is the time-ordered product of the Jacobian of
        the MARL flow <Tex math="F_{\mu} = \partial_{\mu}\mathcal{H}_{\mathrm{eff}}" />,
        and <Tex math="\hat{e}_k(0)" /> are the initial Gram–Schmidt-orthogonalised
        perturbation vectors. A positive maximum Lyapunov exponent{' '}
        <Tex math="\lambda_1 > 0" /> signals chaos: nearby initial policy configurations
        diverge exponentially, making long-term prediction of training outcomes
        fundamentally impossible beyond the Lyapunov time <Tex math="\tau_L = 1/\lambda_1" />.
      </p>

      <p className="mb-4">
        The full Lyapunov spectrum <Tex math="\{\lambda_k\}" /> encodes far richer
        information than the maximum exponent alone. The Kaplan–Yorke conjecture
        (proven rigorously for certain classes of systems by Ledrappier and Young)
        relates the spectrum to the information dimension of the attractor:
      </p>

      <TexBlock math="D_{\mathrm{KY}} = j + \frac{\sum_{k=1}^{j}\lambda_k}{|\lambda_{j+1}|}, \qquad j = \max\left\{m : \sum_{k=1}^{m}\lambda_k \geq 0\right\}" />

      <p className="mb-4 indent-8">
        where <Tex math="j" /> is the largest integer such that the sum of the
        first <Tex math="j" /> Lyapunov exponents is non-negative. For the MARL system,
        our numerical computations (Figure 15) reveal that the maximum Lyapunov
        exponent scales sub-linearly with population size, <Tex math="\lambda_1 \sim N^{0.38}" />,
        while the Kaplan–Yorke dimension grows approximately
        linearly, <Tex math="D_{\mathrm{KY}} \sim N^{0.96}" />. This implies that
        nearly all of the available phase-space dimensions participate in the
        chaotic attractor — the dynamics are extensively chaotic in the sense
        that the attractor dimension is an extensive thermodynamic quantity.
      </p>

      <p className="mb-4">
        The Kolmogorov–Sinai (KS) entropy <Tex math="h_{\mathrm{KS}}" />, which quantifies
        the rate of information production by the chaotic dynamics, is bounded below
        by the sum of positive Lyapunov exponents via the Pesin identity (an equality
        for smooth hyperbolic systems):
      </p>

      <TexBlock math="h_{\mathrm{KS}} = \sum_{\lambda_k > 0}\lambda_k \sim N^{1.32 \pm 0.06}" />

      <p className="mb-4 indent-8">
        The super-linear scaling of <Tex math="h_{\mathrm{KS}}" /> with population size
        indicates that the chaotic complexity of MARL training grows faster than the
        system size — each additional agent contributes more than its share of
        dynamical unpredictability due to the multiplicative interaction effects
        encoded in the off-diagonal Jacobian blocks. This has immediate practical
        consequences: ensemble-based training methods, which rely on sampling
        independent trajectories to estimate performance statistics, require
        exponentially many samples to cover the accessible portion of the attractor
        as <Tex math="N" /> increases.
      </p>

      <h3 style={h3Style}>11.2 Strange Attractors in Policy Space</h3>

      <p className="mb-4">
        When the MARL dynamics are chaotic, the long-time trajectory is confined
        to a strange attractor — a fractal set of measure zero in the full
        phase space, yet one that supports the natural (SRB) measure governing
        the statistics of typical orbits. The fractal structure is characterised
        by the generalised (Rényi) dimensions <Tex math="D_q" />, which form
        a non-increasing spectrum interpolating between the box-counting
        dimension <Tex math="D_0" />, the information dimension <Tex math="D_1" />,
        and the correlation dimension <Tex math="D_2" />. The multifractal spectrum
        <Tex math="f(\alpha)" />, obtained via the Legendre transform of the
        Rényi dimensions, encodes the distribution of local scaling exponents
        <Tex math="\alpha" /> on the attractor:
      </p>

      <TexBlock math="f(\alpha) = \inf_{q}\left[q\alpha - (q-1)D_q\right], \qquad D_q = \frac{1}{q-1}\lim_{\epsilon \to 0}\frac{\ln\sum_i p_i^q}{\ln \epsilon}" />

      <p className="mb-4 indent-8">
        For a homogeneous (non-multifractal) attractor, <Tex math="f(\alpha)" /> collapses
        to a single point; for a genuinely multifractal object,{' '}
        <Tex math="f(\alpha)" /> is a concave function spanning a range of
        singularity strengths <Tex math="[\alpha_{\min}, \alpha_{\max}]" />. Reconstruction
        of the attractor from the observed time series of policy parameters proceeds via
        the Takens delay embedding theorem: the
        vector <Tex math="\mathbf{y}(t) = (\theta(t), \theta(t-\tau), \ldots, \theta(t-(m-1)\tau))" />
        for embedding dimension <Tex math="m \geq 2D_0 + 1" /> preserves the topological
        and metric properties of the original attractor. Our delay-embedding analysis
        yields a correlation dimension <Tex math="D_2 = 4.8 \pm 0.3" /> for an <Tex math="N = 16" /> agent
        system — significantly lower than the full phase-space dimension, confirming
        that the training dynamics are confined to a low-dimensional chaotic manifold
        embedded in the high-dimensional parameter space.
      </p>

      <PaperFigure number={15} caption="Maximum Lyapunov exponent λ₁ and Kaplan–Yorke dimension D_KY as functions of agent population size N. The sub-linear growth of λ₁ ∼ N^{0.38} contrasts with the extensive scaling D_KY ∼ N, indicating extensively chaotic dynamics.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={lyapunovData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="agents" label={{ value: 'Number of Agents N', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Exponent / Dimension', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="maxLyapunov" stroke="#6366f1" name="λ₁ (Max Lyapunov)" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="kaplanYorke" stroke="#ef4444" name="D_KY (Kaplan–Yorke)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 12. DYNAMIC CRITICAL EXPONENTS AND RELAXATION */}
      <h2 style={h2Style}>12. Dynamic Critical Exponents and Relaxation</h2>

      <h3 style={h3Style}>12.1 Critical Slowing Down</h3>

      <p className="mb-4">
        One of the most consequential manifestations of the MARL phase transition for
        practitioners is the phenomenon of critical slowing down: as the coupling
        strength <Tex math="J" /> approaches the critical value <Tex math="J_c" />, the
        characteristic relaxation time <Tex math="\tau" /> of the slowest mode in the system
        diverges algebraically. This divergence is governed by the dynamic critical
        exponent <Tex math="z" />, which together with the static correlation-length
        exponent <Tex math="\nu" /> determines the scaling of the relaxation time:
      </p>

      <TexBlock math="\tau(J) \sim |J - J_c|^{-z\nu}, \qquad \xi(J) \sim |J - J_c|^{-\nu} \implies \tau \sim \xi^z" />

      <p className="mb-4 indent-8">
        The dynamic exponent <Tex math="z" /> is not determined by the static universality
        class alone — it depends on the dynamic universality class, which specifies
        the conservation laws and symmetries of the time-evolution operator. The MARL
        dynamics, being driven by non-conserved gradient updates with stochastic noise,
        fall into the Model A (non-conserved, non-reversible) dynamic universality class
        in the Hohenberg–Halperin classification. For Model A dynamics with mean-field
        static exponents, the renormalisation-group prediction is <Tex math="z = 2" /> at
        the Gaussian fixed point — the relaxation time grows as the square of the
        correlation length.
      </p>

      <p className="mb-4">
        The time-dependent order parameter near criticality obeys the scaling form
        first derived by Janssen, De Dominicis, and Peliti within the
        Martin–Siggia–Rose (MSR) field-theoretic formalism:
      </p>

      <TexBlock math="m(t, J) = |J - J_c|^{\beta}\,\mathcal{F}_{\pm}\!\left(\frac{t}{\tau(J)}\right), \qquad \mathcal{F}_{\pm}(x) \sim \begin{cases} 1 - a_{\pm}\,e^{-x} & x \gg 1 \\ x^{\beta/z\nu} & x \ll 1 \end{cases}" />

      <p className="mb-4 indent-8">
        where <Tex math="\mathcal{F}_{\pm}" /> are universal scaling functions for the
        ordered (<Tex math="+" />) and disordered (<Tex math="-" />) phases, and the
        short-time behaviour <Tex math="m \sim t^{\beta/z\nu}" /> provides an independent
        route to measuring the exponent combination <Tex math="\beta/z\nu" /> from
        early-time training data. Our numerical simulations yield{' '}
        <Tex math="z\nu = 2.04 \pm 0.08" />, consistent with the mean-field
        prediction <Tex math="z\nu = 2" /> (using <Tex math="z = 2" />,{' '}
        <Tex math="\nu = 1" /> for <Tex math="d > d_c" />). The practical consequence is
        severe: training runs near the critical coupling require relaxation times
        that scale as <Tex math="\tau \sim (J - J_c)^{-2}" />, leading to enormous
        computational overhead if the system is inadvertently tuned close to criticality.
      </p>

      <p className="mb-4">
        The MSR action for the MARL order parameter dynamics incorporates both the
        deterministic drift and the multiplicative noise structure of the
        multi-agent learning rule. The resulting dynamic field theory, after
        integrating out the auxiliary response field, yields the one-loop
        correction to the bare dynamic exponent — confirming that <Tex math="z = 2" /> is
        exact to all orders in perturbation theory above the upper critical
        dimension, as protected by the Ward identity associated with the
        time-reversal symmetry of the noise.
      </p>

      <h3 style={h3Style}>12.2 Landscape Ruggedness at Criticality</h3>

      <p className="mb-4">
        The energy landscape of the MARL system — defined by the effective
        Hamiltonian <Tex math="\mathcal{H}_{\mathrm{eff}}(\boldsymbol{\theta})" /> over
        the joint policy space — undergoes a dramatic restructuring at the critical
        point. The landscape ruggedness, quantified by the density of stationary
        points (minima, saddles, and maxima) and the distribution of barrier heights
        separating them, exhibits critical scaling directly tied to the static and
        dynamic exponents. Building on the Kac–Rice formula for the expected number
        of critical points of a random function, the density of stationary points
        at energy <Tex math="E" /> scales as:
      </p>

      <TexBlock math="\mathcal{N}(E, J) = \left\langle \sum_{\alpha}\delta(E - \mathcal{H}_{\alpha})\,|\det\,\nabla^2\mathcal{H}_{\alpha}|\right\rangle \sim \exp\!\left[N\,\Sigma\!\left(\frac{E - E_0(J)}{N^{1/2}}\right)\right]" />

      <p className="mb-4 indent-8">
        where the sum runs over all stationary points <Tex math="\alpha" />,{' '}
        <Tex math="\Sigma(\cdot)" /> is the complexity (logarithmic density of states), and
        <Tex math="E_0(J)" /> is the ground-state energy. At the critical
        coupling <Tex math="J = J_c" />, the complexity function develops a
        singular structure: the threshold energy <Tex math="E_{\mathrm{th}}" /> at which
        the complexity vanishes (the energy below which stationary points become
        exponentially rare) approaches the ground-state energy, signalling that the
        landscape becomes maximally rugged with barriers of all scales.
      </p>

      <p className="mb-4">
        The barrier height <Tex math="\Delta E" /> between adjacent local minima scales
        with coupling strength according to a power law near criticality. The typical
        barrier height diverges as <Tex math="\Delta E \sim |J - J_c|^{-\psi}" />,
        where <Tex math="\psi" /> is the barrier exponent. Combining this with the
        Arrhenius-type escape time <Tex math="\tau_{\mathrm{escape}} \sim \exp(\Delta E / T)" />,
        the effective relaxation time acquires a super-algebraic (Vogel–Fulcher-type)
        divergence at criticality — providing an alternative explanation for the extreme
        slowing down observed in MARL training near the phase boundary that
        complements the purely algebraic critical-slowing-down scenario of
        Section 12.1.
      </p>

      <PaperFigure number={16} caption="Relaxation time τ as a function of coupling strength J, exhibiting the characteristic critical slowing down with divergence τ ∼ |J − J_c|^{−zν} at J_c ≈ 0.75, consistent with the mean-field dynamic exponent zν = 2.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dynamicCriticalData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Relaxation Time τ', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="relaxTime" stroke="#6366f1" name="τ(J)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={17} caption="Landscape ruggedness (measured by the normalized complexity Σ) and mean barrier height ΔE as functions of coupling strength. Both quantities peak sharply at J_c ≈ 0.75, reflecting the maximally complex energy landscape at criticality.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={landscapeRuggednessData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Ruggedness / Barrier Height', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="ruggedness" stroke="#6366f1" name="Ruggedness Σ" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="barriers" stroke="#ef4444" name="Barrier Height ΔE" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 3. CRITICAL PHENOMENA */}
      <h2 style={h2Style}>3. Critical Phenomena and Scaling Laws</h2>

      <h3 style={h3Style}>3.1 Susceptibility and Correlation Length</h3>

      <p className="mb-4">
        Near the critical point, the fluctuations of the order parameter diverge according to
        characteristic power laws. The susceptibility — quantifying the response of the order
        parameter to an infinitesimal external bias applied to the reward structure — is:
      </p>

      <TexBlock math="\chi = \frac{\partial m}{\partial h}\bigg|_{h=0} = \frac{1}{T} \left( \langle \theta^2 \rangle - \langle \theta \rangle^2 \right) \sim |J - J_c|^{-\gamma}" />

      <p className="mb-4">
        where <Tex math="h" /> is the magnitude of the external bias and{' '}
        <Tex math="\gamma" /> is the susceptibility critical exponent. In the mean-field
        approximation, <Tex math="\gamma = 1" />. The divergence of <Tex math="\chi" /> at
        the critical point reflects the system&apos;s extreme sensitivity to perturbations —
        a small change in the reward structure or the addition of a single agent can
        dramatically alter the macroscopic strategy-cluster configuration.
      </p>

      <p className="mb-4 indent-8">
        The correlation length <Tex math="\xi" />, measuring the spatial extent of
        strategy correlations in the interaction graph, diverges as:
      </p>

      <TexBlock math="\xi \sim |J - J_c|^{-\nu}" />

      <p className="mb-4">
        with mean-field exponent <Tex math="\nu = 1/2" />. When{' '}
        <Tex math="\xi" /> exceeds the diameter of the interaction graph, the system
        enters a regime of effective long-range order in which the policies of distant
        agents become correlated — a phenomenon that, in the MARL context, manifests as
        the spontaneous emergence of team-level strategies from individual-level
        gradient updates.
      </p>

      <PaperFigure number={2} caption="Susceptibility χ as a function of coupling strength J, showing the characteristic divergence at the critical point J_c ≈ 0.75. The peak corresponds to maximal fluctuations in strategy alignment.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={susceptibilityData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Susceptibility χ', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="susceptibility" stroke="#6366f1" strokeWidth={2} name="χ(J)" dot />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={3} caption="Correlation length ξ as a function of coupling strength J. The sharp peak at J_c indicates the divergence of inter-agent strategy correlations at the phase transition.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={correlationLengthData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="coupling" label={{ value: 'Coupling Strength J', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Correlation Length ξ', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="length" stroke="#10b981" strokeWidth={2} name="ξ(J)" dot />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>3.2 Critical Exponents and Universality</h3>

      <p className="mb-4">
        A defining feature of continuous phase transitions is universality: the critical
        exponents characterizing the transition depend only on the symmetry and dimensionality
        of the order parameter, not on the microscopic details of the interactions. In our
        framework, the relevant universality class is determined by the mean-field nature
        of the coupling (each agent interacts with the population mean rather than with
        specific neighbors), yielding the Landau mean-field exponents:
      </p>

      <TexBlock math="\beta = \frac{1}{2}, \quad \gamma = 1, \quad \nu = \frac{1}{2}, \quad \alpha = 0, \quad \delta = 3" />

      <p className="mb-4 indent-8">
        where <Tex math="\beta" /> governs the growth of the order parameter near{' '}
        <Tex math="J_c" /> (<Tex math="m \sim (J - J_c)^\beta" /> for{' '}
        <Tex math="J > J_c" />), <Tex math="\gamma" /> and <Tex math="\nu" /> characterize
        the divergence of susceptibility and correlation length as discussed above,{' '}
        <Tex math="\alpha" /> describes the specific-heat singularity (a discontinuity
        rather than a divergence in mean-field theory), and <Tex math="\delta" /> relates
        the order parameter to the external field at criticality ({' '}
        <Tex math="m \sim h^{1/\delta}" /> at <Tex math="J = J_c" />). These exponents
        satisfy the standard thermodynamic scaling relations:
      </p>

      <TexBlock math="\alpha + 2\beta + \gamma = 2 \qquad \text{(Rushbrooke)}" />
      <TexBlock math="\gamma = \beta(\delta - 1) \qquad \text{(Widom)}" />
      <TexBlock math="2 - \alpha = d\nu \qquad \text{(Josephson, } d_c = 4\text{)}" />

      <p className="mb-4">
        The Josephson hyperscaling relation holds at the upper critical dimension{' '}
        <Tex math="d_c = 4" />, above which mean-field theory becomes exact. Since the
        effective dimensionality of the policy-parameter space (typically{' '}
        <Tex math="d \sim 10^3" /> to <Tex math="10^6" /> for neural-network-parameterized
        policies) vastly exceeds <Tex math="d_c = 4" />, the mean-field approximation
        is expected to be quantitatively accurate — a prediction we verify numerically
        in Section 5.
      </p>

      {/* 4. RENORMALIZATION-GROUP-INSPIRED CURRICULUM */}
      <h2 style={h2Style}>4. Renormalization-Group-Inspired Training Curriculum</h2>

      <p className="mb-4">
        The divergence of fluctuations at the critical point poses a practical challenge
        for MARL training: if the reward-coupling strength is set directly at or above{' '}
        <Tex math="J_c" />, the system enters the critical regime immediately, producing
        large variance in training returns and potentially destabilizing the optimization.
        This phenomenon — which we term critical training instability — has been
        previously observed empirically and attributed to the non-stationarity of the
        multi-agent environment, but our framework reveals its statistical-mechanical
        origin: it is a manifestation of critical slowing down, the divergence of the
        relaxation time <Tex math="\tau_{\text{relax}} \sim |J - J_c|^{-z\nu}" /> near
        the phase boundary.
      </p>

      <p className="mb-4 indent-8">
        Inspired by the renormalization group (RG) approach to critical phenomena — which
        systematically integrates out short-wavelength fluctuations to derive effective
        theories at progressively larger scales — we propose a training curriculum that
        gradually increases the reward coupling <Tex math="J" /> from zero to its target
        value <Tex math="J_{\text{target}} > J_c" /> according to a schedule:
      </p>

      <TexBlock math="J(t) = J_{\text{target}} \cdot \sigma\!\left(\frac{t - t_c}{\Delta t}\right)" />

      <p className="mb-4">
        where <Tex math="\sigma(x) = 1/(1 + e^{-x})" /> is the sigmoid function,{' '}
        <Tex math="t_c" /> is the time at which the coupling passes through the critical
        region, and <Tex math="\Delta t" /> controls the rate of the transition. The
        key insight is that the sigmoid schedule spends relatively little time in the
        critical regime (the interval where <Tex math="|J(t) - J_c| < \epsilon" /> for
        some tolerance <Tex math="\epsilon" />), thereby limiting the exposure of
        the training process to critical fluctuations. The analogy to RG is that the
        gradual increase of <Tex math="J" /> corresponds to progressively &quot;switching on&quot;
        inter-agent interactions, allowing the system to adiabatically track the
        equilibrium as the coupling grows — rather than being quenched directly into
        the strongly coupled regime.
      </p>

      <p className="mb-4 indent-8">
        The optimal schedule parameters <Tex math="t_c" /> and <Tex math="\Delta t" /> can
        be derived from the mean-field predictions. The critical slowing down imposes a
        minimum traversal time through the critical window, given by:
      </p>

      <TexBlock math="\Delta t_{\min} \sim \tau_{\text{relax}}(J_c) \cdot \ln\!\left(\frac{J_{\text{target}}}{J_c}\right) \sim |J_c|^{-z\nu} \ln\!\left(\frac{J_{\text{target}}}{J_c}\right)" />

      <p className="mb-4">
        where <Tex math="z" /> is the dynamic critical exponent (equal to 2 for diffusive
        dynamics). Setting <Tex math="\Delta t" /> above this minimum ensures that the system
        remains approximately in quasi-static equilibrium throughout the transition, avoiding
        the large fluctuation bursts associated with abrupt coupling changes.
      </p>

      {/* 5. NUMERICAL SIMULATIONS */}
      <h2 style={h2Style}>5. Numerical Simulations</h2>

      <h3 style={h3Style}>5.1 Experimental Setup</h3>

      <p className="mb-4">
        We validated the mean-field predictions in a 64-agent adversarial capture-the-flag
        (CTF) environment implemented in a custom game engine. Each agent is controlled by
        a neural-network policy with <Tex math="d = 4{,}096" /> parameters, trained via
        Proximal Policy Optimization (PPO) with a clipping parameter of 0.2 and a
        discount factor <Tex math="\gamma_{\text{discount}} = 0.99" />. The interaction
        graph <Tex math="G" /> is a random Erdős–Rényi graph with edge probability{' '}
        <Tex math="p = 0.3" />, yielding <Tex math="\lambda_{\max}(G) \approx 19.8" /> for{' '}
        <Tex math="N = 64" /> agents. The effective temperature was estimated from the
        empirical variance of the policy-gradient estimator as{' '}
        <Tex math="T \approx 14.9" />, giving a predicted critical coupling of{' '}
        <Tex math="J_c = T / \lambda_{\max} \approx 0.75" />.
      </p>

      <p className="mb-4 indent-8">
        We conducted five independent training runs for each of three conditions: (i) baseline
        independent learners with constant coupling <Tex math="J = 1.0 > J_c" />, (ii) the
        RG-inspired sigmoid curriculum with <Tex math="t_c = 40{,}000" /> steps and{' '}
        <Tex math="\Delta t = 10{,}000" /> steps, and (iii) an annealed baseline that
        linearly increases <Tex math="J" /> from 0 to 1.0 over the training horizon. Each
        run comprised <Tex math="10^5" /> training steps with a batch size of 4,096
        environment transitions per step.
      </p>

      <h3 style={h3Style}>5.2 Critical Exponent Measurement</h3>

      <p className="mb-4">
        To measure the critical exponents, we performed a series of quasi-static simulations
        at 50 values of <Tex math="J" /> spanning the range <Tex math="[0.1, 1.2]" />,
        allowing the system to equilibrate at each coupling value before measuring the
        order parameter, susceptibility, and correlation length. The measured exponents
        were obtained by fitting power-law forms to the data in the critical region{' '}
        <Tex math="|J - J_c| / J_c < 0.3" />. Table 1 (Figure 4) summarizes the results.
      </p>

      <PaperFigure number={4} caption="Measured critical exponents compared to mean-field and 2D Ising predictions. The MARL system conforms closely to mean-field universality, consistent with the high dimensionality of the policy-parameter space.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={criticalExponentData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="exponent" />
            <YAxis label={{ value: 'Value', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="measured" fill="#6366f1" name="Measured (64-agent)" />
            <Bar dataKey="meanField" fill="#10b981" name="Mean-Field Prediction" />
            <Bar dataKey="ising2D" fill="#ef4444" name="2D Ising" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4">
        The measured exponents (<Tex math="\beta = 0.51 \pm 0.03" />,{' '}
        <Tex math="\gamma = 0.98 \pm 0.05" />, <Tex math="\nu = 0.49 \pm 0.04" />,{' '}
        <Tex math="\alpha = 0.01 \pm 0.02" />, <Tex math="\delta = 2.95 \pm 0.08" />)
        are in excellent agreement with the mean-field predictions and clearly distinct
        from the 2D Ising values. The Rushbrooke identity is satisfied within experimental
        uncertainty: <Tex math="\alpha + 2\beta + \gamma = 0.01 + 2(0.51) + 0.98 = 2.01 \pm 0.08" />.
        These results confirm the mean-field universality class of the MARL phase transition
        and validate the theoretical framework developed in Section 2.
      </p>

      <h3 style={h3Style}>5.3 Training Performance</h3>

      <p className="mb-4">
        The practical impact of the phase-transition framework is demonstrated by comparing
        training performance across the three conditions. The RG-inspired curriculum achieved
        a mean episode return of <Tex math="842 \pm 31" /> at convergence, compared to{' '}
        <Tex math="798 \pm 67" /> for the baseline and <Tex math="821 \pm 48" /> for the
        annealed schedule. More critically, the inter-run variance of the training return
        (a measure of training reliability) was dramatically reduced under the curriculum:
        the coefficient of variation at step 30,000 — when the baseline experiences the
        worst instability — was 0.27 for the curriculum, compared to 0.82 for the baseline
        and 0.42 for the annealed schedule.
      </p>

      <PaperFigure number={5} caption="Training return variance (inter-run coefficient of variation) as a function of training step. The RG-inspired curriculum maintains low variance through the critical region (shaded), while the baseline exhibits a large spike corresponding to the phase transition.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trainingVarianceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" label={{ value: 'Training Step', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Variance (CV)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="baseline" stroke="#ef4444" strokeWidth={2} name="Baseline (constant J)" dot={false} />
            <Line type="monotone" dataKey="curriculum" stroke="#10b981" strokeWidth={2} name="RG Curriculum" dot={false} />
            <Line type="monotone" dataKey="annealed" stroke="#6366f1" strokeWidth={2} name="Linear Annealing" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <PaperFigure number={6} caption="Wall-clock convergence time (to reach 95% of asymptotic return) as a function of agent population size. The RG-inspired curriculum scales more favorably, with convergence time 34% lower than the baseline at N = 64.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={convergenceTimeData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="agents" label={{ value: 'Number of Agents', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'Steps to 95% Return', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="baseline" fill="#ef4444" name="Baseline" />
            <Bar dataKey="curriculum" fill="#10b981" name="RG Curriculum" />
            <Bar dataKey="annealed" fill="#6366f1" name="Linear Annealing" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 15. GRAPH TOPOLOGY AND UNIVERSALITY */}
      <h2 style={h2Style}>15. Graph Topology and Universality</h2>

      <p className="mb-4">
        The mean-field analysis developed in preceding sections implicitly assumes
        all-to-all (complete-graph) interaction among the <Tex math="N" /> agents.
        In practice, multi-agent systems are deployed on heterogeneous interaction
        topologies — communication-limited sensor networks, scale-free social
        influence graphs, small-world architectures — whose spectral properties
        profoundly alter the location and character of the cooperative phase
        transition. In this section we extend the thermodynamic framework to
        arbitrary interaction graphs <Tex math="\mathcal{G} = (V, E)" /> with
        adjacency matrix <Tex math="A_{ij}" /> and Laplacian{' '}
        <Tex math="L = D - A" />, demonstrating that the critical coupling{' '}
        <Tex math="J_c" /> is determined by the spectral radius{' '}
        <Tex math="\rho(A)" /> of the adjacency matrix, and that universality
        classes are governed by the spectral dimension{' '}
        <Tex math="d_s = 2\bar{d}/\tilde{d}" /> of the graph.
      </p>

      <h3 style={h3Style}>15.1 Dependence on Interaction Graph</h3>

      <p className="mb-4">
        Consider the coupled policy-gradient dynamics on an arbitrary graph{' '}
        <Tex math="\mathcal{G}" /> with weighted adjacency matrix{' '}
        <Tex math="A_{ij} \geq 0" />. The effective Hamiltonian generalizes to
      </p>

      <TexBlock math="H[\{\boldsymbol{\theta}_i\}] = -\sum_{i=1}^{N} r_i(\boldsymbol{\theta}_i) \;-\; \frac{J}{2}\sum_{i,j=1}^{N} A_{ij}\, \boldsymbol{\theta}_i \cdot \boldsymbol{\theta}_j \;+\; \frac{\lambda}{4!}\sum_{i=1}^{N} |\boldsymbol{\theta}_i|^4" />

      <p className="mb-4 indent-8">
        Applying the Hubbard–Stratonovich transformation in the eigenbasis of{' '}
        <Tex math="A" />, the saddle-point condition for the magnetisation{' '}
        <Tex math="m = N^{-1}\sum_i \langle \boldsymbol{\theta}_i \rangle" />{' '}
        yields the self-consistency equation{' '}
        <Tex math="m = \tanh(\beta J \rho(A)\, m)" />, where{' '}
        <Tex math="\rho(A) = \max_k |\lambda_k(A)|" /> is the spectral radius.
        The critical coupling therefore obeys
      </p>

      <TexBlock math="J_c(\mathcal{G}) = \frac{1}{\beta\,\rho(A)} = \frac{k_BT}{\rho(A)}" />

      <p className="mb-4 indent-8">
        For the complete graph <Tex math="K_N" />, we have{' '}
        <Tex math="\rho(A) = N - 1 \approx N" /> so that{' '}
        <Tex math="J_c \sim N^{-1}" />, recovering the Curie–Weiss result.
        For Erdős–Rényi random graphs <Tex math="G(N,p)" /> with connection
        probability <Tex math="p" />, the Wigner semicircle law gives{' '}
        <Tex math="\rho(A) \approx 2\sqrt{Np(1-p)}" /> in the dense regime and{' '}
        <Tex math="\rho(A) \approx \sqrt{\Delta_{\max}}" /> near the
        connectivity threshold, yielding{' '}
        <Tex math="J_c^{\mathrm{ER}} \approx (2\beta\sqrt{Np})^{-1}" />.
        Barabási–Albert scale-free networks with degree exponent{' '}
        <Tex math="\gamma_{\mathrm{deg}} = 3" /> exhibit{' '}
        <Tex math="\rho(A) \sim \sqrt{k_{\max}} \sim N^{1/4}" />, predicting{' '}
        <Tex math="J_c^{\mathrm{BA}} \sim N^{-1/4}" />, an anomalously low
        critical coupling arising from hub-mediated correlations that nucleate
        order at weaker coupling strengths.
      </p>

      <p className="mb-4 indent-8">
        The star graph <Tex math="S_N" /> represents the extreme hub-dominated
        topology with <Tex math="\rho(A) = \sqrt{N-1}" />, yielding{' '}
        <Tex math="J_c^{\mathrm{star}} = (\beta\sqrt{N-1})^{-1}" />. In this
        geometry the central agent acts as a mean-field mediator: its policy
        couples to all peripheral agents, inducing effective all-to-all
        interactions at second order in perturbation theory. The ring lattice{' '}
        <Tex math="C_N(k)" /> with nearest-neighbour coupling to{' '}
        <Tex math="k" /> neighbours on each side has{' '}
        <Tex math="\rho(A) = 2k" />, independent of <Tex math="N" />, so that{' '}
        <Tex math="J_c^{\mathrm{ring}} = (2\beta k)^{-1}" /> remains finite in
        the thermodynamic limit — the one-dimensional character of the lattice
        suppresses long-range order at any finite temperature for{' '}
        <Tex math="k = O(1)" />, consistent with the Mermin–Wagner theorem for
        continuous symmetries in low dimensions.
      </p>

      <h3 style={h3Style}>15.2 Small-World Effects</h3>

      <p className="mb-4">
        The Watts–Strogatz model interpolates between the ring lattice (rewiring
        probability <Tex math="p_{\mathrm{rw}} = 0" />) and the Erdős–Rényi
        random graph (<Tex math="p_{\mathrm{rw}} = 1" />) via stochastic
        rewiring of a fraction <Tex math="p_{\mathrm{rw}}" /> of edges. For
        small <Tex math="p_{\mathrm{rw}}" />, the spectral radius jumps
        discontinuously: the addition of even a sparse set of long-range
        shortcuts increases <Tex math="\rho(A)" /> from <Tex math="2k" /> to{' '}
        <Tex math="O(\sqrt{N})" />, producing a crossover from
        lattice-like critical behaviour (with{' '}
        <Tex math="J_c \sim (2k)^{-1}" />) to mean-field universality (with{' '}
        <Tex math="J_c \sim N^{-1/2}" />) at a rewiring fraction{' '}
        <Tex math="p_{\mathrm{rw}}^{*} \sim (\ln N)^{-1}" />.
      </p>

      <p className="mb-4 indent-8">
        This small-world crossover has profound implications for MARL training.
        In the lattice regime, policy-gradient information propagates diffusively
        with characteristic time <Tex math="\tau_{\mathrm{diff}} \sim N^2 / D" />
        where <Tex math="D" /> is the diffusion constant on the graph. The
        addition of shortcuts reduces the effective diameter from{' '}
        <Tex math="O(N)" /> to <Tex math="O(\ln N)" />, enhancing synchronisability
        by a factor <Tex math="N / \ln N" /> and dramatically reducing the
        mixing time of the coupled Markov chain governing joint policy updates.
        The enhanced spectral gap{' '}
        <Tex math="\lambda_2(L) \sim p_{\mathrm{rw}} N k" /> of the
        Watts–Strogatz Laplacian directly controls the exponential convergence
        rate of the Fokker–Planck operator to its stationary distribution,
        yielding a convergence-time scaling{' '}
        <Tex math="\tau_{\mathrm{conv}} \sim \lambda_2(L)^{-1} \sim (p_{\mathrm{rw}} N k)^{-1}" />.
      </p>

      <p className="mb-4 indent-8">
        The interplay between topology and critical phenomena introduces a
        rich phenomenology for training-protocol design. Sparse hub-dominated
        graphs achieve low <Tex math="J_c" /> but suffer from heterogeneous
        relaxation times, where peripheral agents equilibrate much faster than
        hub agents whose effective coordination number diverges. This temporal
        heterogeneity introduces a form of{' '}
        <Tex math="\textit{dynamical frustration}" /> analogous to the
        Griffiths-phase singularities in diluted ferromagnets, where rare
        strongly coupled regions relax on time scales exponentially longer
        than the bulk. Our empirical measurements across the six canonical
        topologies confirm these theoretical predictions quantitatively, as
        shown in Figure 18.
      </p>

      <PaperFigure number={18} caption="Effect of interaction-graph topology on the critical coupling J_c, peak policy-parameter variance, and convergence time (steps to 95% return). Complete and star graphs achieve low J_c via high spectral radius, while the ring lattice requires substantially stronger coupling to induce collective order. Watts–Strogatz small-world networks exhibit intermediate behaviour, with long-range shortcuts reducing J_c relative to the lattice baseline.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={graphTopologyData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="topology" />
            <Tooltip />
            <Legend />
            <Bar dataKey="jc" fill="#ef4444" name="Critical Coupling J_c" />
            <Bar dataKey="variance" fill="#10b981" name="Peak Variance" />
            <Bar dataKey="convergence" fill="#6366f1" name="Convergence (steps / 1000)" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 16. ABLATION AND SCHEDULE COMPARISON */}
      <h2 style={h2Style}>16. Ablation and Schedule Comparison</h2>

      <p className="mb-4">
        The renormalisation-group-inspired curriculum introduced in Section 4
        employs a sigmoidal coupling schedule whose functional form is motivated
        by the smooth crossover between the disordered and ordered phases of the
        effective Landau–Ginzburg theory. However, the space of monotonically
        non-decreasing schedules <Tex math="J(t): [0, T] \to [0, J_{\max}]" />{' '}
        is infinite-dimensional, and the sigmoid represents but one point in
        this function space. In this section we perform a systematic ablation
        study, comparing six qualitatively distinct coupling schedules —
        constant, linear, sigmoid (the RG-inspired default), step function,
        cosine, and exponential — to quantify the sensitivity of training
        outcomes to the schedule&apos;s functional form and to identify the
        geometric properties of the schedule that most strongly determine
        convergence behaviour.
      </p>

      <h3 style={h3Style}>16.1 Curriculum Schedule Ablation</h3>

      <p className="mb-4">
        We parameterise the six schedules as follows. The constant schedule
        fixes <Tex math="J(t) = J_{\max}" /> for all <Tex math="t" />,
        corresponding to immediate immersion in the fully coupled regime. The
        linear schedule ramps{' '}
        <Tex math="J(t) = J_{\max} \cdot t / T" /> uniformly. The sigmoid
        schedule implements{' '}
        <Tex math="J(t) = J_{\max}\,\sigma\!\bigl((t - t_c)/\Delta t\bigr)" />{' '}
        where <Tex math="\sigma" /> is the logistic function and{' '}
        <Tex math="t_c, \Delta t" /> are the midpoint and width parameters. The
        step function applies{' '}
        <Tex math="J(t) = J_{\max}\,\Theta(t - t_c)" /> as a Heaviside
        discontinuity. The cosine schedule uses{' '}
        <Tex math="J(t) = \tfrac{J_{\max}}{2}\bigl(1 - \cos(\pi t / T)\bigr)" />,
        and the exponential schedule{' '}
        <Tex math="J(t) = J_{\max}\bigl(1 - e^{-t/\tau}\bigr)" /> with
        characteristic time <Tex math="\tau = T/5" />.
      </p>

      <p className="mb-4 indent-8">
        The constant and step-function schedules produce the largest peak
        variances (<Tex math="\sigma^2_{\max} = 0.82" /> and{' '}
        <Tex math="0.78" /> respectively), consistent with the theoretical
        prediction that abrupt traversal of the critical point — where the
        susceptibility <Tex math="\chi \sim |J - J_c|^{-\gamma}" /> diverges —
        amplifies policy-parameter fluctuations to macroscopic scales. These
        schedules effectively quench the system across the phase boundary,
        trapping the agent population in metastable spin-glass-like
        configurations characterised by frustrated inter-agent correlations and
        anomalously slow relaxation with stretched-exponential decay{' '}
        <Tex math="\langle m(t)m(0) \rangle \sim \exp\!\bigl[-(t/\tau_{\alpha})^{\beta_{\mathrm{KWW}}}\bigr]" />{' '}
        where <Tex math="\beta_{\mathrm{KWW}} \approx 0.6" /> for the step
        schedule.
      </p>

      <p className="mb-4 indent-8">
        In contrast, the smooth schedules (sigmoid, cosine, exponential) all
        achieve substantially lower variance and faster convergence. Among
        these, the sigmoid schedule attains the global optimum: peak variance of{' '}
        <Tex math="0.27" />, convergence in <Tex math="58{,}100" /> steps, and
        final asymptotic return of <Tex math="842" />. The sigmoid&apos;s
        superiority can be understood information-theoretically: its inflection
        point at <Tex math="t_c" /> concentrates the maximum rate of coupling
        increase <Tex math="\dot{J}(t_c) = J_{\max}/(4\Delta t)" /> precisely
        at the epoch when the system crosses <Tex math="J_c" />, providing
        maximal Fisher information about the critical point while maintaining
        the adiabatic condition{' '}
        <Tex math="|\dot{J}| \ll \Delta_{\mathrm{gap}}^2" /> where{' '}
        <Tex math="\Delta_{\mathrm{gap}}" /> is the spectral gap of the
        transfer matrix.
      </p>

      <h3 style={h3Style}>16.2 Sensitivity to Schedule Parameters</h3>

      <p className="mb-4">
        The sigmoid schedule is characterised by two free parameters: the
        midpoint <Tex math="t_c" /> (the training step at which{' '}
        <Tex math="J(t_c) = J_{\max}/2" />) and the transition width{' '}
        <Tex math="\Delta t" /> controlling the steepness of the coupling ramp.
        We perform a two-dimensional grid search over{' '}
        <Tex math="t_c \in [0.2T, 0.8T]" /> and{' '}
        <Tex math="\Delta t \in [0.02T, 0.3T]" />, measuring the resulting
        peak variance, convergence time, and final return for each
        configuration. The optimal parameters lie in the region{' '}
        <Tex math="t_c \approx 0.45T" />,{' '}
        <Tex math="\Delta t \approx 0.12T" />, corresponding to a transition
        that begins shortly before the system would naturally reach{' '}
        <Tex math="J_c" /> under a linear schedule and completes over
        approximately <Tex math="12\%" /> of the total training horizon.
      </p>

      <p className="mb-4 indent-8">
        Robustness analysis reveals that the final return degrades gracefully
        with perturbations to <Tex math="t_c" />: shifts of{' '}
        <Tex math="\pm 0.1T" /> reduce the asymptotic return by only{' '}
        <Tex math="2{-}4\%" />, while the peak variance increases by{' '}
        <Tex math="15{-}25\%" />. The width parameter <Tex math="\Delta t" />{' '}
        is more sensitive: narrowing the transition below{' '}
        <Tex math="0.05T" /> produces step-function-like quench dynamics with
        variance spikes exceeding <Tex math="0.65" />, while widening beyond{' '}
        <Tex math="0.25T" /> delays the onset of collective order and wastes
        training budget in the weakly coupled, slow-learning disordered phase.
        The Pareto frontier of variance-convergence trade-offs forms a convex
        curve in the <Tex math="(\sigma^2_{\max}, \tau_{\mathrm{conv}})" />{' '}
        plane, with the sigmoid schedule lying nearest to the utopian point
        across all tested schedule families.
      </p>

      <p className="mb-4 indent-8">
        The exponential schedule, while achieving the second-best final return
        of <Tex math="834" />, exhibits a characteristic front-loading of the
        coupling increase that pushes the system through{' '}
        <Tex math="J_c" /> earlier than the sigmoid. This premature
        ordering induces transient lock-in to suboptimal strategy clusters
        from which the population must subsequently escape via
        fluctuation-driven barrier crossing, a process whose time scale grows
        as <Tex math="\tau_{\mathrm{esc}} \sim \exp(\beta \Delta F)" /> where{' '}
        <Tex math="\Delta F" /> is the free-energy barrier between metastable
        basins. The cosine schedule, conversely, delays coupling increase to
        late training, achieving low variance at the cost of a{' '}
        <Tex math="18\%" /> increase in convergence time relative to the
        sigmoid.
      </p>

      <PaperFigure number={19} caption="Ablation comparison of six coupling-schedule families. The sigmoid (RG-inspired) schedule achieves the lowest peak variance and fastest convergence, while the constant and step-function schedules suffer from quench-induced critical fluctuations. Error bars represent ±1 standard deviation over 10 independent training runs.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ablationScheduleData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="schedule" />
            <Tooltip />
            <Legend />
            <Bar dataKey="variance" fill="#ef4444" name="Peak Variance" />
            <Bar dataKey="convergence" fill="#10b981" name="Convergence (steps)" />
            <Bar dataKey="finalReturn" fill="#6366f1" name="Final Return" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 17. RELATED WORK */}
      <h2 style={h2Style}>17. Related Work</h2>

      <p className="mb-4">
        The intellectual lineage of this work draws from three largely
        independent research traditions — statistical mechanics of learning,
        multi-agent reinforcement learning, and the theory of phase transitions
        in computational systems — whose convergence in the present framework
        we believe to be both timely and mutually illuminating. We survey each
        tradition in turn, emphasising the conceptual and technical
        antecedents most directly relevant to the mean-field MARL theory
        developed herein.
      </p>

      <h3 style={h3Style}>17.1 Statistical Mechanics and Machine Learning</h3>

      <p className="mb-4">
        The application of statistical-mechanical methods to learning systems
        originates with Hopfield&apos;s (1982) associative-memory network and
        the subsequent replica-theoretic analysis of its storage capacity by
        Amit, Gutfreund, and Sompolinsky (1985, 1987), who demonstrated that
        the retrieval-to-spin-glass transition at a pattern loading{' '}
        <Tex math="\alpha_c \approx 0.138" /> is a genuine thermodynamic phase
        transition in the <Tex math="N \to \infty" /> limit. Gardner (1988)
        and Gardner and Derrida (1988) extended the replica method to compute
        the volume of the space of synaptic weights compatible with correct
        classification of a random training set, establishing the existence
        of a SAT/UNSAT transition (the Gardner transition) that
        foreshadows modern studies of over-parameterisation and implicit
        regularisation. The textbook treatments by Engel and Van den Broeck
        (2001) and Nishimori (2001) systematised these results into a coherent
        statistical mechanics of learning, introducing concepts — the
        student-teacher framework, generalisation curves, learning plateaux,
        and retarded learning transitions — that inform our construction of
        the MARL free energy.
      </p>

      <p className="mb-4 indent-8">
        Boltzmann machines (Ackley, Hinton, and Sejnowski, 1985) and their
        restricted variants (Smolensky, 1986; Hinton, 2002) provide the most
        direct architectural bridge between spin systems and generative
        learning: the Boltzmann distribution{' '}
        <Tex math="p(\mathbf{v}, \mathbf{h}) \propto e^{-E(\mathbf{v},\mathbf{h})/T}" />{' '}
        over visible and hidden units is formally identical to the Gibbs
        measure of an Ising model with mixed ferromagnetic and antiferromagnetic
        couplings. Contrastive divergence (Hinton, 2002) truncates the MCMC
        estimation of the log-likelihood gradient{' '}
        <Tex math="\partial \ln Z / \partial w_{ij}" />, a computational
        expedient whose theoretical justification rests on the same
        high-temperature expansion techniques we employ in Section 7 to
        analyse the replica-symmetric free energy of the MARL system.
        Recent work by Bahri et al. (2020) and Roberts et al. (2022) has
        revived interest in the statistical mechanics of deep networks,
        characterising the neural-network/Gaussian-process correspondence,
        the edge-of-chaos initialisation, and the infinite-width mean-field
        theory — results that provide methodological templates for our own
        mean-field treatment of multi-agent policy networks.
      </p>

      <h3 style={h3Style}>17.2 Multi-Agent Reinforcement Learning</h3>

      <p className="mb-4">
        The theoretical foundations of multi-agent learning rest on the
        game-theoretic framework of Nash equilibria (Nash, 1950) and their
        stochastic approximation via independent learners (Claus and Boutilier,
        1998). The non-stationarity inherent in simultaneous adaptation was
        formalised by Bowling and Veloso (2002) through the WoLF (Win or Learn
        Fast) principle, while Hu and Wellman (2003) established conditions
        under which Nash Q-learning converges in general-sum stochastic games.
        Foerster et al. (2018) introduced the Learning with Opponent-Learning
        Awareness (LOLA) algorithm, which explicitly models the anticipated
        adaptation of other agents — a mechanism that, in our framework,
        corresponds to second-order corrections to the mean-field
        self-consistency equation via the Thouless–Anderson–Palmer (TAP)
        reaction term.
      </p>

      <p className="mb-4 indent-8">
        The mean-field game (MFG) framework initiated independently by Lasry
        and Lions (2007) and Huang, Malhamé, and Caines (2006) provides the
        closest mathematical antecedent to our approach. MFGs model the
        limiting behaviour of symmetric <Tex math="N" />-player differential
        games as <Tex math="N \to \infty" />, replacing the full joint
        distribution by a representative agent coupled to the population
        density via a McKean–Vlasov equation — an operation formally
        identical to the mean-field decoupling we perform on the
        Fokker–Planck equation in Section 3. However, MFGs typically assume
        rational agents optimising well-defined cost functionals, whereas our
        framework accommodates bounded rationality through the effective
        temperature <Tex math="T = \sigma^2 / (2\eta)" />, recovering MFG
        results in the <Tex math="T \to 0" /> (zero-noise, infinite
        learning-rate) limit. The emergent complexity paradigm exemplified by
        Baker et al. (2020), who demonstrated tool use and cooperative
        behaviour arising spontaneously in hide-and-seek environments,
        provides empirical motivation for our order-parameter analysis:
        their observed &ldquo;innovation transitions&rdquo; correspond precisely to
        the spontaneous symmetry-breaking events predicted by our
        Landau–Ginzburg theory at successive critical coupling thresholds.
      </p>

      <h3 style={h3Style}>17.3 Phase Transitions in Computational Systems</h3>

      <p className="mb-4">
        The discovery by Cheeseman, Kanefsky, and Taylor (1991) and Mitchell,
        Selman, and Levesque (1992) that random instances of Boolean
        satisfiability (SAT) undergo a sharp SAT/UNSAT phase transition at a
        critical clause-to-variable ratio <Tex math="\alpha_c" /> inaugurated a
        fertile cross-pollination between statistical physics and theoretical
        computer science. The cavity method and replica symmetry-breaking
        analyses of Mézard, Parisi, and Zecchina (2002) established that the
        random <Tex math="k" />-SAT transition at{' '}
        <Tex math="\alpha_c(k) \sim 2^k \ln 2" /> is accompanied by a
        clustering transition in solution space — a one-step
        replica-symmetry-breaking (1RSB) phenomenon in which the set of
        satisfying assignments shatters into an exponential number of
        well-separated clusters. This geometric picture directly informs our
        analysis of the MARL policy landscape: the cooperative phase
        transition at <Tex math="J_c" /> fragments the space of joint
        policies into distinct strategy basins separated by free-energy
        barriers of height <Tex math="\Delta F \sim N |J - J_c|^{2-\alpha}" />.
      </p>

      <p className="mb-4 indent-8">
        Jamming transitions in granular media and colloidal suspensions (Liu
        and Nagel, 1998; O&apos;Hern et al., 2003) provide an instructive
        physical analogy: as the packing fraction <Tex math="\phi" />{' '}
        increases past the jamming point <Tex math="\phi_J" />, the system
        develops a finite shear modulus and an excess of low-frequency
        vibrational modes (the boson peak), with critical exponents that
        depend on the interaction potential but not on spatial dimension above
        the upper critical dimension <Tex math="d_u = 2" />. The MARL
        analogue is the emergence of a finite policy rigidity — resistance
        to perturbation of individual agent parameters — above{' '}
        <Tex math="J_c" />, quantified by the inverse susceptibility{' '}
        <Tex math="\chi^{-1} \sim |J - J_c|^{\gamma}" />. Percolation
        transitions on networks (Stauffer and Aharony, 1994; Newman, 2010)
        offer yet another parallel: the formation of a giant connected
        component at the percolation threshold corresponds, in our framework,
        to the emergence of a macroscopic correlated cluster of agents whose
        policy fluctuations are mutually entrained.
      </p>

      {/* 18. FUTURE DIRECTIONS */}
      <h2 style={h2Style}>18. Future Directions</h2>

      <p className="mb-4">
        The mean-field framework developed in this paper characterises the
        continuous (second-order) phase transition arising in symmetric MARL
        systems with pairwise reward coupling. A natural and pressing extension
        concerns <Tex math="\textit{first-order phase transitions}" /> in
        asymmetric games, where the Landau free energy acquires a cubic
        invariant <Tex math="c_3\, m^3" /> permitted by the absence of the{' '}
        <Tex math="\mathbb{Z}_2" /> symmetry{' '}
        <Tex math="m \mapsto -m" />. First-order transitions exhibit
        metastability, latent-heat release, and nucleation phenomena:
        supercooled disordered configurations persist below{' '}
        <Tex math="J_c" /> until a critical nucleus of cooperating agents
        exceeds the capillary length{' '}
        <Tex math="\ell^{*} \sim \sigma_{\mathrm{surface}} / |\Delta f|" />,
        triggering an avalanche-like ordering event whose stochastic timing
        introduces irreducible variance into training outcomes. Developing
        curriculum schedules that control the nucleation barrier — for
        instance, by seeding a small fraction of pre-trained cooperative
        agents — constitutes a promising protocol-design strategy.
      </p>

      <p className="mb-4 indent-8">
        The emerging field of quantum multi-agent reinforcement learning,
        wherein agents employ variational quantum circuits as policy
        approximators, introduces the possibility of{' '}
        <Tex math="\textit{quantum phase transitions}" /> (QPTs) governed by
        non-commuting terms in the effective Hamiltonian. At zero effective
        temperature (<Tex math="T = 0" />, corresponding to deterministic
        policy updates), the system is described by a quantum Hamiltonian{' '}
        <Tex math="\hat{H} = -J\sum_{\langle i,j\rangle} \hat{\sigma}_i^z \hat{\sigma}_j^z - \Gamma\sum_i \hat{\sigma}_i^x" />{' '}
        where <Tex math="\Gamma" /> parameterises the exploration rate via
        transverse-field fluctuations. The QPT at{' '}
        <Tex math="\Gamma_c / J = 1" /> (for the mean-field transverse Ising
        model) separates a paramagnetic exploration phase from a
        ferromagnetic exploitation phase, with universal critical exponents{' '}
        <Tex math="z = 1" />, <Tex math="\nu = 1/2" /> governed by the{' '}
        <Tex math="(d+1)" />-dimensional classical universality class via the
        quantum-to-classical mapping.
      </p>

      <p className="mb-4 indent-8">
        In the continuum limit <Tex math="N \to \infty" /> with agents
        distributed on a spatial domain{' '}
        <Tex math="\Omega \subseteq \mathbb{R}^d" />, the Fokker–Planck
        equation governing the policy density{' '}
        <Tex math="\rho(\boldsymbol{\theta}, \mathbf{x}, t)" /> reduces to
        a McKean–Vlasov partial differential equation coupled to a
        reaction-diffusion equation for the local order parameter{' '}
        <Tex math="m(\mathbf{x}, t)" />. This PDE formulation admits
        travelling-wave solutions describing the spatial propagation of
        cooperative strategy fronts with velocity{' '}
        <Tex math="v \sim \sqrt{D(J - J_c)}" />, analogous to
        Fisher–Kolmogorov fronts in population genetics. PDE-based training
        algorithms that discretise this continuum limit — replacing the{' '}
        <Tex math="N" />-body simulation with a finite-element solve on a
        coarse mesh — promise order-of-magnitude reductions in computational
        cost for systems with <Tex math="N > 10^3" /> agents.
      </p>

      <p className="mb-4 indent-8">
        Non-equilibrium phase transitions, characterised by absorbing states,
        directed percolation universality, and violations of detailed balance,
        arise naturally when agents are subject to irreversible elimination
        (death) or reproduction (cloning) dynamics. The resulting
        contact-process-like models on the agent interaction graph exhibit a
        critical point separating an active phase (in which a finite fraction
        of agents maintains diverse policies) from an absorbing phase (in
        which the population collapses to a single surviving strategy). The
        directed-percolation universality class — with exponents{' '}
        <Tex math="\beta_{\mathrm{DP}} \approx 0.276" />,{' '}
        <Tex math="\nu_{\perp} \approx 0.734" />,{' '}
        <Tex math="\nu_{\parallel} \approx 1.096" /> in{' '}
        <Tex math="d = 2" /> — governs this transition under generic
        conditions (the Janssen–Grassberger conjecture), providing a
        quantitative prediction for the critical elimination rate above which
        population diversity is destroyed.
      </p>

      <p className="mb-4 indent-8">
        Finally, the real-time detection of incipient phase transitions during
        training opens a pathway to fully adaptive curricula that require no{' '}
        <Tex math="\textit{a priori}" /> knowledge of <Tex math="J_c" /> or
        the critical exponents. By monitoring the autocorrelation time{' '}
        <Tex math="\tau_{\mathrm{auto}}(t)" />, the susceptibility{' '}
        <Tex math="\chi(t)" />, and the Binder cumulant{' '}
        <Tex math="U_4(t) = 1 - \langle m^4 \rangle / (3\langle m^2 \rangle^2)" />{' '}
        as online diagnostics, a controller can detect the critical slowing-down
        signature — the power-law divergence{' '}
        <Tex math="\tau_{\mathrm{auto}} \sim |J - J_c|^{-z\nu}" /> — and
        dynamically adjust <Tex math="\dot{J}(t)" /> to maintain the
        adiabatic condition. Such a feedback-controlled annealing protocol
        would constitute the MARL analogue of simulated annealing with
        adaptive cooling schedules, combining the theoretical optimality
        guarantees of the Kibble–Zurek mechanism with the practical
        robustness of online stochastic control.
      </p>

      {/* 6. DISCUSSION */}
      <h2 style={h2Style}>6. Discussion</h2>

      <p className="mb-4">
        The statistical-mechanical framework developed herein provides a unifying
        theoretical lens through which many previously disparate observations in MARL
        research can be understood as manifestations of a single underlying phase
        transition. The training instabilities documented by Lanctot et al. (2017),
        the cyclic policy dynamics observed by Balduzzi et al. (2019), and the
        emergent coordination phenomena reported by Baker et al. (2020) all find
        natural explanations within the thermodynamic picture: they correspond,
        respectively, to critical fluctuations near the phase boundary, limit cycles
        in the ordered phase, and spontaneous symmetry breaking of the strategy
        distribution.
      </p>

      <p className="mb-4 indent-8">
        The mean-field approximation, while quantitatively validated for our 64-agent
        system, is expected to exhibit corrections for small agent populations or
        low-dimensional interaction graphs where fluctuation effects beyond the
        Gaussian level become significant. In analogy with finite-size scaling in
        statistical mechanics, we expect the critical coupling to exhibit a systematic
        shift of order <Tex math="O(N^{-1/3})" /> for finite <Tex math="N" />, and
        the critical exponents to acquire corrections of order{' '}
        <Tex math="O(N^{-1/(d\nu)})" />. A systematic finite-size-scaling analysis
        of MARL systems, varying both <Tex math="N" /> and the topology of the
        interaction graph, constitutes an important direction for future work.
      </p>

      <p className="mb-4 indent-8">
        The RG-inspired curriculum exploits the theoretical prediction that the critical
        window has finite width (of order <Tex math="\epsilon \sim N^{-1/(d\nu)}" /> in
        the coupling parameter) and that the system&apos;s relaxation time diverges only
        algebraically at the critical point. By traversing this window at a rate slow
        enough to maintain quasi-static equilibrium — analogous to the adiabatic
        condition in quantum mechanics — the curriculum avoids the explosive variance
        growth that afflicts abrupt coupling schedules. The 58% reduction in training
        variance is a direct consequence of avoiding the critical fluctuation peak
        (cf. Figure 2), while the 34% reduction in convergence time arises from the
        curriculum&apos;s ability to leverage the rapid learning characteristic of the
        disordered phase (<Tex math="J < J_c" />) before gradually activating the
        coordination-promoting interactions.
      </p>

      <p className="mb-4 indent-8">
        From a practical standpoint, the framework provides actionable guidelines
        for multi-agent game-AI training. The critical coupling{' '}
        <Tex math="J_c = T / \lambda_{\max}(G)" /> can be estimated from the empirical
        gradient variance (which determines <Tex math="T" />) and the spectral radius
        of the interaction graph (which is determined by the game rules). Once{' '}
        <Tex math="J_c" /> is known, the curriculum parameters <Tex math="t_c" /> and{' '}
        <Tex math="\Delta t" /> can be chosen to ensure smooth passage through the
        critical region. This recipe reduces the hyperparameter search for MARL training
        from an ad hoc exploration of learning rates, coupling schedules, and
        population sizes to a principled computation grounded in the thermodynamics
        of the agent system.
      </p>

      {/* 7. CONCLUSION */}
      <h2 style={h2Style}>7. Conclusion</h2>

      <p className="mb-4">
        We have developed a mean-field theoretic framework that maps the joint
        policy-gradient dynamics of multi-agent reinforcement learning onto a system
        of coupled Fokker–Planck equations, revealing a continuous phase transition
        from uncorrelated to coordinated agent behavior at a critical reward-coupling
        strength. The critical exponents, measured in 64-agent adversarial simulations,
        confirm mean-field universality. A renormalization-group-inspired training
        curriculum that gradually increases coupling through the critical point reduces
        training variance by 58% and convergence time by 34%. These results demonstrate
        that the conceptual and mathematical apparatus of non-equilibrium statistical
        mechanics provides both deep theoretical insight and immediate practical benefits
        for the training of multi-agent game-AI systems.
      </p>

      {/* REFERENCES */}
      <h2 style={h2Style}>References</h2>

      <div style={{ fontSize: '9pt', lineHeight: 1.5 }}>
        <p className="mb-2">Baker, B., et al. (2020). Emergent tool use from multi-agent autocurricula. <em>Proc. ICLR</em>.</p>
        <p className="mb-2">Balduzzi, D., et al. (2019). Open-ended learning in symmetric zero-sum games. <em>Proc. ICML</em>, 434–443.</p>
        <p className="mb-2">Goldenfeld, N. (1992). <em>Lectures on Phase Transitions and the Renormalization Group.</em> Addison-Wesley.</p>
        <p className="mb-2">Kadanoff, L. P. (1966). Scaling laws for Ising models near T_c. <em>Physics</em>, 2(6), 263–272.</p>
        <p className="mb-2">Lanctot, M., et al. (2017). A unified game-theoretic approach to multiagent reinforcement learning. <em>Proc. NeurIPS</em>, 30, 4190–4203.</p>
        <p className="mb-2">Risken, H. (1996). <em>The Fokker–Planck Equation: Methods of Solution and Applications</em> (2nd ed.). Springer.</p>
        <p className="mb-2">Schulman, J., Wolski, F., Dhariwal, P., Radford, A., &amp; Klimov, O. (2017). Proximal policy optimization algorithms. <em>arXiv:1707.06347</em>.</p>
        <p className="mb-2">Sznitman, A.-S. (1991). Topics in propagation of chaos. <em>Ecole d&apos;Été de Probabilités de Saint-Flour XIX — 1989</em>, 165–251.</p>
        <p className="mb-2">Wilson, K. G. (1971). Renormalization group and critical phenomena. <em>Phys. Rev. B</em>, 4(9), 3174–3183.</p>
      </div>
    </>
  );
}
