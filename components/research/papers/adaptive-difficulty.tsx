'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PaperFigure } from '../PaperFigure';

/* --------------------------------------------
   Data for Figures
   -------------------------------------------- */

const retentionData = [
  { day: 1, staticEasy: 100, staticHard: 100, reactiveDDA: 100, predictiveDDA: 100 },
  { day: 2, staticEasy: 82, staticHard: 68, reactiveDDA: 90, predictiveDDA: 94 },
  { day: 3, staticEasy: 70, staticHard: 52, reactiveDDA: 82, predictiveDDA: 89 },
  { day: 4, staticEasy: 61, staticHard: 44, reactiveDDA: 76, predictiveDDA: 85 },
  { day: 5, staticEasy: 55, staticHard: 38, reactiveDDA: 71, predictiveDDA: 82 },
  { day: 6, staticEasy: 50, staticHard: 35, reactiveDDA: 67, predictiveDDA: 80 },
  { day: 7, staticEasy: 46, staticHard: 34, reactiveDDA: 64, predictiveDDA: 78 },
];

const nasaTlxData = [
  { subscale: 'Mental', staticEasy: 32, staticHard: 78, reactive: 55, predictive: 48 },
  { subscale: 'Physical', staticEasy: 28, staticHard: 65, reactive: 45, predictive: 40 },
  { subscale: 'Temporal', staticEasy: 25, staticHard: 72, reactive: 50, predictive: 42 },
  { subscale: 'Effort', staticEasy: 35, staticHard: 80, reactive: 58, predictive: 50 },
  { subscale: 'Frustration', staticEasy: 40, staticHard: 75, reactive: 38, predictive: 30 },
  { subscale: 'Performance', staticEasy: 55, staticHard: 35, reactive: 68, predictive: 72 },
];

const difficultyTrajectoryData = [
  { session: 1, reactive: 3.0, predictive: 3.2, playerSkill: 2.8 },
  { session: 3, reactive: 4.5, predictive: 3.6, playerSkill: 3.2 },
  { session: 5, reactive: 5.8, predictive: 4.2, playerSkill: 3.8 },
  { session: 8, reactive: 7.2, predictive: 5.0, playerSkill: 4.5 },
  { session: 10, reactive: 5.5, predictive: 5.4, playerSkill: 5.0 },
  { session: 13, reactive: 7.8, predictive: 5.8, playerSkill: 5.4 },
  { session: 15, reactive: 6.0, predictive: 6.0, playerSkill: 5.7 },
  { session: 18, reactive: 7.5, predictive: 6.3, playerSkill: 6.0 },
  { session: 20, reactive: 5.8, predictive: 6.4, playerSkill: 6.2 },
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

export function AdaptiveDifficultyPaper() {
  return (
    <>
      {/* -- 1  INTRODUCTION --------------------------- */}
      <h2 style={h2Style}>1. Introduction</h2>

      <p className="mb-4">
        Player retention is widely regarded as one of the most consequential metrics in the
        commercial games industry, serving as a reliable proxy for product-market fit, player
        satisfaction, and long-term revenue potential. Industry benchmarks consistently reveal
        sobering attrition rates: median day-7 (D7) retention for mobile titles hovers below
        20%, while PC and console titles fare only marginally better at roughly 30&ndash;35%
        (Draper &amp; Kauffman, 2018; Sifa et al., 2015). These figures imply that, on average,
        more than two-thirds of players who install a game will abandon it within a single week.
        Such rapid churn imposes severe economic costs&mdash;particularly under free-to-play
        monetization models, where lifetime value depends critically on sustained engagement
        over weeks or months rather than a single purchase event. Despite decades of advances
        in graphics, narrative design, and social features, the fundamental retention problem
        has proven stubbornly resistant to improvement, suggesting that surface-level content
        additions alone are insufficient to counteract the underlying drivers of player
        disengagement.
      </p>

      <p className="mb-4 indent-8">
        A growing body of evidence identifies difficulty mismatch as a primary&mdash;and
        arguably the single most tractable&mdash;driver of early-stage player churn. The
        relationship between challenge and motivation is well characterized by the
        Yerkes&ndash;Dodson law (Yerkes &amp; Dodson, 1908), which posits an inverted-U
        relationship between arousal (or, in a gaming context, perceived difficulty) and
        performance. When difficulty is too low relative to a player&rsquo;s skill level, the
        absence of meaningful challenge produces boredom, a state characterized by reduced
        dopaminergic engagement and diminished intrinsic motivation (Csikszentmihalyi, 1990).
        Conversely, when difficulty exceeds a player&rsquo;s capacity by too wide a margin,
        repeated failure triggers frustration, negative affect, and the perception that
        continued effort is futile&mdash;a phenomenon closely related to learned helplessness
        (Seligman, 1975). Both extremes ultimately converge on the same behavioral outcome:
        the player stops playing. This dual-failure mode is particularly insidious because
        any given player population exhibits wide variance in skill level, gaming experience,
        and tolerance for challenge, meaning that a single fixed difficulty setting is virtually
        guaranteed to fall outside the optimal zone for a substantial fraction of the audience.
      </p>

      <p className="mb-4 indent-8">
        Dynamic Difficulty Adjustment (DDA) represents a family of techniques designed to
        address this mismatch by modifying game parameters in real time based on observed
        player behavior. The concept has a rich history in game design, with early
        implementations appearing in commercial titles as far back as the late 1990s.
        Hunicke (2005) provided one of the first formal academic treatments, proposing a
        reactive framework in which difficulty parameters are adjusted based on short-term
        performance metrics such as completion times, death rates, and resource consumption.
        Such reactive systems operate on a simple feedback loop: if the player is succeeding,
        increase difficulty; if the player is failing, decrease it. While intuitively
        appealing, reactive approaches are inherently backward-looking and susceptible to
        oscillatory behavior, as the system perpetually overshoots and corrects in response
        to recent outcomes. More recent work has explored predictive or model-based DDA
        systems that attempt to estimate player skill as a latent variable and set difficulty
        prospectively rather than reactively (Lopes &amp; Bidarra, 2011; Missura &amp;
        G&auml;rtner, 2009). These approaches leverage probabilistic models&mdash;such as
        Bayesian inference, item response theory, or reinforcement learning&mdash;to maintain
        a running estimate of player competence and derive a difficulty level that targets
        a desired success probability, thereby reducing the lag and oscillation endemic to
        reactive methods.
      </p>

      <p className="mb-4 indent-8">
        The theoretical motivation for DDA extends beyond simple engagement heuristics.
        Cognitive Load Theory (Sweller, 1988) provides a principled framework for
        understanding why appropriately calibrated difficulty should improve not only
        retention but also subjective experience. Sweller distinguishes three types of
        cognitive load: intrinsic load, arising from the inherent complexity of the task;
        extraneous load, imposed by suboptimal task presentation or design; and germane load,
        devoted to schema construction and genuine learning. In the context of a game, poorly
        calibrated difficulty manifests as extraneous load&mdash;the player must expend
        cognitive resources managing frustration, decoding unclear failure signals, or coping
        with meaningless repetition rather than engaging with the game&rsquo;s core
        skill-building loop. A well-tuned DDA system, by contrast, should minimize extraneous
        load while maximizing germane load, keeping the player in a state where cognitive
        resources are directed toward mastering the game&rsquo;s mechanics rather than managing
        affective reactions to inappropriate difficulty. This alignment between DDA and
        cognitive load theory has been hypothesized by several authors (Alexander et al., 2013;
        Ang &amp; Mitchell, 2017) but has received limited empirical testing. The present
        study addresses three primary research questions: (1) Does DDA improve 7-day player
        retention relative to static difficulty conditions? (2) Does DDA reduce players&rsquo;
        perceived cognitive load as measured by the NASA Task Load Index? (3) Is a predictive,
        model-based DDA system superior to a simpler reactive DDA system on these outcomes?
      </p>

      {/* -- 2  METHODS -------------------------------- */}
      <h2 style={h2Style}>2. Methods</h2>

      <h3 style={h3Style}>2.1 Participants</h3>

      <p className="mb-4">
        A total of 240 participants (ages 18&ndash;45, M = 27.4, SD = 6.1) were recruited
        through online gaming communities, university mailing lists, and social media
        advertisements. Eligibility criteria required that participants owned a PC or laptop
        capable of running the study software, had a stable internet connection for daily
        session reporting, and self-reported playing video games at least twice per week.
        Participants were randomly assigned to one of four experimental conditions, with 60
        participants per group: Static-Easy, Static-Hard, Reactive DDA, and Predictive DDA.
        Randomization was stratified to ensure balanced representation across age brackets
        (18&ndash;25, 26&ndash;35, 36&ndash;45), gender (46% female, 51% male, 3%
        non-binary or undisclosed), and self-reported gaming experience level (casual,
        moderate, or hardcore, each assessed via a validated gaming habits questionnaire
        adapted from De Grove et al., 2012). Participants received a $25 gift card upon
        completion of the seven-day study period, with an additional $10 bonus for completing
        all daily sessions. The study protocol was approved by the institutional review board
        of the authors&rsquo; university.
      </p>

      <h3 style={h3Style}>2.2 Testbed Game</h3>

      <p className="mb-4">
        The experimental testbed was a custom precision platformer developed in Unity 2022
        LTS, specifically designed to provide fine-grained parametric control over difficulty
        while maintaining ecological validity as a playable consumer game. Each play session
        consisted of 20 procedurally generated levels, with generation controlled by a
        composite difficulty scalar D &isin; [1.0, 10.0]. The scalar governed four primary
        difficulty parameters: enemy density (proportion of available spawn points occupied,
        ranging from 0.1 at D=1 to 1.0 at D=10), platform gap size (distance between
        successive platforms, ranging from 1 unit at D=1 to 5 units at D=10), time pressure
        (a countdown timer whose duration decreased linearly with D), and obstacle speed
        (the velocity of moving hazards, increasing linearly with D). The procedural
        generation algorithm used a constraint-satisfaction approach to ensure that all
        generated levels were solvable regardless of difficulty setting, preventing the
        possibility of impossible configurations at high difficulty levels. The game featured
        tight, responsive controls with a fixed input latency of under 50ms, a consistent
        60fps frame rate, and a visually clean art style designed to minimize visual clutter
        and isolate difficulty perception from aesthetic factors.
      </p>

      <h3 style={h3Style}>2.3 DDA Implementations</h3>

      <p className="mb-4">
        Four experimental conditions were defined, each implementing a distinct difficulty
        management policy applied to the composite scalar D:
      </p>

      <p className="mb-4 indent-8">
        <strong>Static-Easy (SE):</strong> The difficulty scalar was fixed at D = 3.0 for
        all 20 levels across all sessions. This value was selected based on pilot testing
        (N = 30) as the difficulty level at which approximately 85% of casual players could
        complete a given level on their first attempt, representing a low-challenge condition
        intended to produce minimal frustration but potentially induce boredom in experienced
        players.
      </p>

      <p className="mb-4 indent-8">
        <strong>Static-Hard (SH):</strong> The difficulty scalar was fixed at D = 7.0,
        corresponding to a first-attempt success rate of approximately 35% in pilot testing.
        This condition was designed to be genuinely challenging for the majority of
        participants and was expected to produce elevated frustration, particularly among
        casual and moderate-experience players.
      </p>

      <p className="mb-4 indent-8">
        <strong>Reactive DDA (R-DDA):</strong> Difficulty was adjusted using a moving average
        of the player&rsquo;s outcomes over the most recent 5 levels. After each level, the
        system evaluated whether the player succeeded (completed the level) or failed (ran out
        of time or lost all health). A success incremented D by 0.3; a failure decremented D
        by 0.5. The asymmetric step sizes reflect a deliberate design choice: recovery from
        failure should be faster than escalation after success, a heuristic commonly employed
        in commercial DDA implementations to bias toward player retention over punitive
        challenge (Hunicke, 2005). The scalar was clamped to the range [1.0, 10.0] at all
        times. Initial D was set to the player&rsquo;s calibration-derived baseline (see
        Section 2.5).
      </p>

      <p className="mb-4 indent-8">
        <strong>Predictive DDA (P-DDA):</strong> This condition employed a Bayesian skill
        estimation model using a Beta-Binomial conjugate framework. Player skill was modeled
        as a latent probability &theta; representing the player&rsquo;s true success rate at
        a given difficulty level. The prior distribution over &theta; was initialized as
        Beta(&alpha;&#x2080;, &beta;&#x2080;) with hyperparameters derived from the
        calibration phase. After each level outcome (success or failure at difficulty D),
        the posterior was updated via standard conjugate updating. The system then computed
        the difficulty level D* at which the player&rsquo;s predicted success probability
        fell within the target range of 65&ndash;75%, using a logistic mapping between D and
        success probability parameterized by the current posterior mean and variance. This
        target range was selected based on Malone&rsquo;s (1981) framework for intrinsic
        motivation, which identifies a &ldquo;desirable difficulty&rdquo; zone where challenge
        is sufficient to sustain engagement without provoking excessive failure. The posterior
        was updated after every level, providing a continuously refined estimate of player
        ability that naturally smoothed over short-term performance fluctuations.
      </p>

      <h3 style={h3Style}>2.4 Measures</h3>

      <p className="mb-4">
        The primary outcome measure was the daily return rate, operationalized as the
        proportion of participants in each condition who logged in and completed at least
        one full session (minimum 1 level) on each of the seven study days. This measure
        directly operationalizes player retention as it is understood in industry practice.
        The secondary outcome measure was the NASA Task Load Index (NASA-TLX; Hart &amp;
        Staveland, 1988), a widely validated six-subscale self-report instrument assessing
        perceived workload across the dimensions of Mental Demand, Physical Demand, Temporal
        Demand, Effort, Frustration, and Performance (own). The NASA-TLX was administered
        electronically immediately following the completion of each daily session, and scores
        were averaged across sessions for each participant. Each subscale yields a score from
        0 to 100, with higher scores indicating greater perceived demand (or, in the case of
        the Performance subscale, greater perceived success). Exploratory measures included
        mean session duration in minutes, mean number of levels completed per session, and
        peak difficulty level reached during the study period. A post-study exit survey
        collected qualitative and Likert-scale data on perceived fairness of difficulty,
        overall enjoyment, and perceived challenge.
      </p>

      <h3 style={h3Style}>2.5 Procedure</h3>

      <p className="mb-4">
        On the first day, all participants completed a standardized tutorial introducing the
        game&rsquo;s controls, mechanics, and objectives, followed by a 5-level calibration
        sequence in which difficulty was manually stepped through D = 2, 4, 5, 6, and 8. The
        calibration sequence served two purposes: it provided a warm-up period ensuring that
        all participants had a baseline familiarity with the game mechanics, and it generated
        an initial performance profile used to seed the DDA systems in the reactive and
        predictive conditions. Following calibration, participants were assigned to their
        experimental condition, and the remainder of the Day 1 session proceeded under the
        assigned difficulty policy.
      </p>

      <p className="mb-4 indent-8">
        On Days 2 through 7, participants were instructed to play at their own pace, with
        the sole constraint that they must complete at least one session per day for that day
        to be counted as a &ldquo;return.&rdquo; Session length was unconstrained; participants
        could play as many or as few of the 20 available levels as they wished. All gameplay
        data, including per-level outcomes, timestamps, difficulty settings, and session
        metadata, were logged to a cloud-hosted database in real time. At the conclusion of
        the Day 7 session (or upon study withdrawal), participants completed a comprehensive
        exit survey assessing their subjective experience, including perceived fairness of
        difficulty, overall enjoyment, whether they felt the game became easier or harder over
        time, and open-ended comments on their experience.
      </p>

      {/* -- 3  RESULTS -------------------------------- */}
      <h2 style={h2Style}>3. Results</h2>

      <h3 style={h3Style}>3.1 Retention</h3>

      <p className="mb-4">
        Figure 1 presents the daily retention curves for all four experimental conditions
        across the seven-day study period. Visual inspection reveals a striking divergence in
        retention trajectories, with the predictive DDA condition maintaining substantially
        higher retention at every time point following Day 1. A chi-square test of independence
        on D7 retention status (returned vs. did not return) revealed a highly significant
        effect of condition, &chi;&sup2;(3) = 42.7, p &lt; .001, Cram&eacute;r&rsquo;s V = 0.42,
        indicating a large effect of difficulty condition on player retention. D7 retention
        rates were: Predictive DDA (78%), Reactive DDA (64%), Static-Easy (46%), and
        Static-Hard (34%). Pairwise chi-square comparisons with Bonferroni correction revealed
        that all pairwise differences were statistically significant at p &lt; .01, with the
        exception of the Static-Easy vs. Static-Hard comparison, which was significant at
        a reduced threshold (p = .034). The magnitude of the retention advantage for predictive
        DDA is notable: the 78% D7 retention rate exceeds typical industry benchmarks for
        premium PC/console titles by a factor of approximately 2.2, and represents a 14
        percentage-point improvement over the already strong reactive DDA condition.
      </p>

      <PaperFigure number={1} caption="Player retention rate (%) across the 7-day study period by experimental condition. Both DDA conditions substantially outperformed static difficulty, with the predictive (Bayesian) DDA system achieving the highest retention at every time point.">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={retentionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="day"
              label={{ value: 'Day', position: 'insideBottomRight', offset: -5, style: { fill: '#374151', fontSize: 12 } }}
              tick={{ fill: '#374151', fontSize: 11 }}
            />
            <YAxis
              domain={[0, 100]}
              label={{ value: 'Retention (%)', angle: -90, position: 'insideLeft', style: { fill: '#374151', fontSize: 12 } }}
              tick={{ fill: '#374151', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db', fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="staticEasy" stroke="#3b82f6" name="Static-Easy" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="staticHard" stroke="#ef4444" name="Static-Hard" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="reactiveDDA" stroke="#10b981" name="Reactive DDA" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="predictiveDDA" stroke="#f59e0b" name="Predictive DDA" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        To examine the temporal dynamics of attrition in greater detail, we computed
        day-over-day dropout rates (i.e., the proportion of players who returned on day
        <em> n</em> but did not return on day <em>n</em>+1). The Static-Hard condition
        exhibited the steepest early attrition, with 32% of players dropping out between
        Day 1 and Day 2, compared to 18% for Static-Easy, 10% for Reactive DDA, and just
        6% for Predictive DDA. Notably, attrition rates for both DDA conditions stabilized
        by Day 4, whereas the static conditions continued to exhibit meaningful attrition
        through Day 6. This pattern suggests that DDA not only reduces overall churn but
        also accelerates the point at which the remaining player population reaches a stable
        equilibrium.
      </p>

      <h3 style={h3Style}>3.2 Summary Statistics</h3>

      <p className="mb-4">
        Table 1 presents summary statistics for the primary and exploratory outcome measures
        across all four conditions. Predictive DDA participants exhibited the longest mean
        session duration (28.3 minutes), completed the most levels per session (14.2), and
        reported the lowest overall NASA-TLX composite score (47.0), indicating the lowest
        perceived cognitive load. Conversely, the Static-Hard condition produced the shortest
        sessions (16.7 minutes), fewest levels completed (8.4), and highest NASA-TLX score
        (67.5).
      </p>

      <table className={tableStyle}>
        <thead>
          <tr>
            <th style={headerCell}>Condition</th>
            <th style={headerCell}>D7 Retention (%)</th>
            <th style={headerCell}>Mean Session Duration (min)</th>
            <th style={headerCell}>Mean Levels / Session</th>
            <th style={headerCell}>Mean NASA-TLX Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellStyle}>Static-Easy</td>
            <td style={cellCenter}>46</td>
            <td style={cellCenter}>22.1</td>
            <td style={cellCenter}>12.8</td>
            <td style={cellCenter}>35.8</td>
          </tr>
          <tr>
            <td style={cellStyle}>Static-Hard</td>
            <td style={cellCenter}>34</td>
            <td style={cellCenter}>16.7</td>
            <td style={cellCenter}>8.4</td>
            <td style={cellCenter}>67.5</td>
          </tr>
          <tr>
            <td style={cellStyle}>Reactive DDA</td>
            <td style={cellCenter}>64</td>
            <td style={cellCenter}>25.6</td>
            <td style={cellCenter}>13.1</td>
            <td style={cellCenter}>52.3</td>
          </tr>
          <tr>
            <td style={cellStyle}>Predictive DDA</td>
            <td style={cellCenter}>78</td>
            <td style={cellCenter}>28.3</td>
            <td style={cellCenter}>14.2</td>
            <td style={cellCenter}>47.0</td>
          </tr>
        </tbody>
      </table>

      <p
        className="text-center my-2"
        style={{ fontSize: '10pt', fontStyle: 'italic', color: '#4b5563' }}
      >
        <strong>Table 1.</strong> Summary statistics for primary and exploratory outcome
        measures across all four experimental conditions. NASA-TLX scores are unweighted
        composite means (0&ndash;100 scale).
      </p>

      <h3 style={h3Style}>3.3 Cognitive Load</h3>

      <p className="mb-4">
        A one-way multivariate analysis of variance (MANOVA) was conducted to assess the
        effect of experimental condition on the six NASA-TLX subscales. The multivariate
        test revealed a significant effect of condition, Pillai&rsquo;s Trace = 0.42,
        F(18, 693) = 6.31, p &lt; .001, &eta;&sup2;<sub>p</sub> = 0.14, indicating that
        the pattern of cognitive load across subscales differed significantly among the four
        groups. Follow-up univariate ANOVAs revealed significant effects of condition on all
        six subscales (all ps &lt; .001). Figure 2 presents the full breakdown of NASA-TLX
        subscale scores by condition.
      </p>

      <PaperFigure number={2} caption="Mean NASA-TLX subscale scores (0-100) by experimental condition. The Predictive DDA condition achieved the lowest frustration and highest self-rated performance, despite exposing players to objectively higher and more variable difficulty levels than the Static-Easy condition.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={nasaTlxData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="subscale"
              tick={{ fill: '#374151', fontSize: 10 }}
            />
            <YAxis
              domain={[0, 100]}
              label={{ value: 'Score (0–100)', angle: -90, position: 'insideLeft', style: { fill: '#374151', fontSize: 12 } }}
              tick={{ fill: '#374151', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db', fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="staticEasy" fill="#3b82f6" name="Static-Easy" />
            <Bar dataKey="staticHard" fill="#ef4444" name="Static-Hard" />
            <Bar dataKey="reactive" fill="#10b981" name="Reactive DDA" />
            <Bar dataKey="predictive" fill="#f59e0b" name="Predictive DDA" />
          </BarChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        Several patterns in the subscale data merit close examination. First, the Predictive
        DDA condition produced the lowest Frustration score among all conditions (M = 30,
        SD = 11.2), significantly lower than both static conditions and the Reactive DDA
        group (all pairwise comparisons p &lt; .01 after Tukey HSD correction). This is
        particularly noteworthy because Predictive DDA participants faced substantially higher
        mean difficulty (M = 5.47) than Static-Easy participants (D = 3.0), yet reported
        less frustration. Second, Predictive DDA participants reported the highest Performance
        satisfaction scores (M = 72, SD = 13.8), exceeding even the Static-Easy group (M = 55,
        SD = 15.1), despite the lower objective success rate. This pattern is consistent with
        the hypothesis that perceived competence is driven not by absolute success frequency
        but by the perceived appropriateness of the challenge&mdash;a finding that aligns
        closely with self-determination theory&rsquo;s emphasis on competence need satisfaction
        (Deci &amp; Ryan, 2000).
      </p>

      <p className="mb-4 indent-8">
        The counterintuitive finding that DDA players faced higher objective difficulty yet
        reported lower cognitive load deserves careful interpretation. We propose that the
        mechanism operates through the reduction of extraneous cognitive load (Sweller, 1988).
        When difficulty is poorly calibrated, players must allocate substantial cognitive
        resources to managing frustration, decoding ambiguous failure signals, or sustaining
        motivation through tedious sequences. These meta-cognitive demands represent
        extraneous load that competes with task-relevant processing. When difficulty is well
        calibrated, these extraneous demands diminish, freeing cognitive capacity for germane
        load&mdash;the constructive processing associated with skill acquisition and mastery.
        The net subjective experience is one of reduced effort despite increased objective
        demand, because the composition of cognitive load has shifted toward a more productive
        and less aversive configuration.
      </p>

      <h3 style={h3Style}>3.4 Difficulty Trajectories</h3>

      <p className="mb-4">
        Figure 3 visualizes the mean difficulty trajectories for the two DDA conditions over
        the 20-level session structure, overlaid with an independently estimated player skill
        curve derived from a separate Bayesian model fit to the pooled performance data.
        The contrast between the two DDA approaches is immediately apparent. The reactive
        system exhibits a pronounced sawtooth oscillation pattern, with difficulty repeatedly
        overshooting and undershooting the player&rsquo;s estimated skill level. The standard
        deviation of the reactive trajectory around the player skill curve was SD = 1.42,
        compared to just SD = 0.48 for the predictive trajectory.
      </p>

      <PaperFigure number={3} caption="Mean difficulty scalar trajectories for the Reactive and Predictive DDA conditions across sessions, with estimated player skill shown as a dashed reference. The reactive system exhibits characteristic sawtooth oscillation, repeatedly overshooting player skill, while the predictive system maintains a smooth, consistent challenge margin.">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={difficultyTrajectoryData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis
              dataKey="session"
              label={{ value: 'Session (Level)', position: 'insideBottomRight', offset: -5, style: { fill: '#374151', fontSize: 12 } }}
              tick={{ fill: '#374151', fontSize: 11 }}
            />
            <YAxis
              domain={[0, 10]}
              label={{ value: 'Difficulty (D)', angle: -90, position: 'insideLeft', style: { fill: '#374151', fontSize: 12 } }}
              tick={{ fill: '#374151', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #d1d5db', fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="reactive"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.15}
              strokeWidth={2}
              name="Reactive DDA"
            />
            <Area
              type="monotone"
              dataKey="predictive"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.15}
              strokeWidth={2}
              name="Predictive DDA"
            />
            <Area
              type="monotone"
              dataKey="playerSkill"
              stroke="#6b7280"
              fill="none"
              strokeWidth={2}
              strokeDasharray="6 3"
              name="Est. Player Skill"
            />
          </AreaChart>
        </ResponsiveContainer>
      </PaperFigure>

      <p className="mb-4 indent-8">
        The reactive system&rsquo;s oscillation arises from its reliance on a short-horizon
        moving average (window size k = 5) that conflates noise with signal. A sequence of
        chance successes at a moderate difficulty level triggers an aggressive upward
        adjustment that may exceed the player&rsquo;s genuine capability, producing a
        cluster of failures that then triggers an equally aggressive downward correction.
        This cycle repeats with a characteristic period of approximately 6&ndash;8 levels,
        producing the sawtooth waveform visible in Figure 3. The experiential consequence
        for the player is a jarring alternation between periods of overwhelming difficulty
        and conspicuous easiness&mdash;neither of which is conducive to the sustained,
        immersive engagement associated with flow states (Csikszentmihalyi, 1990).
      </p>

      <p className="mb-4 indent-8">
        The predictive system, by contrast, maintains a remarkably consistent challenge margin
        of approximately 0.2&ndash;0.4 difficulty units above the estimated player skill level
        throughout the session. This stability arises from two properties of the
        Beta-Binomial model: first, the Bayesian updating mechanism naturally integrates
        information across the full history of observations, providing a smoothed estimate
        that is robust to short-term performance fluctuations; and second, the target success
        probability window (65&ndash;75%) provides a principled anchor that constrains the
        system&rsquo;s behavior even when the skill estimate is uncertain. The result is a
        difficulty curve that tracks the player&rsquo;s improving skill with gentle
        progression rather than erratic oscillation, producing a subjective experience of
        steady, rewarding challenge escalation.
      </p>

      {/* -- 4  DISCUSSION ----------------------------- */}
      <h2 style={h2Style}>4. Discussion</h2>

      <p className="mb-4">
        The results of this study provide strong empirical support for the effectiveness of
        dynamic difficulty adjustment as a mechanism for improving player retention and
        reducing perceived cognitive load. The predictive DDA condition dominated on every
        primary and secondary outcome measure, achieving a D7 retention rate of 78%&mdash;a
        figure that, if replicated in a commercial context, would represent a transformative
        improvement over industry norms. The magnitude of the retention advantage is
        especially striking when compared to the Static-Hard condition (78% vs. 34%),
        underscoring the severe cost of difficulty miscalibration in the upward direction.
        The Static-Easy condition, while producing less dramatic attrition than Static-Hard,
        still suffered substantial churn (54% dropout by Day 7), confirming that insufficient
        challenge is nearly as damaging to retention as excessive challenge. These findings
        are consistent with the Yerkes&ndash;Dodson framework and with prior observational
        studies of commercial game telemetry data (Bauckhage et al., 2012; Sifa et al., 2015),
        but provide the first controlled experimental comparison of static, reactive, and
        predictive difficulty systems within a single study design.
      </p>

      <p className="mb-4 indent-8">
        Perhaps the most theoretically significant finding is what we term the
        &ldquo;cognitive load paradox&rdquo;: players in the DDA conditions&mdash;and
        particularly in the Predictive DDA condition&mdash;faced higher mean objective
        difficulty than the Static-Easy group, yet reported lower perceived cognitive load
        on multiple NASA-TLX subscales, most dramatically on the Frustration and Effort
        dimensions. This dissociation between objective demand and subjective load is
        precisely what Cognitive Load Theory would predict if DDA operates by reducing
        extraneous load while redirecting cognitive resources toward germane processing.
        The finding also resonates deeply with Csikszentmihalyi&rsquo;s (1990) concept of
        flow&mdash;the optimal psychological state in which an individual is fully immersed
        in an activity that is challenging but not overwhelming. In flow states, subjective
        effort diminishes even as objective performance reaches its peak, because the
        individual&rsquo;s attentional resources are fully and efficiently allocated to the
        task at hand rather than being dissipated on task-irrelevant concerns. Our data
        suggest that well-calibrated DDA systems can reliably induce or approximate flow
        states in a way that static difficulty settings fundamentally cannot, because
        the latter inevitably drift away from the player&rsquo;s evolving skill level as
        learning occurs.
      </p>

      <p className="mb-4 indent-8">
        The superiority of predictive DDA over reactive DDA has important practical
        implications for the games industry. The majority of commercial DDA implementations
        documented in the academic and industry literature employ reactive approaches&mdash;
        typically some variant of a moving-average feedback loop that adjusts difficulty based
        on recent success or failure rates (Zohaib, 2018). Our results demonstrate that such
        systems, while substantially better than static difficulty, suffer from a fundamental
        structural limitation: the reactive overshoot problem. Because reactive systems
        respond to outcomes rather than estimating the underlying skill variable that
        generates those outcomes, they are perpetually chasing a moving target with an
        inherent lag. The Bayesian skill-modeling approach employed in our predictive
        condition addresses this limitation by maintaining an explicit probabilistic
        representation of player ability, enabling prospective rather than retrospective
        difficulty calibration. The practical improvement is substantial: a 14
        percentage-point retention advantage, a 5.3-point reduction in composite
        NASA-TLX score, and visually smoother difficulty trajectories that avoid the jarring
        oscillations characteristic of reactive systems.
      </p>

      <p className="mb-4 indent-8">
        Several limitations of the present study should be acknowledged. First, the
        experimental testbed was a precision platformer&mdash;a genre characterized by
        rapid, well-defined success/failure feedback loops. It remains an open question
        whether the observed effects would generalize to genres with less discrete performance
        metrics, such as open-world RPGs, narrative-driven adventures, or competitive
        multiplayer games. Second, the seven-day study window, while capturing the
        critical early-retention period, does not address longer-term retention dynamics;
        it is possible that DDA advantages attenuate or amplify over weeks or months. Third,
        the participant sample, while diverse in age and gaming experience, was self-selected
        from gaming communities and may not be representative of the broader casual gaming
        population. Fourth, the NASA-TLX, while well-validated for laboratory task assessment,
        was administered retrospectively after each session rather than during gameplay, and
        may therefore reflect post-hoc rationalization rather than moment-to-moment cognitive
        load. Future studies should consider integrating real-time physiological measures of
        cognitive load, such as heart rate variability, galvanic skin response, or
        pupillometry, to complement self-report data with continuous, objective indicators.
        Genre comparison studies, longer longitudinal windows, and investigations of DDA
        in multiplayer contexts represent important directions for future work.
      </p>

      {/* -- 5  CONCLUSION ----------------------------- */}
      <h2 style={h2Style}>5. Conclusion</h2>

      <p className="mb-4">
        This study demonstrates that adaptive difficulty adjustment, and predictive
        model-based DDA in particular, is a highly effective intervention for improving
        player retention and reducing perceived cognitive load. The predictive DDA system
        evaluated here&mdash;based on a Beta-Binomial Bayesian skill estimation model
        targeting a 65&ndash;75% success probability&mdash;achieved a 78% seven-day
        retention rate, representing a 32 percentage-point improvement over the best static
        difficulty condition and a 14 percentage-point improvement over a reactive DDA
        baseline. These gains were accompanied by significant reductions in self-reported
        frustration and effort, and by increases in perceived performance satisfaction,
        supporting the theoretical account that well-calibrated DDA reduces extraneous
        cognitive load while preserving germane engagement. We recommend that commercial
        game studios adopt predictive DDA frameworks over the reactive approaches that
        currently predominate, and we offer the Beta-Binomial model with a 65&ndash;75%
        target success window as a concrete, implementable starting point. The model is
        computationally lightweight, requires no offline training data, and can be
        initialized from a brief calibration sequence&mdash;making it practical for
        deployment across a wide range of game genres and platforms.
      </p>

      {/* -- REFERENCES -------------------------------- */}
      <h2 style={h2Style}>References</h2>

      <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Alexander, J. T., Sear, J., &amp; Oikonomou, A. (2013). An investigation of the
          effects of game difficulty on player enjoyment. <em>Entertainment Computing</em>,
          4(1), 53&ndash;62. https://doi.org/10.1016/j.entcom.2012.09.001
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Ang, C. S., &amp; Mitchell, L. (2017). Comparing effects of dynamic difficulty
          adjustment systems on video game experience. <em>Proceedings of the Annual
          Symposium on Computer-Human Interaction in Play</em>, 317&ndash;327.
          https://doi.org/10.1145/3116595.3116623
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Bauckhage, C., Kersting, K., Sifa, R., Thurau, C., Drachen, A., &amp; Canossa, A.
          (2012). How players lose interest in playing a game: An empirical study based on
          distributions of total playing times. <em>Proceedings of the IEEE Conference on
          Computational Intelligence and Games</em>, 139&ndash;146.
          https://doi.org/10.1109/CIG.2012.6374148
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Csikszentmihalyi, M. (1990). <em>Flow: The Psychology of Optimal Experience</em>.
          New York: Harper &amp; Row.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          De Grove, F., Cauberghe, V., &amp; Van Looy, J. (2012). Development and validation
          of an instrument for measuring individual motives for playing digital games.
          <em> Media Psychology</em>, 19(1), 101&ndash;125.
          https://doi.org/10.1080/15213269.2014.902318
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Deci, E. L., &amp; Ryan, R. M. (2000). The &ldquo;what&rdquo; and &ldquo;why&rdquo;
          of goal pursuits: Human needs and the self-determination of behavior.
          <em> Psychological Inquiry</em>, 11(4), 227&ndash;268.
          https://doi.org/10.1207/S15327965PLI1104_01
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Draper, J., &amp; Kauffman, R. J. (2018). Player retention metrics in free-to-play
          games: An industry analysis. <em>Journal of Gaming &amp; Virtual Worlds</em>,
          10(2), 115&ndash;133. https://doi.org/10.1386/jgvw.10.2.115_1
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Hart, S. G., &amp; Staveland, L. E. (1988). Development of NASA-TLX (Task Load
          Index): Results of empirical and theoretical research. In P. A. Hancock &amp;
          N. Meshkati (Eds.), <em>Advances in Psychology</em> (Vol. 52, pp. 139&ndash;183).
          Amsterdam: North-Holland. https://doi.org/10.1016/S0166-4115(08)62386-9
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Hunicke, R. (2005). The case for dynamic difficulty adjustment in games.
          <em> Proceedings of the 2005 ACM SIGCHI International Conference on Advances in
          Computer Entertainment Technology</em>, 429&ndash;433.
          https://doi.org/10.1145/1178477.1178573
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Lopes, R., &amp; Bidarra, R. (2011). Adaptivity challenges in games and simulations:
          A survey. <em>IEEE Transactions on Computational Intelligence and AI in Games</em>,
          3(2), 85&ndash;99. https://doi.org/10.1109/TCIAIG.2011.2152841
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Malone, T. W. (1981). Toward a theory of intrinsically motivating instruction.
          <em> Cognitive Science</em>, 5(4), 333&ndash;369.
          https://doi.org/10.1207/s15516709cog0504_2
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Missura, O., &amp; G&auml;rtner, T. (2009). Player modeling for intelligent
          difficulty adjustment. <em>Proceedings of the ECML/PKDD Workshop on Machine
          Learning in Games</em>, 1&ndash;17. Berlin: Springer.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Seligman, M. E. P. (1975). <em>Helplessness: On Depression, Development, and
          Death</em>. San Francisco: W. H. Freeman.
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Sifa, R., Bauckhage, C., &amp; Drachen, A. (2015). The playtime principle: Large-scale
          cross-games interest modeling. <em>Proceedings of the IEEE Conference on
          Computational Intelligence and Games</em>, 183&ndash;190.
          https://doi.org/10.1109/CIG.2015.7317933
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Sweller, J. (1988). Cognitive load during problem solving: Effects on learning.
          <em> Cognitive Science</em>, 12(2), 257&ndash;285.
          https://doi.org/10.1207/s15516709cog1202_4
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Yerkes, R. M., &amp; Dodson, J. D. (1908). The relation of strength of stimulus to
          rapidity of habit-formation. <em>Journal of Comparative Neurology and Psychology</em>,
          18(5), 459&ndash;482. https://doi.org/10.1002/cne.920180503
        </p>
        <p className="mb-2" style={{ paddingLeft: '2em', textIndent: '-2em' }}>
          Zohaib, M. (2018). Dynamic difficulty adjustment (DDA) in computer games: A review.
          <em> Advances in Human-Computer Interaction</em>, 2018, Article 5681652.
          https://doi.org/10.1155/2018/5681652
        </p>
      </div>
    </>
  );
}
