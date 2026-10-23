/**
 * Steve Jobs Quotes Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Clock, Quote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/motion';

export const Route = createFileRoute('/_site/quotes')({
  head: definePage({
    path: '/quotes',
    title: 'Steve Jobs Quotes | RMH Studios',
    description:
      'A collection of the most inspiring Steve Jobs quotes on innovation, design, life, and technology.',
  }),
  component: QuotesPage,
});

const quotes = [
  {
    text: 'Stay hungry, stay foolish.',
    context: 'Stanford University commencement speech, June 12, 2005',
    category: 'Life & Wisdom',
  },
  {
    text: "The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle.",
    context: 'Stanford University commencement speech, June 12, 2005',
    category: 'Work & Passion',
  },
  {
    text: "Your time is limited, so don't waste it living someone else's life. Don't be trapped by dogma — which is living with the results of other people's thinking.",
    context: 'Stanford University commencement speech, June 12, 2005',
    category: 'Life & Wisdom',
  },
  {
    text: 'Design is not just what it looks like and feels like. Design is how it works.',
    context: 'The New York Times, 2003',
    category: 'Design & Innovation',
  },
  {
    text: 'Innovation distinguishes between a leader and a follower.',
    context: 'Various interviews, 1990s-2000s',
    category: 'Design & Innovation',
  },
  {
    text: 'Sometimes when you innovate, you make mistakes. It is best to admit them quickly, and get on with improving your other innovations.',
    context: 'Interview, 1995',
    category: 'Design & Innovation',
  },
  {
    text: "Creativity is just connecting things. When you ask creative people how they did something, they feel a little guilty because they didn't really do it, they just saw something. It seemed obvious to them after a while.",
    context: 'Wired interview, February 1996',
    category: 'Creativity',
  },
  {
    text: "I'm convinced that about half of what separates the successful entrepreneurs from the non-successful ones is pure perseverance.",
    context: 'Interview, 1995',
    category: 'Work & Passion',
  },
  {
    text: 'Quality is more important than quantity. One home run is much better than two doubles.',
    context: 'BusinessWeek interview, 2006',
    category: 'Design & Innovation',
  },
  {
    text: "Details matter, it's worth waiting to get it right.",
    context: 'Various interviews',
    category: 'Design & Innovation',
  },
  {
    text: 'Have the courage to follow your heart and intuition. They somehow already know what you truly want to become.',
    context: 'Stanford University commencement speech, June 12, 2005',
    category: 'Life & Wisdom',
  },
  {
    text: "It's not about pop culture, and it's not about fooling people, and it's not about convincing people that they want something they don't. We figure out what we want.",
    context: 'Fortune interview, 2000',
    category: 'Design & Innovation',
  },
  {
    text: 'The people who are crazy enough to think they can change the world are the ones who do.',
    context: "Apple's 'Think Different' campaign, 1997",
    category: 'Life & Wisdom',
  },
  {
    text: 'I want to put a ding in the universe.',
    context: 'Interview, early Apple days',
    category: 'Work & Passion',
  },
  {
    text: "Being the richest man in the cemetery doesn't matter to me. Going to bed at night saying we've done something wonderful — that's what matters to me.",
    context: 'Wall Street Journal interview, 1993',
    category: 'Life & Wisdom',
  },
  {
    text: "You can't just ask customers what they want and then try to give that to them. By the time you get it built, they'll want something new.",
    context: 'Inc. Magazine interview, 1989',
    category: 'Design & Innovation',
  },
  {
    text: "My model for business is The Beatles. They were four guys who kept each other's kind of negative tendencies in check. They balanced each other.",
    context: 'Interview, 2004',
    category: 'Work & Passion',
  },
  {
    text: "Simple can be harder than complex: You have to work hard to get your thinking clean to make it simple. But it's worth it in the end because once you get there, you can move mountains.",
    context: 'BusinessWeek interview, 1998',
    category: 'Design & Innovation',
  },
  {
    text: "We're here to put a dent in the universe. Otherwise why else even be here?",
    context: 'Interview, early Apple days',
    category: 'Work & Passion',
  },
  {
    text: 'Remembering that you are going to die is the best way I know to avoid the trap of thinking you have something to lose. You are already naked. There is no reason not to follow your heart.',
    context: 'Stanford University commencement speech, June 12, 2005',
    category: 'Life & Wisdom',
  },
  {
    text: "Technology is nothing. What's important is that you have a faith in people, that they're basically good and smart, and if you give them tools, they'll do wonderful things with them.",
    context: 'Rolling Stone interview, 1994',
    category: 'Technology & People',
  },
  {
    text: "I think if you do something and it turns out pretty good, then you should go do something else wonderful, not dwell on it for too long. Just figure out what's next.",
    context: 'Interview, 1995',
    category: 'Work & Passion',
  },
  {
    text: 'The most precious resource we all have is time.',
    context: 'Various interviews',
    category: 'Life & Wisdom',
  },
  {
    text: 'One way to remember who you are is to remember who your heroes are.',
    context: 'Interview, 1985',
    category: 'Life & Wisdom',
  },
  {
    text: 'Why join the navy if you can be a pirate?',
    context: 'Interview, 1982',
    category: 'Work & Passion',
  },
];

const categories = [...new Set(quotes.map((q) => q.category))];

function QuoteCard({ quote, index }: { quote: (typeof quotes)[number]; index: number }) {
  return (
    <div className="group relative border-s-2 border-site-border py-6 ps-8 transition-colors duration-site-slow hover:border-site-accent">
      {/* Quote number badge */}
      <div className="absolute -start-3 top-6 flex size-6 items-center justify-center rounded-full glass-fill">
        <span className="font-mono text-xs text-site-text-muted transition-colors duration-site-slow group-hover:text-site-accent">
          {index + 1}
        </span>
      </div>

      {/* Quote text */}
      <blockquote className="mb-4">
        <p className="text-site-text text-lg leading-relaxed font-display italic">
          &ldquo;{quote.text}&rdquo;
        </p>
      </blockquote>

      {/* Context and category */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-site-text-muted">
        <span className="inline-flex items-center gap-2">
          <Clock aria-hidden className="size-3.5 opacity-60" />
          {quote.context}
        </span>
        <Badge>{quote.category}</Badge>
      </div>
    </div>
  );
}

function QuotesPage() {
  const { t } = useTranslation('site');
  return (
    <PageLayout title={t('steve-jobs-quotes-title', { defaultValue: 'Steve Jobs Quotes' })}>
      <div className="px-4 pt-4 pb-12">
        {/* Hero section */}
        <Reveal className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-site glass-fill">
            <Quote aria-hidden className="size-9 text-site-accent" strokeWidth={1.5} />
          </div>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-site-text-muted">
            {t('quotes-hero-description', {
              defaultValue:
                'A curated collection of the most memorable words from Steve Jobs — co-founder of Apple, visionary, and one of the most influential thinkers of the modern era.',
            })}
          </p>
        </Reveal>

        {/* Category filter chips */}
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {categories.map((cat) => (
            <Badge key={cat} size="lg">
              {cat}
            </Badge>
          ))}
        </div>

        {/* Divider */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-site-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-site-bg px-3 font-mono text-xs text-site-text-muted">
              {t('quotes-count', { count: quotes.length, defaultValue: '{{count}} Quotes' })}
            </span>
          </div>
        </div>

        {/* Quote list — each entry reveals once as it scrolls into view. */}
        <div className="divide-y divide-site-border">
          {quotes.map((quote, index) => (
            <Reveal key={index} y={12}>
              <QuoteCard quote={quote} index={index} />
            </Reveal>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 border-t border-site-border pt-6 text-center">
          <p className="text-sm leading-relaxed text-site-text-muted">
            {t('quotes-footer-note', {
              defaultValue:
                '“Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. And the only way to do great work is to love what you do.”',
            })}
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
