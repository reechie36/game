#!/usr/bin/env python3
"""Generate reference test vectors from Python Letter Rise for parity testing."""

import json
import sys
import os

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.dirname(TOOLS_DIR)
REPO_DIR = os.path.dirname(WEB_DIR)
PYTHON_DIR = os.path.join(REPO_DIR, "python")

if PYTHON_DIR not in sys.path:
    sys.path.insert(0, PYTHON_DIR)

import letter_rise.config as cfg
import letter_rise.data as data
from letter_rise.board import Board
from letter_rise.models import Row

test_words = [
    "a", "i", "the", "cat", "word", "puzzle", "complex", "zyzzyva", "quiz", "jazz", "oxygen"
]

word_scores = {}
for w in test_words:
    if w in data.WORD_SET:
        tier = data.WORD_TIERS[w]
        score = data.calculate_word_score(w)
        bingo_score = score * cfg.BINGO_BONUS_MULTIPLIER if len(w) == cfg.ROW_LEN else score
        word_scores[w] = {
            "tier": tier,
            "score": score,
            "bingo_score": bingo_score
        }

board = Board()
board.started_at = 0
intervals = {}
for elapsed_sec in [0, 30, 60, 120, 300, 600, 1200]:
    now = elapsed_sec * 1000
    intervals[elapsed_sec] = {
        "difficulty_steps": board.difficulty_steps(now),
        "spawn_interval": board.spawn_interval(now),
        "row_growth_interval": board.row_growth_interval(now),
    }

danger_levels = {}
test_board = Board()
for row_count in range(1, 12):
    test_board.rows = [Row() for _ in range(row_count)]
    danger_levels[row_count] = {
        "stack_top_y": test_board.stack_top_y(),
        "danger_level": test_board.danger_level()
    }

reference_data = {
    "word_scores": word_scores,
    "intervals": intervals,
    "danger_levels": danger_levels,
}

with open(os.path.join(TOOLS_DIR, "parity_reference.json"), "w") as f:
    json.dump(reference_data, f, indent=2)

print("parity_reference.json written successfully.")
