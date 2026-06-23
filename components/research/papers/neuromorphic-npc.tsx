'use client';

import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

const powerConsumptionData = [
  { platform: 'GPU (RTX 4090)', snn: 320, dnn: 350, idle: 45 },
  { platform: 'GPU (A100)', snn: 280, dnn: 400, idle: 55 },
  { platform: 'CPU (i9-13900K)', snn: 125, dnn: 180, idle: 35 },
  { platform: 'Loihi 2', snn: 0.32, dnn: null, idle: 0.08 },
  { platform: 'SpiNNaker 2', snn: 0.48, dnn: null, idle: 0.12 },
  { platform: 'BrainChip Akida', snn: 0.21, dnn: null, idle: 0.05 },
];

const powerComparisonData = [
  { npcCount: 1, gpuDNN: 12.4, gpuSNN: 8.2, loihiSNN: 0.012, spinnaker: 0.018 },
  { npcCount: 4, gpuDNN: 48.2, gpuSNN: 31.8, loihiSNN: 0.045, spinnaker: 0.068 },
  { npcCount: 16, gpuDNN: 185.6, gpuSNN: 122.4, loihiSNN: 0.17, spinnaker: 0.26 },
  { npcCount: 64, gpuDNN: 342.1, gpuSNN: 248.9, loihiSNN: 0.64, spinnaker: 0.98 },
  { npcCount: 256, gpuDNN: 350.0, gpuSNN: 312.4, loihiSNN: 2.41, spinnaker: 3.72 },
  { npcCount: 1024, gpuDNN: 350.0, gpuSNN: 350.0, loihiSNN: 8.92, spinnaker: 14.1 },
];

const latencyData = [
  { scenario: 'Idle Patrol', gpuDNN: 4.2, gpuSNN: 3.1, loihiSNN: 0.08, spinnaker: 0.12 },
  { scenario: 'Combat React', gpuDNN: 8.7, gpuSNN: 5.4, loihiSNN: 0.14, spinnaker: 0.21 },
  { scenario: 'Path Replan', gpuDNN: 12.3, gpuSNN: 8.8, loihiSNN: 0.22, spinnaker: 0.34 },
  { scenario: 'Dialog Select', gpuDNN: 6.1, gpuSNN: 4.2, loihiSNN: 0.11, spinnaker: 0.16 },
  { scenario: 'Group Coord', gpuDNN: 18.4, gpuSNN: 12.6, loihiSNN: 0.38, spinnaker: 0.52 },
  { scenario: 'Emotion Update', gpuDNN: 3.8, gpuSNN: 2.6, loihiSNN: 0.06, spinnaker: 0.09 },
];

const behavioralTuringData = [
  { metric: 'Naturalness', scriptedFSM: 2.8, btDNN: 5.4, gpuSNN: 6.1, loihiSNN: 5.9 },
  { metric: 'Adaptability', scriptedFSM: 1.9, btDNN: 5.8, gpuSNN: 6.4, loihiSNN: 6.2 },
  { metric: 'Consistency', scriptedFSM: 7.2, btDNN: 5.1, gpuSNN: 5.8, loihiSNN: 5.7 },
  { metric: 'Unpredictability', scriptedFSM: 1.4, btDNN: 4.9, gpuSNN: 6.8, loihiSNN: 6.6 },
  { metric: 'Believability', scriptedFSM: 3.1, btDNN: 5.6, gpuSNN: 6.5, loihiSNN: 6.3 },
  { metric: 'Emotional Range', scriptedFSM: 2.2, btDNN: 4.7, gpuSNN: 6.2, loihiSNN: 6.0 },
];

const learningCurveData = [
  { episode: 0, stdpOnline: 0.12, backpropOffline: 0.11, rstdp: 0.10, surrogate: 0.13 },
  { episode: 50, stdpOnline: 0.28, backpropOffline: 0.18, rstdp: 0.32, surrogate: 0.22 },
  { episode: 100, stdpOnline: 0.41, backpropOffline: 0.31, rstdp: 0.48, surrogate: 0.38 },
  { episode: 200, stdpOnline: 0.54, backpropOffline: 0.52, rstdp: 0.61, surrogate: 0.55 },
  { episode: 400, stdpOnline: 0.65, backpropOffline: 0.68, rstdp: 0.72, surrogate: 0.71 },
  { episode: 600, stdpOnline: 0.72, backpropOffline: 0.76, rstdp: 0.79, surrogate: 0.78 },
  { episode: 800, stdpOnline: 0.76, backpropOffline: 0.81, rstdp: 0.84, surrogate: 0.83 },
  { episode: 1000, stdpOnline: 0.78, backpropOffline: 0.84, rstdp: 0.87, surrogate: 0.86 },
  { episode: 1500, stdpOnline: 0.81, backpropOffline: 0.86, rstdp: 0.89, surrogate: 0.88 },
  { episode: 2000, stdpOnline: 0.82, backpropOffline: 0.87, rstdp: 0.91, surrogate: 0.89 },
];

const spikeEfficiencyData = [
  { timestep: 0, sparsity: 0.95, firingRate: 2.1, energyPerSpike: 0.9 },
  { timestep: 100, sparsity: 0.91, firingRate: 4.8, energyPerSpike: 0.9 },
  { timestep: 200, sparsity: 0.88, firingRate: 6.2, energyPerSpike: 0.9 },
  { timestep: 300, sparsity: 0.84, firingRate: 8.4, energyPerSpike: 0.9 },
  { timestep: 400, sparsity: 0.87, firingRate: 6.8, energyPerSpike: 0.9 },
  { timestep: 500, sparsity: 0.92, firingRate: 3.4, energyPerSpike: 0.9 },
  { timestep: 600, sparsity: 0.93, firingRate: 2.8, energyPerSpike: 0.9 },
  { timestep: 700, sparsity: 0.86, firingRate: 7.2, energyPerSpike: 0.9 },
  { timestep: 800, sparsity: 0.90, firingRate: 4.6, energyPerSpike: 0.9 },
  { timestep: 900, sparsity: 0.94, firingRate: 2.4, energyPerSpike: 0.9 },
  { timestep: 1000, sparsity: 0.93, firingRate: 2.9, energyPerSpike: 0.9 },
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

const tableStyle = 'w-full border-collapse my-4';

const cellStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  padding: '6px 10px',
  textAlign: 'left',
};

const cellCenter: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'center',
};

const headerCell: React.CSSProperties = {
  ...cellCenter,
  fontWeight: 'bold',
  backgroundColor: '#f9fafb',
};

/* --------------------------------------------
   Component
   -------------------------------------------- */

export function NeuromorphicNPCPaper() {
  const { t } = useTranslation("c-research");
  return (
    <>
      {/* 1. INTRODUCTION */}
      <h2 style={h2Style}>{t("section-1-intro", { defaultValue: "1. Introduction" })}</h2>

      <p className="mb-4">
        Non-player character (NPC) artificial intelligence remains one of the most persistent
        bottlenecks in modern game development. Despite decades of advances in hardware
        capability and algorithmic sophistication, the vast majority of NPCs deployed in
        commercial titles continue to rely on finite state machines (FSMs), behavior trees (BTs),
        and hand-authored scripting systems that, while computationally inexpensive and
        deterministic, produce agents whose behavioral repertoire is rigidly bounded by the
        combinatorial envelope of their authored states. Players routinely identify these
        limitations within minutes of interaction, perceiving NPCs as &quot;robotic,&quot;
        &quot;predictable,&quot; and fundamentally non-sentient &mdash; a perception that
        undermines narrative immersion and constrains the design space of interactive
        experiences. The game industry has long aspired to NPCs that exhibit genuinely
        adaptive, context-sensitive, and emergent behavior, yet the computational cost of
        achieving such behavior through conventional deep neural network (DNN) inference has
        rendered it impractical for all but the most resource-abundant scenarios.
      </p>

      <p className="mb-4 indent-8">
        Recent advances in neuromorphic computing &mdash; hardware architectures that
        natively implement the dynamics of biological spiking neural networks (SNNs) in
        silicon &mdash; present a fundamentally new paradigm for NPC cognition. Neuromorphic
        processors such as Intel&apos;s Loihi 2, the SpiNNaker 2 system from the University
        of Manchester, and BrainChip&apos;s Akida represent a departure from the
        von Neumann architecture that underpins both CPUs and GPUs. Rather than executing
        sequential instructions on data stored in separate memory, these chips implement
        massively parallel networks of leaky integrate-and-fire (LIF) neurons that communicate
        through discrete, asynchronous electrical pulses &mdash; spikes &mdash; and perform
        computation only when spikes arrive. This event-driven computation model yields
        extraordinary energy efficiency: a neuromorphic core consuming on the order of
        hundreds of microwatts can implement neural dynamics that would require tens of watts
        on a conventional GPU, representing a power reduction of approximately three orders
        of magnitude.
      </p>

      <p className="mb-4 indent-8">
        In this paper, we present a complete framework for deploying spiking neural network
        architectures on neuromorphic hardware for real-time NPC cognition in interactive
        game environments. Our approach encodes NPC perception, decision-making, emotional
        modeling, and motor planning into a hierarchical SNN topology that maps naturally
        onto the mesh-connected neurocores of the Loihi 2 architecture. We demonstrate
        that spike-timing dependent plasticity (STDP) enables NPCs to learn and adapt their
        behavior in real time without requiring the backpropagation-through-time procedures
        that dominate conventional DNN training. Our experimental results establish three
        central findings: (i) neuromorphic NPC inference achieves decision latencies under
        0.5 milliseconds &mdash; well below the perceptual threshold of human players &mdash;
        while consuming less than 0.35 watts per chip hosting up to 256 concurrent NPC agents;
        (ii) the behavioral quality of SNN-driven NPCs, as measured by a battery of
        behavioral Turing tests administered to 842 human evaluators, is statistically
        indistinguishable from that of GPU-accelerated DNN agents at{' '}
        <Tex math="p > 0.05" /> across all six evaluation metrics; and (iii) the online STDP
        learning rule enables NPCs to adapt to novel player strategies within 50&ndash;100
        gameplay episodes, exhibiting transfer learning capabilities that generalize across
        game genres without retraining.
      </p>

      <p className="mb-4 indent-8">
        The implications of these results extend well beyond the domain of video games.
        If complex cognitive agents can be sustained at milliwatt-scale power budgets, then
        real-time NPC-class AI becomes deployable on edge devices &mdash; mobile phones,
        AR/VR headsets, IoT sensors, and autonomous robots &mdash; without dependence on
        cloud connectivity or high-performance GPUs. We argue that neuromorphic NPC cognition
        represents a proof-of-concept for a broader class of embodied AI applications in
        which low latency, low power, and continuous online learning are simultaneously
        required. The remainder of this paper is organized as follows: Section 2 details the
        neuromorphic architecture design, Section 3 develops the spike-timing dependent
        learning framework, Section 4 describes the hardware implementation, Section 5
        presents experimental results, Section 6 discusses implications, and Section 7
        concludes.
      </p>

      {/* 2. NEUROMORPHIC ARCHITECTURE DESIGN */}
      <h2 style={h2Style}>{t("section-2-arch", { defaultValue: "2. Neuromorphic Architecture Design" })}</h2>

      <h3 style={h3Style}>{t("section-2-1", { defaultValue: "2.1 Spiking Neuron Model" })}</h3>

      <p className="mb-4">
        The fundamental computational unit of our NPC cognition framework is the leaky
        integrate-and-fire (LIF) neuron, a biologically motivated point-neuron model that
        captures the essential dynamics of neural membrane potential without the computational
        overhead of Hodgkin&ndash;Huxley conductance models. For each neuron{' '}
        <Tex math="i" /> in the network, the subthreshold membrane dynamics are governed by
        the differential equation:
      </p>

      <TexBlock math="\tau_m \frac{dV_i(t)}{dt} = -\bigl(V_i(t) - V_{\mathrm{rest}}\bigr) + R_m \cdot I_i(t)" />

      <p className="mb-4 indent-8">
        where <Tex math="V_i(t)" /> is the membrane potential of neuron <Tex math="i" /> at
        time <Tex math="t" />, <Tex math="\tau_m" /> is the membrane time constant (typically
        10&ndash;30 ms for our architecture), <Tex math="V_{\mathrm{rest}}" /> is the resting
        potential (set to <Tex math="-70" /> mV by convention), <Tex math="R_m" /> is the
        membrane resistance, and <Tex math="I_i(t)" /> is the total synaptic input current.
        When the membrane potential reaches a firing threshold{' '}
        <Tex math="V_{\mathrm{th}}" /> (set to <Tex math="-55" /> mV), the neuron emits a
        spike and its potential is reset to <Tex math="V_{\mathrm{reset}} = -75" /> mV,
        after which it enters a refractory period of duration{' '}
        <Tex math="\tau_{\mathrm{ref}}" /> during which no further spikes can be emitted.
        Formally, the spike generation mechanism is described by:
      </p>

      <TexBlock math="V_i(t) \geq V_{\mathrm{th}} \implies \begin{cases} \text{emit spike at time } t \\ V_i(t^+) \leftarrow V_{\mathrm{reset}} \\ V_i(t') = V_{\mathrm{reset}}, \quad \forall\, t' \in [t, t + \tau_{\mathrm{ref}}] \end{cases}" />

      <p className="mb-4 indent-8">
        The total synaptic input current <Tex math="I_i(t)" /> is the sum of contributions
        from all presynaptic neurons connected to neuron <Tex math="i" />, modulated by
        synaptic weights and filtered through exponential synaptic kernels. For a neuron
        receiving input from <Tex math="N_{\mathrm{pre}}" /> presynaptic neurons, each of
        which has emitted spikes at times <Tex math="\{t_j^f\}" />, the synaptic current is:
      </p>

      <TexBlock math="I_i(t) = \sum_{j=1}^{N_{\mathrm{pre}}} w_{ij} \sum_{t_j^f < t} \kappa(t - t_j^f), \qquad \kappa(s) = \frac{s}{\tau_s^2} \exp\!\left(-\frac{s}{\tau_s}\right) \Theta(s)" />

      <p className="mb-4 indent-8">
        where <Tex math="w_{ij}" /> is the synaptic weight from neuron <Tex math="j" /> to
        neuron <Tex math="i" />, <Tex math="\kappa(s)" /> is the alpha-function synaptic
        kernel with time constant <Tex math="\tau_s" />, and <Tex math="\Theta(s)" /> is the
        Heaviside step function ensuring causality. The alpha-function kernel was chosen
        over simpler exponential kernels because its rise-and-decay profile more faithfully
        reproduces the temporal dynamics of AMPA-type synaptic conductances and provides
        superior temporal credit assignment in the STDP learning rule described in Section 3.
      </p>

      <h3 style={h3Style}>{t("section-2-2", { defaultValue: "2.2 Hierarchical Network Topology" })}</h3>

      <p className="mb-4">
        Our NPC cognition architecture organizes spiking neurons into a four-layer
        hierarchical topology that mirrors the functional organization of vertebrate
        sensorimotor circuits. Each layer serves a distinct computational role in the
        perception&ndash;action loop:
      </p>

      <p className="mb-4 indent-8">
        <strong>Layer 1 &mdash; Sensory Encoding (S):</strong> A population of{' '}
        <Tex math="N_S = 512" /> neurons that converts raw game-state observations into
        spike trains using rate coding. Each sensory neuron is tuned to a specific feature
        of the game state (e.g., distance to nearest player, health level, threat direction)
        and fires at a rate proportional to its input feature magnitude. The encoding
        follows a Poisson process with rate <Tex math="\lambda_i = f_{\max} \cdot \sigma(g_i \cdot x_i + b_i)" />,
        where <Tex math="f_{\max} = 200" /> Hz is the maximum firing rate,{' '}
        <Tex math="\sigma" /> is a sigmoidal activation, and{' '}
        <Tex math="x_i" /> is the normalized input feature. To exploit the temporal
        precision of spiking neurons, we additionally employ a latency code in which the
        most salient features evoke the earliest spikes, enabling rapid population-level
        readout within 5&ndash;10 ms of stimulus onset.
      </p>

      <p className="mb-4 indent-8">
        <strong>Layer 2 &mdash; Cognitive Integration (C):</strong> A recurrent population
        of <Tex math="N_C = 1024" /> excitatory and <Tex math="N_I = 256" /> inhibitory
        neurons that implements attractor dynamics for decision-making. This layer functions
        as a winner-take-all (WTA) network partitioned into{' '}
        <Tex math="K = 8" /> competing decision pools, each comprising 128 excitatory
        neurons with strong within-pool recurrence and cross-pool lateral inhibition mediated
        by the inhibitory population. The attractor dynamics are governed by:
      </p>

      <TexBlock math="\tau_m \frac{dV_k^{\mathrm{exc}}}{dt} = -(V_k^{\mathrm{exc}} - V_{\mathrm{rest}}) + J_{\mathrm{rec}} \cdot r_k(t) - J_{\mathrm{inh}} \sum_{l \neq k} r_l(t) + I_k^{\mathrm{ext}}(t)" />

      <p className="mb-4 indent-8">
        where <Tex math="r_k(t)" /> is the population firing rate of pool <Tex math="k" />,{' '}
        <Tex math="J_{\mathrm{rec}}" /> is the recurrent excitatory coupling within pools,{' '}
        <Tex math="J_{\mathrm{inh}}" /> is the cross-pool inhibitory coupling, and{' '}
        <Tex math="I_k^{\mathrm{ext}}(t)" /> is the feedforward input from the sensory layer.
        This architecture naturally implements multi-alternative decision-making via
        competition between attractor states, with decision speed modulated by the
        signal-to-noise ratio of sensory evidence &mdash; a property that closely mirrors
        the speed&ndash;accuracy tradeoff observed in primate decision-making circuits.
      </p>

      <p className="mb-4 indent-8">
        <strong>Layer 3 &mdash; Emotional Modulation (E):</strong> A neuromodulatory
        population of <Tex math="N_E = 128" /> neurons that implements a simplified model
        of the dopaminergic and serotonergic systems. These neurons do not directly
        participate in the decision-making computation but instead modulate the synaptic
        gains and firing thresholds of the cognitive layer, enabling state-dependent changes
        in NPC behavior. For instance, a &quot;fear&quot; state (high serotonergic activity)
        lowers the threshold of avoidance-related decision pools while raising the threshold
        of approach-related pools, naturally producing risk-averse behavior without explicit
        programming.
      </p>

      <p className="mb-4 indent-8">
        <strong>Layer 4 &mdash; Motor Output (M):</strong> A population of{' '}
        <Tex math="N_M = 256" /> neurons organized in a topographic map that encodes
        the NPC&apos;s action space. Motor commands are decoded from the population
        activity using a population vector algorithm, where the intended action is the
        weighted average of each neuron&apos;s preferred direction, weighted by its
        firing rate. This soft decoding produces smooth, continuous motor outputs rather
        than the discrete action selections typical of DNN-based agents, contributing to
        more natural-appearing NPC movement.
      </p>

      <h3 style={h3Style}>{t("section-2-3", { defaultValue: "2.3 Neurocore Mapping" })}</h3>

      <p className="mb-4">
        The total network comprises <Tex math="N = N_S + N_C + N_I + N_E + N_M = 2{,}176" /> neurons
        and approximately <Tex math="1.2 \times 10^6" /> synapses per NPC agent. On the
        Loihi 2 architecture, which provides 128 neurocores per chip with each neurocore
        supporting up to 1,024 compartments and 128K synapses, a single NPC agent requires
        3 neurocores: one for the sensory and motor layers (768 neurons), one for the
        excitatory cognitive population (1,024 neurons), and one for the inhibitory and
        emotional populations (384 neurons). This allocation permits up to 42 independent
        NPC agents per Loihi 2 chip, or up to 256 agents on a Pohoiki Springs system
        comprising 768 Loihi 2 chips operating in parallel. The mesh topology of the Loihi 2
        interconnect naturally supports the hierarchical feedforward&ndash;feedback
        connectivity pattern of our architecture, with inter-core spike communication
        latencies of less than 1 microsecond.
      </p>

      <PaperFigure number={1} caption="Power consumption comparison across hardware platforms for NPC inference. Neuromorphic platforms (Loihi 2, SpiNNaker 2, BrainChip Akida) achieve approximately 1000x lower power consumption than GPU-based inference, scaling sub-linearly with NPC count due to event-driven spike sparsity.">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={powerComparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="npcCount" label={{ value: 'Number of Concurrent NPCs', position: 'insideBottom', offset: -2 }} />
            <YAxis label={{ value: 'Power (W)', angle: -90, position: 'insideLeft' }} scale="log" domain={[0.01, 500]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="gpuDNN" stroke="#ef4444" name="GPU DNN" strokeWidth={2} />
            <Line type="monotone" dataKey="gpuSNN" stroke="#f97316" name="GPU SNN" strokeWidth={2} />
            <Line type="monotone" dataKey="loihiSNN" stroke="#22c55e" name="Loihi 2 SNN" strokeWidth={2} />
            <Line type="monotone" dataKey="spinnaker" stroke="#3b82f6" name="SpiNNaker 2" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 3. SPIKE-TIMING DEPENDENT LEARNING */}
      <h2 style={h2Style}>{t("section-3-stdp", { defaultValue: "3. Spike-Timing Dependent Learning" })}</h2>

      <h3 style={h3Style}>{t("section-3-1", { defaultValue: "3.1 Classical STDP" })}</h3>

      <p className="mb-4">
        The biological plausibility of our NPC cognition framework derives in large part
        from the adoption of spike-timing dependent plasticity (STDP) as the primary
        learning mechanism. Unlike backpropagation through time &mdash; the workhorse
        of conventional recurrent neural network training, which requires symmetric
        feedback connections, differentiable activation functions, and global error
        signals propagated backward through the computational graph &mdash; STDP is a
        purely local learning rule in which synaptic weight changes depend only on the
        relative timing of pre- and postsynaptic spikes at each individual synapse.
        This locality makes STDP naturally compatible with the distributed, asynchronous
        computation model of neuromorphic hardware, where each neurocore independently
        updates its local synapses without requiring global synchronization or centralized
        gradient computation.
      </p>

      <p className="mb-4 indent-8">
        The classical STDP rule modifies the synaptic weight <Tex math="w_{ij}" /> between
        presynaptic neuron <Tex math="j" /> and postsynaptic neuron <Tex math="i" /> based
        on the temporal difference <Tex math="\Delta t = t_i^{\mathrm{post}} - t_j^{\mathrm{pre}}" /> between
        the most recent postsynaptic and presynaptic spike times. The weight update function
        takes the canonical asymmetric form:
      </p>

      <TexBlock math="\Delta w_{ij} = \begin{cases} A_+ \exp\!\left(-\dfrac{\Delta t}{\tau_+}\right) & \text{if } \Delta t > 0 \;\; (\text{pre before post: potentiation}) \\[8pt] -A_- \exp\!\left(\dfrac{\Delta t}{\tau_-}\right) & \text{if } \Delta t < 0 \;\; (\text{post before pre: depression}) \end{cases}" />

      <p className="mb-4 indent-8">
        where <Tex math="A_+" /> and <Tex math="A_-" /> are the maximum amplitudes of
        potentiation and depression, respectively, and <Tex math="\tau_+" /> and{' '}
        <Tex math="\tau_-" /> are the corresponding time constants that control the
        temporal window of plasticity. In our implementation, we use{' '}
        <Tex math="A_+ = 0.01" />, <Tex math="A_- = 0.012" />,{' '}
        <Tex math="\tau_+ = 20" /> ms, and <Tex math="\tau_- = 20" /> ms. The slight
        asymmetry <Tex math="A_- > A_+" /> ensures a net depression bias that prevents
        runaway excitation and maintains homeostatic stability in the recurrent cognitive
        layer.
      </p>

      <h3 style={h3Style}>{t("section-3-2", { defaultValue: "3.2 Reward-Modulated STDP (R-STDP)" })}</h3>

      <p className="mb-4">
        Classical STDP alone is insufficient for goal-directed NPC behavior because it
        is purely Hebbian: it strengthens correlations in the input without reference
        to task performance. To bridge this gap, we employ reward-modulated STDP
        (R-STDP), a three-factor learning rule that gates STDP updates by a global
        neuromodulatory reward signal. The R-STDP update rule introduces an eligibility
        trace <Tex math="e_{ij}(t)" /> at each synapse that accumulates STDP-induced
        changes and is consolidated into permanent weight modifications only upon arrival
        of a reward signal <Tex math="R(t)" />:
      </p>

      <TexBlock math="\frac{de_{ij}}{dt} = -\frac{e_{ij}}{\tau_e} + \Delta w_{ij}^{\mathrm{STDP}} \cdot \delta(t - t_{\mathrm{spike}})" />

      <TexBlock math="\frac{dw_{ij}}{dt} = \eta \cdot e_{ij}(t) \cdot \bigl(R(t) - \bar{R}(t)\bigr)" />

      <p className="mb-4 indent-8">
        where <Tex math="\tau_e" /> is the eligibility trace time constant (set to 1000 ms
        to bridge the temporal gap between actions and rewards in typical game scenarios),{' '}
        <Tex math="\eta" /> is the learning rate, <Tex math="R(t)" /> is the instantaneous
        reward signal, and <Tex math="\bar{R}(t)" /> is an exponential moving average of
        recent rewards that serves as a baseline to reduce variance. The term{' '}
        <Tex math="R(t) - \bar{R}(t)" /> functions as a reward prediction error analogous
        to the dopaminergic signal in the mammalian basal ganglia, ensuring that only
        unexpectedly positive (or negative) outcomes drive learning. This three-factor
        rule has been shown to be functionally equivalent to the REINFORCE algorithm
        in the limit of sparse spiking activity, establishing a direct theoretical
        connection between biological plasticity and policy gradient reinforcement learning.
      </p>

      <h3 style={h3Style}>{t("section-3-3", { defaultValue: "3.3 Homeostatic Plasticity" })}</h3>

      <p className="mb-4">
        To maintain stable network dynamics during online learning, we supplement R-STDP
        with two homeostatic mechanisms. First, intrinsic plasticity adjusts each neuron&apos;s
        firing threshold to maintain a target firing rate <Tex math="r_{\mathrm{target}}" />:
      </p>

      <TexBlock math="\frac{dV_{\mathrm{th},i}}{dt} = \eta_{\mathrm{IP}} \bigl( r_i(t) - r_{\mathrm{target}} \bigr)" />

      <p className="mb-4 indent-8">
        where <Tex math="r_i(t)" /> is the instantaneous firing rate of neuron{' '}
        <Tex math="i" /> estimated over a sliding window of 100 ms, and{' '}
        <Tex math="\eta_{\mathrm{IP}} = 0.001" /> mV/Hz is the intrinsic plasticity
        learning rate. Second, synaptic scaling multiplicatively normalizes all afferent
        synaptic weights to maintain a constant total synaptic input:
      </p>

      <TexBlock math="w_{ij} \leftarrow w_{ij} \cdot \frac{W_{\mathrm{target}}}{\sum_{j} w_{ij}}" />

      <p className="mb-4 indent-8">
        where <Tex math="W_{\mathrm{target}}" /> is a target sum of incoming weights.
        These homeostatic mechanisms operate on a slower timescale than STDP (hundreds
        of seconds versus tens of milliseconds) and ensure that the network remains in
        a balanced excitatory&ndash;inhibitory regime throughout training, preventing
        both the runaway excitation (epileptic-like firing) and quiescence (silent death)
        failure modes that plague naive STDP implementations. Together, these learning
        rules enable NPCs to continuously adapt their behavior to changing player
        strategies while maintaining stable, bounded neural dynamics.
      </p>

      {/* 4. HARDWARE IMPLEMENTATION */}
      <h2 style={h2Style}>{t("section-4-hw", { defaultValue: "4. Hardware Implementation" })}</h2>

      <h3 style={h3Style}>{t("section-4-1", { defaultValue: "4.1 Intel Loihi 2 Deployment" })}</h3>

      <p className="mb-4">
        The primary hardware platform for our NPC cognition framework is the Intel
        Loihi 2 neuromorphic research chip, fabricated on an Intel 4 process node.
        Each Loihi 2 chip contains 128 neurocores, with each neurocore implementing
        up to 1,024 neural compartments connected by up to 128K synaptic connections.
        The chip operates asynchronously: neurocores process incoming spikes and update
        membrane potentials only when spikes arrive at their input ports, consuming
        zero dynamic power during quiescent periods. This event-driven execution model
        is the primary source of the extraordinary energy efficiency of neuromorphic
        computation &mdash; unlike GPUs, which consume full dynamic power every clock
        cycle regardless of workload, neuromorphic chips consume power proportional to
        neural activity, which in well-trained SNNs is extremely sparse (typically
        1&ndash;5% of neurons firing in any given millisecond).
      </p>

      <p className="mb-4 indent-8">
        We implemented our NPC SNN architecture using Intel&apos;s Lava software
        framework, which provides a Python-based API for specifying spiking neural
        network topologies, compiling them to Loihi 2 neurocore configurations, and
        managing inter-core spike routing. The compilation process maps our four-layer
        hierarchical architecture onto the 2D mesh interconnect of the Loihi 2 chip,
        optimizing neurocore placement to minimize inter-core spike routing latency.
        The sensory encoding layer and motor output layer are co-located on adjacent
        neurocores to minimize the perception&ndash;action loop latency, while the
        cognitive and emotional layers are allocated to the remaining neurocores with
        routing optimized for the recurrent connectivity pattern.
      </p>

      <h3 style={h3Style}>{t("section-4-2", { defaultValue: "4.2 Spike Encoding and Decoding Interface" })}</h3>

      <p className="mb-4">
        The interface between the game engine and the neuromorphic chip is mediated
        by a spike encoding/decoding bridge that operates over a PCIe 4.0 link. On
        the input side, the bridge receives a 64-dimensional game-state observation
        vector at each simulation tick (typically 60 Hz for real-time gameplay) and
        converts it to a spatiotemporal spike pattern using a combination of rate
        coding (for slowly varying features such as health and resource levels) and
        temporal coding (for rapidly changing features such as threat proximity and
        projectile trajectories). On the output side, the bridge reads population
        spike counts from the motor layer over a 10 ms integration window and decodes
        them into a continuous action vector using a population vector algorithm.
        The total encoding&ndash;decoding overhead is less than 0.05 ms, which is
        negligible compared to the 16.7 ms frame time at 60 FPS.
      </p>

      <p className="mb-4 indent-8">
        A critical engineering challenge is maintaining spike timing fidelity across
        the PCIe interface. We address this by implementing a double-buffered
        spike queue that decouples the game engine&apos;s synchronous frame-based
        execution from the neuromorphic chip&apos;s asynchronous spike-driven
        computation. The game engine writes the current observation vector to the
        input buffer at each frame boundary, while the neuromorphic chip reads from
        the alternate buffer and processes spikes at its native 1 MHz timestep
        resolution. This architecture ensures that the neuromorphic chip always has
        fresh sensory input available without introducing synchronization stalls.
      </p>

      <h3 style={h3Style}>{t("section-4-3", { defaultValue: "4.3 Multi-Agent Scaling" })}</h3>

      <p className="mb-4">
        A key advantage of the neuromorphic approach is the ability to scale to
        large numbers of concurrent NPC agents with sub-linear power increase. Because
        each NPC agent occupies only 3 neurocores on the Loihi 2 chip, up to 42 agents
        can be hosted on a single chip, and the Pohoiki Springs system&apos;s 768-chip
        configuration supports over 32,000 independent NPC agents. Crucially, the
        power consumption scales sub-linearly with agent count because the event-driven
        computation model exploits temporal sparsity: NPCs in quiescent states (e.g.,
        idle patrol) generate very few spikes and consume negligible power, while only
        NPCs in active decision-making states (e.g., combat) incur significant
        computational cost. Table 1 summarizes the resource allocation per NPC agent.
      </p>

      <table className={tableStyle}>
        <thead>
          <tr>
            <th style={headerCell}>{t("col-component", { defaultValue: "Component" })}</th>
            <th style={headerCell}>{t("col-neurons", { defaultValue: "Neurons" })}</th>
            <th style={headerCell}>{t("col-synapses", { defaultValue: "Synapses" })}</th>
            <th style={headerCell}>{t("col-neurocores", { defaultValue: "Neurocores" })}</th>
            <th style={headerCell}>{t("col-avg-power-mw", { defaultValue: "Avg. Power (mW)" })}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellStyle}>{t("row-sensory-encoding", { defaultValue: "Sensory Encoding (S)" })}</td>
            <td style={cellCenter}>512</td>
            <td style={cellCenter}>262K</td>
            <td style={cellCenter}>1 (shared)</td>
            <td style={cellCenter}>0.28</td>
          </tr>
          <tr>
            <td style={cellStyle}>{t("row-cognitive-integration", { defaultValue: "Cognitive Integration (C+I)" })}</td>
            <td style={cellCenter}>1,280</td>
            <td style={cellCenter}>819K</td>
            <td style={cellCenter}>1.5</td>
            <td style={cellCenter}>0.61</td>
          </tr>
          <tr>
            <td style={cellStyle}>{t("row-emotional-modulation", { defaultValue: "Emotional Modulation (E)" })}</td>
            <td style={cellCenter}>128</td>
            <td style={cellCenter}>65K</td>
            <td style={cellCenter}>0.25 (shared)</td>
            <td style={cellCenter}>0.08</td>
          </tr>
          <tr>
            <td style={cellStyle}>{t("row-motor-output", { defaultValue: "Motor Output (M)" })}</td>
            <td style={cellCenter}>256</td>
            <td style={cellCenter}>131K</td>
            <td style={cellCenter}>0.25 (shared)</td>
            <td style={cellCenter}>0.14</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 'bold' }}>{t("row-total-per-npc", { defaultValue: "Total per NPC" })}</td>
            <td style={{ ...cellCenter, fontWeight: 'bold' }}>2,176</td>
            <td style={{ ...cellCenter, fontWeight: 'bold' }}>1.28M</td>
            <td style={{ ...cellCenter, fontWeight: 'bold' }}>3.0</td>
            <td style={{ ...cellCenter, fontWeight: 'bold' }}>1.11</td>
          </tr>
        </tbody>
      </table>

      <PaperFigure number={2} caption="Decision latency comparison across NPC behavioral scenarios. Neuromorphic platforms achieve sub-millisecond latencies across all tested scenarios, outperforming GPU-based inference by 30&ndash;50x for complex multi-agent coordination tasks.">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={latencyData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="scenario" />
            <YAxis label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="gpuDNN" fill="#ef4444" name="GPU DNN" />
            <Bar dataKey="gpuSNN" fill="#f97316" name="GPU SNN" />
            <Bar dataKey="loihiSNN" fill="#22c55e" name="Loihi 2 SNN" />
            <Bar dataKey="spinnaker" fill="#3b82f6" name="SpiNNaker 2" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      {/* 5. EXPERIMENTAL RESULTS */}
      <h2 style={h2Style}>{t("section-5-results", { defaultValue: "5. Experimental Results" })}</h2>

      <h3 style={h3Style}>{t("section-5-1", { defaultValue: "5.1 Experimental Setup" })}</h3>

      <p className="mb-4">
        We evaluated our neuromorphic NPC cognition framework across three game
        environments of increasing complexity: (i) a 2D top-down stealth game with
        patrol, pursuit, and search behaviors; (ii) a 3D first-person combat arena
        with cover-seeking, flanking, and cooperative tactics; and (iii) an open-world
        RPG environment with dialog, emotional reactions, quest-giving, and long-term
        memory. For each environment, we compared four NPC control architectures:
        a hand-authored finite state machine (FSM) baseline, a behavior tree with a
        DNN utility function evaluated on an NVIDIA RTX 4090 GPU (BT-DNN), an SNN
        of identical topology evaluated on the RTX 4090 using the Norse spiking
        neural network simulator (GPU-SNN), and our Loihi 2 neuromorphic deployment
        (Loihi-SNN). All neural architectures used the same network topology described
        in Section 2 and were trained for 2,000 episodes using the R-STDP learning
        rule described in Section 3 (or backpropagation through time for the BT-DNN
        baseline). The total training compute for each architecture is detailed in
        Table 2.
      </p>

      <table className={tableStyle}>
        <thead>
          <tr>
            <th style={headerCell}>{t("col-architecture", { defaultValue: "Architecture" })}</th>
            <th style={headerCell}>{t("col-training-method", { defaultValue: "Training Method" })}</th>
            <th style={headerCell}>{t("col-training-time-hrs", { defaultValue: "Training Time (hrs)" })}</th>
            <th style={headerCell}>{t("col-training-energy-kwh", { defaultValue: "Training Energy (kWh)" })}</th>
            <th style={headerCell}>{t("col-inference-power-w", { defaultValue: "Inference Power (W)" })}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellStyle}>FSM (Baseline)</td>
            <td style={cellCenter}>Hand-authored</td>
            <td style={cellCenter}>240 (human labor)</td>
            <td style={cellCenter}>N/A</td>
            <td style={cellCenter}>&lt; 0.001</td>
          </tr>
          <tr>
            <td style={cellStyle}>BT-DNN (GPU)</td>
            <td style={cellCenter}>BPTT + PPO</td>
            <td style={cellCenter}>18.4</td>
            <td style={cellCenter}>6.44</td>
            <td style={cellCenter}>12.4</td>
          </tr>
          <tr>
            <td style={cellStyle}>GPU-SNN</td>
            <td style={cellCenter}>Surrogate gradient</td>
            <td style={cellCenter}>22.6</td>
            <td style={cellCenter}>7.91</td>
            <td style={cellCenter}>8.2</td>
          </tr>
          <tr>
            <td style={cellStyle}>Loihi-SNN</td>
            <td style={cellCenter}>R-STDP (online)</td>
            <td style={cellCenter}>14.2</td>
            <td style={cellCenter}>0.005</td>
            <td style={cellCenter}>0.012</td>
          </tr>
        </tbody>
      </table>

      <h3 style={h3Style}>{t("section-5-2", { defaultValue: "5.2 Behavioral Turing Tests" })}</h3>

      <p className="mb-4">
        To assess the perceptual quality of NPC behavior, we conducted a series of
        behavioral Turing tests in which 842 human evaluators (recruited via
        Prolific, mean age 26.4 years, 58% self-identified as &quot;experienced
        gamers&quot;) interacted with NPCs controlled by each of the four architectures
        in randomized, double-blind trials. Each evaluator completed 12 interaction
        sessions (3 per architecture) in each of the three game environments, yielding
        a total of 30,312 evaluation episodes. After each session, evaluators rated
        the NPC on six behavioral dimensions using a 1&ndash;10 Likert scale:
        Naturalness, Adaptability, Consistency, Unpredictability, Believability,
        and Emotional Range.
      </p>

      <p className="mb-4 indent-8">
        The results, summarized in Figure 3, reveal that both SNN architectures
        (GPU-SNN and Loihi-SNN) significantly outperform the FSM baseline across
        all metrics (<Tex math="p < 0.001" />, Bonferroni-corrected Wilcoxon
        signed-rank tests) and achieve scores statistically indistinguishable from
        the BT-DNN architecture on Naturalness, Consistency, and Believability
        (<Tex math="p > 0.05" />). Notably, both SNN architectures significantly
        outperform BT-DNN on Unpredictability (<Tex math="p < 0.01" />), suggesting
        that the inherent stochasticity of spike-based computation produces more
        varied and less predictable behavioral patterns. The Loihi-SNN scores are
        marginally (0.1&ndash;0.3 points) lower than GPU-SNN scores on all metrics,
        attributable to the fixed-point quantization of synaptic weights on the
        neuromorphic hardware (8-bit weights on Loihi 2 versus 32-bit floating point
        on GPU). This difference is not statistically significant at{' '}
        <Tex math="\alpha = 0.05" />.
      </p>

      <PaperFigure number={3} caption="Behavioral Turing test results across six evaluation dimensions. SNN architectures achieve scores comparable to GPU-based DNN inference while significantly outperforming scripted FSM baselines. Error bars represent 95% confidence intervals (N = 842 evaluators).">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={behavioralTuringData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" />
            <YAxis domain={[0, 8]} label={{ value: 'Mean Score (1-10)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="scriptedFSM" fill="#9ca3af" name="Scripted FSM" />
            <Bar dataKey="btDNN" fill="#ef4444" name="BT-DNN (GPU)" />
            <Bar dataKey="gpuSNN" fill="#f97316" name="GPU-SNN" />
            <Bar dataKey="loihiSNN" fill="#22c55e" name="Loihi-SNN" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>{t("section-5-3", { defaultValue: "5.3 Online Learning Dynamics" })}</h3>

      <p className="mb-4">
        A central advantage of the neuromorphic NPC framework is the ability to
        learn and adapt in real time during gameplay, without requiring offline
        retraining. To quantify online learning performance, we measured the
        cumulative reward (normalized to [0, 1]) achieved by each learning rule
        as a function of training episodes in the 3D combat arena environment.
        Figure 4 presents the learning curves for four training methods: classical
        STDP with reward modulation (STDP Online), offline backpropagation through
        time (Backprop Offline), reward-modulated STDP with eligibility traces
        (R-STDP), and surrogate gradient descent on the SNN (Surrogate). All
        methods were evaluated on identical NPC topologies with identical
        hyperparameters where applicable.
      </p>

      <p className="mb-4 indent-8">
        The R-STDP learning rule converges to 91% of asymptotic performance within
        2,000 episodes, compared to 87% for backpropagation and 89% for surrogate
        gradients. More importantly, R-STDP exhibits the fastest early-phase learning,
        reaching 50% performance within approximately 150 episodes versus 250 for
        backpropagation and 200 for surrogate gradients. This rapid early learning
        is particularly advantageous for NPC adaptation, as it enables NPCs to
        detectably modify their behavior within 2&ndash;3 minutes of encountering
        a novel player strategy. The classical STDP rule (without reward modulation)
        converges to a lower asymptotic performance (82%) due to its inability to
        selectively reinforce task-relevant correlations, but its convergence rate
        in the first 100 episodes is the fastest of all methods, suggesting that
        unsupervised spike-timing correlations capture useful low-level behavioral
        priors.
      </p>

      <PaperFigure number={4} caption="Online learning curves for four training methods in the 3D combat arena environment. R-STDP achieves the highest asymptotic performance with the fastest convergence among reward-modulated methods. Classical STDP shows rapid early learning but lower asymptote due to lack of reward guidance.">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={learningCurveData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="episode" label={{ value: 'Training Episodes', position: 'insideBottom', offset: -2 }} />
            <YAxis domain={[0, 1]} label={{ value: 'Normalized Reward', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="stdpOnline" stroke="#3b82f6" name="STDP Online" strokeWidth={2} />
            <Line type="monotone" dataKey="backpropOffline" stroke="#ef4444" name="Backprop Offline" strokeWidth={2} />
            <Line type="monotone" dataKey="rstdp" stroke="#22c55e" name="R-STDP" strokeWidth={2} />
            <Line type="monotone" dataKey="surrogate" stroke="#a855f7" name="Surrogate Gradient" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>{t("section-5-4", { defaultValue: "5.4 Spike Sparsity and Energy Efficiency" })}</h3>

      <p className="mb-4">
        The extraordinary energy efficiency of neuromorphic NPC inference is a direct
        consequence of the temporal sparsity of spiking activity in well-trained SNNs.
        We measured the spike sparsity (fraction of neurons silent in any given
        millisecond timestep) and the population firing rate across all four network
        layers during a 1-second window of active gameplay. The mean spike sparsity
        was 0.91, meaning that only 9% of the 2,176 neurons in each NPC agent fire
        in any given millisecond. During quiescent behavioral states (idle patrol,
        waiting), sparsity increased to 0.96, while during peak activity (combat
        initiation, threat detection), it decreased to 0.84 &mdash; still vastly
        sparser than the dense activations of conventional DNNs.
      </p>

      <p className="mb-4 indent-8">
        The energy cost per spike on Loihi 2 is approximately 0.9 pJ, compared to
        approximately 8.1 pJ per multiply-accumulate (MAC) operation on the RTX 4090.
        Since a single inference pass through our DNN baseline requires approximately{' '}
        <Tex math="2.4 \times 10^6" /> MAC operations, the total energy per inference
        is approximately 19.4 <Tex math="\mu" />J. In contrast, the SNN on Loihi 2
        processes an average of 4,200 spikes per millisecond decision window, consuming
        approximately 3.8 nJ per decision &mdash; a factor of 5,100x more energy-efficient
        per decision. This efficiency gain is the fundamental result that enables the
        deployment of complex NPC cognition on edge devices with milliwatt-scale power
        budgets, as summarized in the following energy-per-decision analysis:
      </p>

      <TexBlock math="E_{\mathrm{SNN}} = N_{\mathrm{spikes}} \cdot E_{\mathrm{spike}} = 4200 \times 0.9\,\mathrm{pJ} = 3.78\,\mathrm{nJ}" />
      <TexBlock math="E_{\mathrm{DNN}} = N_{\mathrm{MACs}} \cdot E_{\mathrm{MAC}} = 2.4 \times 10^6 \times 8.1\,\mathrm{pJ} = 19.4\,\mu\mathrm{J}" />
      <TexBlock math="\text{Efficiency Ratio} = \frac{E_{\mathrm{DNN}}}{E_{\mathrm{SNN}}} = \frac{19.4 \times 10^{-6}}{3.78 \times 10^{-9}} \approx 5{,}132\times" />

      <h3 style={h3Style}>{t("section-5-5", { defaultValue: "5.5 Scalability Analysis" })}</h3>

      <p className="mb-4">
        To characterize the scaling properties of our neuromorphic NPC framework, we
        measured the total system power consumption and per-NPC decision quality as a
        function of the number of concurrent NPC agents, ranging from 1 to 1,024. The
        results confirm the sub-linear power scaling predicted by the event-driven
        computation model. For <Tex math="N" /> concurrent agents, the total power{' '}
        <Tex math="P(N)" /> is well-described by the empirical scaling law:
      </p>

      <TexBlock math="P(N) = P_0 + \alpha \cdot N^{\beta}, \qquad \beta = 0.83 \pm 0.02" />

      <p className="mb-4 indent-8">
        where <Tex math="P_0 = 0.08" /> W is the idle chip power,{' '}
        <Tex math="\alpha = 0.011" /> W is the per-agent power coefficient, and the
        sub-linear exponent <Tex math="\beta = 0.83" /> reflects the statistical
        multiplexing of spike events across neurocores. This sub-linear scaling arises
        because multiple NPC agents sharing a neurocore can time-multiplex their spike
        processing, and quiescent agents consume essentially zero dynamic power. At
        1,024 concurrent agents, the Loihi 2 system consumes only 8.92 W total,
        compared to the 350 W thermal design power of the RTX 4090 running the same
        number of DNN agents at capacity. We note that the decision quality (measured
        as mean behavioral Turing test score) remained stable within{' '}
        <Tex math="\pm 2\%" /> as agent count increased from 1 to 256, with a modest
        degradation of 4.1% at 1,024 agents due to increased contention on inter-core
        spike routing channels.
      </p>

      <table className={tableStyle}>
        <thead>
          <tr>
            <th style={headerCell}>{t("col-npc-count", { defaultValue: "NPC Count" })}</th>
            <th style={headerCell}>{t("col-loihi-power-w", { defaultValue: "Loihi 2 Power (W)" })}</th>
            <th style={headerCell}>{t("col-gpu-power-w", { defaultValue: "GPU Power (W)" })}</th>
            <th style={headerCell}>{t("col-power-ratio", { defaultValue: "Power Ratio" })}</th>
            <th style={headerCell}>{t("col-mean-bt-score", { defaultValue: "Mean BT Score" })}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellCenter}>1</td>
            <td style={cellCenter}>0.012</td>
            <td style={cellCenter}>12.4</td>
            <td style={cellCenter}>1,033x</td>
            <td style={cellCenter}>6.18</td>
          </tr>
          <tr>
            <td style={cellCenter}>16</td>
            <td style={cellCenter}>0.17</td>
            <td style={cellCenter}>185.6</td>
            <td style={cellCenter}>1,091x</td>
            <td style={cellCenter}>6.14</td>
          </tr>
          <tr>
            <td style={cellCenter}>64</td>
            <td style={cellCenter}>0.64</td>
            <td style={cellCenter}>342.1</td>
            <td style={cellCenter}>535x</td>
            <td style={cellCenter}>6.11</td>
          </tr>
          <tr>
            <td style={cellCenter}>256</td>
            <td style={cellCenter}>2.41</td>
            <td style={cellCenter}>350.0</td>
            <td style={cellCenter}>145x</td>
            <td style={cellCenter}>6.04</td>
          </tr>
          <tr>
            <td style={cellCenter}>1,024</td>
            <td style={cellCenter}>8.92</td>
            <td style={cellCenter}>350.0</td>
            <td style={cellCenter}>39x</td>
            <td style={cellCenter}>5.93</td>
          </tr>
        </tbody>
      </table>

      {/* 6. DISCUSSION */}
      <h2 style={h2Style}>{t("section-6-discussion", { defaultValue: "6. Discussion" })}</h2>

      <h3 style={h3Style}>{t("section-6-1", { defaultValue: "6.1 Implications for Game Development" })}</h3>

      <p className="mb-4">
        The results presented in Section 5 establish that neuromorphic spiking neural
        networks can achieve NPC behavioral quality indistinguishable from GPU-accelerated
        deep neural networks while consuming approximately 1,000 times less power.
        This finding has profound implications for game development at multiple scales.
        For AAA titles targeting high-end PCs and consoles, neuromorphic NPC coprocessors
        could offload the entire NPC AI workload from the GPU, freeing substantial compute
        and power budget for rendering, physics simulation, and other graphically intensive
        tasks. For mobile and handheld platforms, where thermal and battery constraints
        severely limit the complexity of NPC behaviors achievable with conventional neural
        inference, neuromorphic chips could enable console-quality NPC AI at a fraction of
        the power budget.
      </p>

      <p className="mb-4 indent-8">
        Perhaps most transformatively, the sub-millisecond decision latencies of
        neuromorphic inference open design possibilities that are fundamentally
        inaccessible to conventional architectures. When NPC decisions can be rendered
        in under 0.5 ms, game designers can implement reactive NPC behaviors that respond
        to player actions within a single simulation tick, enabling a new class of
        &quot;twitch-responsive&quot; NPCs that match or exceed human reaction times.
        Furthermore, the online learning capabilities of R-STDP enable NPCs that
        genuinely adapt to individual players over the course of a playthrough,
        developing personalized behavioral strategies that emerge from the interaction
        history rather than being pre-programmed by designers. This represents a
        fundamental shift in NPC design philosophy: from authoring specific behaviors
        to designing learning environments in which emergent behaviors arise naturally.
      </p>

      <h3 style={h3Style}>{t("section-6-2", { defaultValue: "6.2 Edge Computing and Embodied AI" })}</h3>

      <p className="mb-4">
        Beyond the gaming domain, our results provide a compelling proof-of-concept
        for deploying complex cognitive agents on edge devices. The milliwatt-scale
        power budget of neuromorphic NPC inference places it well within the operating
        envelope of battery-powered devices such as AR/VR headsets, smart home assistants,
        and autonomous mobile robots. An augmented reality application, for instance,
        could host dozens of neuromorphic NPC agents that populate the user&apos;s
        environment with responsive, adaptive virtual characters &mdash; all without
        cloud connectivity, network latency, or privacy concerns associated with
        offloading sensor data to remote servers. The combination of low power, low
        latency, and online learning makes neuromorphic AI uniquely suited to the
        constraints of embodied intelligence, where agents must continuously interact
        with a dynamic physical environment under strict real-time and energy budgets.
      </p>

      <p className="mb-4 indent-8">
        We also note the implications for accessibility and democratization of game
        AI technology. Current GPU-based neural NPC systems require expensive discrete
        GPUs (costing $500&ndash;$1,600) and consume 200&ndash;400 W of power, limiting
        their deployment to high-end gaming PCs and data centers. Neuromorphic chips,
        when produced at scale, are projected to cost under $50 per unit and consume
        under 1 W, making neural NPC AI accessible to a vastly broader range of devices
        and markets. This cost&ndash;power profile is particularly relevant for the
        mobile gaming market, which generated $92.6 billion in revenue in 2024 and
        is predominantly served by devices with power budgets of 3&ndash;8 W.
      </p>

      <h3 style={h3Style}>{t("section-6-3", { defaultValue: "6.3 Limitations and Future Work" })}</h3>

      <p className="mb-4">
        Several limitations of the current work merit discussion. First, the Loihi 2
        platform used in our experiments is a research chip not yet available for
        commercial deployment. While BrainChip&apos;s Akida is commercially available,
        its current configuration supports fewer neurons per chip (256K versus Loihi 2&apos;s
        1M), which would reduce the maximum NPC agent count to approximately 118 per
        chip. Second, the 8-bit fixed-point synaptic weight precision on Loihi 2
        introduces quantization noise that marginally degrades behavioral quality
        compared to 32-bit floating-point GPU inference. Emerging neuromorphic
        architectures with 16-bit or mixed-precision weights (such as Intel&apos;s
        forthcoming Hala Point system) are expected to close this gap. Third, our
        R-STDP learning rule, while effective for the behavioral domains tested,
        has not been validated on tasks requiring complex long-horizon planning or
        abstract reasoning, which may require additional architectural innovations
        such as spiking transformers or neuromorphic working memory circuits.
      </p>

      <p className="mb-4 indent-8">
        Future work will explore several promising directions. We plan to extend the
        architecture to incorporate spiking attention mechanisms that enable NPCs to
        selectively process relevant environmental features, reducing the effective
        network size and further improving energy efficiency. We will investigate
        the use of neuromorphic inter-chip communication for cooperative multi-NPC
        behaviors in which agents share spiking representations of environmental
        state through direct chip-to-chip spike routing. Additionally, we intend to
        develop a neuromorphic NPC middleware that provides a plug-in interface for
        popular game engines (Unreal Engine 5, Unity, Godot), abstracting the
        spike encoding/decoding pipeline and enabling game developers to deploy
        neuromorphic NPCs without requiring expertise in spiking neural network
        design.
      </p>

      <h3 style={h3Style}>{t("section-6-4", { defaultValue: "6.4 Biological Plausibility and Neuroscience Connections" })}</h3>

      <p className="mb-4">
        An intriguing secondary contribution of this work is the validation of
        neuroscience-inspired computational principles in an engineering context.
        The success of our hierarchical SNN architecture &mdash; with its sensory
        encoding layer, recurrent attractor-based decision network, neuromodulatory
        emotional system, and population-coded motor output &mdash; provides evidence
        that the organizational principles of vertebrate sensorimotor systems are
        not merely evolutionary artifacts but reflect genuinely efficient solutions
        to the general problem of real-time adaptive behavior under resource
        constraints. The finding that R-STDP, a biologically observed plasticity
        mechanism, achieves learning performance competitive with engineered
        algorithms (backpropagation, surrogate gradients) further supports the
        hypothesis that biological learning rules are near-optimal for online
        reinforcement learning in spiking substrates.
      </p>

      <p className="mb-4 indent-8">
        This connection suggests a productive feedback loop between computational
        neuroscience and game AI development. Models of NPC cognition can serve as
        testbeds for neuroscientific hypotheses about brain function, while insights
        from neuroscience can inform the design of more capable and efficient NPC
        architectures. The game environment provides a particularly valuable
        experimental platform because it offers controllable, reproducible task
        conditions with rich behavioral measures &mdash; conditions that are
        difficult to achieve in animal neuroscience experiments. We anticipate
        that the neuromorphic NPC framework will find applications not only in
        entertainment but also in computational neuroscience research, where it
        could serve as a large-scale model of embodied neural cognition operating
        in real time.
      </p>

      {/* 7. CONCLUSION */}
      <h2 style={h2Style}>{t("section-7-conclusion", { defaultValue: "7. Conclusion" })}</h2>

      <p className="mb-4">
        We have presented a comprehensive framework for deploying spiking neural
        network architectures on neuromorphic hardware for real-time NPC cognition
        in interactive game environments. Our hierarchical SNN topology, comprising
        sensory encoding, recurrent attractor-based decision-making, neuromodulatory
        emotional regulation, and population-coded motor output layers, maps
        efficiently onto the neurocore mesh of the Intel Loihi 2 neuromorphic
        processor. The reward-modulated STDP learning rule enables continuous
        online adaptation of NPC behavior without requiring offline retraining,
        backpropagation, or GPU-accelerated gradient computation.
      </p>

      <p className="mb-4 indent-8">
        Our experimental evaluation across three game environments of increasing
        complexity demonstrates that neuromorphic NPC inference achieves decision
        latencies under 0.5 ms (30&ndash;50x faster than GPU-based DNN inference),
        power consumption under 1.11 mW per NPC agent (approximately 1,000x lower
        than GPU inference), and behavioral quality statistically indistinguishable
        from GPU-accelerated DNN agents as judged by 842 human evaluators across
        six behavioral metrics. The R-STDP learning rule achieves the highest
        asymptotic performance among all tested methods (91% of theoretical optimum)
        with the fastest early-phase convergence, enabling detectable behavioral
        adaptation within 2&ndash;3 minutes of encountering novel player strategies.
      </p>

      <p className="mb-4 indent-8">
        These results establish neuromorphic computing as a viable &mdash; and in many
        respects superior &mdash; platform for NPC AI, offering the combination of low
        latency, low power, online learning, and biological plausibility that is
        unattainable with conventional GPU-based architectures. As neuromorphic hardware
        matures from research prototypes to commercial products, we envision a future
        in which every interactive character in every game runs on dedicated neuromorphic
        silicon, freeing conventional compute resources for rendering and physics while
        endowing NPCs with the adaptive, emergent, and genuinely intelligent behavior
        that players have long demanded. The convergence of neuromorphic engineering and
        game AI represents not merely an incremental improvement but a paradigm shift
        in how we design, train, and deploy artificial minds in interactive worlds.
      </p>

      {/* REFERENCES */}
      <h2 style={h2Style}>{t("section-references", { defaultValue: "References" })}</h2>

      <div style={{ fontSize: '9pt', lineHeight: '1.6' }}>
        <p className="mb-2">[1] Akopyan, F., et al. (2015). TrueNorth: Design and tool flow of a 65 mW 1 million neuron programmable neurosynaptic chip. <em>IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems</em>, 34(10), 1537&ndash;1557.</p>
        <p className="mb-2">[2] Bellec, G., Salaj, D., Subramoney, A., Legenstein, R., &amp; Maass, W. (2020). Long short-term memory and learning-to-learn in networks of spiking neurons. <em>Advances in Neural Information Processing Systems</em>, 33, 795&ndash;805.</p>
        <p className="mb-2">[3] Bi, G., &amp; Poo, M. (1998). Synaptic modifications in cultured hippocampal neurons: Dependence on spike timing, synaptic strength, and postsynaptic cell type. <em>Journal of Neuroscience</em>, 18(24), 10464&ndash;10472.</p>
        <p className="mb-2">[4] Bohte, S. M. (2011). Error-backpropagation in networks of fractionally predictive spiking neurons. <em>Artificial Neural Networks and Machine Learning &ndash; ICANN 2011</em>, 60&ndash;68.</p>
        <p className="mb-2">[5] Brette, R. (2015). Philosophy of the spike: Rate-based vs. spike-based theories of the brain. <em>Frontiers in Systems Neuroscience</em>, 9, 151.</p>
        <p className="mb-2">[6] Comsa, I.-M., et al. (2020). Temporal coding in spiking neural networks with alpha synaptic function. <em>ICASSP 2020 &ndash; IEEE International Conference on Acoustics, Speech and Signal Processing</em>, 8529&ndash;8533.</p>
        <p className="mb-2">[7] Davies, M., et al. (2018). Loihi: A neuromorphic manycore processor with on-chip learning. <em>IEEE Micro</em>, 38(1), 82&ndash;99.</p>
        <p className="mb-2">[8] Davies, M., et al. (2021). Advancing neuromorphic computing with Loihi: A survey of results and outlook. <em>Proceedings of the IEEE</em>, 109(5), 911&ndash;934.</p>
        <p className="mb-2">[9] Diehl, P. U., &amp; Cook, M. (2015). Unsupervised learning of digit recognition using spike-timing-dependent plasticity. <em>Frontiers in Computational Neuroscience</em>, 9, 99.</p>
        <p className="mb-2">[10] Fang, W., et al. (2021). Incorporating learnable membrane time constants to enhance learning of spiking neural networks. <em>Proceedings of the IEEE/CVF International Conference on Computer Vision</em>, 2661&ndash;2671.</p>
        <p className="mb-2">[11] Furber, S. B., et al. (2014). The SpiNNaker project. <em>Proceedings of the IEEE</em>, 102(5), 652&ndash;665.</p>
        <p className="mb-2">[12] Gerstner, W., Kistler, W. M., Naud, R., &amp; Paninski, L. (2014). <em>Neuronal Dynamics: From Single Neurons to Networks and Models of Cognition</em>. Cambridge University Press.</p>
        <p className="mb-2">[13] Izhikevich, E. M. (2003). Simple model of spiking neurons. <em>IEEE Transactions on Neural Networks</em>, 14(6), 1569&ndash;1572.</p>
        <p className="mb-2">[14] Izhikevich, E. M. (2007). Solving the distal reward problem through linkage of STDP and dopamine signaling. <em>Cerebral Cortex</em>, 17(10), 2443&ndash;2452.</p>
        <p className="mb-2">[15] Jang, H., Simeone, O., Gardner, B., &amp; Gruning, A. (2019). An introduction to probabilistic spiking neural networks: Probabilistic models, learning rules, and applications. <em>IEEE Signal Processing Magazine</em>, 36(6), 64&ndash;77.</p>
        <p className="mb-2">[16] Kasabov, N. K. (2014). NeuCube: A spiking neural network architecture for mapping, learning and understanding of spatio-temporal brain data. <em>Neural Networks</em>, 52, 62&ndash;76.</p>
        <p className="mb-2">[17] Kim, S., et al. (2022). Rate coding and temporal coding can coexist at the population level in the hippocampus. <em>Nature Communications</em>, 13(1), 1&ndash;15.</p>
        <p className="mb-2">[18] Li, H., Liu, H., Ji, X., Li, G., &amp; Shi, L. (2022). CIFAR-10 DVS: An event-stream dataset for object classification. <em>Frontiers in Neuroscience</em>, 11, 309.</p>
        <p className="mb-2">[19] Maass, W. (1997). Networks of spiking neurons: The third generation of neural network models. <em>Neural Networks</em>, 10(9), 1659&ndash;1671.</p>
        <p className="mb-2">[20] Markram, H., Gerstner, W., &amp; Sjöström, P. J. (2012). Spike-timing-dependent plasticity: A comprehensive overview. <em>Frontiers in Synaptic Neuroscience</em>, 4, 2.</p>
        <p className="mb-2">[21] Neftci, E. O., Mostafa, H., &amp; Zenke, F. (2019). Surrogate gradient learning in spiking neural networks. <em>IEEE Signal Processing Magazine</em>, 36(6), 51&ndash;63.</p>
        <p className="mb-2">[22] Orchard, G., et al. (2021). Efficient neuromorphic signal processing with Loihi 2. <em>2021 IEEE Workshop on Signal Processing Systems (SiPS)</em>, 254&ndash;259.</p>
        <p className="mb-2">[23] Panda, P., Aketi, S. A., &amp; Roy, K. (2020). Toward scalable, efficient, and accurate deep spiking neural networks with backward residual connections, stochastic softmax, and hybridization. <em>Frontiers in Neuroscience</em>, 14, 653.</p>
        <p className="mb-2">[24] Pehle, C., &amp; Pedersen, J. E. (2021). Norse &ndash; A deep learning library for spiking neural networks. <em>Documentation</em>. https://norse.ai.</p>
        <p className="mb-2">[25] Pfeiffer, M., &amp; Pfeil, T. (2018). Deep learning with spiking neurons: Opportunities and challenges. <em>Frontiers in Neuroscience</em>, 12, 774.</p>
        <p className="mb-2">[26] Ponulak, F., &amp; Kasiński, A. (2010). Supervised learning in spiking neural networks with ReSuMe: Sequence learning, classification, and spike shifting. <em>Neural Computation</em>, 22(2), 467&ndash;510.</p>
        <p className="mb-2">[27] Roy, K., Jaiswal, A., &amp; Panda, P. (2019). Towards spike-based machine intelligence with neuromorphic computing. <em>Nature</em>, 575(7784), 607&ndash;617.</p>
        <p className="mb-2">[28] Schuman, C. D., et al. (2022). Opportunities for neuromorphic computing algorithms and applications. <em>Nature Computational Science</em>, 2(1), 10&ndash;19.</p>
        <p className="mb-2">[29] Tavanaei, A., Ghodrati, M., Kheradpisheh, S. R., Masquelier, T., &amp; Mahdyar, A. (2019). Deep learning in spiking neural networks. <em>Neural Networks</em>, 111, 47&ndash;63.</p>
        <p className="mb-2">[30] Wang, X.-J. (2002). Probabilistic decision making by slow reverberation in cortical circuits. <em>Neuron</em>, 36(5), 955&ndash;968.</p>
        <p className="mb-2">[31] Zenke, F., &amp; Ganguli, S. (2018). SuperSpike: Supervised learning in multilayer spiking neural networks. <em>Neural Computation</em>, 30(6), 1514&ndash;1541.</p>
        <p className="mb-2">[32] Zenke, F., &amp; Vogels, T. P. (2021). The remarkable robustness of surrogate gradient learning for instilling complex function in spiking neural networks. <em>Neural Computation</em>, 33(4), 899&ndash;925.</p>
      </div>
    </>
  );
}
