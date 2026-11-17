/**
 * Citations that cross divisions: paper id → extra archive paper ids it cites.
 * Kept apart from the division files so each division could be written alone.
 * Every id must resolve, and a paper never cites one from a later year
 * (`__tests__/catalog.test.ts`).
 */
export const CROSS_LINKS: Readonly<Record<string, readonly string[]>> = {
  // ── Formal → elsewhere ──
  'sparse-interaction-random-matrix-universality': ['floquet-prethermalization-lifetimes'],
  'gibbs-sampler-mixing-hypergraph-colourings': ['floquet-prethermalization-lifetimes'],
  'large-deviations-sparse-graph-spectra': ['floquet-prethermalization-lifetimes', 'geometry-of-learning-related-plasticity'],
  'tensor-completion-nuclear-norm-sharp': ['state-space-inference-sparse-spike-trains'],
  'sample-efficient-policy-search-dynamics-priors': ['state-space-inference-sparse-spike-trains'],
  'lowrank-adaptation-bounds-tensor-completion': ['geometry-of-learning-related-plasticity'],
  'sublinear-memory-attention-event-streams': ['state-space-inference-sparse-spike-trains'],
  'adaptive-load-shedding-latency-critical-feeds': ['attention-residue-in-feed-scrolling', 'receding-horizon-chiller-plant-optimisation'],
  'differentially-private-feed-aggregation': ['sum-product-bounds-prime-fields'],
  'membership-inference-recommender-embeddings': ['sum-product-bounds-prime-fields', 'tensor-completion-nuclear-norm-sharp'],
  'beamforming-crowded-acoustic-environments': ['music-training-and-auditory-attention'],
  'learned-priors-room-impulse-response': ['state-space-inference-sparse-spike-trains', 'music-training-and-auditory-attention'],
  'waste-heat-recovery-district-heating': ['microchannel-flow-boiling-instability', 'cooling-water-demand-basin-projections'],
  'thermal-control-heavy-tailed-load-surges': ['two-phase-immersion-cooling-transport', 'coolant-maldistribution-transient-load', 'slow-fast-averaging-heavy-tails'],
  'thermal-energy-storage-free-cooling-extension': ['siting-thermal-loads-climate-risk', 'free-cooling-hours-humid-heat-regimes', 'fluorinated-ether-dielectric-coolants'],

  // ── Physical → elsewhere ──
  'microchannel-flow-boiling-instability': ['liquid-cooled-rack-high-density-halls'],
  'two-phase-immersion-cooling-transport': ['liquid-cooled-rack-high-density-halls'],
  'graphene-copper-laminate-cold-plates': ['liquid-cooled-rack-high-density-halls', 'free-cooling-economisers-variable-humidity'],
  'coolant-maldistribution-transient-load': ['receding-horizon-chiller-plant-optimisation', 'mpc-coupled-thermal-zones'],
  'fluorinated-ether-dielectric-coolants': ['two-phase-immersion-cooling-transport', 'boiling-heat-flux-microstructured-copper'],
  'coolant-degradation-thermal-cycling': ['waste-heat-recovery-district-heating'],
  'hierarchical-sed-fitting-priors': ['state-space-inference-sparse-spike-trains'],
  'thermal-drift-infrared-detector-mosaics': ['mpc-coupled-thermal-zones', 'two-phase-immersion-cooling-transport'],
  'cooling-water-demand-basin-projections': ['free-cooling-economisers-variable-humidity', 'liquid-cooled-rack-high-density-halls'],
  'siting-thermal-loads-climate-risk': ['free-cooling-economisers-variable-humidity', 'battery-storage-sizing-ride-through'],
  'waste-heat-reuse-district-networks': ['waste-heat-recovery-district-heating'],
  'free-cooling-hours-humid-heat-regimes': ['free-cooling-economisers-variable-humidity', 'two-phase-immersion-cooling-transport', 'waste-heat-recovery-district-heating'],

  // ── Life → elsewhere ──
  'epistasis-and-enzyme-evolvability': ['single-atom-palladium-ceria-co-oxidation'],
  'replicator-dynamics-matchmaking-rating-drift': ['search-frictions-in-skill-based-matchmaking'],
  'cheater-dynamics-in-structured-biofilms': ['expander-spectral-gaps-bounded-girth', 'random-walk-entropy-expander-graphs'],
  'landscape-inference-deep-mutational-scanning': ['tensor-completion-nuclear-norm-sharp', 'state-space-inference-sparse-spike-trains'],
  'reward-prediction-error-and-skill-acquisition': ['loss-aversion-in-virtual-currency-spending'],
  'cross-modal-prediction-errors-rhythm-game-learning': ['loss-aversion-in-virtual-currency-spending', 'variable-reward-schedules-and-persistence'],
  'sustained-attention-lapses-in-long-play': ['attention-residue-in-feed-scrolling', 'financial-precarity-and-impulsive-spending', 'basic-income-pilots-and-behavioural-take-up'],
  'wearable-sleep-regularity-cluster-trial': ['daily-streaks-and-habit-formation'],
  'evening-play-sessions-and-sleep-timing': ['daily-streaks-and-habit-formation', 'attentional-capture-during-feed-scrolling-eeg'],

  // ── Human → elsewhere ──
  'network-effects-in-creator-platforms': ['expander-spectral-gaps-bounded-girth'],
  'peer-presence-and-effort-in-matchmaking': ['replicator-dynamics-matchmaking-rating-drift'],
  'two-sided-matching-fees-and-liquidity': ['replicator-dynamics-matchmaking-rating-drift'],
  'reactance-to-engagement-nudges': ['attentional-capture-during-feed-scrolling-eeg'],
  'trust-in-algorithmic-feed-ranking': ['geometry-of-learning-related-plasticity', 'attentional-capture-during-feed-scrolling-eeg', 'membership-inference-recommender-embeddings', 'differentially-private-feed-aggregation'],
  'gifting-networks-and-reciprocity-rings': ['expander-spectral-gaps-bounded-girth', 'random-walk-entropy-expander-graphs'],
};
