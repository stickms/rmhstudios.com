/**
 * Steve Jobs Quotes Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/quotes')({
  head: () => ({
    meta: [
      { title: 'Steve Jobs Quotes | RMH Studios' },
      { name: 'description', content: 'A collection of the most inspiring Steve Jobs quotes on innovation, design, life, and technology.' },
    ],
  }),
  component: QuotesPage,
});

const quotes = [
  {
    text: "Stay hungry, stay foolish.",
    context: "Stanford University commencement speech, June 12, 2005",
    category: "Life & Wisdom",
  },
  {
    text: "The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle.",
    context: "Stanford University commencement speech, June 12, 2005",
    category: "Work & Passion",
  },
  {
    text: "Your time is limited, so don't waste it living someone else's life. Don't be trapped by dogma — which is living with the results of other people's thinking.",
    context: "Stanford University commencement speech, June 12, 2005",
    category: "Life & Wisdom",
  },
  {
    text: "Design is not just what it looks like and feels like. Design is how it works.",
    context: "The New York Times, 2003",
    category: "Design & Innovation",
  },
  {
    text: "Innovation distinguishes between a leader and a follower.",
    context: "Various interviews, 1990s-2000s",
    category: "Design & Innovation",
  },
  {
    text: "Sometimes when you innovate, you make mistakes. It is best to admit them quickly, and get on with improving your other innovations.",
    context: "Interview, 1995",
    category: "Design & Innovation",
  },
  {
    text: "Creativity is just connecting things. When you ask creative people how they did something, they feel a little guilty because they didn't really do it, they just saw something. It seemed obvious to them after a while.",
    context: "Wired interview, February 1996",
    category: "Creativity",
  },
  {
    text: "I'm convinced that about half of what separates the successful entrepreneurs from the non-successful ones is pure perseverance.",
    context: "Interview, 1995",
    category: "Work & Passion",
  },
  {
    text: "Quality is more important than quantity. One home run is much better than two doubles.",
    context: "BusinessWeek interview, 2006",
    category: "Design & Innovation",
  },
  {
    text: "Details matter, it's worth waiting to get it right.",
    context: "Various interviews",
    category: "Design & Innovation",
  },
  {
    text: "Have the courage to follow your heart and intuition. They somehow already know what you truly want to become.",
    context: "Stanford University commencement speech, June 12, 2005",
    category: "Life & Wisdom",
  },
  {
    text: "It's not about pop culture, and it's not about fooling people, and it's not about convincing people that they want something they don't. We figure out what we want.",
    context: "Fortune interview, 2000",
    category: "Design & Innovation",
  },
  {
    text: "The people who are crazy enough to think they can change the world are the ones who do.",
    context: "Apple's 'Think Different' campaign, 1997",
    category: "Life & Wisdom",
  },
  {
    text: "I want to put a ding in the universe.",
    context: "Interview, early Apple days",
    category: "Work & Passion",
  },
  {
    text: "Being the richest man in the cemetery doesn't matter to me. Going to bed at night saying we've done something wonderful — that's what matters to me.",
    context: "Wall Street Journal interview, 1993",
    category: "Life & Wisdom",
  },
  {
    text: "You can't just ask customers what they want and then try to give that to them. By the time you get it built, they'll want something new.",
    context: "Inc. Magazine interview, 1989",
    category: "Design & Innovation",
  },
  {
    text: "My model for business is The Beatles. They were four guys who kept each other's kind of negative tendencies in check. They balanced each other.",
    context: "Interview, 2004",
    category: "Work & Passion",
  },
  {
    text: "Simple can be harder than complex: You have to work hard to get your thinking clean to make it simple. But it's worth it in the end because once you get there, you can move mountains.",
    context: "BusinessWeek interview, 1998",
    category: "Design & Innovation",
  },
  {
    text: "We're here to put a dent in the universe. Otherwise why else even be here?",
    context: "Interview, early Apple days",
    category: "Work & Passion",
  },
  {
    text: "Remembering that you are going to die is the best way I know to avoid the trap of thinking you have something to lose. You are already naked. There is no reason not to follow your heart.",
    context: "Stanford University commencement speech, June 12, 2005",
    category: "Life & Wisdom",
  },
  {
    text: "Technology is nothing. What's important is that you have a faith in people, that they're basically good and smart, and if you give them tools, they'll do wonderful things with them.",
    context: "Rolling Stone interview, 1994",
    category: "Technology & People",
  },
  {
    text: "I think if you do something and it turns out pretty good, then you should go do something else wonderful, not dwell on it for too long. Just figure out what's next.",
    context: "Interview, 1995",
    category: "Work & Passion",
  },
  {
    text: "The most precious resource we all have is time.",
    context: "Various interviews",
    category: "Life & Wisdom",
  },
  {
    text: "One way to remember who you are is to remember who your heroes are.",
    context: "Interview, 1985",
    category: "Life & Wisdom",
  },
  {
    text: "Why join the navy if you can be a pirate?",
    context: "Interview, 1982",
    category: "Work & Passion",
  },
];

const categories = [...new Set(quotes.map((q) => q.category))];

function QuoteCard({ quote, index }: { quote: typeof quotes[number]; index: number }) {
  return (
    <div className="group relative pl-8 border-l-2 border-site-border hover:border-site-accent transition-colors duration-300 py-6">
      {/* Quote number badge */}
      <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-site-surface border border-site-border flex items-center justify-center group-hover:bg-site-accent/10 group-hover:border-site-accent transition-colors duration-300">
        <span className="text-xs font-mono text-site-text-muted group-hover:text-site-accent transition-colors duration-300">
          {index + 1}
        </span>
      </div>

      {/* Quote text */}
      <blockquote className="mb-3">
        <p className="text-site-text text-lg leading-relaxed font-(family-name:--site-font-display) italic">
          &ldquo;{quote.text}&rdquo;
        </p>
      </blockquote>

      {/* Context and category */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-site-text-muted">
        <span className="inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {quote.context}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-site-surface border border-site-border text-xs font-medium text-site-text-muted">
          {quote.category}
        </span>
      </div>
    </div>
  );
}

function QuotesPage() {
  const { t } = useTranslation("site");
  return (
    <PageLayout title={t("steve-jobs-quotes-title", { defaultValue: "Steve Jobs Quotes" })} wide>
      <div className="px-4 pt-4 pb-12 max-w-2xl mx-auto">
        {/* Hero section */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-site bg-site-surface border border-site-border flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-site-accent">
              <path d="M3 21c3 0 7-1 7-8" />
              <path d="M13 21c3 0 7-1 7-8" />
              <path d="M10 12c.5-3 1.5-5 5-5" />
              <path d="M20 12c.5-3 1.5-5 5-5" />
            </svg>
          </div>
          <p className="text-site-text-muted text-sm leading-relaxed max-w-lg mx-auto">
            {t("quotes-hero-description", { defaultValue: "A curated collection of the most memorable words from Steve Jobs — co-founder of Apple, visionary, and one of the most influential thinkers of the modern era." })}
          </p>
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center px-3 py-1 rounded-full bg-site-surface border border-site-border text-xs font-medium text-site-text-muted hover:text-site-accent hover:border-site-accent/50 transition-colors duration-200 cursor-default"
            >
              {cat}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-site-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-site-bg px-3 text-xs font-mono text-site-text-muted uppercase tracking-widest">
              {t("quotes-count", { count: quotes.length, defaultValue: "{{count}} Quotes" })}
            </span>
          </div>
        </div>

        {/* Quote list */}
        <div className="space-y-0 divide-y divide-site-border">
          {quotes.map((quote, index) => (
            <QuoteCard key={index} quote={quote} index={index} />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 pt-8 border-t border-site-border text-center">
          <p className="text-xs text-site-text-muted">
            {t("quotes-footer-note", { defaultValue: "“Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. And the only way to do great work is to love what you do.”" })}
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
