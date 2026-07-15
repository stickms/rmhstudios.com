/**
 * Steve Jobs Quotes Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { CanvasSitePage } from '@/canvas-ui/runtime/CanvasSitePage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { Badge } from '@/canvas-ui/widgets/primitives';

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

type Quote = (typeof quotes)[number];

interface QuotesSceneProps extends Record<string, unknown> {
  title: string;
  hero: string;
  countLabel: string;
  footer: string;
  cats: string[];
  items: Quote[];
}

function QuotesScene({ title, hero, countLabel, footer, cats, items }: QuotesSceneProps) {
  return (
    <CanvasSitePage title={title} wide>
      <Box name="quotes" style={tw('flex flex-col w-full items-center px-4 pt-4 pb-12')}>
        <Box style={tw('flex flex-col w-full max-w-[672px] gap-8')}>
          {/* Hero */}
          <Box style={tw('flex flex-col items-center gap-6')}>
            <Box style={tw('w-full')}>
              <CanvasText style="text-sm text-site-text-muted text-center">{hero}</CanvasText>
            </Box>
          </Box>

          {/* Category chips */}
          <Box style={tw('flex flex-row flex-wrap justify-center gap-2')}>
            {cats.map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </Box>

          {/* Count divider */}
          <Box style={tw('flex flex-row justify-center w-full')}>
            <CanvasText style="text-xs font-mono uppercase tracking-widest text-site-text-muted">{countLabel}</CanvasText>
          </Box>

          {/* Quote list */}
          <Box style={tw('flex flex-col w-full')}>
            {items.map((q, i) => (
              <Box
                key={i}
                name={`quote-${i}`}
                style={tw('flex flex-col w-full gap-3 pl-8 py-6 border-l-2 border-site-border')}
              >
                <CanvasText style="text-lg font-display italic text-site-text">{`\u201C${q.text}\u201D`}</CanvasText>
                <Box style={tw('flex flex-row flex-wrap items-center gap-2')}>
                  <CanvasText style="text-sm text-site-text-muted">{q.context}</CanvasText>
                  <Badge>{q.category}</Badge>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Footer */}
          <Box style={tw('flex flex-col w-full items-center mt-6 pt-8 border-t border-site-border')}>
            <CanvasText style="text-xs text-site-text-muted text-center">{footer}</CanvasText>
          </Box>
        </Box>
      </Box>
    </CanvasSitePage>
  );
}

function QuotesMirror({ title, hero, footer, items }: QuotesSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{hero}</p>
      {items.map((q, i) => (
        <blockquote key={i}>
          <p>{q.text}</p>
          <cite>{q.context} {"\u2014"} {q.category}</cite>
        </blockquote>
      ))}
      <p>{footer}</p>
    </div>
  );
}

function QuotesPage() {
  const { t } = useTranslation("site");
  const sceneProps: QuotesSceneProps = useMemo(() => ({
    title: t("steve-jobs-quotes-title", { defaultValue: "Steve Jobs Quotes" }),
    hero: t("quotes-hero-description", { defaultValue: "A curated collection of the most memorable words from Steve Jobs \u2014 co-founder of Apple, visionary, and one of the most influential thinkers of the modern era." }),
    countLabel: t("quotes-count", { count: quotes.length, defaultValue: "{{count}} Quotes" }),
    footer: t("quotes-footer-note", { defaultValue: "\u201CYour work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. And the only way to do great work is to love what you do.\u201D" }),
    cats: categories,
    items: quotes,
  }), [t]);

  return (
    <CanvasPage
      routeId="/_site/quotes"
      scene={QuotesScene}
      sceneProps={sceneProps}
      mirror={<QuotesMirror {...sceneProps} />}
      shell="site"
      title={sceneProps.title}
    />
  );
}
