"""Game state data models."""

from .config import ROW_LEN

class Row:
    """A single row of ROW_LEN cells. Index 0 = bottom-most row in the stack."""

    def __init__(self):
        self.cells = [None] * ROW_LEN     # each entry: letter char or None
        self.hole_cols = set()             # columns freshly vacated (visual only)
        self.locked_cols = set()
        self.scored_cols = set()
        self.resolution_phase = None       # "hold" or "flicker" while checking
        self.resolution_until = 0
        self.resolution_range = None

    def is_full(self):
        return all(c is not None for c in self.cells)

    def word(self):
        return "".join(c if c else "?" for c in self.cells)

    def segment_word(self, start, end):
        return "".join(self.cells[start:end + 1])

    def is_locked(self, col):
        return col in self.locked_cols


class FallingLetter:
    def __init__(self, letter, x, y):
        self.letter = letter
        self.x = x
        self.y = y
        self.dragging = False
        # origin tells us what happens when a placed letter is dropped outside
        # a grid cell.
        self.origin = "fall"


class ScorePopup:
    def __init__(self, base_points, multiplier, points, tier, bingo, x, y, created_at):
        self.base_points = base_points
        self.multiplier = multiplier
        self.points = points
        self.tier = tier
        self.bingo = bingo
        self.x = x
        self.y = y
        self.created_at = created_at


