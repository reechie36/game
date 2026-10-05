"""Runtime vocabulary and scoring data."""

import os
import random

import pandas as pd

from .config import (
    LETTER_POINT_COLORS,
    PROJECT_DIR,
    ROW_LEN,
    TIER_COLORS,
)

# Runtime datasets: merged vocabulary tiers and Scrabble letter values.
DATASET = pd.read_csv(os.path.join(PROJECT_DIR, "merged.csv"))
LETTER_POINTS_DATASET = pd.read_csv(
    os.path.join(PROJECT_DIR, "scrabble_letter_points.csv")
)

WORD_TIERS = {
    str(word).strip().lower(): int(tier)
    for word, tier in zip(DATASET["word"], DATASET["tier"])
    if 1 <= len(str(word).strip()) <= ROW_LEN
}
WORD_TIERS.update({"a": 1, "i": 1})
WORD_LIST = list(WORD_TIERS)
WORD_SET = set(WORD_LIST)
WORD_FREQUENCIES = {}
for word, count in zip(DATASET["word"], DATASET["count"]):
    normalized_word = str(word).strip().lower()
    if normalized_word:
        WORD_FREQUENCIES[normalized_word] = (
            WORD_FREQUENCIES.get(normalized_word, 0) + int(count)
        )
WORD_FREQUENCIES.setdefault("a", 1)
WORD_FREQUENCIES.setdefault("i", 1)
LETTER_POINTS = {
    str(character).strip().upper(): int(points)
    for character, points in zip(
        LETTER_POINTS_DATASET["character"], LETTER_POINTS_DATASET["points"]
    )
    if len(str(character).strip()) == 1
}
TIER_MULTIPLIERS = {
    1: 1.0,
    2: 1.2,
    3: 1.5,
    4: 2.0,
    5: 2.5,
    6: 3.0,
    7: 3.5,
    8: 4.0,
}
TIER_NAMES = {
    1: "Common",
    2: "Uncommon",
    3: "Rare",
    4: "Epic",
    5: "Legendary",
    6: "Mythic",
    7: "Ancient",
    8: "Celestial",
}


def calculate_word_score(word):
    """Return Scrabble letter points multiplied by the word's tier bonus."""
    normalized_word = word.strip().lower()
    tier = WORD_TIERS[normalized_word]
    base_points = sum(LETTER_POINTS[letter] for letter in normalized_word.upper())
    return base_points * TIER_MULTIPLIERS[tier]

# Weighted letter pool built from merged.csv word frequencies.
_letter_weights = {}
for _word, _word_count in WORD_FREQUENCIES.items():
    for _ch in _word:
        _letter_weights[_ch] = _letter_weights.get(_ch, 0) + _word_count
LETTER_POOL = list(_letter_weights)
LETTER_WEIGHTS = list(_letter_weights.values())


def random_letter():
    return random.choices(LETTER_POOL, weights=LETTER_WEIGHTS, k=1)[0]


def letter_color(letter, dragging=False):
    """Return a Scrabble-value color for a letter and its drag state."""
    upper_letter = letter.upper()
    if upper_letter == "S":
        color = TIER_COLORS[2]
    else:
        points = LETTER_POINTS.get(upper_letter, 1)
        color = LETTER_POINT_COLORS.get(points, TIER_COLORS[1])
    if not dragging:
        return color
    return tuple(min(255, channel + 35) for channel in color)


def tier_color(tier):
    """Return the display color for a tier number."""
    return TIER_COLORS[tier]

