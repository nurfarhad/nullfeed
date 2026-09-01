export interface Quote {
  text: string;
  author: string;
}

export const FOCUS_QUOTES: readonly Quote[] = Object.freeze([
  {
    text: "The feed will still be here. This moment won't.",
    author: "Nullfeed Focus"
  },
  {
    text: "You have power over your mind - not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius"
  },
  {
    text: "It is not that we have a short time to live, but that we waste a lot of it.",
    author: "Seneca"
  },
  {
    text: "Your attention is the only asset that cannot be refunded once spent.",
    author: "Naval Ravikant"
  },
  {
    text: "Deciding what not to do is as important as deciding what to do.",
    author: "Steve Jobs"
  },
  {
    text: "Silence is a source of great strength.",
    author: "Lao Tzu"
  },
  {
    text: "Simplicity is the prerequisite for reliability.",
    author: "Edsger W. Dijkstra"
  },
  {
    text: "First say to yourself what you would be; and then do what you have to do.",
    author: "Epictetus"
  },
  {
    text: "Deep work is the ability to focus without distraction on a cognitively demanding task.",
    author: "Cal Newport"
  },
  {
    text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    author: "Stephen Covey"
  },
  {
    text: "Almost everything will work again if you unplug it for a few minutes, including you.",
    author: "Anne Lamott"
  },
  {
    text: "This is a good time to do the thing you've been avoiding.",
    author: "Nullfeed Focus"
  }
]);

export const QUOTES: readonly string[] = Object.freeze(
  FOCUS_QUOTES.map((q) => q.text)
);

export function getRandomQuote(excludeIndex?: number): { quote: Quote; index: number } {
  const total = FOCUS_QUOTES.length;
  let index = Math.floor(Math.random() * total);
  if (excludeIndex !== undefined && total > 1 && index === excludeIndex) {
    index = (index + 1) % total;
  }
  return { quote: FOCUS_QUOTES[index], index };
}
