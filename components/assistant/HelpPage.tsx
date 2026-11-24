import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageFrame } from '@/components/feed/PageLayout';
import { ConciergePanel } from '@/components/assistant/ConciergePanel';
import { FeedbackPopover } from '@/components/feedback/FeedbackPopover';
import { NoGlobe } from '@/components/shell/NoGlobe';
import { Button } from '@/components/ui/button';
import '@/components/feed/conversation/conversation.css';

/**
 * Laid out like a DM thread (components/feed/conversation/conversation.css): the column is as tall as the window leaves
 * it, so the conversation is the one scroller and the question field is the bottom of the column. <NoGlobe /> takes the
 * docked globe off a phone so nothing sits on that field, which makes the header's back link the way out there; it is
 * hidden from 1024px, where the sidebar is. Feedback is an icon button on the right of the title row.
 */
export function HelpPage() {
  const { t } = useTranslation('site');
  return (
    <PageFrame noDockPadding>
      <div className="conversation conversation--flush-bottom">
        <NoGlobe />
        <header data-slot="page-header" className="conversation__head">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('help-back', { defaultValue: 'Back' })}
          >
            <Link to="/sections">
              <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
            </Link>
          </Button>
          <h1 className="t-title min-w-0 flex-1">{t('help-title', { defaultValue: 'Help' })}</h1>
          <FeedbackPopover />
        </header>

        <ConciergePanel className="flex-1 min-h-0" />
      </div>
    </PageFrame>
  );
}
