import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** The /developer pointer to the "Coding with AI" practices page. */
export function AiPracticesLink() {
  const { t } = useTranslation('f-dev-ai');
  return (
    <Link
      to="/developer/ai-practices"
      className="glass-fill glass-interactive group flex items-start gap-3 rounded-site p-4 hover:-translate-y-px"
    >
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-site-accent" aria-hidden />
      <span>
        <span className="block font-semibold text-site-text transition-colors group-hover:text-site-accent">
          {t('link-title', { defaultValue: 'Coding with AI' })}
        </span>
        <span className="mt-1 block text-sm text-site-text-muted">
          {t('link-description', {
            defaultValue:
              'How we use AI coding tools on this codebase: the working loop, repo rules, the commit gate, CI/CD and reviewing AI-written code.',
          })}
        </span>
      </span>
    </Link>
  );
}
