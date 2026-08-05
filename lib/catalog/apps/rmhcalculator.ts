import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhcalculator',
  order: 100,
  title: 'RMHCalculator',
  description:
    'A full-featured graphing and scientific calculator where DeepSeek does all the math — including the graphs.',
  longDescription:
    'RMHCalculator is a graphing and scientific calculator powered entirely by the DeepSeek API — it performs no arithmetic of its own. Every scientific evaluation and every plotted graph point is computed by the model, which also decides how to frame and plot each curve for good accuracy. Watch its reasoning stream live, and switch between DeepSeek Reasoner for maximum accuracy and DeepSeek Chat for faster answers.',
  href: '/rmhcalculator',
  status: 'Beta',
  cta: 'Open Calculator',
  isSteam: false,
  gradient: 'from-indigo-500 via-blue-500 to-cyan-500',
  iconName: 'Calculator',
  color: 'from-indigo-500/20 to-cyan-500/20 hover:border-indigo-500/50',
  tags: ['Calculator', 'Graphing', 'AI', 'DeepSeek', 'Beta'],
  authGate: true,
  // Full-screen top-level route (app/routes/rmhcalculator.tsx) styled with
  // the --site-* theme tokens, so keep the site theme class applied.
  usesSiteTheme: true,
};

export default entry;
