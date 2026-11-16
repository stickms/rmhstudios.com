/**
 * RMH Research — the life sciences division: biology, medicine, neuroscience.
 *
 * Fiction in the in-universe register of the archive. Medicine entries are
 * research-register only (cohorts, mechanisms, trials); nothing here is advice.
 */
import type { Author, Paper } from '../types';

export const LIFE_AUTHORS: readonly Author[] = [
  // Biology
  { id: 'ines-carvalho', name: 'Ines Carvalho', field: 'biology', role: 'Principal Investigator', lab: 'Evolutionary Dynamics Lab', since: 2010 },
  { id: 'kofi-mensah-adu', name: 'Kofi Mensah-Adu', field: 'biology', role: 'Senior Scientist', lab: 'Evolutionary Dynamics Lab', since: 2014 },
  { id: 'priya-venkataraman', name: 'Priya Venkataraman', field: 'biology', role: 'Staff Scientist', lab: 'Microbial Systems Lab', since: 2012 },
  { id: 'anselm-rydberg', name: 'Anselm Rydberg', field: 'biology', role: 'Research Fellow', lab: 'Microbial Systems Lab', since: 2019 },
  { id: 'wanjiru-kamau', name: 'Wanjiru Kamau', field: 'biology', role: 'Postdoctoral Fellow', lab: 'Microbial Systems Lab', since: 2022 },
  // Medicine
  { id: 'rafael-ortuno', name: 'Rafael Ortuño', field: 'medicine', role: 'Principal Investigator', lab: 'Cohort Epidemiology Lab', since: 2009 },
  { id: 'sunita-bhattacharya', name: 'Sunita Bhattacharya', field: 'medicine', role: 'Senior Scientist', lab: 'Cohort Epidemiology Lab', since: 2011 },
  { id: 'leif-haugen', name: 'Leif Haugen', field: 'medicine', role: 'Staff Scientist', lab: 'Translational Immunology Lab', since: 2015 },
  { id: 'nadia-karimova', name: 'Nadia Karimova', field: 'medicine', role: 'Research Fellow', lab: 'Translational Immunology Lab', since: 2020 },
  // Neuroscience
  { id: 'tomasz-wisniewski', name: 'Tomasz Wisniewski', field: 'neuroscience', role: 'Principal Investigator', lab: 'Attention & Learning Lab', since: 2010 },
  { id: 'amara-okonkwo-eze', name: 'Amara Okonkwo-Eze', field: 'neuroscience', role: 'Senior Scientist', lab: 'Attention & Learning Lab', since: 2013 },
  { id: 'sora-nakagawa', name: 'Sora Nakagawa', field: 'neuroscience', role: 'Staff Scientist', lab: 'Circuit Dynamics Lab', since: 2016 },
  { id: 'elif-demirtas', name: 'Elif Demirtas', field: 'neuroscience', role: 'Postdoctoral Fellow', lab: 'Circuit Dynamics Lab', since: 2023 },
];

const LS = 'RMH Life Sciences';
const EE = 'RMH Evolution & Ecology Letters';
const CR = 'RMH Journal of Clinical Research';
const IR = 'RMH Immunology Reports';
const NS = 'RMH Neuroscience';
const CN = 'RMH Journal of Cognitive Neuroscience';

export const LIFE_PAPERS: readonly Paper[] = [
  // ───────────────────────── Biology ─────────────────────────
  {
    id: 'fitness-landscape-ruggedness-bacterial-populations',
    title: 'Ruggedness of Empirical Fitness Landscapes in Experimental Bacterial Populations',
    authors: ['ines-carvalho'],
    year: 2011,
    field: 'biology',
    venue: LS,
    abstract:
      'We measured the fitness of 2,304 single- and double-mutant genotypes of a metabolic enzyme across four environments. Sign epistasis was common and its prevalence rose with environmental stress, producing landscapes with multiple local optima. Replicate populations founded on the same genotype diverged to different peaks in a majority of lines.',
    keywords: ['fitness landscape', 'epistasis', 'experimental evolution', 'bacteria'],
    refs: [],
  },
  {
    id: 'horizontal-gene-transfer-rates-in-biofilms',
    title: 'Horizontal Gene Transfer Rates in Surface-Attached Biofilms',
    authors: ['priya-venkataraman'],
    year: 2012,
    field: 'biology',
    venue: LS,
    abstract:
      'Conjugative transfer was quantified in flow-cell biofilms using a dual-fluorescent reporter that marks donors, recipients and transconjugants. Transfer frequency exceeded planktonic rates by roughly two orders of magnitude and was concentrated at the biofilm base, where cell density is highest and diffusion is slowest.',
    keywords: ['horizontal gene transfer', 'biofilm', 'conjugation', 'microscopy'],
    refs: [],
  },
  {
    id: 'mutation-supply-and-adaptation-rate',
    title: 'Mutation Supply and the Rate of Adaptation in Large Asexual Populations',
    authors: ['ines-carvalho', 'kofi-mensah-adu'],
    year: 2013,
    field: 'biology',
    venue: EE,
    abstract:
      'Adaptation in asexual populations is limited either by the supply of beneficial mutations or by competition between them. By tuning mutation rate with a conditional mutator allele we show a transition between the two regimes at population sizes near 10^8, and that clonal interference sets the ceiling thereafter.',
    keywords: ['clonal interference', 'mutation rate', 'adaptation', 'population size'],
    refs: ['fitness-landscape-ruggedness-bacterial-populations'],
  },
  {
    id: 'quorum-sensing-cheater-invasion',
    title: 'Quorum-Sensing Cheaters Invade Only Below a Critical Cooperator Density',
    authors: ['priya-venkataraman', 'kofi-mensah-adu'],
    year: 2014,
    field: 'biology',
    venue: EE,
    abstract:
      'Signal-blind mutants can exploit public goods produced under quorum-sensing control. Using mixed cultures with controlled spatial structure, we find that cheaters invade a population only when cooperator density falls beneath a threshold set by diffusion length. Above it, the signal itself acts as a partial barrier to invasion.',
    keywords: ['quorum sensing', 'cooperation', 'public goods', 'cheaters'],
    refs: ['horizontal-gene-transfer-rates-in-biofilms'],
  },
  {
    id: 'epistasis-and-enzyme-evolvability',
    title: 'Epistasis Constrains and Channels the Evolvability of a Metabolic Enzyme',
    authors: ['ines-carvalho'],
    year: 2015,
    field: 'biology',
    venue: LS,
    abstract:
      'Starting from a promiscuous ancestral enzyme, we mapped the mutational neighbourhood around three functional variants. Pairwise interactions among a small set of active-site residues determined which new activities were reachable in fewer than five substitutions, and predicted the paths taken in directed evolution.',
    keywords: ['epistasis', 'enzyme evolution', 'evolvability', 'directed evolution'],
    refs: ['fitness-landscape-ruggedness-bacterial-populations', 'mutation-supply-and-adaptation-rate'],
  },
  {
    id: 'phage-resistance-tradeoffs-in-chemostats',
    title: 'Phage Resistance Trade-offs Shape Coexistence in Continuous Culture',
    authors: ['kofi-mensah-adu', 'priya-venkataraman'],
    year: 2016,
    field: 'biology',
    venue: EE,
    abstract:
      'In chemostats seeded with a bacterium and a lytic phage, resistant mutants arose within days but paid a growth cost that depended on nutrient limitation. The cost structure explains stable coexistence at low dilution rates and cyclical dynamics at high ones, matching a three-variable model fitted to the time series.',
    keywords: ['bacteriophage', 'resistance', 'chemostat', 'coexistence'],
    refs: ['horizontal-gene-transfer-rates-in-biofilms', 'mutation-supply-and-adaptation-rate'],
  },
  {
    id: 'priority-effects-in-gut-community-assembly',
    title: 'Priority Effects in the Assembly of a Defined Gut Microbial Community',
    authors: ['priya-venkataraman'],
    year: 2017,
    field: 'biology',
    venue: LS,
    abstract:
      'Twelve gut-derived taxa were introduced to germ-free hosts in all permutations of three arrival orders. Early colonisers occupied niches that later arrivals could not displace, and community outcome depended on order for nine of twelve taxa. We describe the cross-feeding interactions that make early arrival decisive.',
    keywords: ['community assembly', 'priority effects', 'gut microbiome', 'cross-feeding'],
    refs: ['horizontal-gene-transfer-rates-in-biofilms', 'quorum-sensing-cheater-invasion'],
  },
  {
    id: 'plasmid-persistence-without-selection',
    title: 'Plasmid Persistence in the Absence of Positive Selection',
    authors: ['kofi-mensah-adu'],
    year: 2018,
    field: 'biology',
    venue: EE,
    abstract:
      'Plasmids that impose a fitness cost should disappear without selection, yet many persist. Combining long-term serial transfer with conjugation assays, we show that compensatory chromosomal mutations and modest transfer rates together account for persistence, and that neither alone is sufficient.',
    keywords: ['plasmids', 'compensatory evolution', 'conjugation', 'persistence'],
    refs: ['horizontal-gene-transfer-rates-in-biofilms', 'phage-resistance-tradeoffs-in-chemostats'],
  },
  {
    id: 'replicator-dynamics-matchmaking-rating-drift',
    title: 'Replicator Dynamics in a Matchmaking Population: Rating Drift as Frequency-Dependent Selection',
    authors: ['ines-carvalho', 'anselm-rydberg'],
    year: 2019,
    field: 'biology',
    venue: LS,
    abstract:
      'We treat the skill-rating distribution of an online competitive population as a replicator system in which strategies reproduce in proportion to match outcomes against the current mix. Using anonymised matchmaking logs, we show that rating drift follows frequency-dependent selection with a measurable payoff matrix, and that matchmaking rules act as a form of population structure.',
    keywords: ['replicator dynamics', 'frequency-dependent selection', 'matchmaking', 'evolutionary game theory'],
    refs: ['mutation-supply-and-adaptation-rate', 'epistasis-and-enzyme-evolvability'],
  },
  {
    id: 'persister-lineage-tracing-single-cell',
    title: 'Single-Cell Lineage Tracing of Antibiotic Persisters',
    authors: ['anselm-rydberg', 'priya-venkataraman'],
    year: 2020,
    field: 'biology',
    venue: LS,
    abstract:
      'Time-lapse imaging in a microfluidic mother machine followed 40,000 lineages through repeated drug exposure. Persistence was heritable for two to three generations and was inferred with a state-space model of the hidden growth state. Lineages that entered persistence from slow growth carried an elevated stress-response signature before exposure.',
    keywords: ['persisters', 'single-cell', 'microfluidics', 'lineage tracing', 'state-space model'],
    refs: ['quorum-sensing-cheater-invasion', 'priority-effects-in-gut-community-assembly', 'state-space-inference-sparse-spike-trains', 'population-dynamics-low-dimensional-manifolds'],
  },
  {
    id: 'cheater-dynamics-in-structured-biofilms',
    title: 'Cheater Dynamics in Spatially Structured Biofilms with Matrix Production',
    authors: ['wanjiru-kamau', 'priya-venkataraman'],
    year: 2022,
    field: 'biology',
    venue: EE,
    abstract:
      'Matrix-deficient mutants free-ride on the extracellular matrix produced by wild-type neighbours. In biofilms grown from known initial patterns, strain intermixing at inoculation controlled how quickly cheaters swept the community, and sector geometry predicted the outcome better than mean strain frequency.',
    keywords: ['biofilm matrix', 'cheaters', 'spatial structure', 'cooperation'],
    refs: ['quorum-sensing-cheater-invasion', 'priority-effects-in-gut-community-assembly', 'persister-lineage-tracing-single-cell'],
  },
  {
    id: 'landscape-inference-deep-mutational-scanning',
    title: 'Inferring Fitness Landscapes from Deep Mutational Scanning with Latent-State Models',
    authors: ['ines-carvalho', 'anselm-rydberg', 'kofi-mensah-adu'],
    year: 2023,
    field: 'biology',
    venue: LS,
    abstract:
      'Deep mutational scans measure single mutants well but give little information on interactions. We fit a latent-state model that separates additive effects from global nonlinearity and recovers pairwise epistasis from sparse double-mutant data, validated against held-out genotypes on three proteins.',
    keywords: ['deep mutational scanning', 'fitness landscape', 'epistasis', 'statistical inference'],
    refs: ['fitness-landscape-ruggedness-bacterial-populations', 'epistasis-and-enzyme-evolvability', 'replicator-dynamics-matchmaking-rating-drift', 'state-space-inference-sparse-spike-trains'],
  },
  {
    id: 'predicting-resistance-evolution-from-landscapes',
    title: 'Predicting the Course of Resistance Evolution from Measured Landscapes',
    authors: ['kofi-mensah-adu', 'wanjiru-kamau'],
    year: 2025,
    field: 'biology',
    venue: EE,
    abstract:
      'Given a fitness landscape measured for a resistance determinant, how well can the order of fixed mutations be predicted? Across 18 replicate lineages the most likely path was realised in 61 percent, and prediction improved when population structure and phage pressure were included. We discuss where determinism breaks down.',
    keywords: ['resistance evolution', 'prediction', 'fitness landscape', 'replicate lineages'],
    refs: [
      'phage-resistance-tradeoffs-in-chemostats',
      'persister-lineage-tracing-single-cell',
      'cheater-dynamics-in-structured-biofilms',
      'landscape-inference-deep-mutational-scanning',
      'state-space-inference-sparse-spike-trains',
      'population-dynamics-low-dimensional-manifolds',
    ],
  },
  {
    id: 'microbiome-resilience-after-perturbation',
    title: 'Trajectory Geometry and Resilience of a Gut Community After Perturbation',
    authors: ['priya-venkataraman', 'wanjiru-kamau'],
    year: 2026,
    field: 'biology',
    venue: LS,
    abstract:
      'We follow community composition through antibiotic perturbation and recovery and describe each trajectory as a path on a low-dimensional manifold. Recovery time scaled with the curvature of the return path rather than with the size of the initial perturbation, and closed-loop nutrient dosing in vitro shortened return time by a third.',
    keywords: ['microbiome', 'resilience', 'perturbation', 'community dynamics', 'feedback control'],
    refs: [
      'priority-effects-in-gut-community-assembly',
      'persister-lineage-tracing-single-cell',
      'cheater-dynamics-in-structured-biofilms',
      'population-dynamics-low-dimensional-manifolds',
      'closed-loop-stimulation-timing',
    ],
  },

  // ───────────────────────── Medicine ─────────────────────────
  {
    id: 'sleep-duration-and-cardiometabolic-outcomes-cohort',
    title: 'Habitual Sleep Duration and Incident Cardiometabolic Outcomes in a 12-Year Prospective Cohort',
    authors: ['rafael-ortuno'],
    year: 2011,
    field: 'medicine',
    venue: CR,
    abstract:
      'We followed 9,412 adults enrolled in a regional cohort for a median of 12 years. Both short and long self-reported sleep duration were associated with higher incidence of cardiometabolic outcomes after adjustment, in a U-shaped pattern. Residual confounding by shift work and depressive symptoms cannot be excluded.',
    keywords: ['sleep', 'cohort study', 'cardiometabolic', 'epidemiology'],
    refs: [],
  },
  {
    id: 'measurement-error-self-reported-activity',
    title: 'Measurement Error in Self-Reported Physical Activity and Its Effect on Cohort Risk Estimates',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2012,
    field: 'medicine',
    venue: CR,
    abstract:
      'Using accelerometer data from a validation substudy, we estimate the structure of error in questionnaire-reported activity and apply regression calibration to the parent cohort. Uncorrected analyses understated the activity-outcome association by about a third, with larger bias at the extremes of reported activity.',
    keywords: ['measurement error', 'regression calibration', 'physical activity', 'cohort study'],
    refs: ['sleep-duration-and-cardiometabolic-outcomes-cohort'],
  },
  {
    id: 'fasting-glucose-trajectories-prospective-cohort',
    title: 'Longitudinal Trajectories of Fasting Glucose Preceding Diagnosed Type 2 Diabetes',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2013,
    field: 'medicine',
    venue: CR,
    abstract:
      'Latent-class trajectory models applied to repeated measures from 6,870 participants identified four glucose trajectories over the decade before diagnosis. A subgroup showed a late accelerating rise rather than gradual drift. Classes differed in baseline adiposity but not in reported sleep or activity.',
    keywords: ['glucose', 'trajectory analysis', 'type 2 diabetes', 'latent class'],
    refs: ['sleep-duration-and-cardiometabolic-outcomes-cohort', 'measurement-error-self-reported-activity'],
  },
  {
    id: 'cytokine-signatures-early-sepsis',
    title: 'Cytokine Signatures in the First 24 Hours of Sepsis: A Multiplex Profiling Study',
    authors: ['leif-haugen'],
    year: 2015,
    field: 'medicine',
    venue: IR,
    abstract:
      'Serial plasma samples from 212 intensive-care admissions were profiled for 38 cytokines. Unsupervised clustering separated an early hyperinflammatory pattern from a suppressed-response pattern, and the two differed in the timing of interleukin-10 and interleukin-6 peaks. The signatures describe mechanism, not prognosis.',
    keywords: ['sepsis', 'cytokines', 'multiplex assay', 'innate immunity'],
    refs: [],
  },
  {
    id: 'sleep-regularity-and-glycaemic-variability',
    title: 'Sleep Regularity and Glycaemic Variability: Evidence from Continuous Monitoring in a Nested Cohort',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2016,
    field: 'medicine',
    venue: CR,
    abstract:
      'In 1,104 cohort members wearing continuous glucose monitors and actigraphy for 14 days, day-to-day variability in sleep timing was associated with greater glycaemic variability independent of mean sleep duration. The association was strongest on days following a shift in sleep midpoint of more than 90 minutes.',
    keywords: ['sleep regularity', 'glycaemic variability', 'actigraphy', 'continuous monitoring'],
    refs: ['sleep-duration-and-cardiometabolic-outcomes-cohort', 'measurement-error-self-reported-activity', 'fasting-glucose-trajectories-prospective-cohort'],
  },
  {
    id: 'mendelian-randomisation-sleep-traits',
    title: 'Mendelian Randomisation of Sleep Traits and Metabolic Markers',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2017,
    field: 'medicine',
    venue: CR,
    abstract:
      'Genetic instruments for sleep duration and chronotype were used to test causal effects on metabolic markers in two-sample designs. Estimates supported a small effect of chronotype on insulin-related traits, while evidence for duration was weak. Pleiotropy-robust methods gave consistent direction but wider intervals.',
    keywords: ['Mendelian randomisation', 'sleep', 'chronotype', 'causal inference', 'metabolic markers'],
    refs: [
      'sleep-duration-and-cardiometabolic-outcomes-cohort',
      'measurement-error-self-reported-activity',
      'fasting-glucose-trajectories-prospective-cohort',
      'sleep-regularity-and-glycaemic-variability',
    ],
  },
  {
    id: 't-cell-exhaustion-in-chronic-infection',
    title: 'Transcriptional Programs of T-Cell Exhaustion in Chronic Viral Infection',
    authors: ['leif-haugen'],
    year: 2018,
    field: 'medicine',
    venue: IR,
    abstract:
      'Sorted CD8 T-cell subsets from chronically infected donors were profiled by bulk and single-cell sequencing. We resolve a progenitor-like population that retains proliferative capacity and a terminally differentiated population defined by sustained inhibitory receptor expression, and map the transcription factors that separate them.',
    keywords: ['T cells', 'exhaustion', 'chronic infection', 'single-cell sequencing'],
    refs: ['cytokine-signatures-early-sepsis'],
  },
  {
    id: 'cohort-retention-and-selection-bias',
    title: 'Cohort Retention and Selection Bias in Long-Running Population Studies',
    authors: ['rafael-ortuno'],
    year: 2019,
    field: 'medicine',
    venue: CR,
    abstract:
      'Loss to follow-up in prospective cohorts is rarely random. Using inverse-probability weighting with linked administrative records, we show how attrition altered exposure-outcome associations in a 20-year cohort and propose reporting conventions for retention.',
    keywords: ['attrition', 'selection bias', 'inverse-probability weighting', 'cohort study'],
    refs: [
      'sleep-duration-and-cardiometabolic-outcomes-cohort',
      'measurement-error-self-reported-activity',
      'fasting-glucose-trajectories-prospective-cohort',
      'sleep-regularity-and-glycaemic-variability',
      'mendelian-randomisation-sleep-traits',
    ],
  },
  {
    id: 'sleep-inflammation-mediation-analysis',
    title: 'Inflammatory Markers as Mediators Between Sleep Timing and Glycaemic Outcomes',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2020,
    field: 'medicine',
    venue: CR,
    abstract:
      'Causal mediation analysis in 3,950 participants with repeated blood draws estimated that C-reactive protein and interleukin-6 jointly mediated about a fifth of the association between irregular sleep timing and glycaemic outcomes. We report sensitivity analyses for unmeasured mediator-outcome confounding.',
    keywords: ['mediation analysis', 'inflammation', 'sleep timing', 'glycaemic outcomes'],
    refs: [
      'sleep-duration-and-cardiometabolic-outcomes-cohort',
      'measurement-error-self-reported-activity',
      'fasting-glucose-trajectories-prospective-cohort',
      'sleep-regularity-and-glycaemic-variability',
      'mendelian-randomisation-sleep-traits',
      'cohort-retention-and-selection-bias',
    ],
  },
  {
    id: 'single-cell-profiling-vaccine-responses',
    title: 'Single-Cell Profiling of B-Cell Responses to Repeated Vaccination',
    authors: ['nadia-karimova', 'leif-haugen'],
    year: 2021,
    field: 'medicine',
    venue: IR,
    abstract:
      'Paired single-cell transcriptome and receptor sequencing from 64 volunteers followed antigen-specific B-cell clones across three immunisations. Clonal expansion was concentrated in a small number of lineages, and somatic hypermutation rose between the second and third doses without further gain in affinity.',
    keywords: ['B cells', 'vaccination', 'single-cell sequencing', 'clonal expansion'],
    refs: ['cytokine-signatures-early-sepsis', 't-cell-exhaustion-in-chronic-infection'],
  },
  {
    id: 'wearable-sleep-regularity-cluster-trial',
    title: 'A Cluster-Randomised Trial of Wearable-Derived Sleep Regularity Feedback: Twelve-Month Outcomes',
    authors: ['rafael-ortuno', 'sunita-bhattacharya'],
    year: 2022,
    field: 'medicine',
    venue: CR,
    abstract:
      'Forty workplaces were randomised to wearable sleep-timing feedback or usual measurement only. The primary outcome was change in sleep-timing variability at 12 months; secondary outcomes included glycaemic variability. Sleep-timing variability fell modestly in the intervention arm, with no detectable difference in secondary outcomes at the trial size achieved.',
    keywords: ['cluster-randomised trial', 'sleep regularity', 'wearables', 'primary outcome'],
    refs: [
      'sleep-duration-and-cardiometabolic-outcomes-cohort',
      'measurement-error-self-reported-activity',
      'fasting-glucose-trajectories-prospective-cohort',
      'sleep-regularity-and-glycaemic-variability',
      'mendelian-randomisation-sleep-traits',
      'sleep-inflammation-mediation-analysis',
      'unsupervised-sleep-spindle-detection',
    ],
  },
  {
    id: 'durable-immune-memory-after-infection',
    title: 'Durable Immune Memory After Infection: A Three-Year Follow-up of Antigen-Specific T Cells',
    authors: ['nadia-karimova', 'leif-haugen', 'wanjiru-kamau'],
    year: 2024,
    field: 'medicine',
    venue: IR,
    abstract:
      'Antigen-specific T cells were tracked for three years in 147 convalescent participants. Memory populations contracted over the first year and then stabilised, and clonal composition at six months predicted the later repertoire. Sequence-based clonotype tracking was cross-checked against a bacterial reporter assay of antigen uptake.',
    keywords: ['immune memory', 'T cells', 'longitudinal study', 'clonotype tracking'],
    refs: [
      'cytokine-signatures-early-sepsis',
      't-cell-exhaustion-in-chronic-infection',
      'single-cell-profiling-vaccine-responses',
      'mendelian-randomisation-sleep-traits',
    ],
  },
  {
    id: 'evening-play-sessions-and-sleep-timing',
    title: 'Late-Evening Play Sessions and Sleep Timing in Adolescents: A Registry-Linked Cohort',
    authors: ['rafael-ortuno', 'amara-okonkwo-eze'],
    year: 2025,
    field: 'medicine',
    venue: CR,
    abstract:
      'Opt-in session logs from a multiplayer game were linked to wearable sleep records for 2,310 adolescents. Sessions ending after 23:00 were associated with a later next-day sleep midpoint, with a dose-response over session length. Using closed-loop timing estimates from neural recordings as a framework, we separate arousal effects from schedule effects.',
    keywords: ['adolescents', 'gameplay', 'sleep timing', 'registry linkage', 'cohort study'],
    refs: [
      'sleep-duration-and-cardiometabolic-outcomes-cohort',
      'measurement-error-self-reported-activity',
      'fasting-glucose-trajectories-prospective-cohort',
      'sleep-regularity-and-glycaemic-variability',
      'mendelian-randomisation-sleep-traits',
      'cohort-retention-and-selection-bias',
      'sleep-inflammation-mediation-analysis',
      'wearable-sleep-regularity-cluster-trial',
      'closed-loop-stimulation-timing',
      'unsupervised-sleep-spindle-detection',
    ],
  },
  {
    id: 'immune-sleep-coupling-vaccine-response',
    title: 'Sleep Architecture and Antibody Kinetics After Vaccination: A Prospective Mechanistic Study',
    authors: ['nadia-karimova', 'leif-haugen'],
    year: 2026,
    field: 'medicine',
    venue: IR,
    abstract:
      'In 96 volunteers, spindle density from overnight EEG in the week after vaccination was related to antibody kinetics and B-cell clonal expansion. Higher spindle density preceded faster early expansion, an association that held after adjustment for age and baseline titre. We discuss candidate mechanisms through thalamocortical timing, without claims of benefit.',
    keywords: ['sleep', 'vaccination', 'antibody kinetics', 'sleep spindles', 'mechanism'],
    refs: [
      'single-cell-profiling-vaccine-responses',
      'wearable-sleep-regularity-cluster-trial',
      'mendelian-randomisation-sleep-traits',
      'closed-loop-stimulation-timing',
      'unsupervised-sleep-spindle-detection',
    ],
  },

  // ───────────────────────── Neuroscience ─────────────────────────
  {
    id: 'gamma-synchrony-and-attentional-selection',
    title: 'Gamma-Band Synchrony and Attentional Selection in Visual Cortex',
    authors: ['tomasz-wisniewski'],
    year: 2011,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'Local field potentials were recorded across visual areas while subjects attended to one of two competing stimuli. Attended stimuli evoked stronger gamma-band coherence between areas, and the coherence difference preceded behavioural advantage by tens of milliseconds. We argue that selection is implemented through changes in communication efficacy.',
    keywords: ['attention', 'gamma oscillations', 'visual cortex', 'synchrony'],
    refs: [],
  },
  {
    id: 'pupil-linked-arousal-and-perceptual-thresholds',
    title: 'Pupil-Linked Arousal Shifts Perceptual Thresholds in a Detection Task',
    authors: ['tomasz-wisniewski'],
    year: 2012,
    field: 'neuroscience',
    venue: CN,
    abstract:
      'Pupil diameter was used as a proxy for locus-coeruleus-linked arousal during a near-threshold detection task. Detection sensitivity followed an inverted-U with arousal, and the optimal point moved with task difficulty. The relationship was stable across sessions within individuals.',
    keywords: ['arousal', 'pupillometry', 'perception', 'detection thresholds'],
    refs: ['gamma-synchrony-and-attentional-selection'],
  },
  {
    id: 'reward-prediction-error-and-skill-acquisition',
    title: 'Reward Prediction Error Signals During Motor Skill Acquisition',
    authors: ['amara-okonkwo-eze', 'tomasz-wisniewski'],
    year: 2013,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'Learners practised a sequence task with graded performance feedback while we recorded frontal midline activity. Feedback-locked responses scaled with signed prediction error early in practice and flattened as performance plateaued, consistent with a learning rate that decays with expertise.',
    keywords: ['reward prediction error', 'skill learning', 'feedback', 'EEG'],
    refs: ['gamma-synchrony-and-attentional-selection', 'pupil-linked-arousal-and-perceptual-thresholds'],
  },
  {
    id: 'prefrontal-oscillations-under-working-memory-load',
    title: 'Prefrontal Oscillations Under Increasing Working-Memory Load',
    authors: ['tomasz-wisniewski', 'amara-okonkwo-eze'],
    year: 2014,
    field: 'neuroscience',
    venue: CN,
    abstract:
      'Theta-gamma coupling in prefrontal cortex increased with the number of items held in working memory up to individual capacity and then declined. Coupling strength at moderate load predicted performance at high load, suggesting a limit on how many items a single theta cycle can carry.',
    keywords: ['working memory', 'theta-gamma coupling', 'prefrontal cortex', 'capacity'],
    refs: ['gamma-synchrony-and-attentional-selection', 'reward-prediction-error-and-skill-acquisition'],
  },
  {
    id: 'sleep-consolidation-of-motor-sequences',
    title: 'Sleep-Dependent Consolidation of Motor Sequences: A Behavioural and EEG Study',
    authors: ['amara-okonkwo-eze'],
    year: 2015,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'Participants learned a finger-tapping sequence and were retested after a night of sleep or an equivalent period awake. Overnight gains correlated with fast-spindle density over motor cortex, and the correlation was specific to the learned sequence. Habitual sleep duration, taken from a prospective cohort, did not predict gain.',
    keywords: ['memory consolidation', 'sleep spindles', 'motor learning', 'EEG'],
    refs: ['pupil-linked-arousal-and-perceptual-thresholds', 'reward-prediction-error-and-skill-acquisition', 'sleep-duration-and-cardiometabolic-outcomes-cohort'],
  },
  {
    id: 'state-space-inference-sparse-spike-trains',
    title: 'State-Space Inference for Sparse Spike Trains with Latent Dynamics',
    authors: ['sora-nakagawa'],
    year: 2016,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'We introduce a state-space model for neural populations in which most units fire rarely, and derive a variational inference scheme whose cost scales linearly with recording length. On simulated and recorded data the method recovers latent trajectories from spike counts an order of magnitude lower than competing approaches.',
    keywords: ['state-space model', 'spike trains', 'variational inference', 'latent dynamics', 'neural data analysis'],
    refs: [],
  },
  {
    id: 'music-training-and-auditory-attention',
    title: 'Music Training and the Selection of Auditory Streams in Noise',
    authors: ['amara-okonkwo-eze', 'tomasz-wisniewski'],
    year: 2017,
    field: 'neuroscience',
    venue: CN,
    abstract:
      'Adults with at least eight years of instrumental training and matched controls attended to one of two simultaneous speech streams while EEG tracked cortical entrainment. Trained listeners showed stronger entrainment to the attended stream and faster suppression of the ignored one. Years of practice, not age of onset, predicted the effect.',
    keywords: ['music training', 'auditory attention', 'cortical entrainment', 'plasticity'],
    refs: ['reward-prediction-error-and-skill-acquisition', 'prefrontal-oscillations-under-working-memory-load'],
  },
  {
    id: 'population-dynamics-low-dimensional-manifolds',
    title: 'Population Dynamics Evolve on Low-Dimensional Manifolds Across Behavioural States',
    authors: ['sora-nakagawa'],
    year: 2018,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'Across 11 recording sessions, population activity during behaviour was confined to a manifold of fewer than ten dimensions, with the same geometry across states of differing arousal. Deviations from the manifold marked transitions between states and were recovered by the inference method introduced earlier.',
    keywords: ['neural manifolds', 'population dynamics', 'dimensionality', 'state transitions'],
    refs: ['state-space-inference-sparse-spike-trains'],
  },
  {
    id: 'attentional-capture-during-feed-scrolling-eeg',
    title: 'Attentional Capture and Disengagement During Feed Scrolling: An EEG Study',
    authors: ['tomasz-wisniewski', 'amara-okonkwo-eze'],
    year: 2019,
    field: 'neuroscience',
    venue: CN,
    abstract:
      'Participants scrolled a simulated social feed while EEG was recorded. Items with high social salience evoked a larger attention-related positivity, and disengagement from them took longer than from neutral items, with effects weakening over the session. We relate the time course to arousal-dependent thresholds and to auditory selection results.',
    keywords: ['attention', 'social feed', 'EEG', 'disengagement', 'salience'],
    refs: [
      'gamma-synchrony-and-attentional-selection',
      'pupil-linked-arousal-and-perceptual-thresholds',
      'prefrontal-oscillations-under-working-memory-load',
      'music-training-and-auditory-attention',
    ],
  },
  {
    id: 'closed-loop-stimulation-timing',
    title: 'Closed-Loop Stimulation Timed to Ongoing Oscillation Phase: A Model and Test',
    authors: ['sora-nakagawa'],
    year: 2020,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'We derive the optimal delay for phase-locked stimulation under realistic latency and signal-to-noise constraints, and show that estimation error dominates the response beyond a few hundred milliseconds. In an animal preparation, stimulation timed to the predicted phase produced twice the entrainment of open-loop delivery.',
    keywords: ['closed-loop stimulation', 'oscillation phase', 'control theory', 'entrainment'],
    refs: ['state-space-inference-sparse-spike-trains', 'population-dynamics-low-dimensional-manifolds'],
  },
  {
    id: 'unsupervised-sleep-spindle-detection',
    title: 'Unsupervised Detection of Sleep Spindles in Low-Density Wearable EEG',
    authors: ['sora-nakagawa'],
    year: 2022,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'Spindle detection usually relies on expert labels and dense montages. We present an unsupervised detector for two-channel headband recordings based on latent state inference, validated against expert scoring in 180 nights. Agreement approached inter-rater agreement, and performance held across devices.',
    keywords: ['sleep spindles', 'EEG', 'unsupervised learning', 'wearables', 'signal detection'],
    refs: ['state-space-inference-sparse-spike-trains', 'sleep-consolidation-of-motor-sequences'],
  },
  {
    id: 'cross-modal-prediction-errors-rhythm-game-learning',
    title: 'Cross-Modal Prediction Errors During Learning of a Rhythm Game',
    authors: ['elif-demirtas', 'amara-okonkwo-eze'],
    year: 2023,
    field: 'neuroscience',
    venue: CN,
    abstract:
      'Novices learned a rhythm game in which visual cues predicted auditory beats. Mismatch responses to violated cue-beat pairings emerged within two sessions and were larger in participants with prior music training. Learning curves were best fit by a model with separate visual and auditory precision terms.',
    keywords: ['prediction error', 'rhythm', 'cross-modal learning', 'games', 'EEG'],
    refs: ['reward-prediction-error-and-skill-acquisition', 'music-training-and-auditory-attention', 'attentional-capture-during-feed-scrolling-eeg'],
  },
  {
    id: 'sustained-attention-lapses-in-long-play',
    title: 'Sustained-Attention Lapses Across Long Play Sessions: Pupil and EEG Markers',
    authors: ['elif-demirtas', 'tomasz-wisniewski'],
    year: 2025,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'During sessions of up to three hours, lapses of attention were preceded by a drop in pupil-linked arousal and a rise in frontal theta. A lapse predictor built on the two markers reached an area under the curve of 0.81 on held-out participants. Evening sessions showed earlier onset of lapses, in line with registry-linked sleep timing.',
    keywords: ['sustained attention', 'lapses', 'pupillometry', 'EEG', 'games'],
    refs: [
      'attentional-capture-during-feed-scrolling-eeg',
      'cross-modal-prediction-errors-rhythm-game-learning',
      'evening-play-sessions-and-sleep-timing',
    ],
  },
  {
    id: 'geometry-of-learning-related-plasticity',
    title: 'The Geometry of Learning-Related Plasticity in Cortical Populations',
    authors: ['elif-demirtas', 'sora-nakagawa'],
    year: 2026,
    field: 'neuroscience',
    venue: NS,
    abstract:
      'We track population manifolds across weeks of skill learning and find that plasticity rotates the manifold within a stable subspace rather than expanding it. The rotation rate tracks learning speed and matches a fitness-landscape-inference view of synaptic change, estimated with methods developed for protein evolution.',
    keywords: ['plasticity', 'neural manifolds', 'learning', 'population geometry'],
    refs: [
      'population-dynamics-low-dimensional-manifolds',
      'cross-modal-prediction-errors-rhythm-game-learning',
      'landscape-inference-deep-mutational-scanning',
    ],
  },
];
