export const WORD_PACKS = {
  standard: [
    'airplane', 'anchor', 'apple', 'balloon', 'banana', 'baseball', 'battery', 'beach',
    'bicycle', 'blanket', 'bridge', 'camera', 'candle', 'castle', 'cloud', 'cookie',
    'crown', 'diamond', 'door', 'drum', 'feather', 'fire', 'fish', 'flag', 'flower',
    'guitar', 'hammer', 'heart', 'helicopter', 'island', 'key', 'ladder', 'lamp',
    'mountain', 'mushroom', 'ocean', 'paint', 'piano', 'pizza', 'pyramid', 'rainbow',
    'robot', 'rocket', 'sailboat', 'scissors', 'shield', 'spider', 'star', 'sun',
    'sword', 'telescope', 'tent', 'tree', 'umbrella', 'volcano', 'watch', 'whale', 'windmill'
  ],
  animals: [
    'alligator', 'butterfly', 'camel', 'cat', 'chameleon', 'cheetah', 'chicken', 'cow',
    'crab', 'crocodile', 'dolphin', 'duck', 'eagle', 'elephant', 'flamingo', 'fox',
    'frog', 'giraffe', 'goat', 'gorilla', 'hamster', 'hedgehog', 'horse', 'kangaroo',
    'koala', 'leopard', 'lion', 'llama', 'monkey', 'octopus', 'owl', 'panda', 'parrot',
    'penguin', 'pig', 'polar bear', 'rabbit', 'rhino', 'shark', 'sheep', 'sloth',
    'snake', 'tiger', 'turtle', 'walrus', 'wolf', 'zebra'
  ],
  food: [
    'avocado', 'bacon', 'bagel', 'burger', 'burrito', 'cake', 'candy', 'cheese', 'cherry',
    'chocolate', 'croissant', 'cupcake', 'donut', 'egg', 'grapes', 'hotdog', 'ice cream',
    'lemon', 'lollipop', 'noodle', 'pancake', 'pasta', 'peach', 'pie', 'pineapple',
    'popcorn', 'sandwich', 'spaghetti', 'steak', 'strawberry', 'sushi', 'taco', 'waffle'
  ],
  technology: [
    'algorithm', 'antenna', 'bluetooth', 'cable', 'charger', 'computer', 'drone', 'earphones',
    'keyboard', 'laptop', 'microchip', 'microphone', 'monitor', 'mouse', 'printer', 'router',
    'satellite', 'screen', 'server', 'smartphone', 'speaker', 'tablet', 'virtual reality', 'webcam'
  ],
} as const;

export type WordPackKey = keyof typeof WORD_PACKS | 'custom';

/**
 * Functional selection of 3 random unique words from specified word pack
 */
export function getRandomWords(pack: WordPackKey, customWords: string[] = []): string[] {
  let pool: string[] = [];
  if (pack === 'custom' && customWords && customWords.length >= 3) {
    pool = [...customWords];
  } else if (pack in WORD_PACKS) {
    pool = [...WORD_PACKS[pack as keyof typeof WORD_PACKS]];
  } else {
    pool = [...WORD_PACKS.standard];
  }

  const shuffled = pool.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3).map((w) => w.toLowerCase().trim());
}

/**
 * Generates masked string e.g. "_ _ a _ _" based on revealed index set
 */
export function generateMask(word: string, revealedIndices: Set<number>): string {
  return word
    .split('')
    .map((char, index) => {
      if (char === ' ') return ' ';
      if (char === '-') return '-';
      return revealedIndices.has(index) ? char : '_';
    })
    .join(' ');
}

/**
 * Calculates deterministic revealed indices based on round progress fraction (0.0 to 1.0)
 */
export function getRevealedIndices(word: string, progressFraction: number): Set<number> {
  const indices = new Set<number>();
  const eligibleIndices: number[] = [];

  for (let i = 0; i < word.length; i++) {
    if (word[i] !== ' ' && word[i] !== '-') {
      eligibleIndices.push(i);
    }
  }

  if (eligibleIndices.length <= 2) return indices;

  let numToReveal = 0;
  if (progressFraction >= 0.75) {
    numToReveal = Math.min(2, Math.floor(eligibleIndices.length / 2));
  } else if (progressFraction >= 0.45) {
    numToReveal = 1;
  }

  for (let i = 0; i < numToReveal; i++) {
    const idx = eligibleIndices[(i * 3 + 1) % eligibleIndices.length];
    indices.add(idx);
  }

  return indices;
}

/**
 * Pure function: calculates Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Checks whether a guess is within 1 edit distance ("Close" notification)
 */
export function isWordClose(guess: string, word: string): boolean {
  const s1 = guess.toLowerCase().trim();
  const s2 = word.toLowerCase().trim();
  if (s1 === s2) return false;
  if (s2.length <= 3) return false;
  return levenshteinDistance(s1, s2) === 1;
}

/**
 * Checks if guess strictly matches word
 */
export function isWordExact(guess: string, word: string): boolean {
  return guess.toLowerCase().trim() === word.toLowerCase().trim();
}
