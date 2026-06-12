export interface SteveJobsQuote {
  text: string;
  context?: string;
}

export const steveJobsQuotes: SteveJobsQuote[] = [
  {
    text: "The only way to do great work is to love what you do.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Stay hungry. Stay foolish.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Design is not just what it looks like and feels like. Design is how it works.",
    context: "The New York Times, 2003",
  },
  {
    text: "Innovation distinguishes between a leader and a follower.",
    context: "Entrepreneur interview, 1995",
  },
  {
    text: "Sometimes life is going to hit you in the head with a brick. Don't lose faith.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Have the courage to follow your heart and intuition. They somehow already know what you truly want to become.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Quality is more important than quantity. One home run is much better than two doubles.",
    context: "BusinessWeek, 2005",
  },
  {
    text: "Things don't have to change the world to be important.",
    context: "1994 interview",
  },
  {
    text: "You can't just ask customers what they want and then try to give that to them. By the time you get it built, they'll want something new.",
    context: "Inc. Magazine, 1989",
  },
  {
    text: "Technology is nothing. What's important is that you have a faith in people, that they're basically good and smart, and if you give them tools, they'll do wonderful things with them.",
    context: "Rolling Stone, 2003",
  },
  {
    text: "Being the richest man in the cemetery doesn't matter to me. Going to bed at night saying we've done something wonderful — that's what matters to me.",
    context: "Wall Street Journal, 1993",
  },
  {
    text: "We're here to put a dent in the universe. Otherwise why else even be here?",
    context: "1980s interview",
  },
  {
    text: "Creativity is just connecting things. When you ask creative people how they did something, they feel a little guilty because they didn't really do it, they just saw something.",
    context: "Wired, 1996",
  },
  {
    text: "I'm convinced that about half of what separates the successful entrepreneurs from the non-successful ones is pure perseverance.",
    context: "Entrepreneur interview, 1995",
  },
  {
    text: "Details matter. It's worth waiting to get it right.",
    context: "BusinessWeek, 2005",
  },
  {
    text: "Don't let the noise of others' opinions drown out your own inner voice.",
    context: "Stanford Commencement Address, 2005",
  },
  {
    text: "Simple can be harder than complex: You have to work hard to get your thinking clean to make it simple. But it's worth it in the end because once you get there, you can move mountains.",
    context: "BusinessWeek, 1998",
  },
  {
    text: "It's not about the money. It's about the people you have, how you're led, and how much you get it.",
    context: "Fortune, 1998",
  },
  {
    text: "The people who are crazy enough to think they can change the world are the ones who do.",
    context: "Apple's 'Think Different' campaign, 1997",
  },
];

export function getRandomSteveJobsQuote(): SteveJobsQuote {
  const index = Math.floor(Math.random() * steveJobsQuotes.length);
  return steveJobsQuotes[index];
}
