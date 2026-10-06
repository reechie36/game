/**
 * Word vocabulary, Scrabble letter points, and weighted letter pool.
 */

import {
  LETTER_POINT_COLORS,
  ROW_LEN,
  TIER_COLORS,
  TIER_MULTIPLIERS,
  TIER_NAMES,
} from "./config.js";

export const LETTER_POINTS = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

export const LETTER_POOL = [
  "t", "h", "e", "o", "f", "a", "n", "d", "i", "r", "s", "b", "y",
  "w", "u", "m", "l", "v", "c", "p", "g", "k", "j", "x", "z", "q",
];

export const LETTER_WEIGHTS = [
  156721871785, 83510672335, 213696540502, 146749150367, 44525376370,
  135958726098, 108845696624, 63457985633, 108643456491, 111942021278,
  119864716052, 30752825258, 35490966549, 35041643668, 50408602486,
  45939959367, 76601361504, 17282349765, 52062564023, 38797170591,
  34242357958, 16491031653, 3913724754, 4338706132, 1347012761, 1499295398,
];

export const CUMULATIVE_WEIGHTS = [
  156721871785, 240232544120, 453929084622, 600678234989, 645203611359,
  781162337457, 890008034081, 953466019714, 1062109476205, 1174051497483,
  1293916213535, 1324669038793, 1360160005342, 1395201649010, 1445610251496,
  1491550210863, 1568151572367, 1585433922132, 1637496486155, 1676293656746,
  1710536014704, 1727027046357, 1730940771111, 1735279477243, 1736626490004,
  1738125785402,
];

export const TOTAL_WEIGHT = 1738125785402;

/**
 * Pick a random letter weighted by word frequency using binary search.
 */
export function randomLetter() {
  const r = Math.random() * TOTAL_WEIGHT;
  let low = 0;
  let high = CUMULATIVE_WEIGHTS.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (r < CUMULATIVE_WEIGHTS[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return LETTER_POOL[low];
}

// In-memory dictionaries populated via loadWords()
export const WORD_TIERS = new Map();
export const WORD_SET = new Set();
export const WORD_FREQUENCIES = new Map();

let wordsLoaded = false;
let loadPromise = null;

export async function loadWords(source = "assets/words.json") {
  if (wordsLoaded) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let data;
    if (typeof source === "string") {
      const res = await fetch(source);
      if (!res.ok) {
        throw new Error(`Failed to load word list: ${res.status} ${res.statusText}`);
      }
      data = await res.json();
    } else {
      data = source;
    }
    for (const [word, [tier, count]] of Object.entries(data)) {
      const normalized = word.trim().toLowerCase();
      if (normalized.length >= 1 && normalized.length <= ROW_LEN) {
        WORD_TIERS.set(normalized, tier);
        WORD_SET.add(normalized);
        WORD_FREQUENCIES.set(normalized, count);
      }
    }
    // Parity with Python
    WORD_TIERS.set("a", 1);
    WORD_TIERS.set("i", 1);
    WORD_SET.add("a");
    WORD_SET.add("i");
    WORD_FREQUENCIES.set("a", 1);
    WORD_FREQUENCIES.set("i", 1);

    wordsLoaded = true;
    return true;
  })();

  return loadPromise;
}

/**
 * Return Scrabble letter points multiplied by the word's tier bonus.
 */
export function calculateWordScore(word) {
  const normalized = word.trim().toLowerCase();
  const tier = WORD_TIERS.get(normalized) || 1;
  let basePoints = 0;
  for (const ch of normalized.toUpperCase()) {
    basePoints += LETTER_POINTS[ch] || 1;
  }
  const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
  return basePoints * multiplier;
}

/**
 * Return color for a letter tile and drag state.
 * Returns [r, g, b] array.
 */
export function letterColor(letter, dragging = false) {
  const upper = (letter || "").toUpperCase();
  let color;
  if (upper === "S") {
    color = TIER_COLORS[2];
  } else {
    const points = LETTER_POINTS[upper] || 1;
    color = LETTER_POINT_COLORS[points] || TIER_COLORS[1];
  }
  if (!dragging) {
    return color;
  }
  return [
    Math.min(255, color[0] + 35),
    Math.min(255, color[1] + 35),
    Math.min(255, color[2] + 35),
  ];
}

export function tierColor(tier) {
  return TIER_COLORS[tier] || TIER_COLORS[1];
}

export function tierName(tier) {
  return TIER_NAMES[tier] || "Common";
}
