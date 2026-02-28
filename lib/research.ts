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
];

export function getArticleBySlug(slug: string): ResearchArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): ResearchArticle[] {
  return articles;
}
