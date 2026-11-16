/**
 * The human sciences division: psychology (Psychology & Behaviour) and the
 * social sciences (Economics & Social Science). Fictional authors, papers and
 * venues; the citation graph is hand-built so that h and r disagree on purpose.
 */
import type { Author, Paper } from '../types';

const JBS = 'RMH Journal of Behavioural Science';
const RCH = 'RMH Review of Cognition and Habit';
const SCL = 'RMH Social Cognition Letters';
const ROE = 'RMH Review of Economics';
const JMD = 'RMH Journal of Market Design';
const SSQ = 'RMH Social Science Quarterly';

export const HUMAN_AUTHORS: readonly Author[] = [
  { id: 'priya-venkataraghavan', name: 'Priya Venkataraghavan', field: 'psychology', role: 'Principal Investigator', lab: 'Decision Lab', since: 2009 },
  { id: 'henrik-solvang', name: 'Henrik Solvang', field: 'psychology', role: 'Senior Scientist', lab: 'Habit and Attention Lab', since: 2012 },
  { id: 'yuna-hashimoto', name: 'Yuna Hashimoto', field: 'psychology', role: 'Postdoctoral Fellow', lab: 'Habit and Attention Lab', since: 2021 },
  { id: 'chidubem-abara', name: 'Chidubem Abara', field: 'psychology', role: 'Staff Scientist', lab: 'Social Cognition Group', since: 2015 },
  { id: 'leila-hadjiev', name: 'Leila Hadjiev', field: 'psychology', role: 'Research Fellow', lab: 'Social Cognition Group', since: 2019 },
  { id: 'tomasz-wierzbicki', name: 'Tomasz Wierzbicki', field: 'social-sciences', role: 'Principal Investigator', lab: 'Platform Economics Group', since: 2008 },
  { id: 'ximena-calderon', name: 'Ximena Calderon', field: 'social-sciences', role: 'Senior Scientist', lab: 'Platform Economics Group', since: 2013 },
  { id: 'seun-adebayo', name: 'Seun Adebayo', field: 'social-sciences', role: 'Staff Scientist', lab: 'Market Design Lab', since: 2016 },
  { id: 'dalia-rahmani', name: 'Dalia Rahmani', field: 'social-sciences', role: 'Research Fellow', lab: 'Market Design Lab', since: 2020 },
  { id: 'nadia-kowalczyk', name: 'Nadia Kowalczyk', field: 'social-sciences', role: 'Staff Scientist', lab: 'Labour and Welfare Group', since: 2018 },
];

export const HUMAN_PAPERS: readonly Paper[] = [
  // ---- Psychology & Behaviour ----
  {
    id: 'daily-streaks-and-habit-formation',
    title: 'Daily Streaks and the Formation of Habit: A Longitudinal Field Study',
    authors: ['henrik-solvang', 'priya-venkataraghavan'],
    year: 2012,
    field: 'psychology',
    venue: RCH,
    abstract:
      'We followed 41,000 new users for 180 days to test whether a visible consecutive-day counter accelerates habit formation. Automaticity ratings rose 0.6 standard deviations faster under the counter, but the effect was concentrated among users who completed the first seven days. We argue that the counter works as a cue for repetition in context rather than as an incentive in itself.',
    keywords: ['habit formation', 'streaks', 'automaticity', 'field study', 'cue-based behaviour'],
    refs: [],
  },
  {
    id: 'loss-aversion-in-virtual-currency-spending',
    title: 'Loss Aversion in Virtual Currency Spending',
    authors: ['priya-venkataraghavan'],
    year: 2013,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Participants spent in-platform coins in a series of matched gain and loss framings. Framing a purchase as forfeiting a balance reduced spending by 22 percent relative to framing it as acquiring an item of equal value, with a loss-to-gain weighting of 1.9. The asymmetry persisted when coins were convertible to cash-equivalent value, which rules out a pure novelty account.',
    keywords: ['loss aversion', 'virtual currency', 'framing', 'mental accounting', 'spending'],
    refs: [],
  },
  {
    id: 'variable-reward-schedules-and-persistence',
    title: 'Variable Reward Schedules and Persistence in Repeated Tasks',
    authors: ['priya-venkataraghavan'],
    year: 2014,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Across four experiments, participants repeated a low-value task under fixed, variable-ratio or no reward. Variable schedules produced the longest persistence after rewards were withdrawn, yet also the largest self-reported regret at the end of the session. We separate the persistence into an anticipation component and a sunk-effort component with a simple two-parameter model.',
    keywords: ['reward schedules', 'persistence', 'extinction', 'anticipation', 'regret'],
    refs: ['loss-aversion-in-virtual-currency-spending'],
  },
  {
    id: 'attention-residue-in-feed-scrolling',
    title: 'Attention Residue After Interrupted Feed Scrolling',
    authors: ['henrik-solvang'],
    year: 2015,
    field: 'psychology',
    venue: RCH,
    abstract:
      'Readers who left a chronological feed mid-scroll performed worse on a subsequent comprehension task than readers who left at a natural stopping point. The deficit lasted roughly four minutes and scaled with the number of unread items passed. Eye-tracking indicates that residual attention remains anchored to the abandoned list.',
    keywords: ['attention', 'task switching', 'feeds', 'interruption', 'eye tracking'],
    refs: ['daily-streaks-and-habit-formation'],
  },
  {
    id: 'social-comparison-in-public-leaderboards',
    title: 'Social Comparison and Effort in Public Leaderboards',
    authors: ['chidubem-abara'],
    year: 2016,
    field: 'psychology',
    venue: SCL,
    abstract:
      'We varied the visible window of a public leaderboard around each participant and measured subsequent effort. Upward comparison with ranks within three places raised effort by 14 percent, while distant top ranks produced withdrawal among low performers. The results support a proximity account of social comparison over a pure competition account.',
    keywords: ['social comparison', 'leaderboards', 'effort', 'rank', 'motivation'],
    refs: ['loss-aversion-in-virtual-currency-spending'],
  },
  {
    id: 'endowment-of-earned-cosmetic-items',
    title: 'Endowment of Earned Versus Purchased Cosmetic Items',
    authors: ['priya-venkataraghavan'],
    year: 2017,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Owners valued digital cosmetic items 38 percent higher when they were earned through play than when they were bought, holding market price constant. The earned-item premium was mediated by recalled effort and disappeared when the earning history was hidden. We discuss implications for the design of reward catalogues.',
    keywords: ['endowment effect', 'ownership', 'digital goods', 'effort justification', 'valuation'],
    refs: ['loss-aversion-in-virtual-currency-spending', 'variable-reward-schedules-and-persistence'],
  },
  {
    id: 'streak-loss-and-abandonment',
    title: 'Streak Loss and Abandonment: Who Returns After a Reset',
    authors: ['henrik-solvang', 'chidubem-abara'],
    year: 2018,
    field: 'psychology',
    venue: RCH,
    abstract:
      'When a long streak is broken, the likelihood that a user returns within a week falls sharply, and falls most for users with the longest streaks. A survival analysis of 212,000 resets shows a hazard peak at day three that is attenuated when the reset is attributed to an external cause. We interpret the pattern as an identity cost rather than a lost-progress cost.',
    keywords: ['streaks', 'abandonment', 'survival analysis', 'identity', 'relapse'],
    refs: ['daily-streaks-and-habit-formation', 'variable-reward-schedules-and-persistence', 'attention-residue-in-feed-scrolling'],
  },
  {
    id: 'peer-presence-and-effort-in-matchmaking',
    title: 'Peer Presence and Effort in Matchmade Teams',
    authors: ['chidubem-abara', 'leila-hadjiev'],
    year: 2019,
    field: 'psychology',
    venue: SCL,
    abstract:
      'Strangers placed in anonymous matchmade teams exerted more effort when told their teammates could see their contribution, but only when the team was no larger than four. In larger teams, visibility was associated with diffusion of responsibility. The findings refine the social loafing literature for ad hoc groups.',
    keywords: ['social loafing', 'matchmaking', 'team effort', 'visibility', 'diffusion of responsibility'],
    refs: ['social-comparison-in-public-leaderboards', 'variable-reward-schedules-and-persistence'],
  },
  {
    id: 'present-bias-in-subscription-renewal',
    title: 'Present Bias in Subscription Renewal Decisions',
    authors: ['priya-venkataraghavan', 'henrik-solvang'],
    year: 2020,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Members who intended to cancel a recurring subscription delayed doing so by a median of 47 days, a delay consistent with quasi-hyperbolic discounting with a present-bias parameter near 0.7. Prompting a cancellation decision at the moment of billing raised cancellation among stated intenders by 31 percent. Income shocks measurably increased present bias, a link we examine with externally collected panel data.',
    keywords: ['present bias', 'subscriptions', 'quasi-hyperbolic discounting', 'cancellation', 'self-control'],
    refs: [
      'loss-aversion-in-virtual-currency-spending',
      'endowment-of-earned-cosmetic-items',
      'daily-streaks-and-habit-formation',
      'income-shocks-and-time-preference',
      'membership-tier-pricing-and-churn',
    ],
  },
  {
    id: 'streak-freezes-as-commitment-devices',
    title: 'Streak Freezes as Commitment Devices',
    authors: ['yuna-hashimoto', 'henrik-solvang'],
    year: 2021,
    field: 'psychology',
    venue: RCH,
    abstract:
      'A limited allowance of streak freezes can act as insurance or as a license to lapse. In a randomised trial, one freeze per month sustained 12 percent more active days than none, while an unlimited allowance reduced them. The optimal allowance depended on prior streak length, consistent with a model of commitment under costly self-control.',
    keywords: ['commitment devices', 'streaks', 'self-control', 'randomised trial', 'habit formation'],
    refs: ['streak-loss-and-abandonment', 'present-bias-in-subscription-renewal', 'daily-streaks-and-habit-formation', 'income-shocks-and-time-preference'],
  },
  {
    id: 'reactance-to-engagement-nudges',
    title: 'Psychological Reactance to Engagement Nudges',
    authors: ['leila-hadjiev'],
    year: 2022,
    field: 'psychology',
    venue: SCL,
    abstract:
      'Frequent reminders reduced return visits among users who scored high on trait reactance, an effect not seen in low-reactance users. Reducing reminder frequency by half restored baseline return rates without lowering the response of low-reactance users. We propose a simple screening item that predicts reactance from first-week behaviour.',
    keywords: ['reactance', 'nudges', 'notifications', 'autonomy', 'individual differences'],
    refs: ['peer-presence-and-effort-in-matchmaking', 'social-comparison-in-public-leaderboards'],
  },
  {
    id: 'habit-decay-after-feature-removal',
    title: 'Habit Decay After the Removal of a Routine Cue',
    authors: ['yuna-hashimoto', 'henrik-solvang'],
    year: 2023,
    field: 'psychology',
    venue: RCH,
    abstract:
      'We exploited the retirement of a daily check-in prompt as a natural experiment on habit decay. Usage fell 26 percent in the first fortnight and stabilised, with the steepest declines among users whose routine was anchored to the prompt time. Users whose usage was tied to a stable context cue showed almost no decay.',
    keywords: ['habit decay', 'natural experiment', 'context cues', 'routine', 'behaviour change'],
    refs: ['streak-freezes-as-commitment-devices', 'streak-loss-and-abandonment', 'attention-residue-in-feed-scrolling', 'financial-precarity-and-impulsive-spending'],
  },
  {
    id: 'creator-recognition-and-intrinsic-motivation',
    title: 'Creator Recognition and Intrinsic Motivation',
    authors: ['chidubem-abara', 'leila-hadjiev'],
    year: 2024,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Public recognition of creators raised output in the short run, but contingent monetary bonuses reduced it once withdrawn, a pattern consistent with crowding out of intrinsic motivation. The decline was largest among creators who had reported high initial enjoyment. We recommend non-contingent recognition schemes where quality is hard to measure.',
    keywords: ['intrinsic motivation', 'crowding out', 'recognition', 'creators', 'incentives'],
    refs: [
      'peer-presence-and-effort-in-matchmaking',
      'reactance-to-engagement-nudges',
      'present-bias-in-subscription-renewal',
      'streak-freezes-as-commitment-devices',
      'creator-labour-supply-and-earnings-volatility',
    ],
  },
  {
    id: 'reward-prediction-in-coin-economies',
    title: 'Reward Prediction and Spending in Closed Coin Economies',
    authors: ['priya-venkataraghavan', 'yuna-hashimoto', 'ximena-calderon'],
    year: 2025,
    field: 'psychology',
    venue: JBS,
    abstract:
      'Spending in a closed virtual economy tracks the expected rather than the realised reward rate: when payouts became more predictable, spending rose 17 percent without any change in earnings. We estimate a reinforcement-learning model of coin valuation and show that it recovers the loss-averse asymmetry reported in earlier laboratory work. Policy simulations suggest that smoothing payouts mainly shifts the timing of spending.',
    keywords: ['reward prediction error', 'virtual economies', 'reinforcement learning', 'spending', 'loss aversion'],
    refs: [
      'loss-aversion-in-virtual-currency-spending',
      'endowment-of-earned-cosmetic-items',
      'creator-recognition-and-intrinsic-motivation',
      'financial-precarity-and-impulsive-spending',
      'basic-income-pilots-and-behavioural-take-up',
      'virtual-currency-inflation-and-sinks',
    ],
  },
  {
    id: 'trust-in-algorithmic-feed-ranking',
    title: 'Trust in Algorithmic Feed Ranking and the Perception of Fairness',
    authors: ['leila-hadjiev', 'chidubem-abara'],
    year: 2026,
    field: 'psychology',
    venue: SCL,
    abstract:
      'Users who were shown a plain-language account of how their feed was ranked rated the ranking as fairer even when the account was uninformative. Trust fell when the explanation conflicted with experienced content, and recovered only when users were given control over one ranking input. We discuss transparency as a perceived-control intervention.',
    keywords: ['algorithmic fairness', 'trust', 'feed ranking', 'perceived control', 'transparency'],
    refs: ['habit-decay-after-feature-removal', 'creator-recognition-and-intrinsic-motivation', 'basic-income-pilots-and-behavioural-take-up', 'wage-compression-in-creator-marketplaces'],
  },

  // ---- Economics & Social Science ----
  {
    id: 'network-effects-in-creator-platforms',
    title: 'Network Effects in Creator Platforms: Identification from Staggered Launches',
    authors: ['tomasz-wierzbicki'],
    year: 2012,
    field: 'social-sciences',
    venue: ROE,
    abstract:
      'We identify cross-side network effects in a creator platform using the staggered launch of tooling across regions. A 10 percent increase in active creators raises audience growth by 3.4 percent within a quarter, while the reverse elasticity is roughly half as large. The asymmetry has direct consequences for which side a young platform should subsidise.',
    keywords: ['network effects', 'two-sided markets', 'platforms', 'identification', 'creators'],
    refs: [],
  },
  {
    id: 'membership-tier-pricing-and-churn',
    title: 'Membership Tier Pricing and Churn',
    authors: ['tomasz-wierzbicki'],
    year: 2014,
    field: 'social-sciences',
    venue: ROE,
    abstract:
      'Using quasi-random price assignments across a three-tier membership ladder, we estimate own- and cross-tier price elasticities and the resulting churn. Middle-tier demand is the most elastic, and a 5 percent rise at the middle tier moves more members down than out. We characterise revenue-maximising tier spacing under heterogeneous willingness to pay.',
    keywords: ['price discrimination', 'membership', 'churn', 'elasticity', 'tier design'],
    refs: ['network-effects-in-creator-platforms'],
  },
  {
    id: 'creator-labour-supply-and-earnings-volatility',
    title: 'Creator Labour Supply and Earnings Volatility',
    authors: ['ximena-calderon'],
    year: 2015,
    field: 'social-sciences',
    venue: SSQ,
    abstract:
      'Creators respond to earnings volatility by shifting hours rather than exiting, with an hours elasticity to expected earnings of 0.4. The response is asymmetric: negative shocks lead to longer reductions than positive shocks lead to increases. We link the pattern to precautionary supply of effort in income-uncertain labour markets.',
    keywords: ['labour supply', 'earnings volatility', 'gig work', 'precautionary behaviour', 'creators'],
    refs: ['network-effects-in-creator-platforms'],
  },
  {
    id: 'creator-payout-schedules-and-retention',
    title: 'Creator Payout Schedules and Retention',
    authors: ['tomasz-wierzbicki', 'seun-adebayo'],
    year: 2016,
    field: 'social-sciences',
    venue: JMD,
    abstract:
      'Moving from monthly to weekly payouts lowered creator attrition by 9 percent among low-balance accounts and had no measurable effect on high-balance accounts. A liquidity-constraint model fits the heterogeneity and predicts a break-even at a balance equal to roughly two weeks of typical payouts. The platform bears a modest float cost that is recovered through retention within a year.',
    keywords: ['payouts', 'liquidity constraints', 'retention', 'creator economy', 'platform design'],
    refs: ['network-effects-in-creator-platforms', 'membership-tier-pricing-and-churn'],
  },
  {
    id: 'virtual-currency-inflation-and-sinks',
    title: 'Virtual Currency Inflation and the Role of Sinks',
    authors: ['tomasz-wierzbicki', 'seun-adebayo'],
    year: 2017,
    field: 'social-sciences',
    venue: ROE,
    abstract:
      'A closed virtual economy with continuous coin creation exhibits steady inflation unless it contains sinks that remove coins at a comparable rate. We derive the steady-state price level as a function of faucet and sink flows and test it against 5 years of ledger data. Sinks that confer visible status are retired more slowly than purely functional sinks, which makes them better stabilisers.',
    keywords: ['virtual currency', 'inflation', 'sinks and faucets', 'monetary models', 'closed economies'],
    refs: ['network-effects-in-creator-platforms', 'membership-tier-pricing-and-churn', 'creator-payout-schedules-and-retention', 'loss-aversion-in-virtual-currency-spending'],
  },
  {
    id: 'search-frictions-in-skill-based-matchmaking',
    title: 'Search Frictions in Skill-Based Matchmaking',
    authors: ['ximena-calderon'],
    year: 2018,
    field: 'social-sciences',
    venue: JMD,
    abstract:
      'Matchmaking is a search problem in which waiting costs trade off against match quality. We estimate a search-and-matching model on queue data and find that the welfare-optimal tolerance for skill mismatch rises with queue length. Players are, on average, too impatient relative to the optimum, and a shared waiting-time display recovers part of the loss.',
    keywords: ['search and matching', 'matchmaking', 'search frictions', 'welfare', 'queues'],
    refs: ['creator-labour-supply-and-earnings-volatility', 'network-effects-in-creator-platforms', 'variable-reward-schedules-and-persistence'],
  },
  {
    id: 'income-shocks-and-time-preference',
    title: 'Income Shocks and Time Preference Among Platform Workers',
    authors: ['nadia-kowalczyk'],
    year: 2019,
    field: 'social-sciences',
    venue: SSQ,
    abstract:
      'Using a panel of platform workers, we show that an unexpected fall in weekly income raises measured discount rates by about 11 percent for the following month. The effect is concentrated among workers with no savings buffer and is largely absent after a transfer of equivalent size. The result implies that apparent impatience in financial choices is partly a response to scarcity rather than a fixed trait.',
    keywords: ['time preference', 'income shocks', 'scarcity', 'platform work', 'discounting'],
    refs: ['creator-labour-supply-and-earnings-volatility'],
  },
  {
    id: 'mechanism-design-for-creator-revenue-share',
    title: 'Mechanism Design for Creator Revenue Share',
    authors: ['tomasz-wierzbicki', 'seun-adebayo'],
    year: 2019,
    field: 'social-sciences',
    venue: JMD,
    abstract:
      'We design a revenue-sharing mechanism that induces creators to report their audience size truthfully when the platform cannot observe it directly. The mechanism is incentive compatible, budget balanced in expectation and implementable with an audit rate under 3 percent. Simulations on historical payout data show a 7 percent improvement in creator surplus over proportional sharing.',
    keywords: ['mechanism design', 'revenue sharing', 'incentive compatibility', 'audits', 'creators'],
    refs: ['membership-tier-pricing-and-churn', 'creator-payout-schedules-and-retention', 'virtual-currency-inflation-and-sinks'],
  },
  {
    id: 'financial-precarity-and-impulsive-spending',
    title: 'Financial Precarity and Impulsive Spending',
    authors: ['nadia-kowalczyk'],
    year: 2021,
    field: 'social-sciences',
    venue: SSQ,
    abstract:
      'Households with volatile income spent a larger share of windfalls on small immediate purchases, even when they reported a savings goal. We attribute roughly a third of the gap to attention scarcity and the remainder to the timing of income receipt. Aligning payment dates with expenses reduced impulsive spending by 8 percent in a pilot.',
    keywords: ['impulsive spending', 'financial precarity', 'windfalls', 'household finance', 'attention'],
    refs: ['income-shocks-and-time-preference', 'loss-aversion-in-virtual-currency-spending'],
  },
  {
    id: 'two-sided-matching-fees-and-liquidity',
    title: 'Two-Sided Matching Fees and Marketplace Liquidity',
    authors: ['tomasz-wierzbicki', 'dalia-rahmani'],
    year: 2021,
    field: 'social-sciences',
    venue: JMD,
    abstract:
      'Charging the scarce side of a marketplace reduces liquidity more than charging the abundant side, even at the same total fee. We show that thin-market effects explain the difference and recover the optimal fee split from observed match rates. The result is robust across 14 marketplace categories.',
    keywords: ['marketplaces', 'matching fees', 'liquidity', 'two-sided markets', 'market thickness'],
    refs: [
      'network-effects-in-creator-platforms',
      'membership-tier-pricing-and-churn',
      'creator-payout-schedules-and-retention',
      'virtual-currency-inflation-and-sinks',
      'mechanism-design-for-creator-revenue-share',
    ],
  },
  {
    id: 'platform-fee-pass-through-in-memberships',
    title: 'Platform Fee Pass-Through in Memberships',
    authors: ['tomasz-wierzbicki', 'dalia-rahmani'],
    year: 2022,
    field: 'social-sciences',
    venue: ROE,
    abstract:
      'When a platform raises its processing fee, creators pass roughly 60 percent of the increase on to members through membership prices. Pass-through is lower where creators face close substitutes and higher where members are locked in by accumulated status. We also find that present-biased members absorb price rises more readily than the standard model predicts.',
    keywords: ['pass-through', 'membership pricing', 'platform fees', 'incidence', 'lock-in'],
    refs: [
      'membership-tier-pricing-and-churn',
      'creator-payout-schedules-and-retention',
      'virtual-currency-inflation-and-sinks',
      'mechanism-design-for-creator-revenue-share',
      'two-sided-matching-fees-and-liquidity',
      'present-bias-in-subscription-renewal',
    ],
  },
  {
    id: 'wage-compression-in-creator-marketplaces',
    title: 'Wage Compression in Creator Marketplaces',
    authors: ['ximena-calderon', 'dalia-rahmani', 'yuna-hashimoto'],
    year: 2023,
    field: 'social-sciences',
    venue: SSQ,
    abstract:
      'Rates quoted by creators for commissioned work converge on a narrow band as marketplaces grow, even as quality differences widen. We argue that rating systems compress prices by making reputation cheap to observe at the bottom of the distribution. Behavioural evidence suggests that buyers anchor on the most visible quoted rate, which amplifies the effect.',
    keywords: ['wage compression', 'reputation', 'anchoring', 'creator marketplaces', 'ratings'],
    refs: [
      'creator-labour-supply-and-earnings-volatility',
      'search-frictions-in-skill-based-matchmaking',
      'mechanism-design-for-creator-revenue-share',
      'membership-tier-pricing-and-churn',
    ],
  },
  {
    id: 'basic-income-pilots-and-behavioural-take-up',
    title: 'Basic Income Pilots and Behavioural Take-Up',
    authors: ['nadia-kowalczyk'],
    year: 2023,
    field: 'social-sciences',
    venue: SSQ,
    abstract:
      'In a randomised pilot of unconditional transfers, take-up fell to 71 percent when enrolment required a single additional form. Recipients who enrolled showed lower short-horizon discounting and fewer reversals of savings decisions after six months. We interpret the take-up gap as an administrative burden that falls hardest on the households the transfer is designed to help.',
    keywords: ['basic income', 'take-up', 'administrative burden', 'randomised pilot', 'savings'],
    refs: ['financial-precarity-and-impulsive-spending', 'income-shocks-and-time-preference'],
  },
  {
    id: 'coin-sink-design-and-price-stability',
    title: 'Coin Sink Design and Price Stability',
    authors: ['tomasz-wierzbicki', 'dalia-rahmani', 'seun-adebayo'],
    year: 2024,
    field: 'social-sciences',
    venue: JMD,
    abstract:
      'We compare price stability under three sink designs: fixed-price goods, auctions and progressive fees. Progressive fees stabilise prices best at moderate faucet rates, while auctions are superior when the faucet is volatile. A calibrated model reproduces the observed price paths of two coin economies to within 4 percent.',
    keywords: ['sink design', 'price stability', 'auctions', 'virtual economies', 'calibration'],
    refs: [
      'creator-payout-schedules-and-retention',
      'virtual-currency-inflation-and-sinks',
      'mechanism-design-for-creator-revenue-share',
      'two-sided-matching-fees-and-liquidity',
      'platform-fee-pass-through-in-memberships',
    ],
  },
  {
    id: 'gifting-networks-and-reciprocity-rings',
    title: 'Gifting Networks and Reciprocity Rings',
    authors: ['tomasz-wierzbicki', 'seun-adebayo'],
    year: 2025,
    field: 'social-sciences',
    venue: ROE,
    abstract:
      'Gifting of in-platform currency forms dense reciprocal rings in which most transfers are returned within a month. We characterise the stable gifting structures of a simple network game and show that ring formation raises effective velocity of money without raising welfare. A policy of capping reciprocated gifts reduces ring activity by a third at little cost to genuine gifting.',
    keywords: ['gifting', 'reciprocity', 'network games', 'velocity of money', 'virtual economies'],
    refs: [
      'network-effects-in-creator-platforms',
      'virtual-currency-inflation-and-sinks',
      'mechanism-design-for-creator-revenue-share',
      'two-sided-matching-fees-and-liquidity',
      'platform-fee-pass-through-in-memberships',
      'coin-sink-design-and-price-stability',
    ],
  },
];
