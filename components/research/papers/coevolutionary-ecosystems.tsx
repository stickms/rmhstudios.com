'use client';

import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

const populationDynamicsData = [
  { generation: 0, predator: 120, prey: 480, scavenger: 60, parasite: 40 },
  { generation: 50, predator: 145, prey: 420, scavenger: 72, parasite: 48 },
  { generation: 100, predator: 182, prey: 340, scavenger: 88, parasite: 55 },
  { generation: 150, predator: 210, prey: 280, scavenger: 102, parasite: 68 },
  { generation: 200, predator: 178, prey: 310, scavenger: 115, parasite: 82 },
  { generation: 250, predator: 142, prey: 390, scavenger: 98, parasite: 95 },
  { generation: 300, predator: 155, prey: 450, scavenger: 82, parasite: 78 },
  { generation: 350, predator: 198, prey: 380, scavenger: 95, parasite: 62 },
  { generation: 400, predator: 225, prey: 295, scavenger: 110, parasite: 85 },
  { generation: 450, predator: 190, prey: 260, scavenger: 128, parasite: 105 },
  { generation: 500, predator: 152, prey: 320, scavenger: 135, parasite: 118 },
  { generation: 550, predator: 135, prey: 395, scavenger: 112, parasite: 98 },
  { generation: 600, predator: 168, prey: 430, scavenger: 95, parasite: 75 },
  { generation: 650, predator: 205, prey: 360, scavenger: 108, parasite: 88 },
  { generation: 700, predator: 238, prey: 285, scavenger: 125, parasite: 102 },
  { generation: 750, predator: 195, prey: 250, scavenger: 140, parasite: 120 },
  { generation: 800, predator: 158, prey: 310, scavenger: 148, parasite: 132 },
  { generation: 850, predator: 140, prey: 375, scavenger: 130, parasite: 108 },
  { generation: 900, predator: 172, prey: 415, scavenger: 115, parasite: 90 },
  { generation: 950, predator: 210, prey: 345, scavenger: 128, parasite: 98 },
  { generation: 1000, predator: 185, prey: 305, scavenger: 142, parasite: 115 },
];

const fitnessLandscapeData = [
  { traitValue: 0.0, predatorFitness: 0.12, preyFitness: 0.85, landscape: 0.48 },
  { traitValue: 0.1, predatorFitness: 0.18, preyFitness: 0.78, landscape: 0.52 },
  { traitValue: 0.2, predatorFitness: 0.28, preyFitness: 0.68, landscape: 0.58 },
  { traitValue: 0.3, predatorFitness: 0.42, preyFitness: 0.55, landscape: 0.65 },
  { traitValue: 0.4, predatorFitness: 0.58, preyFitness: 0.42, landscape: 0.72 },
  { traitValue: 0.5, predatorFitness: 0.72, preyFitness: 0.30, landscape: 0.68 },
  { traitValue: 0.6, predatorFitness: 0.81, preyFitness: 0.22, landscape: 0.55 },
  { traitValue: 0.7, predatorFitness: 0.75, preyFitness: 0.18, landscape: 0.42 },
  { traitValue: 0.8, predatorFitness: 0.62, preyFitness: 0.25, landscape: 0.35 },
  { traitValue: 0.9, predatorFitness: 0.45, preyFitness: 0.38, landscape: 0.30 },
  { traitValue: 1.0, predatorFitness: 0.28, preyFitness: 0.52, landscape: 0.28 },
];

const speciesDiversityData = [
  { generation: 0, shannonIndex: 1.02, speciesCount: 4, evenness: 0.74 },
  { generation: 100, shannonIndex: 1.18, speciesCount: 5, evenness: 0.73 },
  { generation: 200, shannonIndex: 1.35, speciesCount: 7, evenness: 0.69 },
  { generation: 300, shannonIndex: 1.22, speciesCount: 6, evenness: 0.68 },
  { generation: 400, shannonIndex: 1.58, speciesCount: 9, evenness: 0.72 },
  { generation: 500, shannonIndex: 1.82, speciesCount: 12, evenness: 0.75 },
  { generation: 600, shannonIndex: 1.65, speciesCount: 10, evenness: 0.71 },
  { generation: 700, shannonIndex: 2.05, speciesCount: 14, evenness: 0.78 },
  { generation: 800, shannonIndex: 2.28, speciesCount: 18, evenness: 0.79 },
  { generation: 850, shannonIndex: 2.42, speciesCount: 21, evenness: 0.80 },
  { generation: 900, shannonIndex: 2.15, speciesCount: 16, evenness: 0.77 },
  { generation: 950, shannonIndex: 2.32, speciesCount: 19, evenness: 0.79 },
  { generation: 1000, shannonIndex: 2.48, speciesCount: 22, evenness: 0.81 },
];

const redQueenData = [
  { cycle: 1, predatorTrait: 0.32, preyTrait: 0.28 },
  { cycle: 2, predatorTrait: 0.38, preyTrait: 0.35 },
  { cycle: 3, predatorTrait: 0.45, preyTrait: 0.42 },
  { cycle: 4, predatorTrait: 0.52, preyTrait: 0.48 },
  { cycle: 5, predatorTrait: 0.58, preyTrait: 0.55 },
  { cycle: 6, predatorTrait: 0.65, preyTrait: 0.62 },
  { cycle: 7, predatorTrait: 0.71, preyTrait: 0.68 },
  { cycle: 8, predatorTrait: 0.78, preyTrait: 0.75 },
  { cycle: 9, predatorTrait: 0.84, preyTrait: 0.81 },
  { cycle: 10, predatorTrait: 0.90, preyTrait: 0.88 },
  { cycle: 11, predatorTrait: 0.35, preyTrait: 0.92 },
  { cycle: 12, predatorTrait: 0.42, preyTrait: 0.35 },
  { cycle: 13, predatorTrait: 0.48, preyTrait: 0.42 },
  { cycle: 14, predatorTrait: 0.55, preyTrait: 0.50 },
  { cycle: 15, predatorTrait: 0.62, preyTrait: 0.58 },
  { cycle: 16, predatorTrait: 0.68, preyTrait: 0.65 },
  { cycle: 17, predatorTrait: 0.75, preyTrait: 0.72 },
  { cycle: 18, predatorTrait: 0.82, preyTrait: 0.78 },
  { cycle: 19, predatorTrait: 0.88, preyTrait: 0.85 },
  { cycle: 20, predatorTrait: 0.38, preyTrait: 0.90 },
];

/* --------------------------------------------
   Shared styles
   -------------------------------------------- */

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

/* --------------------------------------------
   Component
   -------------------------------------------- */

export function CoevolutionaryEcosystemsPaper() {
  const { t } = useTranslation("c-research");
  return (
    <>
      {/* 1. INTRODUCTION */}
      <h2 style={h2Style}>{t("section-1-introduction", { defaultValue: "1. Introduction" })}</h2>

      <p className="mb-4">
        {t("intro-p1", { defaultValue: "The emergence of complex ecological dynamics in artificial agent populations represents one of the most compelling frontiers of computational biology and game design. Since the pioneering work of Thomas Ray's Tierra system and Karl Sims' virtual creatures, researchers have recognized that populations of autonomous digital agents, when subjected to selective pressures within sufficiently rich environments, can spontaneously generate evolutionary phenomena of remarkable sophistication—including adaptive radiation, niche partitioning, and arms-race dynamics that parallel the coevolutionary processes observed in natural ecosystems. Yet despite decades of investigation in the artificial life community, the majority of digital evolution experiments have been conducted in highly simplified, low-dimensional environments that lack the spatial heterogeneity, resource complexity, and multi-trophic interactions necessary to support the full spectrum of ecological and evolutionary phenomena observed in biological systems." })}
      </p>

      <p className="mb-4 indent-8">
        {t("intro-p2-start", { defaultValue: "In this paper, we present results from a large-scale agent-based simulation conducted within a procedurally generated open-world game environment comprising" })} <Tex math="2.4 \times 10^6" /> {t("intro-p2-cells", { defaultValue: "discrete spatial cells, 47 distinct resource types, and an initial population of" })} <Tex math="N = 10{,}000" /> {t("intro-p2-agents", { defaultValue: "autonomous agents governed by neural-network controllers with evolvable architectures. Over the course of" })} <Tex math="10^3" /> {t("intro-p2-generations", { defaultValue: "simulated generations—each comprising approximately" })} <Tex math="5 \times 10^4" /> {t("intro-p2-observe", { defaultValue: "individual agent-environment interaction steps—we observe the spontaneous emergence of phenomena that have, to our knowledge, not previously been documented in artificial systems at this fidelity: genuine speciation events producing reproductively isolated populations with distinct morphological and behavioral phenotypes; sustained Red Queen dynamics in which predator and prey lineages engage in continuous reciprocal adaptation without convergence to a static equilibrium; and punctuated equilibrium patterns wherein long periods of phenotypic stasis are interrupted by rapid bursts of morphological innovation coinciding with environmental perturbation events." })}
      </p>

      <p className="mb-4 indent-8">
        {t("intro-p3", { defaultValue: "The significance of these findings extends beyond the artificial life literature. From the perspective of game design, the demonstration that autonomous agent ecosystems can generate self-sustaining, dynamically evolving food webs suggests a fundamentally new approach to creating “living worlds”—game environments in which the fauna and flora are not hand-designed but emerge organically through evolutionary processes, producing ecological complexity that no design team could plausibly author manually. From the perspective of theoretical biology, our simulation provides a controlled experimental system in which the parameters governing mutation, selection, and environmental change can be varied independently, enabling causal tests of evolutionary hypotheses that are difficult or impossible to conduct in natural systems. The scale of the simulation—with populations an order of magnitude larger than typical artificial life experiments and environments orders of magnitude more complex—bridges a critical gap between the toy models that have dominated computational evolution and the mesoscale complexity of real ecosystems." })}
      </p>

      <p className="mb-4 indent-8">
        {t("intro-p4", { defaultValue: "The remainder of this paper is organized as follows. Section 2 describes the simulation framework, including the agent architecture, environmental model, and reproductive mechanics. Section 3 details the evolutionary mechanisms implemented in the system, encompassing mutation operators, selection regimes, and niche construction dynamics. Section 4 characterizes the emergent phenomena observed during the simulation, with particular emphasis on speciation events, Red Queen dynamics, and punctuated equilibrium patterns. Section 5 presents quantitative results, including population dynamics, phylogenetic reconstructions, and fitness landscape analyses. Section 6 discusses the implications of our findings for both evolutionary theory and game design, and Section 7 offers concluding remarks." })}
      </p>

      {/* 2. SIMULATION FRAMEWORK */}
      <h2 style={h2Style}>{t("section-2-simulation-framework", { defaultValue: "2. Simulation Framework" })}</h2>

      <h3 style={h3Style}>{t("section-2-1-environmental-model", { defaultValue: "2.1 Environmental Model" })}</h3>

      <p className="mb-4">
        {t("env-model-p1-start", { defaultValue: "The simulation environment is a continuous two-dimensional world of dimensions" })} <Tex math="L_x \times L_y = 2000 \times 1200" /> {t("env-model-p1-cells", { defaultValue: "spatial units, discretized into" })} <Tex math="2.4 \times 10^6" /> {t("env-model-p1-body", { defaultValue: "cells of unit area. The terrain is procedurally generated using a multi-octave Perlin noise function with fractal Brownian motion, producing a heterogeneous landscape comprising seven biome types: temperate forest, grassland, desert, tundra, aquatic, mountain, and marshland. Each biome type supports a characteristic distribution of resource nodes, with 47 distinct resource types distributed across the environment according to biome-specific density functions. Resource nodes regenerate stochastically at rates governed by a logistic growth model:" })}
      </p>
      <TexBlock math="\frac{dR_k(\mathbf{x}, t)}{dt} = r_k \, R_k(\mathbf{x}, t) \left(1 - \frac{R_k(\mathbf{x}, t)}{K_k(\mathbf{x})}\right) - \sum_{i=1}^{N} c_{ik}(\mathbf{x}, t)" />
      <p className="mb-4 indent-8">
        {t("env-model-p2-start", { defaultValue: "where" })} <Tex math="R_k(\mathbf{x}, t)" /> {t("env-model-p2-denotes", { defaultValue: "denotes the abundance of resource type" })} <Tex math="k" /> {t("env-model-p2-at", { defaultValue: "at spatial location" })} <Tex math="\mathbf{x}" /> {t("env-model-p2-and-time", { defaultValue: "and time" })} <Tex math="t" />{t("env-model-p2-comma", { defaultValue: "," })} <Tex math="r_k" /> {t("env-model-p2-growth", { defaultValue: "is the intrinsic growth rate of resource" })} <Tex math="k" />{t("env-model-p2-comma", { defaultValue: "," })} <Tex math="K_k(\mathbf{x})" /> {t("env-model-p2-carrying", { defaultValue: "is the biome-dependent carrying capacity, and" })} <Tex math="c_{ik}(\mathbf{x}, t)" /> {t("env-model-p2-consumption", { defaultValue: "is the consumption rate of resource" })} <Tex math="k" /> {t("env-model-p2-by-agent", { defaultValue: "by agent" })} <Tex math="i" /> {t("env-model-p2-location", { defaultValue: "at location" })} <Tex math="\mathbf{x}" />{t("env-model-p2-period", { defaultValue: "." })} {t("env-model-p2-perturbations", { defaultValue: "Environmental perturbations—droughts, floods, temperature shifts, and resource depletion events—are injected stochastically at a rate of" })} <Tex math="\lambda = 0.02" /> {t("env-model-p2-per-gen", { defaultValue: "per generation, altering the carrying capacities" })} <Tex math="K_k(\mathbf{x})" /> {t("env-model-p2-biomes", { defaultValue: "of affected biomes by a factor drawn from a log-normal distribution with mean 1.0 and standard deviation 0.4." })}
      </p>

      <h3 style={h3Style}>{t("section-2-2-agent-architecture", { defaultValue: "2.2 Agent Architecture" })}</h3>

      <p className="mb-4">
        {t("agent-arch-p1-start", { defaultValue: "Each agent" })} <Tex math="i" /> {t("agent-arch-p1-defined", { defaultValue: "is defined by a genotype" })} <Tex math="G_i" /> {t("agent-arch-p1-encoding", { defaultValue: "encoding both morphological parameters and the weights of a neural-network controller. The morphological genome specifies 24 continuous traits including body size" })} <Tex math="s_i \in [0.1, 10.0]" />{t("env-model-p2-comma", { defaultValue: "," })} {t("agent-arch-p1-metabolic", { defaultValue: "metabolic rate" })} <Tex math="m_i" />{t("env-model-p2-comma", { defaultValue: "," })} {t("agent-arch-p1-sensory", { defaultValue: "sensory range" })} <Tex math="r_i^{\mathrm{sense}}" />{t("env-model-p2-comma", { defaultValue: "," })} {t("agent-arch-p1-locomotion", { defaultValue: "locomotion speed" })} <Tex math="v_i^{\max}" />{t("env-model-p2-comma", { defaultValue: "," })} {t("agent-arch-p1-armor", { defaultValue: "armor" })} <Tex math="a_i" />{t("env-model-p2-comma", { defaultValue: "," })} {t("agent-arch-p1-attack", { defaultValue: "and attack strength" })} <Tex math="\alpha_i" />{t("agent-arch-p1-tradeoffs", { defaultValue: ". These traits are subject to energetic trade-offs governed by a constraint function:" })}
      </p>
      <TexBlock math="\Phi(G_i) = s_i^{2/3} \cdot m_i + \gamma_v (v_i^{\max})^2 + \gamma_r (r_i^{\mathrm{sense}})^{1.5} + \gamma_a a_i^2 + \gamma_\alpha \alpha_i^2 \leq E_{\max}(s_i)" />
      <p className="mb-4 indent-8">
        {t("agent-arch-p2-start", { defaultValue: "where" })} <Tex math="\gamma_v, \gamma_r, \gamma_a, \gamma_\alpha" /> {t("agent-arch-p2-cost", { defaultValue: "are cost coefficients and" })} <Tex math="E_{\max}(s_i) = E_0 \, s_i^{0.75}" /> {t("agent-arch-p2-allometric", { defaultValue: "is the allometric energy budget scaling with body size according to Kleiber's law. The neural-network controller is a recurrent network with a variable number of hidden layers (1–4), each containing 16–128 neurons, with the architecture itself encoded in the genotype and subject to structural mutations. The controller receives a 48-dimensional sensory input vector—comprising local resource densities, nearby agent positions and types, terrain information, and internal state variables (energy, health, age)—and produces a 12-dimensional action vector controlling movement direction, speed, consumption, attack, defense, signaling, and reproductive readiness." })}
      </p>

      <h3 style={h3Style}>{t("section-2-3-reproductive-mechanics", { defaultValue: "2.3 Reproductive Mechanics" })}</h3>

      <p className="mb-4">
        {t("repro-p1-start", { defaultValue: "Reproduction is sexual and requires two agents to be within a spatial proximity threshold" })} <Tex math="d_{\mathrm{mate}} = 5.0" /> {t("repro-p1-units", { defaultValue: "spatial units and to both emit compatible mating signals (a 4-dimensional signal vector with cosine similarity exceeding" })} <Tex math="\tau_{\mathrm{mate}} = 0.85" />{t("repro-p1-offspring", { defaultValue: "). The offspring genotype is produced by uniform crossover of the parental genotypes followed by mutation (see Section 3.1). Crucially, the mating signal compatibility threshold creates a mechanism for pre-zygotic reproductive isolation: as populations diverge in signal space, hybrids become increasingly unlikely, enabling allopatric and sympatric speciation. An agent must accumulate an energy reserve exceeding" })} <Tex math="E_{\mathrm{repro}} = 0.6 \, E_{\max}(s_i)" /> {t("repro-p1-eligible", { defaultValue: "to be eligible for reproduction, and the act of reproduction transfers 40% of the parent's current energy to the offspring. Agents have a maximum lifespan of" })} <Tex math="T_{\max} = 500" /> {t("repro-p1-lifespan", { defaultValue: "simulation steps, though the realized lifespan is typically much shorter due to predation, starvation, and environmental hazards." })}
      </p>

      {/* 3. EVOLUTIONARY MECHANISMS */}
      <h2 style={h2Style}>{t("section-3-evolutionary-mechanisms", { defaultValue: "3. Evolutionary Mechanisms" })}</h2>

      <h3 style={h3Style}>{t("section-3-1-mutation-operators", { defaultValue: "3.1 Mutation Operators" })}</h3>

      <p className="mb-4">
        {t("mutation-p1-start", { defaultValue: "The mutation model operates at three levels of genomic organization. Point mutations perturb individual morphological traits and network weights by additive Gaussian noise with trait-specific standard deviations" })} <Tex math="\sigma_k" /> {t("mutation-p1-calibrated", { defaultValue: "calibrated to produce phenotypic variation comparable to that observed in natural populations. For morphological traits," })} <Tex math="\sigma_k = 0.05 \cdot \mathrm{range}(k)" /> {t("mutation-p1-range", { defaultValue: "where the range is the difference between the maximum and minimum values of trait" })} <Tex math="k" />{t("mutation-p1-weights", { defaultValue: ". For neural-network weights," })} <Tex math="\sigma_w = 0.02" />{t("mutation-p1-structural", { defaultValue: ". Structural mutations alter the topology of the neural-network controller with probability" })} <Tex math="p_{\mathrm{struct}} = 0.01" /> {t("mutation-p1-per-repro", { defaultValue: "per reproduction event, adding or removing neurons and connections according to a NEAT-inspired complexification scheme. Finally, chromosomal mutations—duplications, deletions, and inversions of contiguous genome segments—occur with probability" })} <Tex math="p_{\mathrm{chrom}} = 0.005" />{t("mutation-p1-enabling", { defaultValue: ", enabling the large-scale genomic reorganizations that can drive rapid phenotypic change. The per-locus mutation rate is:" })}
      </p>
      <TexBlock math="\mu(l) = \mu_0 \left(1 + \beta_{\mathrm{stress}} \cdot \frac{E_{\mathrm{stress}}}{E_{\max}}\right)" />
      <p className="mb-4 indent-8">
        {t("mutation-p2-start", { defaultValue: "where" })} <Tex math="\mu_0 = 0.01" /> {t("mutation-p2-baseline", { defaultValue: "is the baseline per-locus mutation rate and" })} <Tex math="\beta_{\mathrm{stress}} = 2.0" /> {t("mutation-p2-stress", { defaultValue: "is a stress-induced mutagenesis coefficient that elevates mutation rates when agents experience environmental stress, measured by the ratio of accumulated stress energy" })} <Tex math="E_{\mathrm{stress}}" /> {t("mutation-p2-capacity", { defaultValue: "to maximum energy capacity. This mechanism, inspired by the SOS response in bacteria, ensures that populations under strong selective pressure generate increased phenotypic variation precisely when adaptation is most critical." })}
      </p>

      <h3 style={h3Style}>{t("section-3-2-selection-regimes", { defaultValue: "3.2 Selection Regimes" })}</h3>

      <p className="mb-4">
        {t("selection-p1-start", { defaultValue: "Selection operates through three concurrent mechanisms. Viability selection eliminates agents whose energy reserves fall to zero; since energy is continuously depleted by metabolic costs and must be replenished through foraging or predation, agents with poorly adapted morphologies or inefficient behavioral strategies are removed from the population on ecological timescales. Fecundity selection favors agents that accumulate energy reserves more rapidly, as the energy threshold for reproduction acts as a fitness proxy. Sexual selection operates through the mating signal system, as agents must evolve signals that are both attractive to conspecifics and distinguishable from heterospecific signals. The combined fitness of agent" })} <Tex math="i" /> {t("selection-p1-lifetime", { defaultValue: "over its lifetime can be expressed as:" })}
      </p>
      <TexBlock math="W_i = \sum_{t=0}^{T_i} \left[ \sum_{k=1}^{K} g_{ik}(t) \cdot R_k(\mathbf{x}_i(t), t) - m_i \cdot \Phi(G_i) - \delta_i(t) \right] \cdot \mathbb{1}\{E_i(t) > 0\}" />
      <p className="mb-4 indent-8">
        {t("selection-p2-start", { defaultValue: "where" })} <Tex math="g_{ik}(t)" /> {t("selection-p2-harvesting", { defaultValue: "is the harvesting efficiency of agent" })} <Tex math="i" /> {t("selection-p2-resource", { defaultValue: "for resource" })} <Tex math="k" /> {t("selection-p2-at-time", { defaultValue: "at time" })} <Tex math="t" />{t("selection-p2-second", { defaultValue: ", the second term represents metabolic costs," })} <Tex math="\delta_i(t)" /> {t("selection-p2-captures", { defaultValue: "captures damage from predation and environmental hazards, and" })} <Tex math="\mathbb{1}\{E_i(t) > 0\}" /> {t("selection-p2-survival", { defaultValue: "is the survival indicator function. The realized fitness is ultimately measured by reproductive output: the number of viable offspring produced during the agent's lifetime." })}
      </p>

      <h3 style={h3Style}>{t("section-3-3-niche-construction", { defaultValue: "3.3 Niche Construction" })}</h3>

      <p className="mb-4">
        {t("niche-p1", { defaultValue: "A distinctive feature of our simulation is the incorporation of niche construction dynamics, whereby agents modify their local environment in ways that alter the selective pressures experienced by themselves and other organisms. Agents deplete resources through consumption, create waste products that inhibit resource regeneration in their vicinity, and construct simple structures (burrows, nests) that modify local terrain properties. These modifications persist across generations, creating an ecological inheritance that supplements the genetic inheritance transmitted through reproduction. The niche construction dynamics are governed by:" })}
      </p>
      <TexBlock math="\frac{\partial \mathcal{E}(\mathbf{x}, t)}{\partial t} = \sum_{i=1}^{N} \omega_i \, \kappa(\mathbf{x} - \mathbf{x}_i(t)) \cdot f(G_i) - \lambda_d \, \mathcal{E}(\mathbf{x}, t)" />
      <p className="mb-4 indent-8">
        {t("niche-p2-start", { defaultValue: "where" })} <Tex math="\mathcal{E}(\mathbf{x}, t)" /> {t("niche-p2-field", { defaultValue: "is the environmental modification field," })} <Tex math="\omega_i" /> {t("niche-p2-intensity", { defaultValue: "is the niche construction intensity of agent" })} <Tex math="i" />{t("env-model-p2-comma", { defaultValue: "," })} <Tex math="\kappa" /> {t("niche-p2-kernel", { defaultValue: "is a spatial kernel determining the range of environmental modification," })} <Tex math="f(G_i)" /> {t("niche-p2-genotype", { defaultValue: "is a genotype-dependent function specifying the type of modification, and" })}
        <Tex math="\lambda_d" /> {t("niche-p2-decay", { defaultValue: "is a decay rate ensuring that modifications degrade over time in the absence of continued maintenance. This framework enables the emergence of ecosystem engineering, whereby certain agent lineages create environmental conditions that facilitate the persistence of entire ecological communities." })}
      </p>

      {/* 4. EMERGENT PHENOMENA */}
      <h2 style={h2Style}>{t("section-4-emergent-phenomena", { defaultValue: "4. Emergent Phenomena" })}</h2>

      <h3 style={h3Style}>{t("section-4-1-speciation-events", { defaultValue: "4.1 Speciation Events" })}</h3>

      <p className="mb-4">
        {t("speciation-p1", { defaultValue: "The most striking emergent phenomenon observed in our simulation is the spontaneous occurrence of genuine speciation events—the splitting of a single ancestral population into two or more reproductively isolated daughter populations with distinct phenotypic profiles. We identify speciation events using a combination of genetic distance metrics and reproductive compatibility assays. Specifically, we define two subpopulations as distinct species when (a) the mean pairwise genetic distance between subpopulations exceeds three times the mean within-population genetic distance, and (b) the rate of successful inter-population mating attempts falls below 5% of the intra-population rate. Over 1,000 generations, we observe 18 unambiguous speciation events, producing a terminal species count of 22 from an initial 4 founding phenotypes. The speciation rate accelerates over time, consistent with the positive feedback between ecological complexity and the availability of novel niches predicted by adaptive radiation theory." })}
      </p>

      <p className="mb-4 indent-8">
        {t("speciation-p2-start", { defaultValue: "The speciation events fall into three distinct categories. Allopatric speciation (7 events) occurs when a subpopulation colonizes a geographically isolated biome and diverges in the absence of gene flow. Ecological speciation (8 events) occurs in sympatry, driven by disruptive selection on resource utilization traits that favors phenotypic extremes over intermediates. Reinforcement-driven speciation (3 events) occurs when secondary contact between partially diverged populations selects for increased mating signal divergence, completing the reproductive isolation initiated by ecological divergence. The replicator dynamics governing the frequency" })} <Tex math="x_j" /> {t("speciation-p2-species", { defaultValue: "of species" })} <Tex math="j" /> {t("speciation-p2-described", { defaultValue: "in the population are well-described by:" })}
      </p>
      <TexBlock math="\dot{x}_j = x_j \left[ f_j(\mathbf{x}) - \bar{f}(\mathbf{x}) \right], \quad \bar{f}(\mathbf{x}) = \sum_{k=1}^{S} x_k \, f_k(\mathbf{x})" />
      <p className="mb-4 indent-8">
        {t("speciation-p3-start", { defaultValue: "where" })} <Tex math="f_j(\mathbf{x})" /> {t("speciation-p3-fitness", { defaultValue: "is the frequency-dependent fitness of species" })} <Tex math="j" /> {t("speciation-p3-and", { defaultValue: "and" })} <Tex math="\bar{f}(\mathbf{x})" /> {t("speciation-p3-mean", { defaultValue: "is the mean population fitness. The frequency dependence of fitness is critical: as a species becomes more abundant, intraspecific competition for resources reduces its per-capita fitness, creating the negative frequency dependence that stabilizes coexistence and prevents competitive exclusion." })}
      </p>

      <h3 style={h3Style}>{t("section-4-2-red-queen-dynamics", { defaultValue: "4.2 Red Queen Dynamics" })}</h3>

      <p className="mb-4">
        {t("redqueen-p1", { defaultValue: "Van Valen's Red Queen hypothesis—that organisms must continuously adapt merely to maintain their fitness relative to coevolving antagonists—finds compelling support in our simulation. We observe sustained oscillatory dynamics in the trait values of predator-prey pairs that persist for the entire duration of the simulation without converging to a stable equilibrium. In the canonical example, the mean attack speed of the dominant predator lineage and the mean evasion speed of its primary prey lineage exhibit strongly correlated cyclical escalation, with a characteristic period of approximately 45–55 generations per cycle. The escalation is not monotonic but follows a sawtooth pattern: gradual trait increase is punctuated by periodic “resets” when the energetic costs of extreme trait values become unsustainable, forcing both lineages to evolve alternative strategies." })}
      </p>

      <p className="mb-4 indent-8">
        {t("redqueen-p2-start", { defaultValue: "The coevolutionary dynamics can be formalized using a coupled replicator-mutator system. Let" })} <Tex math="p(z_1, t)" /> {t("redqueen-p2-and", { defaultValue: "and" })} <Tex math="q(z_2, t)" /> {t("redqueen-p2-denote", { defaultValue: "denote the trait distributions for predator trait" })} <Tex math="z_1" /> {t("redqueen-p2-prey", { defaultValue: "and prey trait" })} <Tex math="z_2" />{t("redqueen-p2-governed", { defaultValue: ", respectively. The dynamics are governed by:" })}
      </p>
      <TexBlock math="\frac{\partial p(z_1, t)}{\partial t} = p(z_1, t) \left[ w_1(z_1, \bar{z}_2) - \bar{w}_1 \right] + \mu_1 \frac{\partial^2 p}{\partial z_1^2}" />
      <TexBlock math="\frac{\partial q(z_2, t)}{\partial t} = q(z_2, t) \left[ w_2(z_2, \bar{z}_1) - \bar{w}_2 \right] + \mu_2 \frac{\partial^2 q}{\partial z_2^2}" />
      <p className="mb-4 indent-8">
        {t("redqueen-p3-start", { defaultValue: "where" })} <Tex math="w_1(z_1, \bar{z}_2)" /> {t("redqueen-p3-fitness", { defaultValue: "is the fitness of a predator with trait value" })} <Tex math="z_1" /> {t("redqueen-p3-given", { defaultValue: "given the mean prey trait" })} <Tex math="\bar{z}_2" />{t("redqueen-p3-diffusion", { defaultValue: ", and the diffusion terms represent mutational input. The interaction kernel" })} <Tex math="w_1" /> {t("redqueen-p3-defined", { defaultValue: "is defined such that predator fitness increases with the difference" })} <Tex math="z_1 - \bar{z}_2" /> {t("redqueen-p3-faster", { defaultValue: "(i.e., faster predators catch more prey), but is penalized by a quadratic cost term" })} <Tex math="-c_1 z_1^2" /> {t("redqueen-p3-metabolic", { defaultValue: "reflecting the metabolic expense of extreme trait values. Numerical analysis of this system confirms that it supports limit-cycle attractors in the joint" })} <Tex math="(z_1, z_2)" /> {t("redqueen-p3-trait", { defaultValue: "trait space, consistent with the empirically observed oscillatory dynamics." })}
      </p>

      <h3 style={h3Style}>{t("section-4-3-punctuated-equilibrium", { defaultValue: "4.3 Punctuated Equilibrium" })}</h3>

      <p className="mb-4">
        {t("punctuated-p1", { defaultValue: "The temporal pattern of phenotypic change in our simulation exhibits a pronounced punctuated equilibrium signature. We quantify morphological change rates using the squared Mahalanobis distance between the multivariate phenotype distribution at consecutive generations:" })}
      </p>
      <TexBlock math="D^2(t, t+1) = (\bar{\mathbf{z}}_t - \bar{\mathbf{z}}_{t+1})^\top \, \Sigma_t^{-1} \, (\bar{\mathbf{z}}_t - \bar{\mathbf{z}}_{t+1})" />
      <p className="mb-4 indent-8">
        {t("punctuated-p2-start", { defaultValue: "where" })} <Tex math="\bar{\mathbf{z}}_t" /> {t("punctuated-p2-mean", { defaultValue: "is the mean phenotype vector and" })}
        <Tex math="\Sigma_t" /> {t("punctuated-p2-covariance", { defaultValue: "is the phenotypic covariance matrix at generation" })} <Tex math="t" />{t("punctuated-p2-distribution", { defaultValue: ". The distribution of" })} <Tex math="D^2" /> {t("punctuated-p2-values", { defaultValue: "values across all species and all generations is strongly right-skewed (skewness" })} <Tex math="= 3.42" />{t("punctuated-p2-kurtosis", { defaultValue: ", kurtosis" })} <Tex math="= 18.7" />{t("punctuated-p2-indicating", { defaultValue: "), indicating that the vast majority of generational transitions involve minimal phenotypic change, while a small number of transitions involve dramatic morphological shifts. The top 5% of" })} <Tex math="D^2" /> {t("punctuated-p2-account", { defaultValue: "values account for 62% of the total cumulative phenotypic change, a pattern strikingly consistent with the punctuated equilibrium model of Eldredge and Gould. Analysis of the temporal distribution of these punctuation events reveals a statistically significant correlation (" })} <Tex math="r = 0.71, p < 0.001" />{t("punctuated-p2-perturbation", { defaultValue: ") with environmental perturbation events, supporting the hypothesis that exogenous environmental changes trigger rapid adaptive radiations that restructure the ecosystem." })}
      </p>

      {/* 5. RESULTS */}
      <h2 style={h2Style}>{t("section-5-results", { defaultValue: "5. Results" })}</h2>

      <h3 style={h3Style}>{t("section-5-1-population-dynamics", { defaultValue: "5.1 Population Dynamics" })}</h3>

      <p className="mb-4">
        {t("pop-dynamics-p1", { defaultValue: "Figure 1 presents the population trajectories of the four major ecological guilds—predators, prey, scavengers, and parasites—over the full 1,000-generation simulation. The dynamics exhibit the characteristic oscillatory behavior of Lotka–Volterra predator-prey systems, but with substantially greater complexity arising from the multi-trophic structure and the continuous evolutionary modification of interaction parameters. The predator and prey populations display anti-correlated oscillations with a period of approximately 150–200 generations, consistent with the classical quarter-cycle phase lag predicted by the Lotka–Volterra model. The scavenger population, which feeds on the carcasses of deceased agents, exhibits a delayed response to predator-prey cycles with an additional phase lag of approximately 30 generations. The parasite population shows the most complex dynamics, with superimposed oscillations at multiple frequencies reflecting its dependence on host population sizes across multiple trophic levels." })}
      </p>

      <PaperFigure number={1} caption={t("fig1-caption", { defaultValue: "Population dynamics of the four major ecological guilds over 1,000 simulated generations, showing characteristic Lotka–Volterra oscillatory behavior with multi-trophic complexity. Predator-prey anti-correlation has a period of approximately 150–200 generations." })}>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={populationDynamicsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="generation" label={{ value: t("axis-generation", { defaultValue: "Generation" }), position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: t("axis-population-size", { defaultValue: "Population Size" }), angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="prey" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name={t("legend-prey", { defaultValue: "Prey" })} />
            <Area type="monotone" dataKey="predator" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name={t("legend-predator", { defaultValue: "Predator" })} />
            <Area type="monotone" dataKey="scavenger" stackId="3" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name={t("legend-scavenger", { defaultValue: "Scavenger" })} />
            <Area type="monotone" dataKey="parasite" stackId="4" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name={t("legend-parasite", { defaultValue: "Parasite" })} />
          </AreaChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        {t("pop-dynamics-p2-start", { defaultValue: "The total population fluctuates between approximately 650 and 850 agents, maintained below the environment's theoretical carrying capacity of" })} <Tex math="N_{\max} \approx 1{,}200" /> {t("pop-dynamics-p2-combined", { defaultValue: "by the combined effects of predation, competition, and parasitism. The coefficient of variation of the total population size is" })} <Tex math="CV = 0.118" />{t("pop-dynamics-p2-lower", { defaultValue: ", substantially lower than the coefficients of variation of individual guild populations (" })} <Tex math="CV_{\mathrm{pred}} = 0.192" />{t("env-model-p2-comma", { defaultValue: "," })} <Tex math="CV_{\mathrm{prey}} = 0.168" />{t("env-model-p2-comma", { defaultValue: "," })}
        <Tex math="CV_{\mathrm{scav}} = 0.184" />{t("env-model-p2-comma", { defaultValue: "," })} <Tex math="CV_{\mathrm{para}} = 0.241" />{t("pop-dynamics-p2-indicating", { defaultValue: "), indicating that compensatory dynamics between guilds buffer total community size against the large oscillations experienced by individual trophic levels. This stabilizing portfolio effect is a well-established property of diverse ecological communities and provides additional evidence that our simulated ecosystem exhibits realistic ecological dynamics." })}
      </p>

      <h3 style={h3Style}>{t("section-5-2-fitness-landscape", { defaultValue: "5.2 Fitness Landscape Analysis" })}</h3>

      <p className="mb-4">
        {t("fitness-p1", { defaultValue: "The fitness landscape experienced by evolving agents is not a static surface but a dynamically deforming manifold whose topology is continuously reshaped by the evolutionary changes of all interacting species. To characterize this dynamic landscape, we project the high-dimensional trait space onto a one-dimensional axis representing the primary axis of phenotypic variation (determined by principal component analysis) and compute the mean fitness as a function of position along this axis for predators and prey separately. Figure 2 displays the resulting fitness profiles at generation 500, a representative time point." })}
      </p>

      <PaperFigure number={2} caption={t("fig2-caption", { defaultValue: "Fitness landscape profiles for predator and prey guilds as a function of the primary phenotypic trait axis at generation 500. The anti-correlated fitness peaks illustrate the antagonistic coevolutionary dynamics driving Red Queen oscillations." })}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={fitnessLandscapeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="traitValue" label={{ value: t("axis-phenotypic-trait", { defaultValue: "Phenotypic Trait Axis (PC1)" }), position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: t("axis-relative-fitness", { defaultValue: "Relative Fitness" }), angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="predatorFitness" stroke="#ef4444" strokeWidth={2} dot={false} name={t("legend-predator-fitness", { defaultValue: "Predator Fitness" })} />
            <Line type="monotone" dataKey="preyFitness" stroke="#22c55e" strokeWidth={2} dot={false} name={t("legend-prey-fitness", { defaultValue: "Prey Fitness" })} />
            <Line type="monotone" dataKey="landscape" stroke="#6b7280" strokeWidth={1} strokeDasharray="5 5" dot={false} name={t("legend-aggregate-landscape", { defaultValue: "Aggregate Landscape" })} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        {t("fitness-p2", { defaultValue: "The predator fitness landscape exhibits a peak at high values of the primary trait axis (corresponding to larger body size, faster movement speed, and greater attack strength), while the prey fitness landscape peaks at low values (corresponding to smaller body size, higher evasion speed, and enhanced sensory range). The aggregate landscape, representing the community-level mean fitness, shows a broad peak at intermediate trait values where neither predator nor prey is maximally adapted—a manifestation of the frequency-dependent selection that maintains phenotypic diversity. The landscape is not smooth but exhibits multiple local optima separated by fitness valleys, indicating that the adaptive landscape has a rugged NK-model-like topology. The ruggedness index" })} <Tex math="\rho = 0.68" />{t("fitness-p2-computed", { defaultValue: ", computed as the autocorrelation of fitness values along random one-dimensional transects through trait space, confirms that the landscape is substantially more rugged than a purely additive model (" })} <Tex math="\rho = 0" />{t("fitness-p2-random", { defaultValue: ") but less rugged than a fully random landscape (" })} <Tex math="\rho = 1" />{t("fitness-p2-end", { defaultValue: ")." })}
      </p>

      <p className="mb-4 indent-8">
        {t("fitness-p3-start", { defaultValue: "Critically, the fitness landscape is non-stationary. Time-lapse analysis reveals that fitness peaks shift at a rate of approximately 0.015 trait units per generation along the primary axis, driven by the reciprocal adaptation of coevolving lineages. This rate of landscape deformation is consistent with the Red Queen prediction that no species can improve its absolute fitness over evolutionary time; instead, each species must continuously adapt merely to maintain its current fitness in the face of coevolutionary change. We quantify this effect by computing the mean absolute fitness of the predator guild at 100-generation intervals and find no statistically significant trend (" })} <Tex math="\beta = 0.0003" />{t("fitness-p3-comma", { defaultValue: "," })}
        <Tex math="p = 0.82" />{t("fitness-p3-end", { defaultValue: "), despite continuous directional selection within each 100-generation window, confirming the Red Queen stasis at the macroevolutionary scale." })}
      </p>

      <h3 style={h3Style}>{t("section-5-3-species-diversity", { defaultValue: "5.3 Species Diversity and Phylogenetic Analysis" })}</h3>

      <p className="mb-4">
        {t("diversity-p1-start", { defaultValue: "Figure 3 presents the temporal trajectory of species diversity as measured by the Shannon diversity index" })} <Tex math="H' = -\sum_{j=1}^{S} p_j \ln p_j" />{t("diversity-p1-count", { defaultValue: ", total species count" })} <Tex math="S" />{t("diversity-p1-evenness", { defaultValue: ", and Pielou's evenness index" })} <Tex math="J = H' / \ln S" />{t("diversity-p1-all", { defaultValue: ". All three metrics exhibit a general upward trend over the 1,000-generation simulation, punctuated by brief episodes of diversity loss coinciding with environmental perturbation events and the subsequent recovery and adaptive radiation." })}
      </p>

      <PaperFigure number={3} caption={t("fig3-caption", { defaultValue: "Species diversity metrics over 1,000 generations. The Shannon diversity index (left axis) and species count (right axis) show a general upward trend punctuated by extinction events and subsequent adaptive radiations." })}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={speciesDiversityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="generation" label={{ value: t("axis-generation", { defaultValue: "Generation" }), position: 'insideBottom', offset: -5 }} />
            <YAxis yAxisId="left" label={{ value: t("axis-shannon-evenness", { defaultValue: "Shannon Index / Evenness" }), angle: -90, position: 'insideLeft' }} />
            <YAxis yAxisId="right" orientation="right" label={{ value: t("axis-species-count", { defaultValue: "Species Count" }), angle: 90, position: 'insideRight' }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="shannonIndex" stroke="#3b82f6" strokeWidth={2} name={t("legend-shannon-index", { defaultValue: "Shannon Index (H')" })} />
            <Line yAxisId="right" type="monotone" dataKey="speciesCount" stroke="#10b981" strokeWidth={2} name={t("legend-species-count", { defaultValue: "Species Count (S)" })} />
            <Line yAxisId="left" type="monotone" dataKey="evenness" stroke="#f59e0b" strokeWidth={1} strokeDasharray="5 5" name={t("legend-evenness", { defaultValue: "Evenness (J)" })} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        {t("diversity-p2-start", { defaultValue: "The Shannon index increases from" })} <Tex math="H' = 1.02" /> {t("diversity-p2-gen0", { defaultValue: "at generation 0 to" })}
        <Tex math="H' = 2.48" /> {t("diversity-p2-gen1000", { defaultValue: "at generation 1,000, representing a 2.4-fold increase in effective diversity. The species count rises from 4 to 22, while evenness increases modestly from" })} <Tex math="J = 0.74" /> {t("diversity-p2-to", { defaultValue: "to" })} <Tex math="J = 0.81" />{t("diversity-p2-indicating", { defaultValue: ", indicating that new species emerge at approximately similar abundances rather than as rare peripheral populations. The rate of species accumulation is well-described by a logarithmic function" })} <Tex math="S(t) = 4.1 \ln(t + 1) + 3.8" /> {t("diversity-p2-r2", { defaultValue: "(" })} <Tex math="R^2 = 0.94" />{t("diversity-p2-consistent", { defaultValue: "), consistent with the species-area relationship generalized to a species-time relationship in which the “area” of available niche space expands as niche construction and environmental modification create new ecological opportunities." })}
      </p>

      <p className="mb-4 indent-8">
        {t("diversity-p3", { defaultValue: "Phylogenetic reconstruction using neighbor-joining on pairwise genetic distances reveals a tree topology consistent with adaptive radiation: the four founding lineages each give rise to multiple descendant species through a series of branching events that accelerate in frequency over time. The phylogenetic tree exhibits a statistically significant imbalance (Colless index" })} <Tex math="I_C = 0.42" />{t("diversity-p3-p", { defaultValue: "," })} <Tex math="p < 0.01" /> {t("diversity-p3-null", { defaultValue: "under the equal-rates Markov null model), indicating that speciation rates are heterogeneous across lineages. The predator lineage is the most speciose, producing 8 terminal species, consistent with the hypothesis that the higher dimensionality of predator trait space (which includes both pursuit and ambush specialization axes) provides more opportunities for ecological divergence. The parasite lineage shows the highest per-lineage speciation rate, reflecting the well-established tendency of parasites to speciate rapidly through host shifts." })}
      </p>

      <h3 style={h3Style}>{t("section-5-4-red-queen-quantitative", { defaultValue: "5.4 Red Queen Dynamics: Quantitative Analysis" })}</h3>

      <p className="mb-4">
        {t("redqueen-quant-p1", { defaultValue: "To rigorously quantify the Red Queen dynamics, we track the mean values of the primary offensive trait (attack speed) in the dominant predator lineage and the primary defensive trait (evasion speed) in its principal prey lineage across sequential coevolutionary cycles. Figure 4 displays the resulting trajectories over 20 complete cycles, each comprising approximately 50 generations. The characteristic sawtooth escalation pattern is clearly visible: both traits increase approximately linearly within each cycle before the predator trait undergoes a rapid reset (decrease) when the metabolic costs of extreme attack speeds become prohibitive, followed shortly by a corresponding reset in the prey trait." })}
      </p>

      <PaperFigure number={4} caption={t("fig4-caption", { defaultValue: "Red Queen coevolutionary dynamics between predator attack speed and prey evasion speed over 20 cycles. The sawtooth escalation pattern with periodic resets demonstrates sustained arms-race dynamics without convergence to equilibrium." })}>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="cycle" type="number" label={{ value: t("axis-coevolutionary-cycle", { defaultValue: "Coevolutionary Cycle" }), position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: t("axis-normalized-trait", { defaultValue: "Normalized Trait Value" }), angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Scatter data={redQueenData} dataKey="predatorTrait" fill="#ef4444" name={t("legend-predator-attack-speed", { defaultValue: "Predator Attack Speed" })} line={{ stroke: '#ef4444', strokeWidth: 1.5 }} />
            <Scatter data={redQueenData} dataKey="preyTrait" fill="#22c55e" name={t("legend-prey-evasion-speed", { defaultValue: "Prey Evasion Speed" })} line={{ stroke: '#22c55e', strokeWidth: 1.5 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        {t("redqueen-quant-p2-start", { defaultValue: "The cross-correlation between predator and prey trait time series is maximized at a lag of 2–3 generations (" })} <Tex math="r_{\max} = 0.87" />{t("redqueen-quant-p2-comma", { defaultValue: "," })}
        <Tex math="p < 0.001" />{t("redqueen-quant-p2-confirming", { defaultValue: "), confirming that the prey trait tracks the predator trait with a short delay characteristic of asymmetric coevolutionary arms races. The mean escalation rate within each cycle is" })} <Tex math="\Delta z / \Delta t = 0.058 \pm 0.012" /> {t("redqueen-quant-p2-predators", { defaultValue: "trait units per generation for predators and" })} <Tex math="0.061 \pm 0.014" /> {t("redqueen-quant-p2-prey", { defaultValue: "for prey, indicating that the prey lineage adapts slightly faster than the predator lineage—consistent with the “life-dinner principle” of Dawkins and Krebs, which predicts that prey should evolve faster because the selective asymmetry (prey risk death; predators risk only a missed meal) generates stronger selection on prey than on predators." })}
      </p>

      <p className="mb-4 indent-8">
        {t("redqueen-quant-p3", { defaultValue: "To test whether the observed dynamics represent a genuine Red Queen process rather than a simple environmental tracking response, we conduct a control experiment in which the predator population is replaced by a static (non-evolving) predator with fixed trait values. In this control condition, the prey population rapidly evolves to a fitness plateau and remains in stasis thereafter, with no oscillatory dynamics. This control confirms that the cyclical trait dynamics in the full simulation are driven by reciprocal adaptation between coevolving lineages rather than by exogenous environmental forcing. The mean absolute fitness of the prey lineage in the coevolution treatment shows no significant temporal trend (" })} <Tex math="\beta = -0.001" />{t("redqueen-quant-p3-comma", { defaultValue: "," })} <Tex math="p = 0.91" />{t("redqueen-quant-p3-end", { defaultValue: "), further supporting the Red Queen prediction of evolutionary stasis in absolute fitness despite continuous directional selection." })}
      </p>

      {/* 6. DISCUSSION */}
      <h2 style={h2Style}>{t("section-6-discussion", { defaultValue: "6. Discussion" })}</h2>

      <h3 style={h3Style}>{t("section-6-1-evolutionary-theory", { defaultValue: "6.1 Implications for Evolutionary Theory" })}</h3>

      <p className="mb-4">
        {t("evol-theory-p1", { defaultValue: "The results presented in this study provide strong computational evidence that the fundamental phenomena of macroevolution—speciation, adaptive radiation, coevolutionary arms races, and punctuated equilibrium—can emerge spontaneously in artificial agent ecosystems without explicit programming of any of these phenomena. The key requirement is not biological realism per se but rather sufficient complexity in the environment, the agent architecture, and the reproductive system to support the feedback loops that generate and maintain diversity. Our findings are consistent with the theoretical prediction of Kauffman's NK model that rugged fitness landscapes with intermediate epistasis promote speciation and diversity, and extend this prediction to spatially explicit, multi-trophic systems with frequency-dependent selection." })}
      </p>

      <p className="mb-4 indent-8">
        {t("evol-theory-p2", { defaultValue: "The observation of genuine Red Queen dynamics—sustained oscillatory coevolution without convergence to equilibrium—is particularly noteworthy. While Red Queen dynamics have been demonstrated in simple mathematical models and in controlled laboratory experiments with host-parasite systems (notably" })} <em>Caenorhabditis elegans</em> {t("evol-theory-p2-bacterial", { defaultValue: "and its bacterial pathogens), our simulation provides evidence that these dynamics are robust to the complexities of multi-trophic ecosystems with continuous niche construction, environmental perturbation, and ongoing speciation. The persistence of Red Queen oscillations over 1,000 generations, despite continuous environmental noise and the repeated invasion of novel species, suggests that coevolutionary arms races are an attractor of the evolutionary dynamics rather than a transient phenomenon dependent on special initial conditions." })}
      </p>

      <p className="mb-4 indent-8">
        {t("evol-theory-p3-start", { defaultValue: "The punctuated equilibrium pattern observed in phenotypic change rates is consistent with Eldredge and Gould's original proposal but with an important caveat: in our simulation, the punctuation events are predominantly triggered by environmental perturbations rather than by intrinsic evolutionary dynamics. This suggests a synthesis of gradualist and punctuationist perspectives in which the evolutionary process is inherently capable of rapid change but is typically constrained by stabilizing selection, with exogenous perturbations acting as the primary trigger for punctuation events by disrupting the ecological equilibria that maintain stasis. The correlation between perturbation magnitude and the intensity of the subsequent morphological change (" })} <Tex math="r = 0.64" />{t("evol-theory-p3-comma", { defaultValue: "," })} <Tex math="p < 0.01" />{t("evol-theory-p3-end", { defaultValue: ") further supports this interpretation." })}
      </p>

      <h3 style={h3Style}>{t("section-6-2-game-design", { defaultValue: "6.2 Implications for Game Design" })}</h3>

      <p className="mb-4">
        {t("game-design-p1", { defaultValue: "From a practical game design perspective, the spontaneous emergence of complex ecological dynamics in our simulation suggests a paradigm shift in how game developers create and populate game worlds. Traditional approaches to game fauna design rely on manual specification of species, their behaviors, and their ecological relationships—a process that is labor-intensive, creatively constrained by human imagination, and incapable of producing the subtle, emergent interactions that characterize real ecosystems. Our results demonstrate that an alternative approach is viable: seeding a game world with a small number of initial agent phenotypes and allowing evolutionary processes to generate ecological complexity autonomously. The resulting ecosystems exhibit properties—dynamic food webs, arms races, niche partitioning, ecosystem engineering—that would be extraordinarily difficult to design manually." })}
      </p>

      <p className="mb-4 indent-8">
        {t("game-design-p2", { defaultValue: "The practical implications for game studios are substantial. First, the procedural generation of ecosystems through evolutionary simulation eliminates the need for extensive manual design of individual species and their interactions, potentially reducing content creation costs by an order of magnitude for ecology-heavy game genres (survival games, simulation games, open-world RPGs). Second, evolutionary ecosystems are inherently self-balancing: the negative frequency dependence of fitness prevents any single species from dominating the ecosystem, and the continuous coevolutionary dynamics ensure that the ecological balance shifts over time, creating a perpetually novel and engaging game world. Third, the punctuated equilibrium dynamics provide natural “content events”—periodic bursts of ecological change that players can observe and interact with, providing a sense of living in a world that has its own history and trajectory." })}
      </p>

      <p className="mb-4 indent-8">
        {t("game-design-p3", { defaultValue: "We note several important caveats for practical implementation. The computational cost of the full evolutionary simulation is substantial: our 1,000-generation simulation required approximately 72 hours of wall-clock time on a 64-core server. For real-time game applications, the simulation would need to be substantially optimized—through reduced population sizes, simplified agent architectures, and aggressive spatial partitioning—or pre-computed offline and loaded as initial conditions for the game world. The stochastic nature of evolutionary outcomes also means that designers cannot precisely control the resulting ecosystem, which may conflict with specific narrative or gameplay requirements. A hybrid approach, in which the broad ecological structure is hand-designed but fine-grained species characteristics and interactions are generated evolutionarily, may represent the most practical near-term application of these methods." })}
      </p>

      <h3 style={h3Style}>{t("section-6-3-limitations", { defaultValue: "6.3 Limitations" })}</h3>

      <p className="mb-4">
        {t("limitations-p1", { defaultValue: "Several limitations of the present study should be acknowledged. First, the two-dimensional spatial structure of the simulation environment, while more complex than most artificial life experiments, does not capture the full three-dimensional spatial heterogeneity of real ecosystems, including vertical stratification, aerial locomotion, and subsurface habitats. The restriction to two dimensions limits the potential for spatial niche differentiation and may suppress the rate of allopatric speciation. Second, the neural-network controllers, while capable of complex behavior, lack the hierarchical modularity of biological neural systems; this may limit the behavioral complexity of individual agents and thereby constrain the ecological interactions available to the ecosystem. Third, the simulation time horizon of 1,000 generations, while unprecedented for simulations of this complexity, represents a small fraction of the evolutionary time required for the major transitions in biological complexity (e.g., multicellularity, eusociality). Longer simulations may reveal qualitatively new phenomena not captured in our current results." })}
      </p>

      <p className="mb-4 indent-8">
        {t("limitations-p2", { defaultValue: "Fourth, the speciation criterion used in this study—based on genetic distance and mating compatibility—is operationally defined and may not correspond precisely to biological species concepts. The extent to which our “species” represent genuinely reproductively isolated populations versus ecologically differentiated morphs of a single species remains an open question that could be addressed by longer simulation horizons and more stringent isolation criteria. Fifth, the environmental perturbation model, while stochastic, does not capture the full complexity of real environmental change, including directional trends (e.g., climate change), cyclical forcing (e.g., Milankovitch cycles), and spatially correlated catastrophes (e.g., volcanic eruptions, bolide impacts). Incorporating these additional sources of environmental variation may substantially alter the observed evolutionary dynamics." })}
      </p>

      {/* 7. CONCLUSION */}
      <h2 style={h2Style}>{t("section-7-conclusion", { defaultValue: "7. Conclusion" })}</h2>

      <p className="mb-4">
        {t("conclusion-p1", { defaultValue: "We have presented a large-scale agent-based simulation demonstrating that autonomous game agents in a complex, procedurally generated open-world environment can spontaneously undergo speciation events and develop coevolutionary dynamics analogous to those observed in biological ecosystems. Over 1,000 simulated generations, an initial population of four founding phenotypes diversified into 22 distinct species through a combination of allopatric, ecological, and reinforcement-driven speciation mechanisms. The resulting ecosystem exhibited sustained Red Queen dynamics between predator and prey lineages, punctuated equilibrium patterns in phenotypic change rates, and the spontaneous emergence of complex food webs with multiple trophic levels and ecosystem engineering. These phenomena arose without explicit programming, emerging instead from the interaction of simple evolutionary mechanisms—mutation, selection, and reproduction—operating within a sufficiently complex environmental and social context." })}
      </p>

      <p className="mb-4 indent-8">
        {t("conclusion-p2", { defaultValue: "The quantitative analysis of population dynamics confirmed Lotka–Volterra-like oscillatory patterns with compensatory dynamics buffering community-level stability, while fitness landscape analysis revealed dynamically deforming adaptive surfaces consistent with Red Queen theory. The replicator dynamics governing species frequencies accurately predicted the observed frequency dependence of fitness, and phylogenetic reconstruction revealed adaptive radiation patterns with heterogeneous speciation rates across lineages. These results collectively demonstrate that the fundamental phenomena of macroevolution are not unique to carbon-based life but represent general properties of populations of self-replicating, heritable-variation-generating entities under selection in complex environments." })}
      </p>

      <p className="mb-4 indent-8">
        {t("conclusion-p3", { defaultValue: "For the game development community, these findings open the possibility of creating genuinely “living” game worlds in which ecological complexity emerges organically through evolutionary processes. The self-organizing, self-balancing, and perpetually novel properties of evolutionary ecosystems offer a compelling alternative to traditional manual content design, with the potential to create game experiences that are richer, more surprising, and more ecologically authentic than any hand-designed fauna system. We believe that the integration of evolutionary simulation into game engines represents a significant opportunity for the next generation of open-world and simulation games, and we encourage further research into the computational optimization, design integration, and player experience implications of this approach." })}
      </p>

      {/* REFERENCES */}
      <h2 style={h2Style}>{t("section-references", { defaultValue: "References" })}</h2>

      <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Dawkins, R., &amp; Krebs, J. R. (1979). Arms races between and within species.
          <em> Proceedings of the Royal Society of London. Series B, Biological Sciences</em>,
          205(1161), 489&ndash;511. https://doi.org/10.1098/rspb.1979.0081
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Eldredge, N., &amp; Gould, S. J. (1972). Punctuated equilibria: An alternative to
          phyletic gradualism. In T. J. M. Schopf (Ed.), <em>Models in Paleobiology</em>
          (pp. 82&ndash;115). San Francisco: Freeman, Cooper &amp; Co.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Kauffman, S. A., &amp; Johnsen, S. (1991). Coevolution to the edge of chaos:
          Coupled fitness landscapes, poised states, and coevolutionary avalanches.
          <em> Journal of Theoretical Biology</em>, 149(4), 467&ndash;505.
          https://doi.org/10.1016/S0022-5193(05)80094-3
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Lenski, R. E., Ofria, C., Pennock, R. T., &amp; Adami, C. (2003). The
          evolutionary origin of complex features. <em>Nature</em>, 423(6936),
          139&ndash;144. https://doi.org/10.1038/nature01568
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Lotka, A. J. (1925). <em>Elements of Physical Biology</em>. Baltimore:
          Williams &amp; Wilkins.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          May, R. M. (1973). <em>Stability and Complexity in Model Ecosystems</em>.
          Princeton: Princeton University Press.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Nowak, M. A. (2006). <em>Evolutionary Dynamics: Exploring the Equations of
          Life</em>. Cambridge, MA: Harvard University Press.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Ray, T. S. (1992). An approach to the synthesis of life. In C. G. Langton,
          C. Taylor, J. D. Farmer, &amp; S. Rasmussen (Eds.), <em>Artificial Life II</em>
          (pp. 371&ndash;408). Redwood City, CA: Addison-Wesley.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Sims, K. (1994). Evolving virtual creatures. <em>Proceedings of the 21st
          Annual Conference on Computer Graphics and Interactive Techniques
          (SIGGRAPH &apos;94)</em>, 15&ndash;22. https://doi.org/10.1145/192161.192167
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Stanley, K. O., &amp; Miikkulainen, R. (2002). Evolving neural networks through
          augmenting topologies. <em>Evolutionary Computation</em>, 10(2), 99&ndash;127.
          https://doi.org/10.1162/106365602320169811
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Stenseth, N. C., &amp; Maynard Smith, J. (1984). Coevolution in ecosystems:
          Red Queen evolution or stasis? <em>Evolution</em>, 38(4), 870&ndash;880.
          https://doi.org/10.2307/2408397
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Van Valen, L. (1973). A new evolutionary law. <em>Evolutionary Theory</em>,
          1, 1&ndash;30.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Volterra, V. (1926). Fluctuations in the abundance of a species considered
          mathematically. <em>Nature</em>, 118(2972), 558&ndash;560.
          https://doi.org/10.1038/118558a0
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Yaeger, L. (1994). Computational genetics, physiology, metabolism, neural
          systems, learning, vision, and behavior; or PolyWorld: Life in a new context.
          In C. G. Langton (Ed.), <em>Artificial Life III</em> (pp. 263&ndash;298).
          Redwood City, CA: Addison-Wesley.
        </p>
      </div>
    </>
  );
}
