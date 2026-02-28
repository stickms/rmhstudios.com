export interface ResearchArticle {
  slug: string;
  title: string;
  authors: string[];
  affiliation: string;
  date: string;
  abstract: string;
  keywords: string[];
  doi: string;
  journal: string;
  volume: number;
  issue: number;
  pages: string;
  category: string;
  heroColor: string;
  iconName: string;
}

export const articles: ResearchArticle[] = [
  {
    slug: 'neural-correlates-flow-states',
    title: 'Neural Correlates of Flow States in Competitive Gaming Environments',
    authors: ['RMH Research'],
    affiliation: 'RMH Studios',
    date: '2025-09-15',
    abstract:
      'Flow states — characterized by complete immersion, loss of self-consciousness, and intrinsic reward — have long been theorized as central to peak performance in competitive domains. However, the neural underpinnings of flow during real-time competitive gaming remain poorly understood. In this study, we employed 64-channel electroencephalography (EEG) to measure cortical dynamics in 48 experienced gamers across three experimental conditions: casual play, competitive ranked play, and passive spectating. Results revealed a significant increase in frontal theta–parietal alpha coherence during self-reported flow episodes in competitive conditions (F(2,45) = 14.32, p < .001, η²p = .39). Flow frequency was 2.4 times higher during competitive play relative to casual play, and flow scores correlated positively with in-game performance metrics (r = .74, p < .001). Time-series analysis indicated that theta–alpha coupling preceded flow onset by approximately 90 seconds, suggesting a predictive neural marker. These findings are consistent with Dietrich\'s transient hypofrontality hypothesis and carry implications for the design of game systems that reliably induce and sustain flow.',
    keywords: ['flow state', 'EEG', 'theta-alpha coherence', 'competitive gaming', 'neuroplasticity', 'transient hypofrontality'],
    doi: '10.1098/rmh.2025.0142',
    journal: 'RMH Studios Technical Reports',
    volume: 3,
    issue: 1,
    pages: '1-18',
    category: 'Neuroscience',
    heroColor: 'from-violet-500 to-fuchsia-500',
    iconName: 'Brain',
  },
  {
    slug: 'reinforcement-learning-roguelike',
    title: 'Reinforcement Learning Agents in Procedurally Generated Roguelike Environments',
    authors: ['RMH Studios Development Team'],
    affiliation: 'RMH Studios',
    date: '2025-11-02',
    abstract:
      'Procedural content generation presents a fundamental challenge for reinforcement learning (RL) agents: environments that are never encountered twice demand robust generalization rather than trajectory memorization. We investigate the training and transfer performance of Proximal Policy Optimization (PPO) agents across three environment configurations of increasing stochasticity — static dungeon layouts, procedurally generated layouts with fixed seeds, and fully randomized procedural generation — within a custom roguelike testbed modeled after commercial dungeon-crawling games. Over 10 million training timesteps with five independent runs per configuration, agents trained on fully randomized environments exhibited slower initial reward accumulation but superior zero-shot generalization to novel layouts (78% completion on hard unseen levels vs. 12% for static-trained agents). A curriculum-learning protocol that incrementally transitions from static to randomized environments achieved the best overall performance, combining fast early learning with strong transfer (82% on hard novel levels). Behavioral analysis revealed emergent exploration strategies, resource management heuristics, and adaptive combat tactics in procedurally trained agents that were absent in static-trained counterparts. These results provide actionable guidelines for training NPC agents in commercial games with procedurally generated content.',
    keywords: ['reinforcement learning', 'procedural generation', 'curriculum learning', 'roguelike', 'PPO', 'generalization'],
    doi: '10.1098/rmh.2025.0287',
    journal: 'RMH Studios Technical Reports',
    volume: 3,
    issue: 2,
    pages: '1-22',
    category: 'Artificial Intelligence',
    heroColor: 'from-cyan-500 to-blue-500',
    iconName: 'Cpu',
  },
  {
    slug: 'adaptive-difficulty-player-retention',
    title: 'The Effect of Adaptive Difficulty Systems on Player Retention and Cognitive Load',
    authors: ['RMH Research'],
    affiliation: 'RMH Studios',
    date: '2025-12-10',
    abstract:
      'Player attrition remains one of the most significant economic challenges in the games industry, with median day-7 retention rates below 20% for mobile titles and 35% for PC/console releases. Dynamic Difficulty Adjustment (DDA) has been proposed as a mechanism for maintaining player engagement by keeping challenge levels within an optimal zone. In this 7-day longitudinal study, 240 participants were randomly assigned to one of four conditions in a custom platformer testbed: static-easy, static-hard, reactive DDA (adjusting based on recent performance), and predictive DDA (adjusting based on a Bayesian model of player skill trajectory). The predictive DDA condition yielded the highest day-7 retention rate (78%), significantly outperforming static-easy (46%), static-hard (34%), and reactive DDA (64%) conditions (χ²(3) = 42.7, p < .001). Counterintuitively, NASA-TLX cognitive load ratings were lowest in the predictive DDA condition despite higher objective difficulty levels, suggesting that appropriately scaled challenge reduces perceived effort. Session-by-session analysis revealed that predictive DDA more closely tracked the true player skill curve, avoiding the oscillatory overshoot pattern characteristic of reactive systems. These findings demonstrate that model-based difficulty adaptation can simultaneously improve retention and reduce cognitive load, offering a practical framework for commercial implementation.',
    keywords: ['adaptive difficulty', 'dynamic difficulty adjustment', 'cognitive load', 'player retention', 'NASA-TLX', 'Bayesian modeling'],
    doi: '10.1098/rmh.2025.0391',
    journal: 'RMH Studios Technical Reports',
    volume: 3,
    issue: 3,
    pages: '1-20',
    category: 'Cognitive Psychology',
    heroColor: 'from-amber-500 to-orange-500',
    iconName: 'Activity',
  },
  {
    slug: 'ergodic-markov-level-design',
    title: 'Ergodic Markov Chains and Spectral Methods in Stochastic Game-Theoretic Level Design',
    authors: ['RMH Research'],
    affiliation: 'RMH Studios',
    date: '2026-01-18',
    abstract:
      'The combinatorial explosion inherent in procedural level generation for contemporary game environments necessitates principled stochastic frameworks capable of governing the synthesis of topologically coherent, ludologically balanced spatial configurations. We present a novel formalism rooted in the spectral theory of ergodic Markov chains operating over high-dimensional tile-adjacency graphs, wherein each vertex of the underlying combinatorial structure encodes a mesostructural game-design primitive and each directed edge is weighted by a context-sensitive transition kernel derived from designer-specified aesthetic and mechanical constraints. By establishing that the resultant chain satisfies detailed balance with respect to a Gibbs measure parameterized by a vector of ludometric energy functionals — encompassing navigational entropy, resource-density variance, and encounter-pacing regularity — we prove that the stationary distribution concentrates on level instantiations that are, in a measure-theoretic sense, optimally playable. Empirical evaluation across 50,000 procedurally generated dungeon instances demonstrates that spectral-gap-guided mixing yields a 3.2× reduction in autocorrelation length relative to naïve Metropolis–Hastings sampling, while human playtesting (N = 120) confirms a statistically significant preference for spectrally optimized layouts over uniform-random baselines (p < .001, Cohen\'s d = 1.14).',
    keywords: ['Markov chains', 'spectral graph theory', 'procedural generation', 'ergodic theory', 'level design', 'Gibbs measure', 'MCMC'],
    doi: '10.1098/rmh.2026.0018',
    journal: 'RMH Studios Technical Reports',
    volume: 4,
    issue: 1,
    pages: '1-24',
    category: 'Applied Mathematics',
    heroColor: 'from-emerald-500 to-teal-500',
    iconName: 'Sigma',
  },
  {
    slug: 'persistent-homology-gan-assets',
    title: 'Topological Persistence Homology for Latent-Space Navigation in Generative Adversarial Game-Asset Synthesis',
    authors: ['RMH Studios Development Team'],
    affiliation: 'RMH Studios',
    date: '2026-02-05',
    abstract:
      'Generative adversarial networks (GANs) have demonstrated remarkable capacity for the de novo synthesis of high-fidelity game assets, yet the latent spaces of such models remain poorly understood from a geometric-topological standpoint, frustrating efforts at systematic, semantically meaningful traversal. We introduce a computational pipeline grounded in persistent homology — the principal invariant of topological data analysis — that extracts multi-scale Betti-number signatures from point-cloud samples of GAN latent manifolds, thereby furnishing a rigorous characterization of the homological structure governing asset-feature entanglement. By constructing Vietoris–Rips filtrations over latent encodings of 80,000 procedurally generated sprite assets and computing persistence diagrams via the standard algorithm with clearing optimization, we identify stable topological features (H₀ connected components, H₁ loops, H₂ voids) whose birth–death coordinates correspond to interpretable semantic axes such as silhouette complexity, chromatic saturation, and articulation pose. A persistence-guided interpolation scheme that routes latent trajectories through low-persistence (topologically simple) regions achieves a 41% reduction in Fréchet Inception Distance relative to linear interpolation and a 27% improvement in human-rated semantic coherence (N = 85, p < .001). These results establish persistent homology as a principled instrument for navigating and controlling generative latent spaces in game-asset production pipelines.',
    keywords: ['persistent homology', 'topological data analysis', 'GAN', 'latent space', 'game assets', 'Betti numbers', 'Vietoris-Rips complex'],
    doi: '10.1098/rmh.2026.0052',
    journal: 'RMH Studios Technical Reports',
    volume: 4,
    issue: 2,
    pages: '1-26',
    category: 'Computational Topology',
    heroColor: 'from-rose-500 to-pink-500',
    iconName: 'Hexagon',
  },
  {
    slug: 'statistical-mechanics-multiagent-rl',
    title: 'Non-Equilibrium Statistical Mechanics of Multi-Agent Reinforcement Learning in Adversarial Game Environments',
    authors: ['RMH Research'],
    affiliation: 'RMH Studios',
    date: '2026-02-20',
    abstract:
      'The dynamics of multi-agent reinforcement learning (MARL) in adversarial game environments exhibit phenomena — spontaneous symmetry breaking, phase transitions between cooperative and defection-dominated equilibria, and critical slowing near bifurcation manifolds — that are strikingly reminiscent of non-equilibrium statistical-mechanical systems. We develop a mean-field theoretic framework that maps the joint policy-gradient dynamics of N interacting agents onto a system of coupled Fokker–Planck equations governing the evolution of policy-parameter probability densities in a high-dimensional strategy space. Under assumptions of weak coupling and Gaussian fluctuations, we derive closed-form expressions for the order parameter, susceptibility, and correlation length of the agent population, and demonstrate that the system undergoes a continuous phase transition at a critical reward-coupling strength whose value depends on the spectral radius of the agent interaction graph. Numerical simulations with 64-agent adversarial capture-the-flag environments corroborate the mean-field predictions: the measured critical exponents (β = 0.51 ± 0.03, γ = 0.98 ± 0.05, ν = 0.49 ± 0.04) are consistent with mean-field universality, and training instabilities previously attributed to non-stationarity are reinterpreted as critical fluctuations near the phase boundary. A renormalization-group-inspired curriculum that gradually increases reward coupling through the critical point reduces training variance by 58% and wall-clock convergence time by 34% relative to standard independent-learner baselines.',
    keywords: ['statistical mechanics', 'multi-agent reinforcement learning', 'phase transitions', 'Fokker-Planck equation', 'mean-field theory', 'critical phenomena', 'adversarial games'],
    doi: '10.1098/rmh.2026.0087',
    journal: 'RMH Studios Technical Reports',
    volume: 4,
    issue: 3,
    pages: '1-28',
    category: 'Statistical Physics',
    heroColor: 'from-indigo-500 to-purple-500',
    iconName: 'Atom',
  },
];

export function getArticleBySlug(slug: string): ResearchArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): ResearchArticle[] {
  return [...articles].sort((a, b) => {
    if (a.volume !== b.volume) return b.volume - a.volume;
    return b.issue - a.issue;
  });
}
