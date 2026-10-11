import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshteinDistance,
  isWordClose,
  isWordExact,
  getRandomWords,
  generateMask,
  getRevealedIndices,
  WORD_PACKS,
} from '../utils/word.util';

describe('Word Utilities (Domain Logic)', () => {
  it('levenshteinDistance calculates correct edit distances for all inputs', () => {
    assert.strictEqual(levenshteinDistance('apple', 'apple'), 0);
    assert.strictEqual(levenshteinDistance('apple', 'apples'), 1);
    assert.strictEqual(levenshteinDistance('apple', 'aple'), 1);
    assert.strictEqual(levenshteinDistance('cat', 'hat'), 1);
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
    assert.strictEqual(levenshteinDistance('', ''), 0);
    assert.strictEqual(levenshteinDistance('', 'abc'), 3);
    assert.strictEqual(levenshteinDistance('xyz', ''), 3);
  });

  it('isWordExact handles case-insensitivity, whitespace, and mismatches', () => {
    assert.strictEqual(isWordExact('  Apple ', 'apple'), true);
    assert.strictEqual(isWordExact('BANANA', 'banana'), true);
    assert.strictEqual(isWordExact('orange', 'apple'), false);
    assert.strictEqual(isWordExact('cat', 'dog'), false);
  });

  it('isWordClose detects near-misses correctly with boundary conditions', () => {
    assert.strictEqual(isWordClose('aple', 'apple'), true);
    assert.strictEqual(isWordClose('banan', 'banana'), true);
    assert.strictEqual(isWordClose('apple', 'apple'), false); // identical is not "close"
    assert.strictEqual(isWordClose('cot', 'cat'), false); // length <= 3 returns false
    assert.strictEqual(isWordClose('ox', 'ox'), false);
    assert.strictEqual(isWordClose('elephant', 'elephanx'), true);
    assert.strictEqual(isWordClose('elephant', 'elephxyz'), false); // distance > 1
  });

  it('getRandomWords returns 3 unique words from all word packs and fallbacks', () => {
    const packs = ['standard', 'animals', 'food', 'technology'] as const;
    for (const pack of packs) {
      const words = getRandomWords(pack);
      assert.strictEqual(words.length, 3);
      assert.strictEqual(new Set(words).size, 3);
      for (const w of words) {
        assert.ok(WORD_PACKS[pack].includes(w as never));
      }
    }

    // Custom pack with valid list
    const customWords = getRandomWords('custom', ['matrix', 'cyberpunk', 'neon', 'glitch']);
    assert.strictEqual(customWords.length, 3);
    assert.strictEqual(new Set(customWords).size, 3);

    // Custom pack with fewer than 3 words falls back to standard
    const fallbackCustom = getRandomWords('custom', ['onlyone']);
    assert.strictEqual(fallbackCustom.length, 3);
    assert.strictEqual(new Set(fallbackCustom).size, 3);

    // Custom pack with undefined array falls back to standard
    const undefinedCustom = getRandomWords('custom', undefined);
    assert.strictEqual(undefinedCustom.length, 3);

    // Invalid pack key falls back to standard
    const invalidPack = getRandomWords('nonexistent' as never);
    assert.strictEqual(invalidPack.length, 3);
  });

  it('generateMask generates correct letter mask including spaces and hyphens', () => {
    const revealed = new Set<number>([1, 4]);
    const mask = generateMask('apple', revealed);
    assert.strictEqual(mask, '_ p _ _ e');

    const multiWordMask = generateMask('ice cream', new Set<number>());
    assert.strictEqual(multiWordMask, '_ _ _   _ _ _ _ _');

    const hyphenMask = generateMask('t-shirt', new Set<number>([0]));
    assert.strictEqual(hyphenMask, 't - _ _ _ _ _');
  });

  it('getRevealedIndices reveals letters progressively based on time and word structure', () => {
    // Word length <= 2 returns empty set
    assert.strictEqual(getRevealedIndices('ox', 0.9).size, 0);
    assert.strictEqual(getRevealedIndices('a', 0.8).size, 0);

    const word = 'elephant';
    const startRevealed = getRevealedIndices(word, 0.1);
    assert.strictEqual(startRevealed.size, 0);

    const midRevealed = getRevealedIndices(word, 0.5);
    assert.strictEqual(midRevealed.size, 1);

    const lateRevealed = getRevealedIndices(word, 0.8);
    assert.strictEqual(lateRevealed.size, 2);

    // Compound word with hyphens and spaces
    const compound = getRevealedIndices('yo-yo car', 0.8);
    assert.ok(compound.size <= 2);
  });
});
