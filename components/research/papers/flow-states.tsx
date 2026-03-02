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

const coherenceData = [
  { condition: 'Casual', coherence: 0.42, se: 0.05 },
  { condition: 'Competitive', coherence: 0.67, se: 0.04 },
  { condition: 'Spectating', coherence: 0.31, se: 0.06 },
];

const flowTimeData = [
  { minute: 0, casual: 2.1, competitive: 2.3 },
  { minute: 5, casual: 3.2, competitive: 4.1 },
  { minute: 10, casual: 3.8, competitive: 5.2 },
  { minute: 15, casual: 4.1, competitive: 6.0 },
  { minute: 20, casual: 3.9, competitive: 6.4 },
  { minute: 25, casual: 3.5, competitive: 6.1 },
  { minute: 30, casual: 3.3, competitive: 5.8 },
];

const scatterData = [
  { flow: 2.1, kd: 0.6 },
  { flow: 2.8, kd: 0.9 },
  { flow: 3.2, kd: 0.8 },
  { flow: 3.5, kd: 1.1 },
  { flow: 3.9, kd: 1.0 },
  { flow: 4.2, kd: 1.3 },
  { flow: 4.5, kd: 1.2 },
  { flow: 4.8, kd: 1.6 },
  { flow: 5.1, kd: 1.5 },
  { flow: 5.4, kd: 1.9 },
  { flow: 5.6, kd: 1.7 },
  { flow: 5.9, kd: 2.0 },
  { flow: 6.0, kd: 2.1 },
  { flow: 6.3, kd: 2.1 },
  { flow: 6.5, kd: 2.3 },
  { flow: 6.8, kd: 2.4 },
  { flow: 7.0, kd: 2.5 },
  { flow: 7.2, kd: 2.6 },
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

export function FlowStatesPaper() {
  return (
    <>
      {/* --------------------------------------------------------------------
          1. INTRODUCTION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>1. Introduction</h2>

      <p className="mb-4">
        The concept of flow, first articulated by Csikszentmihalyi (1990), describes a psychological
        state of complete absorption in an activity, characterized by the merging of action and
        awareness, a distorted sense of time, loss of reflective self-consciousness, and a profound
        sense of intrinsic motivation. During flow, individuals report that their attention narrows
        to the task at hand while extraneous cognitive processes recede, producing an experience
        often described as effortless yet deeply engaging. Since its initial formulation, flow theory
        has been applied across an extraordinarily diverse range of domains, from surgical performance
        (Csikszentmihalyi &amp; Csikszentmihalyi, 1988) and musical improvisation (de Manzano et al.,
        2010) to athletic competition (Jackson &amp; Marsh, 1996) and creative writing (Perry, 1999).
        The universality of the flow construct across such disparate activities suggests that it may
        reflect a fundamental mode of human cognitive functioning, one in which the brain achieves
        an optimally efficient configuration for sustained, high-level performance.
      </p>

      <p className="mb-4 indent-8">
        From a neuroscientific perspective, flow has been linked to the hypothesis of transient
        hypofrontality, proposed by Dietrich (2004), which posits that flow states arise when
        higher-order prefrontal cortical regions undergo a temporary reduction in activation. This
        downregulation of executive and self-referential processing is thought to free up
        computational resources that can then be allocated to task-relevant sensorimotor and
        attentional networks. Electroencephalographic (EEG) studies have provided partial support
        for this framework. Kramer (2007) demonstrated increased frontal theta power during states
        of heightened concentration in expert athletes, while de Manzano et al. (2010) observed
        characteristic patterns of frontal alpha synchronization during flow-like states in
        professional pianists. More recent work by Katahira et al. (2018) found that frontal midline
        theta activity, particularly at the Fz electrode site, increased significantly during
        experimentally induced flow in arithmetic tasks, and that this increase was accompanied by
        reduced alpha power in parietal regions associated with self-referential processing. These
        findings converge on the idea that flow involves a specific reconfiguration of
        frontoparietal network dynamics, although the precise electrophysiological signature remains
        a subject of active investigation.
      </p>

      <p className="mb-4 indent-8">
        Despite the growing body of literature on flow in sports, music, and laboratory cognitive
        tasks, competitive video gaming represents a conspicuously understudied domain. This is
        surprising for several reasons. First, competitive gaming environments offer an unusually
        high degree of experimental control: game parameters, difficulty levels, and opponent
        behavior can be precisely manipulated, and performance metrics such as kill/death ratios,
        accuracy percentages, and reaction times are automatically and continuously logged. Second,
        competitive gaming is widely reported by practitioners to be a potent inducer of flow
        states, with professional esports athletes frequently describing experiences of &quot;being in
        the zone&quot; during peak performance (Peifer et al., 2014). Third, the competitive gaming
        population is large and growing, with an estimated 3.2 billion gamers worldwide as of 2023,
        making findings from this domain broadly relevant. While a small number of studies have
        examined EEG correlates of gaming engagement (Nacke et al., 2011; Klasen et al., 2012),
        these investigations have generally used non-competitive or single-player paradigms, employed
        relatively low-density EEG montages, and relied on post-session rather than concurrent flow
        assessments. The absence of rigorous, ecologically valid studies of flow during competitive
        gaming leaves a significant gap in our understanding of how competitive social dynamics
        modulate the neural substrates of optimal experience.
      </p>

      <p className="mb-4 indent-8">
        The present study was designed to address this gap by combining high-density 64-channel EEG
        recording with validated concurrent flow assessments during competitive, casual, and
        spectating gaming conditions. We sought to test two primary hypotheses. First, we
        hypothesized (H1) that competitive gaming would produce significantly higher frontal
        theta&ndash;parietal alpha coherence (FTACoh) compared to casual play and passive spectating
        conditions, consistent with the enhanced frontoparietal network engagement predicted by flow
        theory and the transient hypofrontality framework. Second, we hypothesized (H2) that
        self-reported flow scores would positively correlate with in-game performance metrics,
        specifically kill/death (K/D) ratio, providing behavioral evidence that the subjective
        experience of flow is associated with objectively measurable performance gains. By
        investigating these hypotheses within a carefully controlled within-subjects design, we
        aimed to provide the first comprehensive characterization of the neural dynamics underlying
        flow in competitive gaming.
      </p>

      {/* --------------------------------------------------------------------
          2. METHODS
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>2. Methods</h2>

      <h3 style={h3Style}>2.1 Participants</h3>

      <p className="mb-4">
        Forty-eight experienced gamers (32 male, 16 female; age range 18&ndash;32 years, <em>M</em> = 23.4,{' '}
        <em>SD</em> = 3.2) were recruited from the university gaming community and local esports
        organizations. Inclusion criteria required a minimum of 500 hours of documented competitive
        gaming experience in first-person or third-person shooter titles within the preceding
        24 months, as verified by platform-reported play statistics. All participants reported normal
        or corrected-to-normal vision and had no history of neurological or psychiatric disorders.
        Participants were screened for colorblindness using the Ishihara test to ensure they could
        reliably distinguish in-game visual elements. Prior to participation, all individuals
        provided written informed consent in accordance with the Declaration of Helsinki, and the
        study protocol was approved by the University Institutional Review Board (Protocol
        #2024-0347). Participants received $75 compensation for completing all three experimental
        sessions.
      </p>

      <h3 style={h3Style}>2.2 Apparatus</h3>

      <p className="mb-4">
        Electroencephalographic data were acquired using a 64-channel BioSemi ActiveTwo system
        (BioSemi B.V., Amsterdam, Netherlands) with active Ag/AgCl electrodes positioned according
        to the extended 10&ndash;20 system. Signals were sampled at 512 Hz with a 24-bit A/D
        resolution. Additional electrodes were placed at the outer canthi of both eyes and above and
        below the left eye to monitor horizontal and vertical electrooculographic (EOG) activity.
        All electrode offsets were maintained below 25 mV throughout recording sessions. Eye-tracking
        data were simultaneously collected using a Tobii Pro Fusion binocular eye tracker operating
        at 250 Hz, mounted below the display monitor, to provide supplementary measures of gaze
        fixation patterns and pupil dilation. The gaming stimulus was presented on a 27-inch ASUS
        ROG Swift PG279QM monitor running at 240 Hz with a 1 ms response time, ensuring minimal
        input lag. Participants used a standardized peripheral set consisting of a Logitech G Pro X
        Superlight mouse (set to 800 DPI) and a SteelSeries Apex Pro mechanical keyboard. A custom
        arena-style first-person shooter testbed, developed in Unreal Engine 5, served as the
        gaming platform. This testbed was designed to closely replicate the mechanics, pacing, and
        visual complexity of commercially available competitive shooters while providing
        comprehensive server-side logging of all game events with millisecond-precision timestamps.
      </p>

      <h3 style={h3Style}>2.3 Procedure</h3>

      <p className="mb-4">
        The study employed a within-subjects design with three experimental conditions, presented in
        counterbalanced order across participants using a Latin square arrangement. In the{' '}
        <em>casual</em> condition, participants played against computer-controlled opponents (bots)
        set to a low difficulty level, designed to provide minimal competitive pressure while
        maintaining basic gameplay engagement. In the <em>competitive</em> condition, participants
        were matched against human opponents of comparable skill through a custom Elo-based
        matchmaking system, creating a genuinely competitive environment with real-time leaderboard
        standings visible during play. In the <em>spectating</em> condition, participants passively
        watched pre-recorded gameplay footage from competitive matches, presented from a
        first-person perspective identical to the active play conditions. Each condition lasted
        30 minutes, and sessions were separated by a minimum 48-hour washout period to minimize
        carryover effects.
      </p>

      <p className="mb-4 indent-8">
        Upon arrival at each session, participants were fitted with the EEG cap and eye tracker. A
        5-minute resting-state baseline recording was obtained, followed by a 3-minute warm-up
        period in the testbed to reacquaint participants with the controls. During the 30-minute
        experimental block, the Flow Short Scale (FSS; Rheinberg et al., 2003) was administered
        every 5 minutes via a brief semi-transparent overlay that appeared in the center of the
        screen. The FSS is a 10-item instrument that assesses the core dimensions of flow
        experience, including absorption, smooth automatic running, and perceived importance. Each
        item is rated on a 7-point Likert scale. The overlay was designed to be minimally disruptive,
        requiring approximately 15&ndash;20 seconds to complete, and game action was briefly paused
        during its presentation. In-game performance metrics, including kills, deaths, accuracy,
        damage dealt, and spatial positioning data, were continuously logged throughout each session.
      </p>

      <h3 style={h3Style}>2.4 Data Analysis</h3>

      <p className="mb-4">
        EEG data were preprocessed offline using EEGLAB v2024.0 (Delorme &amp; Makeig, 2004) running
        in MATLAB R2024a. Raw signals were first re-referenced to the average of both mastoid
        electrodes and bandpass filtered between 1 and 50 Hz using a zero-phase FIR filter (order =
        3300). Data were then segmented into 2-second non-overlapping epochs, and epochs containing
        gross artifacts (amplitude exceeding &plusmn;150 &mu;V at any channel) were rejected. Extended
        Infomax independent component analysis (ICA) was applied to the remaining data, and
        components corresponding to eye blinks, lateral eye movements, and muscle artifacts were
        identified using the ICLabel classifier (Pion-Tonachini et al., 2019) and removed. On
        average, 5.7 components (<em>SD</em> = 2.1) were rejected per participant per session. After
        ICA-based artifact rejection, an average of 92.3% (<em>SD</em> = 4.6%) of epochs were retained
        for analysis.
      </p>

      <p className="mb-4 indent-8">
        Spectral power was computed for each artifact-free epoch using Welch&apos;s method with
        2-second Hamming windows and 50% overlap, yielding a frequency resolution of 0.5 Hz. Power
        spectral density estimates were extracted for the theta band (4&ndash;8 Hz) and the alpha
        band (8&ndash;13 Hz). Frontal theta power was computed as the average across electrodes Fz,
        F3, F4, FCz, FC3, and FC4. Parietal alpha power was computed as the average across
        electrodes Pz, P3, P4, POz, PO3, and PO4. Frontal theta&ndash;parietal alpha coherence
        (FTACoh) was calculated as the magnitude-squared coherence between the averaged frontal
        theta signal and the averaged parietal alpha signal using the mscohere function in MATLAB,
        serving as the primary neural measure of frontoparietal network coupling. This measure was
        selected based on prior literature suggesting that enhanced theta&ndash;alpha coupling
        reflects the kind of focused yet flexible attentional state characteristic of flow (Sauseng
        et al., 2005; Tozman et al., 2015).
      </p>

      <p className="mb-4 indent-8">
        Statistical analyses were conducted using R v4.3.2 with the lme4 and emmeans packages.
        The primary analysis employed linear mixed-effects models with condition (casual,
        competitive, spectating) as a fixed effect and participant as a random intercept. FTACoh
        served as the dependent variable for neural analyses, while FSS scores served as the
        dependent variable for subjective flow analyses. Post-hoc pairwise comparisons were
        conducted using the Bonferroni correction for multiple comparisons. Effect sizes were
        computed as partial eta-squared (&eta;&sup2;<sub>p</sub>) for omnibus tests and
        Cohen&apos;s <em>d</em> for pairwise comparisons. The relationship between FSS scores and
        performance metrics was assessed using Pearson product-moment correlations and simple linear
        regression. All tests used an alpha level of .05.
      </p>

      {/* --------------------------------------------------------------------
          3. RESULTS
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>3. Results</h2>

      <h3 style={h3Style}>3.1 Frontal Theta&ndash;Parietal Alpha Coherence</h3>

      <p className="mb-4">
        The primary analysis revealed a significant main effect of condition on frontal
        theta&ndash;parietal alpha coherence (<em>F</em>(2, 45) = 14.32, <em>p</em> &lt; .001,{' '}
        &eta;&sup2;<sub>p</sub> = .39). As depicted in Figure 1, FTACoh was highest in the
        competitive condition (<em>M</em> = 0.67, <em>SE</em> = 0.04), intermediate in the casual
        condition (<em>M</em> = 0.42, <em>SE</em> = 0.05), and lowest in the spectating condition
        (<em>M</em> = 0.31, <em>SE</em> = 0.06). Post-hoc Bonferroni-corrected pairwise comparisons
        confirmed that FTACoh was significantly greater in the competitive condition compared to
        both the casual condition (<em>p</em> = .003, <em>d</em> = 1.12) and the spectating
        condition (<em>p</em> &lt; .001, <em>d</em> = 1.58). The casual condition also showed
        significantly higher FTACoh than the spectating condition (<em>p</em> = .041,{' '}
        <em>d</em> = 0.64). These results strongly support Hypothesis 1.
      </p>

      <PaperFigure number={1} caption="Mean frontal theta\u2013parietal alpha coherence (FTACoh) by experimental condition. Error bars represent \u00b11 standard error of the mean. Competitive gaming produced significantly higher coherence than both casual play and passive spectating.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={coherenceData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="condition"
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
            />
            <YAxis
              domain={[0, 0.85]}
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
              label={{
                value: 'FTACoh (magnitude\u00b2)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#1f2937', fontSize: 12 },
              }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [Number(v).toFixed(2), 'Coherence']}
            />
            <Bar dataKey="coherence" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={60} />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>3.2 Descriptive Statistics</h3>

      <p className="mb-4">
        Table 1 presents the descriptive statistics for self-reported flow (FSS), neural coherence
        (FTACoh), and behavioral performance (K/D ratio) across all three experimental conditions.
        The competitive condition yielded the highest values across all three measures, consistent
        with the hypothesis that competitive environments facilitate both the subjective experience
        and the neural substrates of flow. Notably, the standard deviations for FSS scores were
        relatively uniform across conditions, suggesting comparable individual variability in flow
        susceptibility regardless of the environmental context.
      </p>

      <table className="w-full border-collapse my-4" style={{ fontSize: '10pt' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'left' }}>
              Condition
            </th>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              FSS Mean
            </th>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              FSS <em>SD</em>
            </th>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              FTACoh Mean
            </th>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              FTACoh <em>SD</em>
            </th>
            <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              K/D Mean
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px' }}>Casual</td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              3.54
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.92
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.42
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.11
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              2.14
            </td>
          </tr>
          <tr style={{ backgroundColor: '#f9fafb' }}>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px' }}>Competitive</td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              5.41
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.88
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.67
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.09
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              1.18
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px' }}>Spectating</td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              2.17
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.95
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.31
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              0.14
            </td>
            <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', textAlign: 'center' }}>
              &mdash;
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td
              colSpan={6}
              style={{
                border: '1px solid #d1d5db',
                padding: '6px 10px',
                fontSize: '9pt',
                fontStyle: 'italic',
                color: '#6b7280',
              }}
            >
              <strong>Table 1.</strong> Descriptive statistics for Flow Short Scale (FSS), frontal
              theta&ndash;parietal alpha coherence (FTACoh), and kill/death (K/D) ratio across
              conditions. K/D ratio is not applicable to the spectating condition.
            </td>
          </tr>
        </tfoot>
      </table>

      <h3 style={h3Style}>3.3 Flow State Dynamics Over Time</h3>

      <p className="mb-4">
        Analysis of flow state scores over the 30-minute session duration revealed distinct temporal
        profiles for the casual and competitive conditions (Figure 2). In the competitive condition,
        FSS scores increased steeply from baseline (<em>M</em> = 2.3 at minute 0) through the first
        15 minutes, reaching a plateau at approximately minute 15 (<em>M</em> = 6.0) before peaking
        at minute 20 (<em>M</em> = 6.4, <em>SD</em> = 0.8). A modest decline was observed in the
        final 10 minutes of the session, with scores decreasing to 6.1 at minute 25 and 5.8 at
        minute 30, possibly reflecting the onset of cognitive fatigue. In the casual condition, FSS
        scores rose more gradually, peaking earlier at minute 15 (<em>M</em> = 4.1) before declining
        steadily through the remainder of the session. A two-way repeated-measures ANOVA on FSS
        scores with condition and time point as within-subjects factors revealed a significant
        condition &times; time interaction (<em>F</em>(6, 282) = 8.74, <em>p</em> &lt; .001,{' '}
        &eta;&sup2;<sub>p</sub> = .16), indicating that the temporal evolution of flow differed
        meaningfully between conditions. The divergence between conditions became statistically
        significant by minute 5 (<em>p</em> = .012) and widened progressively through minute 20.
      </p>

      <PaperFigure number={2} caption="Flow Short Scale (FSS) scores over 30-minute session duration for casual and competitive conditions. The competitive condition showed steeper initial increase, higher peak flow, and more sustained engagement compared to the casual condition.">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={flowTimeData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="minute"
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
              label={{
                value: 'Time (minutes)',
                position: 'insideBottom',
                offset: -2,
                style: { fill: '#1f2937', fontSize: 12 },
              }}
            />
            <YAxis
              domain={[0, 7.5]}
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
              label={{
                value: 'FSS Score',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#1f2937', fontSize: 12 },
              }}
            />
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#1f2937' }} />
            <Line
              type="monotone"
              dataKey="casual"
              name="Casual"
              stroke="#6b7280"
              strokeWidth={2}
              dot={{ fill: '#6b7280', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="competitive"
              name="Competitive"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <h3 style={h3Style}>3.4 Relationship Between Flow and Performance</h3>

      <p className="mb-4">
        Pearson product-moment correlation analysis revealed a strong positive relationship between
        FSS scores and K/D ratio across all active gaming conditions (<em>r</em> = .74,{' '}
        <em>p</em> &lt; .001; Figure 3). Simple linear regression indicated that each 1-unit
        increase in FSS score predicted a 0.34-unit increase in K/D ratio (<em>b</em> = 0.34,{' '}
        <em>SE</em> = 0.04, <em>t</em>(46) = 8.50, <em>p</em> &lt; .001), with flow scores
        accounting for approximately 55% of the variance in performance
        (<em>R</em>&sup2; = .55, adjusted <em>R</em>&sup2; = .54). This finding strongly supports
        Hypothesis 2 and suggests that the subjective experience of flow is a robust predictor of
        objective gaming performance. Examination of the scatterplot (Figure 3) suggests a broadly
        linear relationship across the full range of flow scores, with no obvious ceiling effects
        or nonlinear trends. It is worth noting that participants who reported the highest flow
        scores (FSS &gt; 6.0) were predominantly drawn from the competitive condition, consistent
        with the interpretation that competitive contexts are more potent elicitors of flow.
      </p>

      <PaperFigure number={3} caption="Scatterplot depicting the relationship between mean Flow Short Scale (FSS) score and kill/death (K/D) ratio across all active gaming conditions. Each point represents one participant\u2019s session-averaged data. The strong positive correlation (r = .74, p < .001) supports the hypothesis that flow is associated with enhanced performance.">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="flow"
              type="number"
              domain={[1.5, 8]}
              name="Flow Score"
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
              label={{
                value: 'FSS Score',
                position: 'insideBottom',
                offset: -2,
                style: { fill: '#1f2937', fontSize: 12 },
              }}
            />
            <YAxis
              dataKey="kd"
              type="number"
              domain={[0, 3]}
              name="K/D Ratio"
              tick={{ fill: '#1f2937', fontSize: 12 }}
              axisLine={{ stroke: '#6b7280' }}
              label={{
                value: 'K/D Ratio',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#1f2937', fontSize: 12 },
              }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => [
                Number(v).toFixed(2),
                name === 'flow' ? 'Flow Score' : 'K/D Ratio',
              ]}
            />
            <Scatter data={scatterData} fill="#8b5cf6" />
          </ScatterChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        To further characterize the neural basis of the flow&ndash;performance link, we conducted a
        mediation analysis examining whether FTACoh mediated the relationship between experimental
        condition and K/D ratio. The indirect effect through FTACoh was significant (indirect{' '}
        <em>b</em> = 0.18, 95% CI [0.09, 0.28], <em>p</em> = .002), suggesting that the
        performance advantage observed in the competitive condition was partially attributable to
        enhanced frontoparietal neural coherence. The direct effect of condition on K/D ratio
        remained significant after controlling for FTACoh (<em>p</em> = .014), indicating partial
        mediation and suggesting that additional mechanisms beyond frontoparietal coupling also
        contribute to the competitive performance advantage.
      </p>

      {/* --------------------------------------------------------------------
          4. DISCUSSION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>4. Discussion</h2>

      <p className="mb-4">
        The present study provides the first systematic investigation of the neural correlates of
        flow states during competitive gaming, combining high-density EEG with concurrent
        self-report flow assessment and objective performance metrics. The results offer strong
        support for both hypotheses. Consistent with H1, competitive gaming produced significantly
        elevated frontal theta&ndash;parietal alpha coherence compared to both casual play and
        passive spectating, with a large effect size (&eta;&sup2;<sub>p</sub> = .39). Consistent
        with H2, self-reported flow scores were strongly correlated with in-game performance
        (<em>r</em> = .74), and each unit increase in flow predicted a meaningful improvement in
        K/D ratio. Taken together, these findings establish that competitive gaming environments
        reliably induce measurable changes in frontoparietal network dynamics that are associated
        with both the subjective experience of flow and enhanced behavioral performance.
      </p>

      <p className="mb-4 indent-8">
        The elevated FTACoh observed during competitive play is consistent with the transient
        hypofrontality hypothesis (Dietrich, 2004), interpreted here not as a global prefrontal
        shutdown but rather as a selective reorganization of frontal activity. Specifically, the
        increased theta coherence between frontal and parietal regions may reflect enhanced
        top-down attentional control mediated by the frontal midline theta system (Cavanagh &amp;
        Frank, 2014), occurring alongside reduced engagement of self-referential and ruminative
        prefrontal networks. This interpretation aligns with recent reformulations of the
        hypofrontality account that emphasize selective rather than wholesale prefrontal
        deactivation (Weber et al., 2009; Harris et al., 2017). The finding also converges with
        work by Tozman et al. (2015), who reported increased frontal theta power during flow-like
        states in chess players, and with Klasen et al. (2012), who observed reduced default-mode
        network activity during engaging first-person shooter gameplay using fMRI. Our contribution
        extends these findings by demonstrating that the critical neural signature is not merely
        frontal theta power in isolation but rather the coherence between frontal theta and parietal
        alpha oscillations, suggesting that flow involves a coordinated reconfiguration of
        distributed frontoparietal circuitry rather than localized changes at any single cortical site.
      </p>

      <p className="mb-4 indent-8">
        The competitive gaming environment likely triggers flow through several converging
        mechanisms that map onto Csikszentmihalyi&apos;s (1990) original preconditions for flow.
        First, competitive matchmaking provides clear, proximal goals (defeat the opponent, climb
        the leaderboard) that orient attention and create a structured framework for action. Second,
        the real-time, interactive nature of competitive play delivers immediate, unambiguous
        feedback on every action, a condition that Csikszentmihalyi identified as critical for
        maintaining the flow state. Third, and perhaps most importantly, skill-based matchmaking
        algorithms dynamically adjust opponent difficulty to maintain an approximate balance between
        the player&apos;s skill level and the challenge presented, effectively automating the
        skill&ndash;challenge balance that is widely regarded as the single most important
        prerequisite for flow induction (Nakamura &amp; Csikszentmihalyi, 2002). The time-course
        analysis further revealed that flow requires an initial &quot;warm-up&quot; period of
        approximately 10 minutes before reaching its full intensity, a finding that has practical
        implications for game session design and tournament scheduling. The gradual decline in flow
        scores observed after minute 20 may reflect the onset of cognitive fatigue, habituation to
        the competitive stimulus, or natural fluctuations in the skill&ndash;challenge balance as
        matchmaking adjusts to ongoing performance data.
      </p>

      <p className="mb-4 indent-8">
        Several limitations of the present study should be acknowledged. First, the laboratory
        setting, while offering excellent experimental control, may not fully capture the social
        and emotional dynamics of naturalistic competitive gaming environments, such as LAN
        tournaments or online ranked play with persistent consequences. Second, our stimulus was
        limited to a single game genre (arena shooter), and the generalizability of these findings
        to other competitive game types, such as real-time strategy, battle royale, or
        multiplayer online battle arena games, remains to be established. Third, the Flow Short
        Scale, while validated and widely used, relies on self-report and introduces brief
        interruptions to gameplay that may themselves modulate the flow experience. Future research
        should explore the use of continuous, unobtrusive physiological markers of flow, such as
        heart rate variability or electrodermal activity, as complementary or alternative measures.
        Fourth, the relatively homogeneous sample of experienced gamers limits the generalizability
        of findings to novice or casual gaming populations, who may exhibit different
        flow-performance relationships. Despite these limitations, the present findings represent a
        significant advance in understanding the neural dynamics of flow in competitive gaming
        and provide a methodological foundation for future work in this emerging area. Future
        investigations should examine flow dynamics in real-world tournament settings, explore
        longitudinal training effects on flow susceptibility, investigate the role of team
        dynamics in multiplayer flow experiences, and test whether neurofeedback protocols targeting
        FTACoh enhancement can be used to train gamers to enter flow states more reliably and
        rapidly.
      </p>

      {/* --------------------------------------------------------------------
          5. CONCLUSION
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>5. Conclusion</h2>

      <p className="mb-4">
        This study demonstrates that competitive gaming environments reliably induce flow states
        characterized by elevated frontal theta&ndash;parietal alpha coherence and enhanced
        behavioral performance. The competitive condition produced significantly higher neural
        coherence and self-reported flow than both casual play and passive spectating, with
        flow scores strongly predicting objective K/D performance metrics. Time-course analysis
        revealed that flow develops progressively over the first 10&ndash;15 minutes of competitive
        play and peaks at approximately 20 minutes, suggesting an optimal session window for peak
        performance. These findings carry important practical implications for game designers
        seeking to create environments that reliably induce flow: effective matchmaking systems that
        maintain an appropriate skill&ndash;challenge balance, clear immediate feedback mechanisms,
        visible progress indicators, and session structures that allow sufficient warm-up time are
        all design elements that can be optimized to support flow induction. More broadly, the
        convergence of neural, subjective, and behavioral evidence presented here supports the
        view that flow represents a distinct and measurable state of optimal brain function, one
        that can be systematically studied and, potentially, deliberately cultivated through
        thoughtful environmental design.
      </p>

      {/* --------------------------------------------------------------------
          REFERENCES
         -------------------------------------------------------------------- */}
      <h2 style={h2Style}>References</h2>

      <ol
        style={{
          fontSize: '10pt',
          lineHeight: 1.8,
          paddingLeft: '1.5rem',
          listStyleType: 'decimal',
        }}
      >
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Cavanagh, J. F., &amp; Frank, M. J. (2014). Frontal theta as a mechanism for cognitive
          control. <em>Trends in Cognitive Sciences</em>, <em>18</em>(8), 414&ndash;421.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Csikszentmihalyi, M. (1990). <em>Flow: The Psychology of Optimal Experience</em>.
          New York: Harper &amp; Row.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Csikszentmihalyi, M., &amp; Csikszentmihalyi, I. S. (Eds.). (1988).{' '}
          <em>Optimal Experience: Psychological Studies of Flow in Consciousness</em>.
          Cambridge: Cambridge University Press.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          de Manzano, &Ouml;., Theorell, T., Harmat, L., &amp; Ull&eacute;n, F. (2010). The
          psychophysiology of flow during piano playing. <em>Emotion</em>, <em>10</em>(3),
          301&ndash;311.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Delorme, A., &amp; Makeig, S. (2004). EEGLAB: An open source toolbox for analysis of
          single-trial EEG dynamics including independent component analysis.{' '}
          <em>Journal of Neuroscience Methods</em>, <em>134</em>(1), 9&ndash;21.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Dietrich, A. (2004). Neurocognitive mechanisms underlying the experience of flow.{' '}
          <em>Consciousness and Cognition</em>, <em>13</em>(4), 746&ndash;761.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Harris, D. J., Vine, S. J., &amp; Wilson, M. R. (2017). Is there an ironic effect of
          flow? Testing the paradoxical relationship between flow and frontal cortical activity.{' '}
          <em>Psychology of Sport and Exercise</em>, <em>32</em>, 10&ndash;17.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Jackson, S. A., &amp; Marsh, H. W. (1996). Development and validation of a scale to
          measure optimal experience: The Flow State Scale.{' '}
          <em>Journal of Sport and Exercise Psychology</em>, <em>18</em>(1), 17&ndash;35.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Katahira, K., Yamazaki, Y., Yamaoka, C., Ozaki, H., Nakagawa, S., &amp; Nagata, N.
          (2018). EEG correlates of the flow state: A combination of increased frontal theta and
          moderate frontocentral alpha rhythm in the mental arithmetic task.{' '}
          <em>Frontiers in Psychology</em>, <em>9</em>, 300.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Klasen, M., Weber, R., Kircher, T. T. J., Mathiak, K. A., &amp; Mathiak, K. (2012).
          Neural contributions to flow experience during video game playing.{' '}
          <em>Social Cognitive and Affective Neuroscience</em>, <em>7</em>(4), 485&ndash;495.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Kramer, D. (2007). Predictions of performance by EEG and ANS parameters in long
          lasting events. <em>International Journal of Psychophysiology</em>, <em>64</em>(1),
          45&ndash;52.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Nacke, L. E., Stellmach, S., &amp; Lindley, C. A. (2011). Electroencephalographic
          assessment of player experience: A full-body interaction game study.{' '}
          <em>Interacting with Computers</em>, <em>23</em>(2), 150&ndash;163.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Nakamura, J., &amp; Csikszentmihalyi, M. (2002). The concept of flow. In C. R. Snyder
          &amp; S. J. Lopez (Eds.), <em>Handbook of Positive Psychology</em> (pp. 89&ndash;105).
          Oxford: Oxford University Press.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Peifer, C., Schulz, A., Schachinger, H., Baumann, N., &amp; Antoni, C. H. (2014). The
          relation of flow-experience and physiological arousal under stress &mdash; Can u shape
          it? <em>Journal of Experimental Social Psychology</em>, <em>53</em>, 62&ndash;69.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Pion-Tonachini, L., Kreutz-Delgado, K., &amp; Makeig, S. (2019). ICLabel: An automated
          electroencephalographic independent component classifier, dataset, and website.{' '}
          <em>NeuroImage</em>, <em>198</em>, 181&ndash;197.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Rheinberg, F., Vollmeyer, R., &amp; Engeser, S. (2003). Die Erfassung des
          Flow-Erlebens [The assessment of flow experience]. In J. Stiensmeier-Pelster &amp; F.
          Rheinberg (Eds.), <em>Diagnostik von Motivation und Selbstkonzept</em> (pp.
          261&ndash;279). G&ouml;ttingen: Hogrefe.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Sauseng, P., Klimesch, W., Schabus, M., &amp; Doppelmayr, M. (2005). Fronto-parietal
          EEG coherence in theta and upper alpha reflect central executive functions of working
          memory. <em>International Journal of Psychophysiology</em>, <em>57</em>(2),
          97&ndash;103.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Tozman, T., Magdas, E. S., MacDougall, H. G., &amp; Bhatt, S. (2015). Understanding
          the psychophysiology of flow: A driving simulator experiment to investigate the
          relationship between flow and heart rate dynamics.{' '}
          <em>International Journal of Psychophysiology</em>, <em>97</em>(3), 183&ndash;190.
        </li>
        <li style={{ paddingLeft: '0.5rem', textIndent: '-0.5rem', marginLeft: '0.5rem' }}>
          Weber, R., Tamborini, R., Westcott-Baker, A., &amp; Kantor, B. (2009). Theorizing flow
          and media enjoyment as cognitive synchronization of attentional and reward networks.{' '}
          <em>Communication Theory</em>, <em>19</em>(4), 397&ndash;422.
        </li>
      </ol>
    </>
  );
}
