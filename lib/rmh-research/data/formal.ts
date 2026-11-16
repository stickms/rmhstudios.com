/**
 * The formal sciences and engineering division: mathematics, computer science,
 * engineering. Fictional authors, papers and venues (see ../types.ts).
 *
 * Shapes worth knowing, because the r-index is meant to separate them:
 *  - Tomasz Wieczorek publishes a long self-citing chain of systems papers:
 *    a high h-index, an r-index of 1.
 *  - Haruka Mizuno has three papers, each cited twice, both times from other
 *    fields: a modest h-index and a higher r-index.
 *  - Several older papers are cited only by papers nobody built on.
 */
import type { Author, Paper } from '../types';

export const FORMAL_AUTHORS: readonly Author[] = [
  // Mathematics
  { id: 'kaveh-arjmand', name: 'Kaveh Arjmand', field: 'mathematics', role: 'Principal Investigator', lab: 'Combinatorics Group', since: 2010 },
  { id: 'ngozi-adebayo', name: 'Ngozi Adebayo', field: 'mathematics', role: 'Senior Scientist', lab: 'Combinatorics Group', since: 2013 },
  { id: 'sorin-vasilescu', name: 'Sorin Vasilescu', field: 'mathematics', role: 'Senior Scientist', lab: 'Analysis and Dynamics Group', since: 2011 },
  { id: 'haruka-mizuno', name: 'Haruka Mizuno', field: 'mathematics', role: 'Research Fellow', lab: 'Analysis and Dynamics Group', since: 2018 },
  { id: 'pavel-zelenko', name: 'Pavel Zelenko', field: 'mathematics', role: 'Postdoctoral Fellow', lab: 'Analysis and Dynamics Group', since: 2020 },
  // Computer science
  { id: 'tomasz-wieczorek', name: 'Tomasz Wieczorek', field: 'computer-science', role: 'Principal Investigator', lab: 'Distributed Systems Lab', since: 2009 },
  { id: 'amara-nwosu', name: 'Amara Nwosu', field: 'computer-science', role: 'Senior Scientist', lab: 'Learning Systems Lab', since: 2015 },
  { id: 'rohan-deshpande', name: 'Rohan Deshpande', field: 'computer-science', role: 'Staff Scientist', lab: 'Distributed Systems Lab', since: 2016 },
  { id: 'lucia-fontaine', name: 'Lucia Fontaine', field: 'computer-science', role: 'Research Fellow', lab: 'Security and Privacy Lab', since: 2020 },
  { id: 'jae-won-seo', name: 'Jae-won Seo', field: 'computer-science', role: 'Postdoctoral Fellow', lab: 'Learning Systems Lab', since: 2023 },
  // Engineering
  { id: 'beatriz-quintanilla', name: 'Beatriz Quintanilla', field: 'engineering', role: 'Principal Investigator', lab: 'Power and Thermal Systems Lab', since: 2011 },
  { id: 'emeka-obi', name: 'Emeka Obi', field: 'engineering', role: 'Senior Scientist', lab: 'Controls and Robotics Lab', since: 2014 },
  { id: 'svetlana-markovic', name: 'Svetlana Marković', field: 'engineering', role: 'Staff Scientist', lab: 'Signal and Acoustics Lab', since: 2017 },
  { id: 'tariq-al-mansouri', name: 'Tariq Al-Mansouri', field: 'engineering', role: 'Research Fellow', lab: 'Power and Thermal Systems Lab', since: 2019 },
  { id: 'anh-tran', name: 'Anh Tran', field: 'engineering', role: 'Postdoctoral Fellow', lab: 'Controls and Robotics Lab', since: 2023 },
];

const JPM = 'RMH Journal of Pure Mathematics';
const TRA = 'Transactions of RMH Analysis';
const PRS = 'Proceedings of RMH Systems';
const JMI = 'RMH Journal of Machine Intelligence';
const SPR = 'RMH Security and Privacy Review';
const JRE = 'Journal of RMH Engineering';
const TCS = 'RMH Transactions on Control Systems';
const TAS = 'RMH Transactions on Acoustics and Signals';

export const FORMAL_PAPERS: readonly Paper[] = [
  // ───────────────────────── Mathematics ─────────────────────────
  {
    id: 'hypergraph-chromatic-thresholds',
    title: 'Chromatic Thresholds in Sparse Random Hypergraphs',
    authors: ['kaveh-arjmand'],
    year: 2011,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We determine the sharp threshold at which a sparse random k-uniform hypergraph ceases to be r-colourable, for all fixed k and r. The proof combines a second-moment argument on balanced colourings with a contiguity result for the planted model. As a consequence the threshold is located to within an additive constant in the average degree.',
    keywords: ['random hypergraphs', 'colouring', 'phase transitions', 'second moment'],
    refs: [],
  },
  {
    id: 'expander-spectral-gaps-bounded-girth',
    title: 'Spectral Gaps of Expander Families with Bounded Girth',
    authors: ['sorin-vasilescu'],
    year: 2012,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We prove an explicit lower bound on the spectral gap of d-regular graphs whose girth is bounded away from infinity, showing that short cycles cost at most a constant factor against the Ramanujan bound. The argument uses a trace method adapted to non-backtracking walks. The bound is tight for an infinite family of Cayley graphs.',
    keywords: ['expander graphs', 'spectral gap', 'girth', 'non-backtracking walks'],
    refs: [],
  },
  {
    id: 'discrepancy-low-shatter-set-systems',
    title: 'Discrepancy of Set Systems with Low Shatter Function',
    authors: ['kaveh-arjmand', 'ngozi-adebayo'],
    year: 2013,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'For set systems whose shatter function grows as n to the power d, we give a partial-colouring bound on discrepancy that improves the classical square-root estimate by a polylogarithmic factor. The method iterates an entropy-based rounding step on carefully chosen subsystems. We also show the bound cannot be improved for systems of half-spaces.',
    keywords: ['discrepancy', 'set systems', 'shatter function', 'entropy method'],
    refs: ['hypergraph-chromatic-thresholds'],
  },
  {
    id: 'piecewise-expanding-maps-with-holes',
    title: 'Invariant Measures for Piecewise Expanding Maps with Holes',
    authors: ['sorin-vasilescu'],
    year: 2014,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We study piecewise expanding interval maps with a small open hole and prove that the conditionally invariant measure converges to the invariant measure of the closed system as the hole shrinks. The rate of convergence is governed by the leading eigenvalue of a perturbed transfer operator on functions of bounded variation. Examples with intermittent branches show that the rate can be arbitrarily slow.',
    keywords: ['open dynamical systems', 'transfer operators', 'bounded variation', 'escape rates'],
    refs: ['expander-spectral-gaps-bounded-girth'],
  },
  {
    id: 'cap-set-polynomial-method-finite-fields',
    title: 'A Polynomial Method for Cap Sets over Finite Fields',
    authors: ['ngozi-adebayo'],
    year: 2015,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We adapt the slice-rank polynomial method to cap sets in vector spaces over small finite fields and obtain an exponential upper bound on their size, with an explicit base. The argument reduces the problem to bounding the dimension of a space of low-degree symmetric polynomials. We discuss the gap between this bound and the best known constructions.',
    keywords: ['cap sets', 'polynomial method', 'finite fields', 'additive combinatorics'],
    refs: ['hypergraph-chromatic-thresholds', 'discrepancy-low-shatter-set-systems'],
  },
  {
    id: 'random-walk-entropy-expander-graphs',
    title: 'Entropy Production in Random Walks on Expander Graphs',
    authors: ['sorin-vasilescu', 'kaveh-arjmand'],
    year: 2016,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We quantify how quickly a random walk on a regular expander loses memory of its starting vertex by tracking the relative entropy to the stationary distribution. A modified log-Sobolev inequality yields a decay rate that depends only on the spectral gap and the degree. The result sharpens mixing estimates for walks driven by non-reversible chains.',
    keywords: ['random walks', 'expander graphs', 'relative entropy', 'log-Sobolev inequality', 'mixing'],
    refs: ['expander-spectral-gaps-bounded-girth', 'hypergraph-chromatic-thresholds'],
  },
  {
    id: 'sparse-regularity-unbounded-degree',
    title: 'Sparse Regularity for Graphs of Unbounded Degree',
    authors: ['kaveh-arjmand', 'ngozi-adebayo'],
    year: 2017,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We prove a regularity lemma for graphs whose degree sequence is unbounded but satisfies a mild tail condition, with partition sizes that do not depend on the number of vertices. The proof replaces the density increment by a weighted energy increment over a pseudorandom host graph. We give counting lemmas for small subgraphs as an application.',
    keywords: ['regularity lemma', 'sparse graphs', 'pseudorandomness', 'counting lemma'],
    refs: ['hypergraph-chromatic-thresholds', 'discrepancy-low-shatter-set-systems', 'cap-set-polynomial-method-finite-fields'],
  },
  {
    id: 'sum-product-bounds-prime-fields',
    title: 'Quantitative Sum-Product Bounds in Prime Fields',
    authors: ['ngozi-adebayo'],
    year: 2018,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'For subsets of a prime field of moderate size, we show that the sumset or the product set must exceed the original set by a power strictly greater than 6/5. The proof combines an incidence bound with a refined energy decomposition. The estimate has direct consequences for randomness extractors built from two weak sources.',
    keywords: ['sum-product', 'incidence geometry', 'additive energy', 'randomness extraction'],
    refs: ['cap-set-polynomial-method-finite-fields'],
  },
  {
    id: 'slow-fast-averaging-heavy-tails',
    title: 'Stochastic Averaging for Slow-Fast Systems with Heavy-Tailed Noise',
    authors: ['haruka-mizuno'],
    year: 2019,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We prove an averaging principle for coupled slow-fast stochastic systems in which the fast component is driven by an alpha-stable process with alpha below two. The slow variable converges to the solution of an averaged equation at a rate that degrades explicitly with the tail index. The result removes the finite-variance assumption used in earlier averaging theorems.',
    keywords: ['stochastic averaging', 'heavy tails', 'stable processes', 'multiscale systems'],
    refs: ['expander-spectral-gaps-bounded-girth'],
  },
  {
    id: 'tensor-completion-nuclear-norm-sharp',
    title: 'Low-Rank Tensor Completion via Nuclear-Norm Relaxation: Sharp Sample Complexity',
    authors: ['haruka-mizuno', 'pavel-zelenko'],
    year: 2021,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We establish the sample complexity at which convex relaxation recovers an incoherent low-rank order-three tensor from uniformly observed entries, matching a lower bound up to a logarithmic factor. The dual certificate is constructed from a tensor analogue of the golfing scheme. Numerical experiments agree with the predicted phase boundary.',
    keywords: ['tensor completion', 'nuclear norm', 'convex relaxation', 'sample complexity', 'dual certificate'],
    refs: ['sparse-regularity-unbounded-degree', 'sum-product-bounds-prime-fields'],
  },
  {
    id: 'sparse-interaction-random-matrix-universality',
    title: 'Random Matrix Universality for Sparse Interaction Graphs',
    authors: ['pavel-zelenko', 'sorin-vasilescu'],
    year: 2022,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We prove that the local eigenvalue statistics of the adjacency matrix of a sparse random graph agree with those of the Gaussian orthogonal ensemble once the average degree exceeds a polylogarithmic threshold. The proof follows the dynamical approach through a Dyson-type flow with a carefully chosen initial condition. A weaker form of universality persists down to constant degree in the bulk.',
    keywords: ['random matrices', 'universality', 'sparse graphs', 'eigenvalue statistics'],
    refs: ['random-walk-entropy-expander-graphs', 'sum-product-bounds-prime-fields'],
  },
  {
    id: 'gibbs-sampler-mixing-hypergraph-colourings',
    title: 'Mixing Times of Gibbs Samplers on Dense Hypergraph Colourings',
    authors: ['haruka-mizuno'],
    year: 2023,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We bound the mixing time of the single-site Gibbs sampler on proper colourings of dense uniform hypergraphs when the number of colours exceeds a degree-dependent threshold. The proof uses a path-coupling argument with a hypergraph-aware metric. The threshold improves on previous results by a factor of two for three-uniform hypergraphs.',
    keywords: ['Gibbs sampler', 'mixing time', 'hypergraph colouring', 'path coupling'],
    refs: ['random-walk-entropy-expander-graphs', 'sum-product-bounds-prime-fields'],
  },
  {
    id: 'optimal-hypergraph-containers-sparse',
    title: 'Hypergraph Containers Revisited: Optimal Counting for Sparse Structures',
    authors: ['kaveh-arjmand', 'pavel-zelenko'],
    year: 2025,
    field: 'mathematics',
    venue: JPM,
    abstract:
      'We give a container theorem for uniform hypergraphs with a codegree condition weaker than those previously required, and use it to count independent sets and sum-free sets in sparse settings with optimal exponents. The proof is an iterative scheme whose supersaturation input is supplied by the sparse regularity lemma. We list several conjectures that the method leaves open.',
    keywords: ['hypergraph containers', 'independent sets', 'supersaturation', 'sparse structures'],
    refs: ['hypergraph-chromatic-thresholds', 'sparse-regularity-unbounded-degree', 'sparse-interaction-random-matrix-universality'],
  },
  {
    id: 'large-deviations-sparse-graph-spectra',
    title: 'Large Deviations for the Spectrum of Sparse Random Graphs',
    authors: ['sorin-vasilescu', 'pavel-zelenko'],
    year: 2026,
    field: 'mathematics',
    venue: TRA,
    abstract:
      'We establish a large deviation principle for the empirical spectral measure of sparse Erdős-Rényi graphs at the speed of the number of edges. The rate function is expressed through a variational problem over graphons with prescribed tail behaviour. In the regime of growing degree it recovers the known rate function for dense graphs.',
    keywords: ['large deviations', 'spectral measure', 'sparse graphs', 'graphons'],
    refs: ['sparse-interaction-random-matrix-universality', 'expander-spectral-gaps-bounded-girth', 'random-walk-entropy-expander-graphs'],
  },

  // ───────────────────────── Computer science ─────────────────────────
  {
    id: 'consistent-hashing-bounded-load-sessions',
    title: 'Consistent Hashing with Bounded Load for Session Stores',
    authors: ['tomasz-wieczorek'],
    year: 2011,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We extend consistent hashing with a per-server load cap that keeps the maximum load within a factor of (1 + epsilon) of the average while moving only a bounded number of keys on membership changes. The scheme is evaluated on the session store of a multiplayer lobby service. It halves peak memory skew relative to unbounded ring placement.',
    keywords: ['consistent hashing', 'load balancing', 'session stores', 'distributed systems'],
    refs: [],
  },
  {
    id: 'quorum-reconfiguration-without-pauses',
    title: 'Quorum Reconfiguration without Stop-the-World Pauses',
    authors: ['tomasz-wieczorek'],
    year: 2012,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We present a protocol that changes the membership of a replicated state machine while continuing to serve reads and writes. Overlapping joint quorums are used during the transition, and a safety argument shows linearizability is preserved. A prototype changes a five-node cluster in under two round trips of added latency.',
    keywords: ['consensus', 'reconfiguration', 'quorums', 'replication'],
    refs: ['consistent-hashing-bounded-load-sessions'],
  },
  {
    id: 'leaderless-replication-partial-synchrony',
    title: 'Leaderless Replication under Partial Synchrony',
    authors: ['tomasz-wieczorek'],
    year: 2013,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We describe a leaderless replication protocol that commits in one round trip when conflicting commands are rare and falls back to a bounded slow path otherwise. Correctness is proved under partial synchrony with up to f crash failures. The protocol removes the single-leader bottleneck observed in write-heavy workloads.',
    keywords: ['leaderless replication', 'partial synchrony', 'fast path', 'consensus'],
    refs: ['consistent-hashing-bounded-load-sessions', 'quorum-reconfiguration-without-pauses'],
  },
  {
    id: 'hybrid-logical-clocks-geo-ledgers',
    title: 'Hybrid Logical Clocks for Geo-Replicated Ledgers',
    authors: ['tomasz-wieczorek'],
    year: 2014,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We combine physical timestamps with logical counters to order events in a ledger replicated across continents, bounding the divergence from wall-clock time by the clock uncertainty. The construction needs no coordinated clock hardware. We show that causal order and snapshot reads follow directly from the timestamp invariants.',
    keywords: ['hybrid logical clocks', 'causality', 'ledgers', 'geo-replication'],
    refs: ['consistent-hashing-bounded-load-sessions', 'quorum-reconfiguration-without-pauses', 'leaderless-replication-partial-synchrony'],
  },
  {
    id: 'tail-latency-request-hedging-bounds',
    title: 'Tail Latency Bounds for Replicated Request Hedging',
    authors: ['tomasz-wieczorek'],
    year: 2015,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'Sending a duplicate request after a delay reduces tail latency but adds load. We derive the hedging delay that minimises the 99th-percentile latency subject to a fixed load budget, for service times with regularly varying tails. The analysis explains why a small fixed fraction of hedged requests captures most of the benefit.',
    keywords: ['tail latency', 'request hedging', 'queueing', 'heavy-tailed service times'],
    refs: [
      'consistent-hashing-bounded-load-sessions',
      'quorum-reconfiguration-without-pauses',
      'leaderless-replication-partial-synchrony',
      'hybrid-logical-clocks-geo-ledgers',
    ],
  },
  {
    id: 'lsm-trees-write-amplification-budgets',
    title: 'Log-Structured Merge Trees under Write Amplification Budgets',
    authors: ['tomasz-wieczorek', 'rohan-deshpande'],
    year: 2016,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We treat the compaction schedule of an LSM tree as a control problem with an explicit write-amplification budget and derive level sizes that minimise read amplification within it. A tiered-leveled hybrid follows from the optimum. In a production score store, the schedule cut disk writes by a third at equal read latency.',
    keywords: ['LSM trees', 'compaction', 'write amplification', 'storage engines'],
    refs: [
      'consistent-hashing-bounded-load-sessions',
      'quorum-reconfiguration-without-pauses',
      'leaderless-replication-partial-synchrony',
      'hybrid-logical-clocks-geo-ledgers',
      'tail-latency-request-hedging-bounds',
    ],
  },
  {
    id: 'deterministic-scheduling-sharded-ledgers',
    title: 'Deterministic Transaction Scheduling for Sharded Ledgers',
    authors: ['tomasz-wieczorek', 'rohan-deshpande'],
    year: 2017,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We schedule cross-shard transactions in a deterministic order agreed before execution, so shards never exchange locks or abort-and-retry messages. The sequencer batches transactions and replicates the batch order with the leaderless protocol of earlier work. Throughput scales linearly to sixty-four shards on a synthetic coin-transfer workload.',
    keywords: ['deterministic scheduling', 'sharding', 'ledgers', 'transactions'],
    refs: [
      'consistent-hashing-bounded-load-sessions',
      'quorum-reconfiguration-without-pauses',
      'leaderless-replication-partial-synchrony',
      'hybrid-logical-clocks-geo-ledgers',
      'tail-latency-request-hedging-bounds',
      'lsm-trees-write-amplification-budgets',
    ],
  },
  {
    id: 'sample-efficient-policy-search-dynamics-priors',
    title: 'Sample-Efficient Policy Search with Learned Dynamics Priors',
    authors: ['amara-nwosu'],
    year: 2016,
    field: 'computer-science',
    venue: JMI,
    abstract:
      'We show that a policy-search method can reuse a learned dynamics model as a prior over rollouts, reducing the number of environment interactions needed to reach a fixed return by an order of magnitude on continuous-control benchmarks. A regret bound relates the benefit to the model error. The approach degrades gracefully when the model is misspecified.',
    keywords: ['reinforcement learning', 'policy search', 'model-based learning', 'sample efficiency'],
    refs: [],
  },
  {
    id: 'sublinear-memory-attention-event-streams',
    title: 'Attention with Sublinear Memory for Long Event Streams',
    authors: ['amara-nwosu'],
    year: 2018,
    field: 'computer-science',
    venue: JMI,
    abstract:
      'We introduce an attention layer whose memory grows with the square root of the stream length by keeping a compressed summary of distant events. Sequences of a million events are processed on a single accelerator. The layer matches full attention on next-event prediction for game telemetry traces.',
    keywords: ['attention', 'sequence models', 'memory efficiency', 'event streams'],
    refs: ['sample-efficient-policy-search-dynamics-priors'],
  },
  {
    id: 'adaptive-load-shedding-latency-critical-feeds',
    title: 'Adaptive Load Shedding for Latency-Critical Feeds',
    authors: ['rohan-deshpande'],
    year: 2019,
    field: 'computer-science',
    venue: PRS,
    abstract:
      'We present a controller that drops low-value feed-assembly work under overload while keeping the median page latency inside a target. Shedding decisions are driven by an online estimate of marginal utility per millisecond of service time. Under a tenfold traffic spike the controller held the target with under two percent of requests degraded.',
    keywords: ['load shedding', 'overload control', 'feeds', 'latency'],
    refs: ['leaderless-replication-partial-synchrony', 'hybrid-logical-clocks-geo-ledgers', 'tail-latency-request-hedging-bounds'],
  },
  {
    id: 'differentially-private-feed-aggregation',
    title: 'Differentially Private Aggregation for Social Feeds',
    authors: ['lucia-fontaine'],
    year: 2020,
    field: 'computer-science',
    venue: SPR,
    abstract:
      'We design an aggregation mechanism for engagement statistics that satisfies local differential privacy while keeping the error of trending-topic counts sublinear in the number of users. A shuffling step amplifies the privacy guarantee without a trusted curator. We prove matching lower bounds for the heavy-hitter problem.',
    keywords: ['differential privacy', 'shuffle model', 'heavy hitters', 'social feeds'],
    refs: [],
  },
  {
    id: 'learned-admission-policies-edge-caches',
    title: 'Learned Admission Policies for Edge Caches',
    authors: ['amara-nwosu'],
    year: 2022,
    field: 'computer-science',
    venue: JMI,
    abstract:
      'We train a lightweight model to decide which objects an edge cache should admit, using features available at request time. The policy raises the byte hit rate over frequency-based admission across three production traces. A distillation step keeps inference under a microsecond per request.',
    keywords: ['caching', 'admission policies', 'learned systems', 'content delivery'],
    refs: [
      'tail-latency-request-hedging-bounds',
      'sample-efficient-policy-search-dynamics-priors',
      'sublinear-memory-attention-event-streams',
      'adaptive-load-shedding-latency-critical-feeds',
    ],
  },
  {
    id: 'membership-inference-recommender-embeddings',
    title: 'Membership Inference against Recommender Embeddings',
    authors: ['lucia-fontaine', 'jae-won-seo'],
    year: 2025,
    field: 'computer-science',
    venue: SPR,
    abstract:
      'We show that item and user embeddings released by a recommender leak whether a given interaction was in the training data, with attack accuracy well above chance for users with short histories. A tensor-completion view of the embedding table predicts which users are most exposed. Noise calibrated to that exposure restores near-chance accuracy at a small cost in ranking quality.',
    keywords: ['membership inference', 'recommender systems', 'embeddings', 'privacy attacks', 'tensor completion'],
    refs: [
      'deterministic-scheduling-sharded-ledgers',
      'sublinear-memory-attention-event-streams',
      'differentially-private-feed-aggregation',
      'learned-admission-policies-edge-caches',
      'sum-product-bounds-prime-fields',
      'tensor-completion-nuclear-norm-sharp',
    ],
  },
  {
    id: 'lowrank-adaptation-bounds-tensor-completion',
    title: 'Low-Rank Adaptation Bounds from Tensor Completion Theory',
    authors: ['jae-won-seo', 'amara-nwosu'],
    year: 2026,
    field: 'computer-science',
    venue: JMI,
    abstract:
      'Low-rank adapters are usually chosen by trial and error. By viewing the update to a pretrained layer as a partially observed low-rank tensor, we derive a rank and data requirement for recovering a target task, and verify it on language-model fine-tuning. The bound relies on sharp sample-complexity results and on mixing estimates for the sampling process.',
    keywords: ['low-rank adaptation', 'fine-tuning', 'tensor completion', 'sample complexity'],
    refs: [
      'sublinear-memory-attention-event-streams',
      'learned-admission-policies-edge-caches',
      'tensor-completion-nuclear-norm-sharp',
      'gibbs-sampler-mixing-hypergraph-colourings',
    ],
  },

  // ───────────────────────── Engineering ─────────────────────────
  {
    id: 'liquid-cooled-rack-high-density-halls',
    title: 'Liquid-Cooled Rack Design for High-Density Compute Halls',
    authors: ['beatriz-quintanilla'],
    year: 2011,
    field: 'engineering',
    venue: JRE,
    abstract:
      'We describe a direct-to-chip liquid cooling rack that removes forty kilowatts per rack at a facility power usage effectiveness below 1.15. Coolant distribution, leak containment and serviceability are treated as one design problem. Measurements from a pilot hall support a lumped thermal model of the loop.',
    keywords: ['liquid cooling', 'datacentre', 'thermal design', 'power usage effectiveness'],
    refs: [],
  },
  {
    id: 'free-cooling-economisers-variable-humidity',
    title: 'Free-Cooling Economisers under Variable Humidity',
    authors: ['beatriz-quintanilla'],
    year: 2013,
    field: 'engineering',
    venue: JRE,
    abstract:
      'Outside-air economisers save energy but are limited by humidity. We model the hours of free cooling available at a site as a function of an allowable humidity envelope and show how adiabatic assist extends them. A year of operating data from two halls confirms the predicted savings within five percent.',
    keywords: ['free cooling', 'economisers', 'humidity', 'energy efficiency'],
    refs: ['liquid-cooled-rack-high-density-halls'],
  },
  {
    id: 'mpc-coupled-thermal-zones',
    title: 'Model Predictive Control of Coupled Thermal Zones',
    authors: ['emeka-obi'],
    year: 2014,
    field: 'engineering',
    venue: TCS,
    abstract:
      'We formulate cooling of thermally coupled zones as a receding-horizon problem whose model captures heat exchange between neighbouring halls. A distributed solver keeps the computation local to each zone with a bounded optimality loss. Closed-loop tests show a reduction in temperature variance relative to decentralised PID control.',
    keywords: ['model predictive control', 'thermal zones', 'distributed optimisation', 'building systems'],
    refs: ['liquid-cooled-rack-high-density-halls'],
  },
  {
    id: 'receding-horizon-chiller-plant-optimisation',
    title: 'Chiller Plant Optimisation Using Receding-Horizon Control',
    authors: ['beatriz-quintanilla', 'emeka-obi'],
    year: 2015,
    field: 'engineering',
    venue: JRE,
    abstract:
      'We schedule chillers, pumps and cooling towers jointly with a receding-horizon controller that accounts for equipment staging costs. A mixed-integer formulation is relaxed to a form that solves within the control period. Deployed on a production plant, it reduced cooling energy by eleven percent.',
    keywords: ['chiller plants', 'receding-horizon control', 'mixed-integer optimisation', 'energy'],
    refs: ['free-cooling-economisers-variable-humidity', 'mpc-coupled-thermal-zones'],
  },
  {
    id: 'adaptive-impedance-control-compliant-manipulators',
    title: 'Adaptive Impedance Control for Compliant Manipulators',
    authors: ['emeka-obi'],
    year: 2016,
    field: 'engineering',
    venue: TCS,
    abstract:
      'We propose an impedance controller for manipulators with series elastic actuators that adapts to unknown payload and contact stiffness online. Lyapunov analysis establishes uniform boundedness of tracking and force errors. Experiments on a six-axis arm show stable contact with surfaces whose stiffness varies by two orders of magnitude.',
    keywords: ['impedance control', 'adaptive control', 'series elastic actuators', 'robotics'],
    refs: ['mpc-coupled-thermal-zones'],
  },
  {
    id: 'beamforming-crowded-acoustic-environments',
    title: 'Beamforming for Crowded Acoustic Environments',
    authors: ['svetlana-markovic'],
    year: 2017,
    field: 'engineering',
    venue: TAS,
    abstract:
      'We present a beamformer that maintains a target-speaker gain when many competing sources surround a microphone array. The design uses a sparsity prior on the source field and an alternating minimisation that converges in a few iterations. In a simulated arcade with forty talkers, intelligibility improved by six decibels over delay-and-sum.',
    keywords: ['beamforming', 'microphone arrays', 'sparse recovery', 'speech enhancement'],
    refs: [],
  },
  {
    id: 'nonnegative-spectral-factorisation-separation',
    title: 'Source Separation by Non-Negative Spectral Factorisation',
    authors: ['svetlana-markovic'],
    year: 2018,
    field: 'engineering',
    venue: TAS,
    abstract:
      'We separate overlapping instruments in a mono recording by factorising its magnitude spectrogram under harmonicity and temporal-continuity constraints. The constraints remove the permutation ambiguity of unconstrained factorisation. Listening tests rate the separated stems above those of three baselines.',
    keywords: ['source separation', 'non-negative matrix factorisation', 'spectrograms', 'music signals'],
    refs: ['beamforming-crowded-acoustic-environments'],
  },
  {
    id: 'battery-storage-sizing-ride-through',
    title: 'Battery Energy Storage Sizing for Datacentre Ride-Through',
    authors: ['tariq-al-mansouri'],
    year: 2019,
    field: 'engineering',
    venue: JRE,
    abstract:
      'We size battery storage for a datacentre by minimising lifetime cost subject to a ride-through requirement and a model of capacity fade. Outage statistics from the regional grid enter as a chance constraint. The resulting capacity is thirty percent below the usual worst-case rule at the same availability.',
    keywords: ['energy storage', 'datacentre', 'reliability', 'chance constraints'],
    refs: ['liquid-cooled-rack-high-density-halls', 'receding-horizon-chiller-plant-optimisation'],
  },
  {
    id: 'active-noise-cancellation-server-halls',
    title: 'Active Noise Cancellation in Server Halls',
    authors: ['emeka-obi', 'svetlana-markovic'],
    year: 2020,
    field: 'engineering',
    venue: TAS,
    abstract:
      'Fan noise in a server hall is broadband and varies with load. We combine a feedforward controller with a spectral estimate of the fan harmonics to attenuate tonal components by twelve decibels at the operator positions. Stability is guaranteed by a passivity condition on the secondary path.',
    keywords: ['active noise control', 'adaptive filtering', 'fan noise', 'datacentre'],
    refs: ['mpc-coupled-thermal-zones', 'beamforming-crowded-acoustic-environments', 'nonnegative-spectral-factorisation-separation'],
  },
  {
    id: 'learned-priors-room-impulse-response',
    title: 'Room Impulse Response Estimation with Learned Priors',
    authors: ['svetlana-markovic'],
    year: 2021,
    field: 'engineering',
    venue: TAS,
    abstract:
      'We estimate a room impulse response from a short reverberant recording by regularising with a prior learned from simulated rooms. The estimator is trained with an adversarial loss that penalises non-causal energy. Errors in reverberation time fall by half against blind deconvolution.',
    keywords: ['room acoustics', 'impulse response', 'deconvolution', 'learned priors'],
    refs: ['nonnegative-spectral-factorisation-separation', 'sample-efficient-policy-search-dynamics-priors'],
  },
  {
    id: 'waste-heat-recovery-district-heating',
    title: 'Waste-Heat Recovery Loops for District Heating from Compute Halls',
    authors: ['beatriz-quintanilla', 'tariq-al-mansouri'],
    year: 2022,
    field: 'engineering',
    venue: JRE,
    abstract:
      'We couple the return loop of a liquid-cooled hall to a district heating network through a heat pump with variable lift. A control strategy keeps the supply temperature within the network contract while following compute load. Over a heating season the loop delivered the equivalent of the winter demand of eight hundred homes.',
    keywords: ['waste heat', 'district heating', 'heat pumps', 'datacentre'],
    refs: ['free-cooling-economisers-variable-humidity', 'receding-horizon-chiller-plant-optimisation', 'battery-storage-sizing-ride-through'],
  },
  {
    id: 'stability-margins-heavy-tailed-disturbances',
    title: 'Stability Margins for Controllers with Heavy-Tailed Disturbances',
    authors: ['emeka-obi', 'anh-tran'],
    year: 2024,
    field: 'engineering',
    venue: TCS,
    abstract:
      'Classical stability margins assume bounded or Gaussian disturbances. Using an averaging result for systems driven by stable noise, we define a margin that is meaningful when disturbances have infinite variance and give a test for it. Case studies on a hovering platform and a cooling loop show that the usual margins overstate robustness.',
    keywords: ['stability margins', 'heavy-tailed disturbances', 'robust control', 'stochastic averaging'],
    refs: ['slow-fast-averaging-heavy-tails', 'adaptive-impedance-control-compliant-manipulators', 'active-noise-cancellation-server-halls'],
  },
  {
    id: 'thermal-control-heavy-tailed-load-surges',
    title: 'Datacentre Thermal Control under Heavy-Tailed Load Surges',
    authors: ['tariq-al-mansouri', 'beatriz-quintanilla'],
    year: 2025,
    field: 'engineering',
    venue: TCS,
    abstract:
      'Compute load in a datacentre arrives in surges whose size is heavy-tailed, and cooling controllers tuned for typical load overheat during rare spikes. We apply an averaged-dynamics model and the tail-aware stability margin to set cooling headroom, and test the design on two production halls. Peak inlet temperature excursions fall by sixty percent for a four percent rise in cooling energy.',
    keywords: ['thermal control', 'heavy tails', 'datacentre', 'load surges', 'robust control'],
    refs: [
      'stability-margins-heavy-tailed-disturbances',
      'slow-fast-averaging-heavy-tails',
      'gibbs-sampler-mixing-hypergraph-colourings',
      'waste-heat-recovery-district-heating',
    ],
  },
  {
    id: 'thermal-energy-storage-free-cooling-extension',
    title: 'Thermal Energy Storage for Free-Cooling Extension',
    authors: ['beatriz-quintanilla', 'anh-tran'],
    year: 2026,
    field: 'engineering',
    venue: JRE,
    abstract:
      'We store coolant chilled by free cooling overnight in stratified tanks and discharge it through the warm part of the day, extending economiser hours at climates where they would otherwise run out. A scheduling model sizes the tank against the forecast. A demonstration hall achieved twenty-two percent more free-cooling hours than the same hall without storage.',
    keywords: ['thermal storage', 'free cooling', 'scheduling', 'energy efficiency'],
    refs: ['free-cooling-economisers-variable-humidity', 'battery-storage-sizing-ride-through', 'waste-heat-recovery-district-heating'],
  },
];
