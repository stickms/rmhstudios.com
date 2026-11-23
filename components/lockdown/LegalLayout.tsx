import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { cn } from '@/lib/utils';
import './lockdown.css';

/**
 * The one document frame for /terms, /privacy, /cookies, /copyright and /security. They are pages of the site, inside
 * the Steel shell like every other (sidebar, margin, page title from `PageLayout`), and their body is prose on the page
 * ground: no panel, no page chrome of their own. `children` is the document's headings, paragraphs and lists, styled by
 * `.legal-content__body` (lockdown.css); the security page passes `wide`, which uses the full content column and stacks
 * its own sections with a gap.
 */
export function LegalLayout({
  title,
  updatedDate,
  wide,
  children,
}: {
  title: string;
  updatedDate?: string;
  /** Use the whole content column instead of the 640px reading measure. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('c-lockdown');
  return (
    <PageLayout
      title={title}
      wide={wide}
      description={
        updatedDate
          ? t('last-updated', { defaultValue: 'Last updated: {{date}}', date: updatedDate })
          : undefined
      }
    >
      <article className={cn('legal-content__body', wide && 'flex flex-col gap-8')}>{children}</article>
    </PageLayout>
  );
}
