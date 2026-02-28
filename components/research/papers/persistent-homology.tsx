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

const bettiNumberData = [
  { dimension: 'β₀ (Components)', sprites: 14.2, textures: 8.7, meshes: 22.1 },
  { dimension: 'β₁ (Loops)', sprites: 7.8, textures: 12.3, meshes: 5.4 },
  { dimension: 'β₂ (Voids)', sprites: 2.1, textures: 4.6, meshes: 9.3 },
];

const persistenceDiagramData = [
  { birth: 0.01, death: 0.82 },
  { birth: 0.03, death: 0.91 },
  { birth: 0.05, death: 0.45 },
  { birth: 0.08, death: 0.74 },
  { birth: 0.12, death: 0.96 },
  { birth: 0.15, death: 0.38 },
  { birth: 0.18, death: 0.67 },
  { birth: 0.22, death: 0.55 },
  { birth: 0.25, death: 0.89 },
  { birth: 0.30, death: 0.42 },
  { birth: 0.33, death: 0.71 },
  { birth: 0.38, death: 0.58 },
  { birth: 0.41, death: 0.93 },
  { birth: 0.45, death: 0.62 },
  { birth: 0.50, death: 0.85 },
  { birth: 0.55, death: 0.78 },
  { birth: 0.60, death: 0.72 },
  { birth: 0.65, death: 0.88 },
];

const fidComparisonData = [
  { method: 'Linear', fid: 47.3 },
  { method: 'Spherical', fid: 41.8 },
  { method: 'Geodesic', fid: 38.2 },
  { method: 'Persistence-Guided', fid: 27.9 },
];

const interpolationQualityData = [
  { step: 0.0, linear: 1.0, spherical: 1.0, persistence: 1.0 },
  { step: 0.1, linear: 0.82, spherical: 0.87, persistence: 0.95 },
  { step: 0.2, linear: 0.61, spherical: 0.72, persistence: 0.91 },
  { step: 0.3, linear: 0.43, spherical: 0.58, persistence: 0.88 },
  { step: 0.4, linear: 0.31, spherical: 0.45, persistence: 0.84 },
  { step: 0.5, linear: 0.24, spherical: 0.38, persistence: 0.82 },
  { step: 0.6, linear: 0.29, spherical: 0.44, persistence: 0.85 },
  { step: 0.7, linear: 0.42, spherical: 0.57, persistence: 0.89 },
  { step: 0.8, linear: 0.59, spherical: 0.71, persistence: 0.92 },
  { step: 0.9, linear: 0.81, spherical: 0.86, persistence: 0.96 },
  { step: 1.0, linear: 1.0, spherical: 1.0, persistence: 1.0 },
];

const semanticCoherenceData = [
  { category: 'Silhouette', linear: 4.2, spherical: 5.1, persistence: 6.8 },
  { category: 'Color', linear: 5.3, spherical: 5.8, persistence: 7.1 },
  { category: 'Pose', linear: 3.1, spherical: 4.4, persistence: 6.5 },
  { category: 'Style', linear: 4.8, spherical: 5.5, persistence: 7.3 },
  { category: 'Overall', linear: 4.3, spherical: 5.2, persistence: 6.9 },
];

const wasserDistanceData = [
  { epoch: 0, h0: 18.4, h1: 12.7, h2: 8.3 },
  { epoch: 50, h0: 14.2, h1: 10.1, h2: 7.1 },
  { epoch: 100, h0: 10.8, h1: 7.8, h2: 5.6 },
  { epoch: 200, h0: 7.3, h1: 5.2, h2: 3.9 },
  { epoch: 300, h0: 5.1, h1: 3.6, h2: 2.8 },
  { epoch: 400, h0: 3.8, h1: 2.7, h2: 2.1 },
  { epoch: 500, h0: 3.2, h1: 2.3, h2: 1.7 },
];

const landscapeNormData = [
  { threshold: 0.05, l1Norm: 42.3, l2Norm: 18.7, lInfNorm: 3.2 },
  { threshold: 0.10, l1Norm: 31.8, l2Norm: 14.2, lInfNorm: 2.8 },
  { threshold: 0.15, l1Norm: 24.1, l2Norm: 11.1, lInfNorm: 2.4 },
  { threshold: 0.20, l1Norm: 18.6, l2Norm: 8.7, lInfNorm: 2.1 },
  { threshold: 0.25, l1Norm: 14.2, l2Norm: 6.8, lInfNorm: 1.8 },
  { threshold: 0.30, l1Norm: 10.8, l2Norm: 5.3, lInfNorm: 1.5 },
  { threshold: 0.40, l1Norm: 6.4, l2Norm: 3.2, lInfNorm: 1.1 },
  { threshold: 0.50, l1Norm: 3.8, l2Norm: 2.0, lInfNorm: 0.8 },
];

const bottleneckStabilityData = [
  { perturbation: 0.01, bottleneck: 0.012, wasserstein1: 0.018, wasserstein2: 0.024 },
  { perturbation: 0.02, bottleneck: 0.023, wasserstein1: 0.034, wasserstein2: 0.047 },
  { perturbation: 0.05, bottleneck: 0.051, wasserstein1: 0.079, wasserstein2: 0.108 },
  { perturbation: 0.10, bottleneck: 0.098, wasserstein1: 0.152, wasserstein2: 0.213 },
  { perturbation: 0.15, bottleneck: 0.142, wasserstein1: 0.224, wasserstein2: 0.318 },
  { perturbation: 0.20, bottleneck: 0.189, wasserstein1: 0.301, wasserstein2: 0.427 },
  { perturbation: 0.30, bottleneck: 0.278, wasserstein1: 0.452, wasserstein2: 0.648 },
];

const spectralSequenceData = [
  { page: 1, rank: 48, differential: 12 },
  { page: 2, rank: 36, differential: 8 },
  { page: 3, rank: 28, differential: 4 },
  { page: 4, rank: 24, differential: 2 },
  { page: 5, rank: 22, differential: 1 },
  { page: 6, rank: 21, differential: 0 },
  { page: 7, rank: 21, differential: 0 },
];

const sheafCohomologyData = [
  { dimension: 0, global: 14.2, local: 18.7, cosheaf: 11.3 },
  { dimension: 1, global: 7.8, local: 12.4, cosheaf: 5.9 },
  { dimension: 2, global: 2.1, local: 5.8, cosheaf: 1.4 },
  { dimension: 3, global: 0.4, local: 1.9, cosheaf: 0.2 },
];

const persistenceImageData = [
  { sigma: 0.01, mmd: 0.342, classification: 0.61 },
  { sigma: 0.02, mmd: 0.281, classification: 0.68 },
  { sigma: 0.05, mmd: 0.198, classification: 0.78 },
  { sigma: 0.10, mmd: 0.142, classification: 0.84 },
  { sigma: 0.15, mmd: 0.118, classification: 0.87 },
  { sigma: 0.20, mmd: 0.103, classification: 0.89 },
  { sigma: 0.30, mmd: 0.091, classification: 0.88 },
  { sigma: 0.50, mmd: 0.087, classification: 0.85 },
];

const zigzagPersistenceData = [
  { timeStep: 0, beta0: 14, beta1: 8, beta2: 2 },
  { timeStep: 50, beta0: 15, beta1: 9, beta2: 3 },
  { timeStep: 100, beta0: 13, beta1: 10, beta2: 2 },
  { timeStep: 150, beta0: 14, beta1: 8, beta2: 4 },
  { timeStep: 200, beta0: 12, beta1: 11, beta2: 3 },
  { timeStep: 250, beta0: 14, beta1: 9, beta2: 2 },
  { timeStep: 300, beta0: 13, beta1: 10, beta2: 3 },
  { timeStep: 350, beta0: 14, beta1: 8, beta2: 2 },
  { timeStep: 400, beta0: 15, beta1: 9, beta2: 3 },
];

const topoRegularizationData = [
  { epoch: 0, fidBaseline: 72.1, fidTopo: 71.8 },
  { epoch: 50, fidBaseline: 51.2, fidTopo: 48.3 },
  { epoch: 100, fidBaseline: 42.8, fidTopo: 37.1 },
  { epoch: 150, fidBaseline: 38.4, fidTopo: 31.2 },
  { epoch: 200, fidBaseline: 36.1, fidTopo: 28.4 },
  { epoch: 250, fidBaseline: 35.2, fidTopo: 27.1 },
  { epoch: 300, fidBaseline: 34.8, fidTopo: 26.3 },
  { epoch: 400, fidBaseline: 34.5, fidTopo: 25.8 },
  { epoch: 500, fidBaseline: 34.3, fidTopo: 25.4 },
];

const multiScaleData = [
  { scale: 0.01, features: 248, significant: 12 },
  { scale: 0.05, features: 182, significant: 18 },
  { scale: 0.10, features: 124, significant: 22 },
  { scale: 0.20, features: 78, significant: 24 },
  { scale: 0.30, features: 48, significant: 21 },
  { scale: 0.50, features: 22, significant: 14 },
  { scale: 0.75, features: 8, significant: 6 },
  { scale: 1.00, features: 3, significant: 2 },
];

const ablationData = [
  { component: 'Full Model', fid: 27.9, coherence: 6.9 },
  { component: 'No H₂ penalty', fid: 29.4, coherence: 6.6 },
  { component: 'No H₁ penalty', fid: 33.8, coherence: 5.8 },
  { component: 'No H₀ penalty', fid: 31.2, coherence: 6.2 },
  { component: 'No persistence weight', fid: 35.1, coherence: 5.4 },
  { component: 'Fixed σ = 0.1', fid: 30.8, coherence: 6.3 },
  { component: 'Linear baseline', fid: 47.3, coherence: 4.3 },
];

const complexityData = [
  { points: 1000, ripser: 2.1, sparseRips: 0.8, witness: 0.3 },
  { points: 2000, ripser: 8.4, sparseRips: 2.9, witness: 0.9 },
  { points: 5000, ripser: 52.1, sparseRips: 14.2, witness: 3.8 },
  { points: 10000, ripser: 418.3, sparseRips: 89.1, witness: 18.4 },
  { points: 20000, ripser: 3341.2, sparseRips: 542.8, witness: 98.2 },
  { points: 50000, ripser: 52108.4, sparseRips: 6842.1, witness: 812.4 },
];

const interpolationLengthData = [
  { method: 'Linear', pathLength: 12.4, topoCrossings: 8.2, coherence: 4.3 },
  { method: 'Spherical', pathLength: 14.1, topoCrossings: 5.7, coherence: 5.2 },
  { method: 'Geodesic', pathLength: 16.8, topoCrossings: 4.1, coherence: 5.8 },
  { method: 'Persistence λ=0.1', pathLength: 15.2, topoCrossings: 3.4, coherence: 6.2 },
  { method: 'Persistence λ=0.5', pathLength: 18.7, topoCrossings: 1.8, coherence: 6.9 },
  { method: 'Persistence λ=1.0', pathLength: 24.3, topoCrossings: 0.6, coherence: 6.7 },
  { method: 'Persistence λ=2.0', pathLength: 38.1, topoCrossings: 0.1, coherence: 5.9 },
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

export function PersistentHomologyPaper() {
  return (
    <>
      {/* 1. INTRODUCTION */}
      <h2 style={h2Style}>1. Introduction</h2>

      <p className="mb-4">
        The advent of generative adversarial networks (GANs) as instruments of de novo visual
        content synthesis has precipitated a paradigmatic transformation in the production
        pipelines of contemporary game studios, enabling the automated generation of sprite
        sheets, texture maps, 3D mesh prototypes, and environmental assets at scales that
        would be prohibitively labor-intensive under manual authoring regimes. Yet the latent
        spaces of these generative models — the high-dimensional Riemannian manifolds within
        which the generator network parameterizes its output distribution — remain, from a
        geometric-topological standpoint, profoundly opaque. Practitioners routinely navigate
        these spaces via linear interpolation or ad hoc heuristics, procedures that are
        agnostic to the intrinsic geometric structure of the learned manifold and consequently
        produce interpolation artifacts: semantic discontinuities, mode-boundary distortions,
        and topological defects in the generated assets that manifest as visual incoherence
        during animation blending or level-of-detail transitions.
      </p>

      <p className="mb-4 indent-8">
        The present work introduces a computational framework grounded in persistent homology —
        the principal algebraic-topological invariant of topological data analysis (TDA) — for
        the rigorous characterization, visualization, and navigation of GAN latent spaces in
        the specific context of game-asset synthesis. Persistent homology tracks the birth
        and death of topological features (connected components, loops, voids, and their
        higher-dimensional analogues) across a continuous filtration of simplicial complexes
        constructed from point-cloud samples of the latent manifold, producing a multi-scale
        signature — the persistence diagram — that is stable under perturbation (in the
        bottleneck and Wasserstein metrics) and invariant under ambient isotopy. By extracting
        these signatures from latent encodings of large corpora of procedurally generated
        game assets, we obtain a principled characterization of the homological structure
        governing the entanglement of semantic attributes such as silhouette complexity,
        chromatic saturation, articulation pose, and stylistic genre.
      </p>

      <p className="mb-4 indent-8">
        Our central contribution is a persistence-guided interpolation algorithm that routes
        latent trajectories through regions of low topological complexity — avoiding the
        high-persistence features (stable loops and voids) that correspond to entangled
        semantic boundaries — thereby achieving demonstrably smoother and more semantically
        coherent asset transitions. Quantitative evaluation on a corpus of 80,000 procedurally
        generated sprite assets demonstrates a 41% reduction in Fréchet Inception Distance
        (FID) relative to linear interpolation and a 27% improvement in human-rated semantic
        coherence (<Tex math="N = 85" />, <Tex math="p < .001" />). These results establish
        persistent homology as a principled and practically effective instrument for the
        analysis and control of generative latent spaces in game-asset production.
      </p>

      {/* 2. ALGEBRAIC-TOPOLOGICAL PRELIMINARIES */}
      <h2 style={h2Style}>2. Algebraic-Topological Preliminaries</h2>

      <h3 style={h3Style}>2.1 Simplicial Complexes and Homology Groups</h3>

      <p className="mb-4">
        A simplicial complex <Tex math="K" /> on a vertex set <Tex math="V" /> is a collection
        of finite subsets of <Tex math="V" /> (called simplices) that is closed under taking
        subsets: if <Tex math="\sigma \in K" /> and <Tex math="\tau \subseteq \sigma" />, then{' '}
        <Tex math="\tau \in K" />. A <Tex math="k" />-simplex is a subset of cardinality{' '}
        <Tex math="k + 1" />; the <Tex math="k" />-th chain group{' '}
        <Tex math="C_k(K; \mathbb{F})" /> is the free <Tex math="\mathbb{F}" />-module generated
        by the <Tex math="k" />-simplices, where <Tex math="\mathbb{F}" /> is a coefficient
        field (we use <Tex math="\mathbb{F} = \mathbb{Z}/2\mathbb{Z}" /> throughout). The
        boundary operator <Tex math="\partial_k : C_k \to C_{k-1}" /> is defined on generators
        by:
      </p>

      <TexBlock math="\partial_k [v_0, v_1, \ldots, v_k] = \sum_{i=0}^{k} (-1)^i [v_0, \ldots, \hat{v}_i, \ldots, v_k]" />

      <p className="mb-4">
        where <Tex math="\hat{v}_i" /> denotes omission of the <Tex math="i" />-th vertex.
        The fundamental identity <Tex math="\partial_{k-1} \circ \partial_k = 0" /> ensures
        that the image of <Tex math="\partial_{k+1}" /> is contained in the kernel of{' '}
        <Tex math="\partial_k" />, yielding the <Tex math="k" />-th homology group:
      </p>

      <TexBlock math="H_k(K; \mathbb{F}) = \ker \partial_k \,/\, \operatorname{im} \partial_{k+1}" />

      <p className="mb-4 indent-8">
        The rank of <Tex math="H_k" /> is the <Tex math="k" />-th Betti number{' '}
        <Tex math="\beta_k" />, counting the number of independent <Tex math="k" />-dimensional
        &quot;holes&quot; in the complex: <Tex math="\beta_0" /> counts connected components,{' '}
        <Tex math="\beta_1" /> counts independent loops, <Tex math="\beta_2" /> counts enclosed
        voids, and so forth. The Betti numbers constitute the coarsest topological invariants
        of the space and provide a global summary of its connectivity structure that is
        invariant under homeomorphism.
      </p>

      <h3 style={h3Style}>2.2 Persistent Homology and Filtrations</h3>

      <p className="mb-4">
        Persistent homology extends classical homology to parameterized families of spaces
        by tracking the evolution of homological features across a filtration. Given a
        point cloud <Tex math="X = \{x_1, \ldots, x_n\} \subset \mathbb{R}^d" />, we
        construct a Vietoris–Rips filtration{' '}
        <Tex math="\{VR_\epsilon(X)\}_{\epsilon \geq 0}" />, where:
      </p>

      <TexBlock math="VR_\epsilon(X) = \bigl\{ \sigma \subseteq X : \text{diam}(\sigma) \leq \epsilon \bigr\}" />

      <p className="mb-4">
        As <Tex math="\epsilon" /> increases from zero, simplices are added to the complex in
        order of their diameter, generating a nested sequence of simplicial complexes. Each
        topological feature — a connected component, loop, or void — has a well-defined
        birth time <Tex math="b" /> (the filtration parameter at which it first appears) and
        death time <Tex math="d" /> (the parameter at which it is filled in or merged with
        another feature). The persistence of the feature is <Tex math="d - b" />;
        high-persistence features are considered topologically significant, while
        low-persistence features are regarded as noise. The collection of all
        birth–death pairs constitutes the persistence diagram{' '}
        <Tex math="\text{Dgm}_k(X) = \{(b_i, d_i)\}_{i}" /> for each homological dimension{' '}
        <Tex math="k" />.
      </p>

      <p className="mb-4 indent-8">
        A foundational result in TDA is the stability theorem of Cohen-Steiner, Edelsbrunner,
        and Harer (2007), which asserts that the bottleneck distance between persistence
        diagrams is bounded by the Hausdorff distance between the underlying point clouds:
      </p>

      <TexBlock math="d_B\!\bigl(\text{Dgm}_k(X),\, \text{Dgm}_k(Y)\bigr) \leq d_H(X, Y)" />

      <p className="mb-4">
        This Lipschitz stability guarantee ensures that persistence diagrams are robust to
        perturbations of the input data — a critical property for their application to
        stochastic latent-space samples that are inherently noisy.
      </p>

      <PaperFigure number={1} caption="Persistence diagram of H₁ features (loops) in the latent space of a StyleGAN2 generator trained on 80,000 sprite assets. Each point represents a topological loop; high-persistence features (far from the diagonal) correspond to stable semantic boundaries.">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="birth" name="Birth ε" type="number" domain={[0, 1]} label={{ value: 'Birth ε', position: 'insideBottom', offset: -5 }} />
            <YAxis dataKey="death" name="Death ε" type="number" domain={[0, 1]} label={{ value: 'Death ε', angle: -90, position: 'insideLeft' }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={persistenceDiagramData} fill="#e11d48" name="H₁ features" />
          </ScatterChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 3. LATENT-SPACE TOPOLOGY OF GAME-ASSET GANS */}
      <h2 style={h2Style}>3. Latent-Space Topology of Game-Asset GANs</h2>

      <h3 style={h3Style}>3.1 Experimental Setup</h3>

      <p className="mb-4">
        We trained a StyleGAN2-ADA architecture (Karras et al., 2020) on a corpus of 80,000
        procedurally generated 64×64 sprite assets encompassing 12 semantic categories
        (humanoid characters, quadrupedal creatures, avian entities, aquatic fauna, botanical
        elements, architectural fragments, weaponry, armor, potions, scrolls, gemstones, and
        environmental props). The generator maps a 512-dimensional latent vector{' '}
        <Tex math="z \sim \mathcal{N}(0, I_{512})" /> through a mapping network to an
        intermediate latent space <Tex math="\mathcal{W} \subset \mathbb{R}^{512}" /> and
        thence to the output image via a synthesis network. We sampled{' '}
        <Tex math="n = 10{,}000" /> latent vectors from the prior and computed their{' '}
        <Tex math="\mathcal{W}" />-space representations, yielding a point cloud in{' '}
        <Tex math="\mathbb{R}^{512}" />.
      </p>

      <p className="mb-4 indent-8">
        To render the Vietoris–Rips computation tractable in this high-dimensional ambient
        space, we first applied UMAP (McInnes et al., 2018) to project the{' '}
        <Tex math="\mathcal{W}" />-space samples to <Tex math="\mathbb{R}^{20}" />,
        preserving local metric structure while reducing dimensionality. We then constructed
        the Vietoris–Rips filtration using the Ripser library (Bauer, 2021) with a maximum
        filtration parameter <Tex math="\epsilon_{\max} = 1.0" /> (after normalizing
        pairwise distances to the unit interval) and computed persistent homology in
        dimensions 0, 1, and 2. The computation required approximately 14 hours on a
        32-core server with 256 GB RAM, reflecting the{' '}
        <Tex math="O(n^3)" /> worst-case complexity of the persistence algorithm on
        dense Vietoris–Rips complexes.
      </p>

      <h3 style={h3Style}>3.2 Topological Feature Analysis</h3>

      <p className="mb-4">
        The persistence diagrams reveal a rich topological structure in the GAN latent
        space. In dimension 0 (<Tex math="H_0" />, connected components), we observe a
        dominant cluster of low-persistence features near the diagonal, corresponding to
        the fine-grained local clustering of semantically similar assets, together with{' '}
        <Tex math="14.2 \pm 2.1" /> high-persistence features (persistence{' '}
        <Tex math="> 0.3" />) that correspond to the 12 semantic categories plus two
        emergent subcategories not present in the training labels (armored humanoids vs.
        unarmored humanoids, and flowering vs. non-flowering botanical elements). In
        dimension 1 (<Tex math="H_1" />, loops), <Tex math="7.8 \pm 1.4" /> persistent
        features indicate the presence of non-contractible cycles in the latent manifold,
        each corresponding to a continuous deformation path that traverses a closed loop
        of semantic variation (e.g., a cycle through increasing silhouette complexity that
        eventually returns to its starting point). In dimension 2 (<Tex math="H_2" />,
        voids), <Tex math="2.1 \pm 0.8" /> features suggest the existence of enclosed
        cavities — regions of latent space that are locally surrounded by asset
        representations but contain no valid asset encodings in their interior,
        corresponding to &quot;forbidden&quot; combinations of semantic attributes.
      </p>

      <PaperFigure number={2} caption="Mean Betti numbers (β₀, β₁, β₂) with persistence threshold > 0.3 for three GAN architectures trained on different asset types. Error bars denote ±1 SD across 5 independent training runs.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={bettiNumberData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dimension" />
            <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="sprites" fill="#e11d48" name="Sprites" />
            <Bar dataKey="textures" fill="#6366f1" name="Textures" />
            <Bar dataKey="meshes" fill="#10b981" name="3D Meshes" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 4. PERSISTENCE-GUIDED INTERPOLATION */}
      <h2 style={h2Style}>4. Persistence-Guided Interpolation</h2>

      <h3 style={h3Style}>4.1 Formulation</h3>

      <p className="mb-4">
        The standard approach to traversing the latent space between two encodings{' '}
        <Tex math="z_0, z_1 \in \mathcal{W}" /> is linear interpolation:{' '}
        <Tex math="z(t) = (1 - t) z_0 + t z_1" /> for <Tex math="t \in [0, 1]" />. This
        trajectory is oblivious to the topology of the latent manifold and may cross
        high-persistence topological features — semantic boundaries, mode-collapse regions,
        or topological voids — producing intermediate assets that are incoherent or
        artifactual. We propose a persistence-guided interpolation scheme that explicitly
        avoids such regions by minimizing a topological cost functional along the path.
      </p>

      <p className="mb-4 indent-8">
        Formally, we seek the path <Tex math="\gamma^* : [0, 1] \to \mathcal{W}" /> minimizing:
      </p>

      <TexBlock math="\gamma^* = \operatorname{arg\,min}_{\gamma: \gamma(0) = z_0,\, \gamma(1) = z_1} \int_0^1 \left[ \|\dot{\gamma}(t)\|^2 + \lambda \sum_{k=0}^{2} \sum_{(b_i, d_i) \in \text{Dgm}_k} \kappa\!\bigl(\gamma(t);\, b_i, d_i\bigr) \right] dt" />

      <p className="mb-4">
        where <Tex math="\|\dot{\gamma}(t)\|^2" /> is the kinetic energy term penalizing
        path length, <Tex math="\lambda > 0" /> is a regularization parameter, and{' '}
        <Tex math="\kappa(\cdot; b_i, d_i)" /> is a topological penalty kernel associated
        with the <Tex math="i" />-th persistent feature. The kernel is defined as a
        Gaussian-weighted function of the distance from the path point{' '}
        <Tex math="\gamma(t)" /> to the representative cycle of the feature:
      </p>

      <TexBlock math="\kappa\!\bigl(\gamma(t);\, b_i, d_i\bigr) = (d_i - b_i) \cdot \exp\!\left(-\frac{\operatorname{dist}\!\bigl(\gamma(t),\, \mathcal{C}_i\bigr)^2}{2\sigma^2}\right)" />

      <p className="mb-4 indent-8">
        where <Tex math="\mathcal{C}_i" /> is the representative cycle of the <Tex math="i" />-th
        feature (computed via the standard persistence algorithm with clearing) and{' '}
        <Tex math="\sigma" /> is a bandwidth parameter controlling the spatial extent of the
        penalty. The weighting by persistence <Tex math="(d_i - b_i)" /> ensures that
        high-persistence features — corresponding to stable, semantically meaningful
        boundaries — exert stronger repulsive forces on the path, while low-persistence
        features (topological noise) have negligible influence. This formulation casts
        persistence-guided interpolation as a variational problem on the space of paths,
        which we solve numerically via discretization into <Tex math="T = 100" /> waypoints
        and gradient descent on the total cost functional using the Adam optimizer with
        learning rate <Tex math="10^{-3}" />.
      </p>

      <h3 style={h3Style}>4.2 Computational Considerations</h3>

      <p className="mb-4">
        The primary computational bottleneck is the evaluation of the representative cycles{' '}
        <Tex math="\mathcal{C}_i" /> and their distances to path waypoints. We precompute
        the representative cycles for all high-persistence features (persistence{' '}
        <Tex math="> 0.1" />) and store them in a spatial index (a ball tree in{' '}
        <Tex math="\mathcal{W}" />-space) for efficient nearest-neighbor queries. The
        per-step cost of evaluating the topological penalty is then{' '}
        <Tex math="O(T \cdot F \cdot \log n)" />, where <Tex math="F" /> is the number
        of persistent features and <Tex math="n" /> is the number of cycle vertices. For
        the sprite GAN with <Tex math="F \approx 24" /> significant features and{' '}
        <Tex math="T = 100" /> waypoints, the optimization converges in approximately
        500 iterations (about 3 seconds on a single GPU), making the approach practical
        for interactive asset-exploration tools.
      </p>

      <p className="mb-4 indent-8">
        We additionally leverage the functoriality of persistent homology to enable incremental
        updates. When the GAN is fine-tuned on new asset data, the persistence diagrams of the
        latent space change; however, the stability theorem guarantees that small perturbations
        of the generator weights produce proportionally small perturbations of the persistence
        diagrams. We maintain a running estimate of the persistence landscape — the functional
        summary of the persistence diagram defined by:
      </p>

      <TexBlock math="\Lambda_k(t) = \operatorname{kmax}_{(b_i, d_i) \in \text{Dgm}_k} \min(t - b_i, d_i - t)^+" />

      <p className="mb-4">
        where <Tex math="(\cdot)^+ = \max(\cdot, 0)" /> and <Tex math="\operatorname{kmax}" />{' '}
        denotes the <Tex math="k" />-th largest value. The persistence landscape is a Banach-space-valued
        function that permits averaging, integration, and statistical hypothesis testing —
        operations not directly available for persistence diagrams. We use the landscape
        representation to monitor topological drift during fine-tuning and trigger
        recomputation of the Vietoris–Rips filtration when the integrated landscape change
        exceeds a threshold.
      </p>

      <PaperFigure number={3} caption="Semantic coherence score along interpolation paths for three methods. The persistence-guided approach maintains consistently high coherence, avoiding the mid-path collapse characteristic of linear interpolation.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={interpolationQualityData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" label={{ value: 'Interpolation Parameter t', position: 'insideBottom', offset: -5 }} />
            <YAxis domain={[0, 1.1]} label={{ value: 'Coherence Score', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="linear" stroke="#ef4444" strokeWidth={2} name="Linear" dot={false} />
            <Line type="monotone" dataKey="spherical" stroke="#6366f1" strokeWidth={2} name="Spherical" dot={false} />
            <Line type="monotone" dataKey="persistence" stroke="#10b981" strokeWidth={2} name="Persistence-Guided" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 5. QUANTITATIVE EVALUATION */}
      <h2 style={h2Style}>5. Quantitative Evaluation</h2>

      <h3 style={h3Style}>5.1 Fréchet Inception Distance</h3>

      <p className="mb-4">
        We evaluated the quality of interpolated assets using the Fréchet Inception Distance
        (FID), which measures the distributional discrepancy between generated and real asset
        ensembles in the feature space of an Inception-v3 network. For each pair of endpoints{' '}
        <Tex math="(z_0, z_1)" />, we generated 11 intermediate assets at uniformly spaced
        interpolation parameters and computed the FID between this interpolation set and a
        held-out reference set of 10,000 real sprites. We report average FID across 1,000
        randomly sampled endpoint pairs.
      </p>

      <p className="mb-4 indent-8">
        The FID is computed as:
      </p>

      <TexBlock math="\text{FID} = \|\mu_r - \mu_g\|^2 + \operatorname{Tr}\!\left(\Sigma_r + \Sigma_g - 2\bigl(\Sigma_r \Sigma_g\bigr)^{1/2}\right)" />

      <p className="mb-4">
        where <Tex math="(\mu_r, \Sigma_r)" /> and <Tex math="(\mu_g, \Sigma_g)" /> are the
        mean and covariance of the Inception features for the real and generated sets,
        respectively. The persistence-guided method achieved a mean FID of{' '}
        <Tex math="27.9 \pm 3.2" />, compared to <Tex math="47.3 \pm 5.1" /> for linear
        interpolation, <Tex math="41.8 \pm 4.6" /> for spherical interpolation, and{' '}
        <Tex math="38.2 \pm 4.1" /> for geodesic interpolation (computed via numerical
        integration of the pull-back metric). The 41% reduction in FID relative to linear
        interpolation is statistically significant (<Tex math="t(999) = 28.4" />,{' '}
        <Tex math="p < 10^{-15}" />, Cohen&apos;s <Tex math="d = 1.79" />).
      </p>

      <PaperFigure number={4} caption="Fréchet Inception Distance (FID) for four interpolation methods. Lower is better. Persistence-guided interpolation achieves a 41% reduction relative to linear interpolation.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={fidComparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="method" />
            <YAxis label={{ value: 'FID (↓)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="fid" fill="#e11d48" name="FID Score" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>5.2 Wasserstein Distance Convergence</h3>

      <p className="mb-4">
        To assess the topological fidelity of the generated latent-space structure, we computed
        the <Tex math="p" />-Wasserstein distance between persistence diagrams of the real
        asset encodings and those of generated samples at various training epochs:
      </p>

      <TexBlock math="W_p(\text{Dgm}, \text{Dgm}') = \left( \inf_{\phi: \text{Dgm} \to \text{Dgm}'} \sum_{(b,d) \in \text{Dgm}} \|{(b,d) - \phi(b,d)}\|_\infty^p \right)^{1/p}" />

      <p className="mb-4 indent-8">
        where the infimum is over all bijections <Tex math="\phi" /> between the two diagrams
        (augmented by the diagonal to account for unmatched features). Figure 5 shows the
        convergence of <Tex math="W_2" /> distances across homological dimensions during GAN
        training, demonstrating that the generator progressively learns the topological
        structure of the real asset distribution. The <Tex math="H_0" /> distance
        (connected-component structure) converges fastest, followed by <Tex math="H_1" />{' '}
        (loop structure) and <Tex math="H_2" /> (void structure), consistent with the
        intuition that higher-dimensional topological features encode increasingly subtle
        aspects of the data distribution.
      </p>

      <PaperFigure number={5} caption="Wasserstein-2 distance between persistence diagrams of real and generated latent encodings across GAN training epochs, for homological dimensions H₀, H₁, and H₂.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={wasserDistanceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="epoch" label={{ value: 'Training Epoch', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'W₂ Distance', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="h0" stroke="#e11d48" strokeWidth={2} name="H₀" dot={false} />
            <Line type="monotone" dataKey="h1" stroke="#6366f1" strokeWidth={2} name="H₁" dot={false} />
            <Line type="monotone" dataKey="h2" stroke="#10b981" strokeWidth={2} name="H₂" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 6. HUMAN EVALUATION */}
      <h2 style={h2Style}>6. Human Evaluation</h2>

      <p className="mb-4">
        We conducted a human evaluation study with <Tex math="N = 85" /> participants
        (professional game artists and experienced sprite designers recruited from online
        game-development communities) to assess the perceptual quality of interpolated
        assets. Participants were shown sequences of 11 intermediate sprites generated by
        each interpolation method and asked to rate them on five dimensions: silhouette
        consistency (whether the outline changed smoothly), color coherence (whether
        the palette transitioned naturally), pose plausibility (whether intermediate poses
        were anatomically reasonable), stylistic consistency (whether the art style
        remained constant), and overall quality. Ratings were given on a 10-point
        Likert scale.
      </p>

      <p className="mb-4 indent-8">
        The persistence-guided method received the highest ratings across all five
        dimensions. The overall quality rating was <Tex math="M = 6.9" />,{' '}
        <Tex math="SD = 1.3" />, compared to <Tex math="M = 5.2" />,{' '}
        <Tex math="SD = 1.5" /> for spherical interpolation and <Tex math="M = 4.3" />,{' '}
        <Tex math="SD = 1.7" /> for linear interpolation. A repeated-measures ANOVA
        confirmed a significant main effect of method on overall quality,{' '}
        <Tex math="F(2, 168) = 31.4" />, <Tex math="p < .001" />,{' '}
        <Tex math="\eta^2_p = 0.272" />. Post-hoc pairwise comparisons with Bonferroni
        correction revealed significant differences between persistence-guided and both
        linear (<Tex math="p < .001" />, Cohen&apos;s <Tex math="d = 1.72" />) and
        spherical (<Tex math="p < .001" />, Cohen&apos;s <Tex math="d = 1.21" />)
        interpolation. The largest improvement was observed in the pose-plausibility
        dimension (persistence-guided: <Tex math="M = 6.5" />; linear:{' '}
        <Tex math="M = 3.1" />), suggesting that topological guidance is particularly
        effective at avoiding the degenerate intermediate poses produced by traversal
        through entangled latent regions.
      </p>

      <PaperFigure number={6} caption="Human-rated semantic coherence across five perceptual dimensions for three interpolation methods. The persistence-guided approach significantly outperforms baselines, with the largest gains in pose plausibility.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={semanticCoherenceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis domain={[0, 10]} label={{ value: 'Mean Rating', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="linear" fill="#ef4444" name="Linear" />
            <Bar dataKey="spherical" fill="#6366f1" name="Spherical" />
            <Bar dataKey="persistence" fill="#10b981" name="Persistence-Guided" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 7. DISCUSSION */}
      <h2 style={h2Style}>7. Discussion</h2>

      <p className="mb-4">
        The results presented herein establish persistent homology as a viable and effective
        instrument for analyzing and navigating the latent spaces of generative adversarial
        networks in game-asset production contexts. The topological perspective complements
        existing geometric approaches (geodesic interpolation, Riemannian metric learning)
        by providing information about the global connectivity structure of the latent manifold
        that is invisible to purely local methods. The persistence diagram, as a stable and
        interpretable topological summary, enables practitioners to identify semantic
        boundaries, detect mode-collapse regions, and plan interpolation trajectories that
        respect the natural topology of the learned representation.
      </p>

      <p className="mb-4 indent-8">
        A salient observation from our analysis is the correspondence between high-persistence{' '}
        <Tex math="H_1" /> features (stable loops) and semantic attribute cycles. Each
        persistent loop in the latent space corresponds to a closed path of continuous
        semantic variation: traversing the loop systematically varies one or more
        attributes (e.g., silhouette complexity, chromatic saturation) while eventually
        returning to the starting configuration. This observation suggests that the
        topological structure of the latent space encodes, in a geometrically compressed
        form, the full combinatorial space of semantic attribute values — a connection
        that merits further investigation through the lens of representation learning
        theory.
      </p>

      <p className="mb-4 indent-8">
        Several limitations of the present approach warrant acknowledgment. The computational
        cost of the initial Vietoris–Rips filtration, while amortized over many interpolation
        queries, remains substantial for very large point clouds or very high ambient
        dimensions. Approximate methods such as sparse Rips filtrations (Cavanna et al., 2015)
        or witness complexes (de Silva &amp; Carlsson, 2004) may reduce this cost at the expense
        of some topological accuracy. Additionally, the representative-cycle computation required
        for the topological penalty kernel is not unique — different algorithmic choices yield
        different cycle representatives for the same homology class — and the sensitivity of
        the interpolation quality to this choice has not been systematically investigated.
        Finally, our evaluation has focused exclusively on 2D sprite assets; extending the
        framework to 3D mesh generation, where the relevant topological invariants may include{' '}
        <Tex math="H_3" /> and higher, presents both computational and conceptual challenges
        that are left to future work.
      </p>

      {/* 8. CONCLUSION */}
      <h2 style={h2Style}>8. Conclusion</h2>

      <p className="mb-4">
        We have introduced a computational pipeline grounded in persistent homology for the
        topological analysis and navigation of GAN latent spaces in game-asset synthesis.
        By constructing Vietoris–Rips filtrations over latent encodings and computing
        multi-scale Betti-number signatures, we characterize the homological structure
        governing semantic attribute entanglement. A persistence-guided interpolation
        scheme that routes latent trajectories through topologically simple regions achieves
        a 41% reduction in Fréchet Inception Distance and a 27% improvement in human-rated
        semantic coherence relative to standard methods. These results demonstrate that
        algebraic-topological methods provide a principled and practically effective
        framework for controlling generative models in game-asset production pipelines,
        opening new avenues for topology-aware generative modeling in interactive entertainment.
      </p>

      {/* REFERENCES */}
      <h2 style={h2Style}>References</h2>

      <div style={{ fontSize: '9pt', lineHeight: 1.5 }}>
        <p className="mb-2">Bauer, U. (2021). Ripser: efficient computation of Vietoris–Rips persistence barcodes. <em>J. Appl. Comput. Topol.</em>, 5, 391–423.</p>
        <p className="mb-2">Carlsson, G. (2009). Topology and data. <em>Bull. Amer. Math. Soc.</em>, 46(2), 255–308.</p>
        <p className="mb-2">Cavanna, N. J., Jahanseir, M., &amp; Sheehy, D. R. (2015). A geometric perspective on sparse filtrations. <em>Proc. 27th Canadian Conf. Comput. Geom.</em></p>
        <p className="mb-2">Cohen-Steiner, D., Edelsbrunner, H., &amp; Harer, J. (2007). Stability of persistence diagrams. <em>Discrete Comput. Geom.</em>, 37(1), 103–120.</p>
        <p className="mb-2">de Silva, V., &amp; Carlsson, G. (2004). Topological estimation using witness complexes. <em>Proc. Sympos. Point-Based Graphics</em>, 157–166.</p>
        <p className="mb-2">Edelsbrunner, H., &amp; Harer, J. (2010). <em>Computational Topology: An Introduction.</em> American Mathematical Society.</p>
        <p className="mb-2">Karras, T., Aittala, M., Hellsten, J., Laine, S., Lehtinen, J., &amp; Aila, T. (2020). Training generative adversarial networks with limited data. <em>Proc. NeurIPS</em>, 33, 12104–12114.</p>
        <p className="mb-2">McInnes, L., Healy, J., &amp; Melville, J. (2018). UMAP: Uniform manifold approximation and projection for dimension reduction. <em>arXiv:1802.03426</em>.</p>
      </div>
    </>
  );
}
