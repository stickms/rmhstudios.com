/**
 * RMH Research — the physical sciences division: physics, chemistry,
 * astronomy and the earth sciences. Fictional authors, papers and venues.
 */
import type { Author, Paper } from '../types';

export const PHYSICAL_AUTHORS: readonly Author[] = [
  // Physics
  { id: 'aarav-venkataraman', name: 'Aarav Venkataraman', field: 'physics', role: 'Principal Investigator', lab: 'Condensed Matter Lab', since: 2009 },
  { id: 'ingrid-solheim', name: 'Ingrid Solheim', field: 'physics', role: 'Senior Scientist', lab: 'Condensed Matter Lab', since: 2013 },
  { id: 'kofi-mensah-boateng', name: 'Kofi Mensah-Boateng', field: 'physics', role: 'Staff Scientist', lab: 'Thermal Systems Group', since: 2013 },
  { id: 'mei-ling-zhou', name: 'Mei-Ling Zhou', field: 'physics', role: 'Postdoctoral Fellow', lab: 'Thermal Systems Group', since: 2022 },
  // Chemistry
  { id: 'oluwaseun-adeyemi', name: 'Oluwaseun Adeyemi', field: 'chemistry', role: 'Principal Investigator', lab: 'Catalysis Lab', since: 2010 },
  { id: 'camila-restrepo', name: 'Camila Restrepo', field: 'chemistry', role: 'Senior Scientist', lab: 'Catalysis Lab', since: 2014 },
  { id: 'dmitri-volkonsky', name: 'Dmitri Volkonsky', field: 'chemistry', role: 'Research Fellow', lab: 'Materials Synthesis Group', since: 2018 },
  { id: 'anahita-farahmand', name: 'Anahita Farahmand', field: 'chemistry', role: 'Postdoctoral Fellow', lab: 'Materials Synthesis Group', since: 2023 },
  // Astronomy
  { id: 'tomasz-wrobel', name: 'Tomasz Wrobel', field: 'astronomy', role: 'Principal Investigator', lab: 'Deep Field Survey', since: 2008 },
  { id: 'priya-raghunathan', name: 'Priya Raghunathan', field: 'astronomy', role: 'Senior Scientist', lab: 'Deep Field Survey', since: 2012 },
  { id: 'halvard-eik', name: 'Halvard Eik', field: 'astronomy', role: 'Staff Scientist', lab: 'Stellar Dynamics Group', since: 2015 },
  { id: 'nalani-kekoa', name: 'Nalani Kekoa', field: 'astronomy', role: 'Postdoctoral Fellow', lab: 'Stellar Dynamics Group', since: 2024 },
  // Earth
  { id: 'lucia-ferrante', name: 'Lucia Ferrante', field: 'earth', role: 'Principal Investigator', lab: 'Climate Systems Lab', since: 2011 },
  { id: 'baraka-mwangi', name: 'Baraka Mwangi', field: 'earth', role: 'Senior Scientist', lab: 'Climate Systems Lab', since: 2015 },
  { id: 'soo-jin-han', name: 'Soo-jin Han', field: 'earth', role: 'Research Fellow', lab: 'Solid Earth Group', since: 2019 },
  { id: 'emre-karadeniz', name: 'Emre Karadeniz', field: 'earth', role: 'Staff Scientist', lab: 'Solid Earth Group', since: 2017 },
];

const PR = 'RMH Physical Review';
const JTP = 'RMH Journal of Thermal Physics';
const JC = 'RMH Journal of Catalysis';
const MC = 'RMH Materials Chemistry';
const AJ = 'RMH Astrophysical Journal';
const SS = 'RMH Survey Series';
const JES = 'RMH Journal of Earth Systems';
const GL = 'RMH Geophysical Letters';

export const PHYSICAL_PAPERS: readonly Paper[] = [
  // ───────────── Physics ─────────────
  {
    id: 'spin-glass-aging-kagome-films',
    title: 'Aging and Memory in Spin-Glass Films on a Kagome Substrate',
    authors: ['aarav-venkataraman', 'ingrid-solheim'],
    year: 2011,
    field: 'physics',
    venue: PR,
    abstract:
      'We measure the thermoremanent magnetisation of thin spin-glass films grown on a kagome-patterned substrate and find a relaxation that ages logarithmically over four decades in waiting time. Geometric frustration shifts the effective freezing temperature by 18 percent relative to an unpatterned control. A droplet picture with a lattice-dependent length scale reproduces both the aging exponent and the memory dip.',
    keywords: ['spin glass', 'aging', 'frustration', 'kagome lattice', 'thin films'],
    refs: [],
  },
  {
    id: 'edge-mode-localization-disordered-chains',
    title: 'Edge-Mode Localization in Disordered Topological Chains',
    authors: ['aarav-venkataraman'],
    year: 2012,
    field: 'physics',
    venue: PR,
    abstract:
      'We study how on-site disorder erodes the protected edge states of a one-dimensional topological chain. The edge-mode localisation length stays finite up to a disorder strength set by the bulk gap, beyond which the mode hybridises with a localised bulk state. Exact diagonalisation on chains of up to 2,000 sites confirms the scaling.',
    keywords: ['topological chains', 'disorder', 'edge states', 'localisation'],
    refs: ['spin-glass-aging-kagome-films'],
  },
  {
    id: 'critical-scaling-layered-nickelate',
    title: 'Quantum Critical Scaling in a Layered Nickelate Analogue',
    authors: ['ingrid-solheim'],
    year: 2013,
    field: 'physics',
    venue: PR,
    abstract:
      'Resistivity and specific heat of a layered nickelate analogue collapse onto a single scaling function near a pressure-tuned quantum critical point. The extracted dynamical exponent is close to 1.5, inconsistent with the simplest itinerant spin-density-wave theory. We discuss the role of interlayer coupling in setting the crossover.',
    keywords: ['quantum criticality', 'nickelate', 'scaling', 'resistivity'],
    refs: [],
  },
  {
    id: 'boiling-heat-flux-microstructured-copper',
    title: 'Nucleate Boiling Heat Flux on Micro-Structured Copper Surfaces',
    authors: ['kofi-mensah-boateng'],
    year: 2014,
    field: 'physics',
    venue: JTP,
    abstract:
      'We characterise pool boiling of a dielectric fluid on copper surfaces patterned with micro-pillar arrays of varying pitch. Critical heat flux rises by up to 70 percent over a smooth surface, and the gain collapses onto a single curve once the pillar pitch is scaled by the capillary length. A hydrodynamic model of vapour escape paths explains the optimum.',
    keywords: ['boiling', 'critical heat flux', 'micro-structured surfaces', 'dielectric fluids', 'heat transfer'],
    refs: [],
  },
  {
    id: 'many-body-localization-driven-lattice',
    title: 'Many-Body Localization Transition in a Driven Lattice',
    authors: ['aarav-venkataraman', 'ingrid-solheim'],
    year: 2015,
    field: 'physics',
    venue: PR,
    abstract:
      'We locate the many-body localisation transition in a periodically driven interacting lattice using level-spacing statistics and entanglement growth. Drive frequency acts as a second control parameter, and the critical disorder moves non-monotonically with it. The phase boundary is consistent with a resonance-counting argument.',
    keywords: ['many-body localization', 'Floquet', 'entanglement', 'disorder', 'driven systems'],
    refs: ['spin-glass-aging-kagome-films', 'edge-mode-localization-disordered-chains'],
  },
  {
    id: 'two-phase-immersion-cooling-transport',
    title: 'Two-Phase Immersion Cooling of Dense Compute Racks: A Transport Model',
    authors: ['kofi-mensah-boateng'],
    year: 2017,
    field: 'physics',
    venue: JTP,
    abstract:
      'We derive a reduced transport model for two-phase immersion cooling of racks dissipating over 80 kW. The model couples bubble departure, vapour channelling between boards and condenser capacity, and predicts the onset of dry-out within 6 percent of bench measurements. It gives a rack-level design rule for board pitch as a function of power density.',
    keywords: ['immersion cooling', 'two-phase flow', 'dry-out', 'data centres', 'transport model'],
    refs: ['boiling-heat-flux-microstructured-copper'],
  },
  {
    id: 'thermal-hall-kagome-magnets',
    title: 'Thermal Hall Response of Kagome Magnets',
    authors: ['ingrid-solheim'],
    year: 2019,
    field: 'physics',
    venue: PR,
    abstract:
      'We report a large thermal Hall conductivity in an insulating kagome magnet that persists well above the ordering temperature. The signal exceeds the phonon estimate by an order of magnitude and tracks the field-induced canting angle. We propose a magnon-edge-current mechanism arising from the lattice geometry.',
    keywords: ['thermal Hall effect', 'kagome magnet', 'magnons', 'heat transport'],
    refs: ['spin-glass-aging-kagome-films', 'many-body-localization-driven-lattice'],
  },
  {
    id: 'floquet-prethermalization-lifetimes',
    title: 'Floquet Prethermalization Lifetimes Beyond Linear Response',
    authors: ['aarav-venkataraman'],
    year: 2020,
    field: 'physics',
    venue: PR,
    abstract:
      'The heating time of a periodically driven many-body system grows exponentially with drive frequency, but the prefactor has resisted calculation. We obtain it for a family of spin chains by resumming the high-frequency expansion past linear response. The lifetime predictions agree with numerics at drive amplitudes where earlier bounds are vacuous.',
    keywords: ['Floquet', 'prethermalization', 'heating', 'spin chains'],
    refs: ['many-body-localization-driven-lattice', 'edge-mode-localization-disordered-chains', 'thermal-hall-kagome-magnets'],
  },
  {
    id: 'microchannel-flow-boiling-instability',
    title: 'Microchannel Flow Boiling Instability Thresholds',
    authors: ['kofi-mensah-boateng'],
    year: 2021,
    field: 'physics',
    venue: JTP,
    abstract:
      'Parallel microchannels under flow boiling develop pressure-drop oscillations that couple to the supply loop. We map the stability boundary in the plane of heat flux and inlet subcooling and show that a modest inlet restriction suppresses the oscillation without a measurable pumping penalty. The thresholds collapse under a single dimensionless group.',
    keywords: ['flow boiling', 'microchannels', 'two-phase instability', 'pressure drop', 'cold plates'],
    refs: ['boiling-heat-flux-microstructured-copper', 'two-phase-immersion-cooling-transport'],
  },
  {
    id: 'graphene-copper-laminate-cold-plates',
    title: 'Heat Spreading in Graphene-Copper Laminates for Server Cold Plates',
    authors: ['mei-ling-zhou'],
    year: 2023,
    field: 'physics',
    venue: JTP,
    abstract:
      'Graphene-copper laminates spread heat anisotropically, and we show how to exploit this in cold plates over processors with strongly non-uniform dissipation. A conduction model with interfacial resistance predicts peak junction temperature to within 1.5 K. A 40 percent reduction in hot-spot temperature rise is obtained with a 12 percent mass penalty.',
    keywords: ['graphene', 'heat spreading', 'cold plates', 'thermal interface resistance', 'hot spots'],
    refs: ['boiling-heat-flux-microstructured-copper', 'two-phase-immersion-cooling-transport', 'microchannel-flow-boiling-instability'],
  },
  {
    id: 'dissipative-time-crystal-cavity-arrays',
    title: 'Dissipative Time Crystals in Coupled Cavity Arrays',
    authors: ['ingrid-solheim', 'aarav-venkataraman'],
    year: 2024,
    field: 'physics',
    venue: PR,
    abstract:
      'We show that a lattice of coupled driven-dissipative cavities supports a persistent subharmonic response that survives a finite density of defects. Mean-field theory predicts the phase boundary, and a quantum trajectory simulation confirms robustness against single-photon loss. We outline a realisation in superconducting resonators.',
    keywords: ['time crystal', 'driven-dissipative systems', 'cavity arrays', 'Floquet'],
    refs: ['floquet-prethermalization-lifetimes', 'many-body-localization-driven-lattice', 'thermal-hall-kagome-magnets'],
  },
  {
    id: 'coolant-maldistribution-transient-load',
    title: 'Coolant Maldistribution in Parallel Cold Plates under Transient Load',
    authors: ['mei-ling-zhou'],
    year: 2025,
    field: 'physics',
    venue: JTP,
    abstract:
      'When many cold plates share a manifold, a sudden load step redistributes flow in ways that steady-state design ignores. We derive a lumped-parameter model of the manifold-plate network and validate it against a 48-plate test loop. Flow to the most heavily loaded plate lags its heat demand by up to nine seconds, and a feed-forward valve schedule removes the lag.',
    keywords: ['liquid cooling', 'manifold flow', 'transient response', 'cold plates', 'control'],
    refs: ['microchannel-flow-boiling-instability', 'graphene-copper-laminate-cold-plates', 'two-phase-immersion-cooling-transport', 'boiling-heat-flux-microstructured-copper'],
  },
  {
    id: 'spinon-heat-transport-kagome-liquid',
    title: 'Spinon Heat Transport in a Kagome Quantum Spin Liquid Candidate',
    authors: ['ingrid-solheim'],
    year: 2026,
    field: 'physics',
    venue: PR,
    abstract:
      'We measure the low-temperature thermal conductivity of a kagome quantum spin liquid candidate down to 40 mK and find a residual linear term consistent with itinerant gapless excitations. The magnitude is sensitive to sample disorder in a way not seen in the thermal Hall channel. We discuss implications for the spinon Fermi-surface scenario.',
    keywords: ['quantum spin liquid', 'kagome lattice', 'thermal conductivity', 'spinons'],
    refs: ['thermal-hall-kagome-magnets', 'spin-glass-aging-kagome-films', 'dissipative-time-crystal-cavity-arrays', 'floquet-prethermalization-lifetimes', 'edge-mode-localization-disordered-chains'],
  },

  // ───────────── Chemistry ─────────────
  {
    id: 'single-atom-palladium-ceria-co-oxidation',
    title: 'Single-Atom Palladium Sites on Ceria for Low-Temperature CO Oxidation',
    authors: ['oluwaseun-adeyemi'],
    year: 2011,
    field: 'chemistry',
    venue: JC,
    abstract:
      'Atomically dispersed palladium anchored on ceria nanocubes oxidises carbon monoxide at temperatures 80 K lower than nanoparticle analogues. Aberration-corrected microscopy and X-ray absorption spectroscopy identify a square-planar Pd-O4 site as the active species. Turnover frequency is stable over 200 hours on stream.',
    keywords: ['single-atom catalysis', 'palladium', 'ceria', 'CO oxidation', 'XAS'],
    refs: [],
  },
  {
    id: 'ceria-oxygen-spillover-support-reducibility',
    title: 'Support Reducibility and Oxygen Spillover in Ceria Catalysts',
    authors: ['oluwaseun-adeyemi'],
    year: 2012,
    field: 'chemistry',
    venue: JC,
    abstract:
      'We correlate the reducibility of doped ceria supports with the rate of oxygen spillover to supported metal sites. Isotopic exchange shows that spillover, not surface reaction, limits conversion below 400 K. A simple descriptor based on the vacancy formation energy ranks twelve dopants correctly.',
    keywords: ['ceria', 'oxygen spillover', 'reducibility', 'isotopic exchange', 'doping'],
    refs: ['single-atom-palladium-ceria-co-oxidation'],
  },
  {
    id: 'operando-raman-methanol-synthesis-catalysts',
    title: 'Operando Raman Spectroscopy of Copper-Zinc Methanol Synthesis Catalysts',
    authors: ['camila-restrepo'],
    year: 2014,
    field: 'chemistry',
    venue: JC,
    abstract:
      'Operando Raman spectroscopy resolves the evolution of surface carbonate and formate species on copper-zinc catalysts under methanol synthesis conditions. Formate coverage rises reversibly with pressure and follows the activity, while carbonate accumulation marks deactivation. We propose a regeneration protocol that restores 90 percent of initial activity.',
    keywords: ['operando spectroscopy', 'methanol synthesis', 'copper-zinc catalysts', 'deactivation'],
    refs: ['single-atom-palladium-ceria-co-oxidation'],
  },
  {
    id: 'alloy-adsorption-energy-descriptors',
    title: 'Machine-Learned Descriptors for Alloy Surface Adsorption Energies',
    authors: ['oluwaseun-adeyemi', 'camila-restrepo'],
    year: 2015,
    field: 'chemistry',
    venue: JC,
    abstract:
      'We train a compact regression model on 4,200 density-functional adsorption energies across binary alloy surfaces. Local coordination and electronegativity differences suffice to predict adsorption energies of oxygen and CO to within 0.12 eV. The model screens a candidate space of 30,000 surfaces in minutes.',
    keywords: ['adsorption energy', 'alloys', 'machine learning', 'density functional theory', 'catalyst screening'],
    refs: ['single-atom-palladium-ceria-co-oxidation', 'ceria-oxygen-spillover-support-reducibility', 'operando-raman-methanol-synthesis-catalysts'],
  },
  {
    id: 'nitrate-reduction-cobalt-phosphide',
    title: 'Electrochemical Nitrate Reduction on Cobalt Phosphide',
    authors: ['camila-restrepo'],
    year: 2016,
    field: 'chemistry',
    venue: JC,
    abstract:
      'Cobalt phosphide electrodes reduce nitrate to ammonia with a Faradaic efficiency of 82 percent at moderate overpotential. Phosphorus leaching limits electrode lifetime to roughly 60 hours. We identify the leaching pathway by post-mortem spectroscopy.',
    keywords: ['electrocatalysis', 'nitrate reduction', 'cobalt phosphide', 'ammonia'],
    refs: ['operando-raman-methanol-synthesis-catalysts'],
  },
  {
    id: 'zirconium-mof-phase-pure-synthesis',
    title: 'Solvothermal Routes to Phase-Pure Zirconium Metal-Organic Frameworks',
    authors: ['dmitri-volkonsky'],
    year: 2018,
    field: 'chemistry',
    venue: MC,
    abstract:
      'Zirconium metal-organic frameworks are often obtained as mixtures of competing topologies. We show that modulator concentration and water content jointly select the product phase, and give a synthesis map that yields phase-pure material across five linkers. Gram-scale batches reproduce the surface area of milligram preparations.',
    keywords: ['metal-organic frameworks', 'zirconium', 'solvothermal synthesis', 'modulators', 'phase purity'],
    refs: [],
  },
  {
    id: 'defect-engineering-zirconium-frameworks',
    title: 'Defect Engineering and Water Stability in Zirconium Frameworks',
    authors: ['dmitri-volkonsky'],
    year: 2019,
    field: 'chemistry',
    venue: MC,
    abstract:
      'Missing-linker defects tune both porosity and hydrolytic stability in zirconium frameworks, but the two respond in opposite directions. We quantify the trade-off by combining titration, thermogravimetry and repeated water adsorption cycles. An intermediate defect density retains 94 percent of capacity after 500 cycles.',
    keywords: ['defect engineering', 'metal-organic frameworks', 'water stability', 'adsorption'],
    refs: ['zirconium-mof-phase-pure-synthesis'],
  },
  {
    id: 'hydrogen-spillover-doped-oxides',
    title: 'Hydrogen Spillover Kinetics on Platinum-Doped Oxides',
    authors: ['oluwaseun-adeyemi', 'camila-restrepo'],
    year: 2020,
    field: 'chemistry',
    venue: JC,
    abstract:
      'We measure hydrogen spillover from platinum sites onto reducible oxide supports by inelastic neutron scattering and isotope transients. Spillover is activated, with a barrier that depends on the support hydroxyl density rather than on the metal loading. The kinetic model accounts for the unusual pressure dependence of hydrogenation rates.',
    keywords: ['hydrogen spillover', 'platinum', 'oxide supports', 'kinetics', 'neutron scattering'],
    refs: ['ceria-oxygen-spillover-support-reducibility', 'alloy-adsorption-energy-descriptors', 'single-atom-palladium-ceria-co-oxidation'],
  },
  {
    id: 'framework-hosted-ammonia-cracking',
    title: 'Framework-Hosted Single-Atom Catalysts for Ammonia Cracking',
    authors: ['dmitri-volkonsky', 'camila-restrepo'],
    year: 2021,
    field: 'chemistry',
    venue: JC,
    abstract:
      'Ruthenium atoms stabilised inside a zirconium framework crack ammonia at 350 degrees Celsius with no sintering over 500 hours. The framework nodes provide a basic environment that facilitates nitrogen recombination, the rate-limiting step. Compared with supported nanoparticles, hydrogen yield per ruthenium atom is four times higher.',
    keywords: ['ammonia cracking', 'single-atom catalysis', 'metal-organic frameworks', 'hydrogen carriers', 'ruthenium'],
    refs: ['defect-engineering-zirconium-frameworks', 'single-atom-palladium-ceria-co-oxidation', 'alloy-adsorption-energy-descriptors'],
  },
  {
    id: 'sulfide-electrolyte-interphase-growth',
    title: 'Interphase Growth at Sulfide Solid Electrolyte Interfaces',
    authors: ['anahita-farahmand'],
    year: 2023,
    field: 'chemistry',
    venue: MC,
    abstract:
      'Sulfide solid electrolytes decompose at lithium interfaces, and the resulting interphase can either passivate or choke the cell. Using depth-resolved photoelectron spectroscopy we follow interphase thickness over 1,000 cycles and show growth follows a diffusion-limited law with a sharply temperature-dependent coefficient. Controlled doping slows growth by a factor of three.',
    keywords: ['solid electrolytes', 'interphase', 'lithium', 'photoelectron spectroscopy', 'batteries'],
    refs: ['defect-engineering-zirconium-frameworks'],
  },
  {
    id: 'fluorinated-ether-dielectric-coolants',
    title: 'Non-Flammable Dielectric Coolants from Fluorinated Ethers',
    authors: ['anahita-farahmand', 'mei-ling-zhou'],
    year: 2024,
    field: 'chemistry',
    venue: MC,
    abstract:
      'We synthesise a family of partially fluorinated ethers with boiling points tuned between 45 and 70 degrees Celsius for two-phase immersion cooling. The best candidate combines a latent heat of 110 kJ per kilogram, no measurable flash point and low global warming potential. Heat transfer on structured copper surfaces matches that of established coolants.',
    keywords: ['dielectric coolants', 'fluorinated ethers', 'immersion cooling', 'heat transfer', 'synthesis'],
    refs: ['zirconium-mof-phase-pure-synthesis', 'defect-engineering-zirconium-frameworks', 'boiling-heat-flux-microstructured-copper', 'two-phase-immersion-cooling-transport'],
  },
  {
    id: 'coolant-degradation-thermal-cycling',
    title: 'Coolant Degradation Under Repeated Thermal Cycling in Immersion Systems',
    authors: ['anahita-farahmand'],
    year: 2025,
    field: 'chemistry',
    venue: MC,
    abstract:
      'Immersion coolants experience thousands of boil-condense cycles over a service life. We track acidity, dissolved fluoride and dielectric strength of a fluorinated ether coolant through 20,000 accelerated cycles and find that trace water drives the degradation. A molecular-sieve loop holds fluoride below the corrosion threshold.',
    keywords: ['coolant degradation', 'thermal cycling', 'immersion cooling', 'fluoride', 'dielectric strength'],
    refs: ['fluorinated-ether-dielectric-coolants', 'two-phase-immersion-cooling-transport', 'microchannel-flow-boiling-instability', 'defect-engineering-zirconium-frameworks', 'operando-raman-methanol-synthesis-catalysts'],
  },
  {
    id: 'plasma-assisted-ammonia-ruthenium',
    title: 'Plasma-Assisted Ammonia Synthesis over Dispersed Ruthenium',
    authors: ['camila-restrepo'],
    year: 2026,
    field: 'chemistry',
    venue: JC,
    abstract:
      'A dielectric barrier discharge combined with a dispersed ruthenium catalyst synthesises ammonia at near-ambient pressure. Vibrationally excited nitrogen lowers the dissociation barrier, and the catalyst converts the resulting surface nitrogen at rates that exceed thermal catalysis at the same bulk temperature. Energy cost per mole is competitive at the pilot scale studied.',
    keywords: ['plasma catalysis', 'ammonia synthesis', 'ruthenium', 'vibrational excitation'],
    refs: ['framework-hosted-ammonia-cracking', 'hydrogen-spillover-doped-oxides', 'single-atom-palladium-ceria-co-oxidation', 'ceria-oxygen-spillover-support-reducibility', 'zirconium-mof-phase-pure-synthesis', 'defect-engineering-zirconium-frameworks'],
  },

  // ───────────── Astronomy ─────────────
  {
    id: 'deep-field-survey-photometric-catalogue',
    title: 'The Deep Field Survey: Design and First Photometric Catalogue',
    authors: ['tomasz-wrobel'],
    year: 2012,
    field: 'astronomy',
    venue: SS,
    abstract:
      'We describe the design of the Deep Field Survey and present its first photometric catalogue: 214,000 sources over 1.4 square degrees in eight bands to a 5-sigma depth of 27.1 in the reddest filter. Completeness and purity are quantified by injection tests. The catalogue is the base for the survey series.',
    keywords: ['galaxy survey', 'photometry', 'deep field', 'catalogue', 'completeness'],
    refs: [],
  },
  {
    id: 'photometric-redshifts-faint-galaxies',
    title: 'Photometric Redshifts for Faint Galaxies in the Deep Field',
    authors: ['tomasz-wrobel'],
    year: 2013,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We derive photometric redshifts for the faint end of the Deep Field catalogue with a template-fitting method that marginalises over dust and emission lines. Against 3,100 spectroscopic redshifts the scatter is 0.04 in (1+z) with an outlier fraction of 6 percent. We show the dominant failure mode is a Lyman-break confusion at z near 2.',
    keywords: ['photometric redshifts', 'faint galaxies', 'template fitting', 'deep field'],
    refs: ['deep-field-survey-photometric-catalogue'],
  },
  {
    id: 'faint-end-luminosity-function-z2',
    title: 'The Faint-End Slope of the Galaxy Luminosity Function at z ~ 2',
    authors: ['tomasz-wrobel', 'priya-raghunathan'],
    year: 2014,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'Using the Deep Field catalogue we fit the rest-frame ultraviolet luminosity function at z near 2 and find a faint-end slope of -1.74, steeper than at lower redshift. Surface-brightness incompleteness is modelled explicitly and does not remove the steepening. The result implies a large contribution of faint galaxies to the ionising background.',
    keywords: ['luminosity function', 'galaxy evolution', 'high redshift', 'ultraviolet'],
    refs: ['deep-field-survey-photometric-catalogue', 'photometric-redshifts-faint-galaxies'],
  },
  {
    id: 'morphological-evolution-star-forming-galaxies',
    title: 'Morphological Evolution of Star-Forming Galaxies Across Cosmic Time',
    authors: ['tomasz-wrobel', 'priya-raghunathan'],
    year: 2016,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We classify 38,000 star-forming galaxies by Sersic index and clumpiness from the Deep Field imaging. The fraction of clumpy discs peaks near z of 2 and declines steadily to the present. Clump masses are consistent with violent disc instability rather than minor mergers.',
    keywords: ['galaxy morphology', 'star formation', 'clumpy discs', 'cosmic evolution'],
    refs: ['photometric-redshifts-faint-galaxies', 'faint-end-luminosity-function-z2', 'deep-field-survey-photometric-catalogue'],
  },
  {
    id: 'tidal-stream-dispersion-halos',
    title: 'Tidal Stream Dispersion in Cold Dark Matter Halos',
    authors: ['halvard-eik'],
    year: 2016,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We follow stellar streams from disrupting globular clusters in cosmological zoom-in halos and measure how the velocity dispersion along the stream grows with time. Triaxiality and a time-dependent potential broaden streams more than subhalo encounters do. We give a baseline dispersion model against which gaps can be judged.',
    keywords: ['stellar streams', 'dark matter halos', 'tidal disruption', 'N-body simulation'],
    refs: [],
  },
  {
    id: 'photometric-redshift-spectroscopic-priors',
    title: 'Photometric Redshift Calibration with Spectroscopic Priors',
    authors: ['tomasz-wrobel'],
    year: 2017,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We introduce a calibration of photometric-redshift probability distributions using sparse spectroscopic subsamples as priors. The calibrated distributions are well-calibrated in the probability-integral-transform sense across magnitude bins. The method reduces the bias in the mean redshift of a tomographic bin from 0.03 to 0.005.',
    keywords: ['photometric redshifts', 'calibration', 'tomography', 'priors'],
    refs: ['photometric-redshifts-faint-galaxies', 'faint-end-luminosity-function-z2', 'morphological-evolution-star-forming-galaxies'],
  },
  {
    id: 'dust-attenuation-cosmic-noon',
    title: 'Dust Attenuation Curves at Cosmic Noon',
    authors: ['tomasz-wrobel', 'priya-raghunathan'],
    year: 2018,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We derive dust attenuation curves for 12,000 galaxies at 1.5 < z < 2.5 by stacking spectral energy distributions in bins of stellar mass. The curves are shallower than the local starburst law and show a weak 2175-angstrom bump that strengthens with metallicity proxy. Applying the curves lowers inferred star-formation rates by 25 percent.',
    keywords: ['dust attenuation', 'cosmic noon', 'SED fitting', 'star formation rate'],
    refs: ['faint-end-luminosity-function-z2', 'morphological-evolution-star-forming-galaxies', 'photometric-redshift-spectroscopic-priors', 'deep-field-survey-photometric-catalogue'],
  },
  {
    id: 'deep-field-survey-second-release',
    title: 'Second Data Release of the Deep Field Survey',
    authors: ['tomasz-wrobel'],
    year: 2019,
    field: 'astronomy',
    venue: SS,
    abstract:
      'We present the second release of the Deep Field Survey: 610,000 sources over 3.8 square degrees with improved astrometry, recalibrated photometry and photometric redshifts from the spectroscopically calibrated pipeline. The release adds morphological parameters and attenuation-corrected star-formation rates.',
    keywords: ['galaxy survey', 'data release', 'photometry', 'deep field'],
    refs: ['deep-field-survey-photometric-catalogue', 'faint-end-luminosity-function-z2', 'morphological-evolution-star-forming-galaxies', 'photometric-redshift-spectroscopic-priors', 'dust-attenuation-cosmic-noon'],
  },
  {
    id: 'wide-binary-subhalo-scattering',
    title: 'Gravitational Scattering of Wide Binaries by Dark Subhalos',
    authors: ['halvard-eik'],
    year: 2019,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'Wide stellar binaries are fragile and can be unbound by passing massive objects. We compute the survival of wide binaries in a population of dark subhalos and show that the observed separation distribution constrains subhalo masses above 10^5 solar masses. A first limit is derived from a catalogue of 11,000 wide pairs.',
    keywords: ['wide binaries', 'dark matter subhalos', 'gravitational scattering', 'constraints'],
    refs: ['tidal-stream-dispersion-halos'],
  },
  {
    id: 'hierarchical-sed-fitting-priors',
    title: 'Spectral Energy Distribution Fitting with Hierarchical Priors',
    authors: ['priya-raghunathan'],
    year: 2020,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We fit galaxy spectral energy distributions with a hierarchical Bayesian model in which population-level priors on star-formation history are learned from the data. Stellar-mass uncertainties shrink by a third relative to flat priors without introducing bias, as tested on mock catalogues. The method scales to millions of galaxies.',
    keywords: ['SED fitting', 'hierarchical Bayesian', 'stellar mass', 'star formation history'],
    refs: ['deep-field-survey-photometric-catalogue', 'photometric-redshifts-faint-galaxies'],
  },
  {
    id: 'stellar-mass-function-evolution',
    title: 'Stellar Mass Function Evolution from the Second Release',
    authors: ['tomasz-wrobel', 'priya-raghunathan'],
    year: 2021,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We measure the galaxy stellar mass function from z of 0.2 to 3 using the second Deep Field release. The knee mass rises by 0.4 dex over this interval and the low-mass slope steepens with redshift. Quiescent galaxies dominate the high-mass end only below z of 1.5.',
    keywords: ['stellar mass function', 'galaxy evolution', 'quiescent galaxies', 'deep field'],
    refs: ['deep-field-survey-second-release', 'faint-end-luminosity-function-z2', 'dust-attenuation-cosmic-noon', 'morphological-evolution-star-forming-galaxies'],
  },
  {
    id: 'thermal-drift-infrared-detector-mosaics',
    title: 'Thermal Drift in Large-Format Infrared Detector Mosaics',
    authors: ['priya-raghunathan'],
    year: 2022,
    field: 'astronomy',
    venue: SS,
    abstract:
      'Millikelvin drifts in the focal-plane temperature produce systematic offsets in large infrared detector mosaics. We model the thermal path from the cryocooler to each detector and show the drift is dominated by conduction through the mounting structure. Boiling-based thermal buffers are shown to be a viable mitigation.',
    keywords: ['infrared detectors', 'cryogenics', 'thermal stability', 'instrumentation'],
    refs: ['boiling-heat-flux-microstructured-copper', 'deep-field-survey-second-release'],
  },
  {
    id: 'stream-gaps-dark-subhalos',
    title: 'Stream Gaps as Probes of Dark Subhalos',
    authors: ['nalani-kekoa'],
    year: 2025,
    field: 'astronomy',
    venue: AJ,
    abstract:
      'We develop a likelihood for gap statistics in cold stellar streams that accounts for baseline dispersion, selection and epicyclic overdensities. Applied to six streams it favours a subhalo mass function with a low-mass cutoff near 10^6 solar masses. The inference is robust to the stream progenitor model.',
    keywords: ['stellar streams', 'dark matter', 'subhalos', 'gaps', 'inference'],
    refs: ['tidal-stream-dispersion-halos', 'wide-binary-subhalo-scattering'],
  },

  // ───────────── Earth ─────────────
  {
    id: 'downscaling-convective-rainfall-terrain',
    title: 'Statistical Downscaling of Convective Rainfall over Complex Terrain',
    authors: ['lucia-ferrante'],
    year: 2011,
    field: 'earth',
    venue: JES,
    abstract:
      'We present a stochastic downscaling scheme that maps coarse reanalysis fields to hourly convective rainfall over mountainous terrain. Orographic triggers are represented through a terrain-dependent initiation probability. The scheme reproduces the observed intensity-duration-frequency curves at 28 of 31 gauge stations.',
    keywords: ['downscaling', 'convective rainfall', 'orography', 'stochastic models'],
    refs: [],
  },
  {
    id: 'soil-moisture-memory-heatwave-persistence',
    title: 'Soil Moisture Memory and Heatwave Persistence',
    authors: ['lucia-ferrante'],
    year: 2013,
    field: 'earth',
    venue: JES,
    abstract:
      'Dry soils amplify surface heating, but the length of this memory has been uncertain. Using a land-atmosphere coupled ensemble we show that a soil-moisture deficit in late spring extends the median heatwave by 2.3 days. The effect saturates once the root zone is depleted below a threshold fraction.',
    keywords: ['soil moisture', 'heatwaves', 'land-atmosphere coupling', 'persistence'],
    refs: ['downscaling-convective-rainfall-terrain'],
  },
  {
    id: 'aerosol-forcing-sahel-dust-belt',
    title: 'Aerosol Radiative Forcing over the Sahel Dust Belt',
    authors: ['baraka-mwangi'],
    year: 2015,
    field: 'earth',
    venue: GL,
    abstract:
      'We combine ground-based radiometry with satellite retrievals to estimate the direct radiative forcing of mineral dust across the Sahel. The seasonal-mean surface forcing is -22 watts per square metre, with a strong dependence on the assumed iron-oxide content. The error budget is dominated by the single-scattering albedo.',
    keywords: ['aerosols', 'radiative forcing', 'mineral dust', 'Sahel', 'remote sensing'],
    refs: [],
  },
  {
    id: 'wet-bulb-extremes-subtropical-cities',
    title: 'Wet-Bulb Temperature Extremes in Humid Subtropical Cities',
    authors: ['lucia-ferrante', 'baraka-mwangi'],
    year: 2016,
    field: 'earth',
    venue: JES,
    abstract:
      'We analyse hourly wet-bulb temperature in 40 humid subtropical cities and find that annual extremes have risen by 0.6 degrees Celsius per decade, faster than dry-bulb extremes. Urban form modifies the extremes by up to 1.5 degrees. The record implies a shrinking margin for evaporative cooling systems.',
    keywords: ['wet-bulb temperature', 'urban climate', 'humid heat', 'extremes'],
    refs: ['downscaling-convective-rainfall-terrain', 'soil-moisture-memory-heatwave-persistence', 'aerosol-forcing-sahel-dust-belt'],
  },
  {
    id: 'slow-slip-recurrence-subduction',
    title: 'Slow Slip Recurrence on a Locked Subduction Interface',
    authors: ['emre-karadeniz'],
    year: 2017,
    field: 'earth',
    venue: GL,
    abstract:
      'A decade of continuous GNSS records resolves 14 slow slip events on the deep extension of a locked subduction interface. Recurrence intervals are quasi-periodic at 14 months with a coefficient of variation of 0.12. A rate-and-state model with a conditionally stable patch reproduces the timing and the migration speed.',
    keywords: ['slow slip', 'subduction', 'GNSS', 'rate-and-state friction'],
    refs: [],
  },
  {
    id: 'fault-fluid-pressure-aftershock-decay',
    title: 'Fault-Zone Fluid Pressure and Aftershock Decay',
    authors: ['emre-karadeniz'],
    year: 2018,
    field: 'earth',
    venue: GL,
    abstract:
      'Aftershock sequences decay more slowly where pore-fluid pressure is elevated. We estimate pressure from seismic velocity ratios for ten sequences and show that the Omori decay exponent falls from 1.1 to 0.8 with increasing pressure. A diffusion model of pressure relaxation explains the relation.',
    keywords: ['aftershocks', 'pore pressure', 'Omori law', 'seismicity'],
    refs: ['slow-slip-recurrence-subduction'],
  },
  {
    id: 'cooling-water-demand-basin-projections',
    title: 'Cooling Water Demand Under Warming: Basin-Scale Withdrawal Projections',
    authors: ['baraka-mwangi'],
    year: 2019,
    field: 'earth',
    venue: JES,
    abstract:
      'We project industrial cooling water withdrawal for 60 river basins under four warming scenarios using a model that couples wet-bulb temperature, plant type and water allocation rules. Withdrawals rise by 18 to 41 percent by 2050 for evaporative systems. Closed-loop and immersion alternatives reduce the exposure substantially.',
    keywords: ['cooling water', 'water demand', 'river basins', 'climate scenarios', 'industrial cooling'],
    refs: ['wet-bulb-extremes-subtropical-cities', 'soil-moisture-memory-heatwave-persistence', 'boiling-heat-flux-microstructured-copper'],
  },
  {
    id: 'permafrost-active-layer-interferometry',
    title: 'Permafrost Active-Layer Thickening from Satellite Interferometry',
    authors: ['soo-jin-han'],
    year: 2020,
    field: 'earth',
    venue: GL,
    abstract:
      'We estimate seasonal thaw subsidence across 120,000 square kilometres of Arctic lowland from interferometric radar and infer active-layer thickening of 0.9 centimetres per year. Ice-rich terrain subsides up to five times faster than the regional mean. Results agree with 38 borehole records.',
    keywords: ['permafrost', 'InSAR', 'active layer', 'Arctic', 'ground subsidence'],
    refs: ['soil-moisture-memory-heatwave-persistence'],
  },
  {
    id: 'compound-heat-drought-reanalysis',
    title: 'Compound Heat and Drought Events in Reanalysis Ensembles',
    authors: ['lucia-ferrante', 'soo-jin-han'],
    year: 2021,
    field: 'earth',
    venue: JES,
    abstract:
      'Compound heat and drought events are more frequent than independence would imply. In a five-reanalysis ensemble the co-occurrence rate is 1.8 times the independent expectation over mid-latitude land, and it is rising. Soil-moisture feedback accounts for roughly two thirds of the excess.',
    keywords: ['compound events', 'heat', 'drought', 'reanalysis', 'climate extremes'],
    refs: ['wet-bulb-extremes-subtropical-cities', 'soil-moisture-memory-heatwave-persistence', 'permafrost-active-layer-interferometry'],
  },
  {
    id: 'ground-motion-attenuation-basins',
    title: 'Ground-Motion Attenuation in Sedimentary Basins',
    authors: ['emre-karadeniz', 'soo-jin-han'],
    year: 2022,
    field: 'earth',
    venue: GL,
    abstract:
      'We calibrate a ground-motion model for sedimentary basins using 2,600 records from 41 earthquakes. Basin depth modifies long-period amplitudes by up to a factor of three, with a clear edge-generated surface wave effect. The model reduces the between-event residual standard deviation by 15 percent.',
    keywords: ['ground motion', 'sedimentary basins', 'seismic hazard', 'attenuation'],
    refs: ['slow-slip-recurrence-subduction', 'fault-fluid-pressure-aftershock-decay'],
  },
  {
    id: 'siting-thermal-loads-climate-risk',
    title: 'Siting Large Thermal Loads Against Regional Climate Risk',
    authors: ['baraka-mwangi'],
    year: 2023,
    field: 'earth',
    venue: JES,
    abstract:
      'Large facilities that reject megawatts of heat are exposed to the regional climate for decades. We build a siting framework that scores locations on projected wet-bulb extremes, water availability and seismic hazard, and apply it to 220 candidate sites. Liquid and immersion cooling shift the preferred sites toward hotter, drier regions that would be ruled out under evaporative cooling.',
    keywords: ['siting', 'climate risk', 'thermal loads', 'data centres', 'wet-bulb temperature'],
    refs: ['cooling-water-demand-basin-projections', 'wet-bulb-extremes-subtropical-cities', 'compound-heat-drought-reanalysis', 'two-phase-immersion-cooling-transport'],
  },
  {
    id: 'waste-heat-reuse-district-networks',
    title: 'Waste Heat Reuse from Liquid-Cooled Facilities in District Networks',
    authors: ['soo-jin-han', 'mei-ling-zhou'],
    year: 2024,
    field: 'earth',
    venue: JES,
    abstract:
      'Liquid cooling returns heat at 50 to 60 degrees Celsius, high enough to feed low-temperature district networks without heat pumps. We model supply and demand matching for 14 cities and find that a single 20 MW facility can cover the winter heating load of up to 9,000 homes. Seasonal mismatch is the binding constraint, not temperature.',
    keywords: ['waste heat', 'district heating', 'liquid cooling', 'energy systems'],
    refs: ['siting-thermal-loads-climate-risk', 'cooling-water-demand-basin-projections', 'two-phase-immersion-cooling-transport'],
  },
  {
    id: 'free-cooling-hours-humid-heat-regimes',
    title: 'Free-Cooling Hours Under Shifting Humid-Heat Regimes',
    authors: ['soo-jin-han'],
    year: 2025,
    field: 'earth',
    venue: GL,
    abstract:
      'We project the annual number of hours in which outside air or water can reject facility heat without mechanical chilling, for 220 sites to 2060. Humid-heat extremes erode free-cooling hours faster than mean warming suggests, and fluids with higher operating temperatures preserve most of the margin. Coolant stability under thermal cycling is a limiting factor in the warmest regimes.',
    keywords: ['free cooling', 'humid heat', 'climate projections', 'facility siting', 'coolants'],
    refs: ['siting-thermal-loads-climate-risk', 'wet-bulb-extremes-subtropical-cities', 'waste-heat-reuse-district-networks', 'fluorinated-ether-dielectric-coolants', 'coolant-degradation-thermal-cycling', 'cooling-water-demand-basin-projections', 'two-phase-immersion-cooling-transport', 'microchannel-flow-boiling-instability'],
  },
];
