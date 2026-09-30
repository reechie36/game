"""
LETTER RISE — Quick Demo v2 (NOT the full game)
=================================================
Implements the v2 design decisions worked out in planning:

- ALL unlocked rows are open/fillable at the same time (not just one
  "active" row) — you choose which row to work on.
- Rows build up ON THEIR OWN over time (every ROW_GROWTH_INTERVAL_MS),
  pushing the whole stack upward, independent of whether you're keeping
  up. This is on top of the existing fill/clear/lock logic, not a
  replacement for it.
- Falling letters are capped (MAX_FALLING at once) and only spawn above
  the unlocked play area, to keep the board from feeling crowded.
- A falling letter that reaches the top of the stack before being caught
  VANISHES (it doesn't count as a miss against you directly, but you
  lose the letter and the chance to use it).
- Interaction is CLICK-AND-DRAG:
        * Drag a falling letter and drop it into any empty grid cell in any
            unlocked row.
    * Drag a falling letter onto an OCCUPIED grid cell to REPLACE the
      letter there. The evicted letter resumes falling from that spot.
    * Drag a letter already placed in the grid to pick it back up and
      move it. If you drop it somewhere invalid, it resumes falling
      from wherever you dropped it (never just disappears).
- Row fills with a valid word -> clears, scores points, resets to
  empty (stays in place — the stack does not shrink from clearing).
- Row fills with an invalid word -> LOCKS (grayed out, no longer
    usable — including immune to shifts from below).
- If the stack reaches the top of the play area, you don't lose
  immediately: a RECURRING grace period starts. Clearing any row
  while in the grace period resets the timer. Let it expire -> Game
  Over.
- No miss-penalty for a falling letter reaching the bottom uncaught
  (for now) — it just vanishes there too.

Controls: mouse only (click-drag-drop). Press R to restart after Game
Over. ESC to quit.

Run locally with:  pip install pygame-ce   then   python letter_rise_demo_v2.py
"""

import os
import random
import sys
import math
import pygame
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCREEN_W, SCREEN_H = 820, 820
FPS = 60

ROW_LEN = 7                 # blocks per row; submitted words may use 1-7 blocks
CELL = 64                   # cell size in px
CELL_GAP = 6
BOARD_LEFT = (SCREEN_W - (ROW_LEN * CELL + (ROW_LEN - 1) * CELL_GAP)) // 2
BOARD_BOTTOM_Y = 620         # y-coordinate of the bottom of the lowest row (row index 0)

BUFFER_LINE_Y = 90          # if the top of the stack rises above this line, danger
SPAWN_Y = 20                 # falling letters spawn just below the top edge

MAX_FALLING = 15
SPAWN_INTERVAL_MS = 1000
FALL_SPEED = 40.0            # px / second, eased down as stack rises (see update)
FALLING_RADIUS = CELL // 2 - 6
FALLING_DIAMETER = FALLING_RADIUS * 2
DELETION_ZONE_HEIGHT = CELL * 2

ROW_GROWTH_INTERVAL_MS = 17_500 
GRACE_PERIOD_MS = 10_000
ROW_HOLD_MS = 300
ROW_FLICKER_MS = 200
SCORE_POPUP_MS = 900
SCORE_POPUP_INTRO_MS = 500
BINGO_BONUS_MULTIPLIER = 2

# Colors
BG = (18, 18, 24)
GRID_LINE = (60, 60, 72)
CELL_EMPTY = (32, 32, 42)
CELL_UNLOCKED_FILLED = (48, 50, 58)
CELL_LOCKED = (70, 70, 76)
CELL_HOLE = (90, 40, 40)          # freshly vacated by discard/replace — visually distinct
TEXT_COLOR = (235, 235, 240)
DANGER_LINE_COLOR = (200, 60, 60)
FALLING_COLOR = (230, 190, 90)
FALLING_DRAG_COLOR = (255, 220, 130)
GRACE_COLOR = (220, 90, 90)
ROW_INVALID_COLOR = (170, 55, 55)
ROW_FLICKER_COLOR = (245, 220, 110)
SCORE_POPUP_COLOR = (255, 235, 135)

TIER_COLORS = {
    1: (220, 55, 55),    # red
    2: (235, 105, 45),   # red-orange
    3: (235, 205, 45),   # yellow
    4: (155, 195, 55),   # yellow-green
    5: (70, 175, 80),    # green
    6: (50, 150, 190),   # blue-green
    7: (125, 80, 190),   # blue-violet / purple
    8: (190, 60, 145),   # red-violet
}
LETTER_POINT_COLORS = {
    1: TIER_COLORS[1],
    2: TIER_COLORS[3],
    3: TIER_COLORS[4],
    4: TIER_COLORS[5],
    5: TIER_COLORS[6],
    8: TIER_COLORS[7],
    10: TIER_COLORS[8],
}

# Runtime datasets: merged vocabulary tiers and Scrabble letter values.
DATASET = pd.read_csv("merged.csv")
LETTER_POINTS_DATASET = pd.read_csv("scrabble_letter_points.csv")

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


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

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


class Board:
    def __init__(self):
        self.rows = [Row()]  # start with one open row at the bottom
        self.falling = []
        self.score = 0
        self.last_spawn = 0
        self.last_growth = pygame.time.get_ticks()
        self.grace_active = False
        self.grace_end = 0
        self.game_over = False
        self.score_popups = []

    # -- geometry -----------------------------------------------------

    def row_top_y(self, idx):
        """Top y-coordinate of row `idx` (0 = bottom)."""
        return BOARD_BOTTOM_Y - (idx + 1) * (CELL + CELL_GAP) + CELL_GAP

    def stack_top_y(self):
        """Top edge y-coordinate of the whole stack (smallest y = highest row)."""
        return self.row_top_y(len(self.rows) - 1)

    def danger_level(self):
        """Return how close the stack is to the danger line, from 0 to 1."""
        safe_height = BOARD_BOTTOM_Y - BUFFER_LINE_Y
        stack_height = BOARD_BOTTOM_Y - self.stack_top_y()
        return max(0.0, min(1.0, stack_height / safe_height))

    def cell_rect(self, row_idx, col):
        x = BOARD_LEFT + col * (CELL + CELL_GAP)
        y = self.row_top_y(row_idx)
        return pygame.Rect(x, y, CELL, CELL)

    # -- growth / spawning ---------------------------------------------

    def maybe_grow(self, now):
        if now - self.last_growth >= ROW_GROWTH_INTERVAL_MS:
            self.last_growth = now
            self.rows.insert(0, Row())

    def maybe_spawn(self, now):
        if len(self.falling) >= MAX_FALLING:
            return
        if now - self.last_spawn < SPAWN_INTERVAL_MS:
            return
        self.last_spawn = now
        x = random.randint(CELL // 2, SCREEN_W - CELL // 2)
        self.falling.append(FallingLetter(random_letter(), x, SPAWN_Y))

    def separate_falling_letters(self):
        for _ in range(12):
            for index, first in enumerate(self.falling):
                for second in self.falling[index + 1:]:
                    dx = second.x - first.x
                    dy = second.y - first.y
                    distance = math.hypot(dx, dy)
                    if distance >= FALLING_DIAMETER:
                        continue

                    if distance == 0:
                        push_x, push_y = FALLING_DIAMETER, 0.0
                    else:
                        push_x = dx / distance * (FALLING_DIAMETER - distance)
                        push_y = dy / distance * (FALLING_DIAMETER - distance)
                    if first.dragging:
                        second.x += push_x
                        second.y += push_y
                    elif second.dragging:
                        first.x -= push_x
                        first.y -= push_y
                    else:
                        first.x -= push_x / 2
                        first.y -= push_y / 2
                        second.x += push_x / 2
                        second.y += push_y / 2

                    first.x = max(FALLING_RADIUS, min(SCREEN_W - FALLING_RADIUS, first.x))
                    second.x = max(FALLING_RADIUS, min(SCREEN_W - FALLING_RADIUS, second.x))

    # -- per-frame update -------------------------------------------------

    def update(self, dt, now):
        if self.game_over:
            return

        self.maybe_grow(now)
        self.maybe_spawn(now)
        self.update_row_resolutions(now)
        self.score_popups = [
            popup for popup in self.score_popups
            if now - popup.created_at < SCORE_POPUP_MS
        ]

        # Ease fall speed down slightly as the stack rises, so total pressure
        # doesn't compound (board getting smaller already raises difficulty).
        rows_up = max(0, len(self.rows) - 3)
        speed = max(28.0, FALL_SPEED - rows_up * 3.0)

        top_y = self.stack_top_y()
        still_falling = []
        for fl in self.falling:
            if fl.dragging:
                still_falling.append(fl)
                continue
            fl.y += speed * dt
            if fl.y >= top_y - 4 + FALLING_DIAMETER or fl.y >= SCREEN_H:
                continue  # vanished — touched the stack, or hit the floor
            still_falling.append(fl)
        self.falling = still_falling
        self.separate_falling_letters()

        # Grace period handling
        in_danger = top_y <= BUFFER_LINE_Y
        if in_danger and not self.grace_active:
            self.grace_active = True
            self.grace_end = now + GRACE_PERIOD_MS
        elif not in_danger:
            self.grace_active = False

        if self.grace_active and now >= self.grace_end:
            self.game_over = True

    def on_row_cleared(self, now):
        """Call whenever a row successfully clears — resets grace timer."""
        if self.grace_active:
            self.grace_end = now + GRACE_PERIOD_MS

    def update_row_resolutions(self, now):
        for row in self.rows[:]:
            if row.resolution_phase == "hold" and now >= row.resolution_until:
                row.resolution_phase = "flicker"
                row.resolution_until = now + ROW_FLICKER_MS
            elif row.resolution_phase == "flicker" and now >= row.resolution_until:
                self.finish_row_resolution(row, now)

    def finish_row_resolution(self, row, now):
        start, end = row.resolution_range
        word = row.segment_word(start, end)
        row.resolution_phase = None
        row.resolution_until = 0
        row.resolution_range = None
        if word in WORD_SET:
            tier = WORD_TIERS[word]
            multiplier = TIER_MULTIPLIERS[tier]
            base_points = sum(LETTER_POINTS[letter] for letter in word.upper())
            points = base_points * multiplier
            bingo = len(word) == ROW_LEN
            if bingo:
                points *= BINGO_BONUS_MULTIPLIER
            self.score += points
            row_index = self.rows.index(row)
            self.score_popups.append(ScorePopup(
                base_points,
                multiplier,
                points,
                tier,
                bingo,
                BOARD_LEFT + ((start + end + 1) * CELL + (start + end) * CELL_GAP) / 2,
                self.row_top_y(row_index) + CELL / 2,
                now,
            ))
            for col in range(start, end + 1):
                row.cells[col] = None
                row.hole_cols.add(col)
            row.scored_cols.update(range(start, end + 1))
            self.on_row_cleared(now)
            if len(row.scored_cols) == ROW_LEN:
                row.hole_cols.clear()
                self.rows.remove(row)
        else:
            row.locked_cols.update(range(start, end + 1))

    # -- word checking -------------------------------------------------

    def try_clear_segment(self, row_idx, start, end, now):
        row = self.rows[row_idx]
        if row.resolution_phase is not None:
            return
        if any(
            row.cells[col] is None or row.is_locked(col)
            for col in range(start, end + 1)
        ):
            return
        row.resolution_phase = "hold"
        row.resolution_until = now + ROW_HOLD_MS
        row.resolution_range = (start, end)


# ---------------------------------------------------------------------------
# Interaction
# ---------------------------------------------------------------------------

class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Letter Rise — Demo v2")
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("consolas", 30, bold=True)
        self.small_font = pygame.font.SysFont("consolas", 18)
        self.big_font = pygame.font.SysFont("consolas", 46, bold=True)
        self.reset()

    def reset(self):
        self.board = Board()
        self.dragging = None  # the FallingLetter currently being dragged

    # -- hit testing -----------------------------------------------------

    def find_falling_at(self, pos):
        for fl in reversed(self.board.falling):
            if not fl.dragging and abs(fl.x - pos[0]) < CELL // 2 and abs(fl.y - pos[1]) < CELL // 2:
                return fl
        return None

    def find_grid_cell_at(self, pos):
        for r_idx, row in enumerate(self.board.rows):
            for c in range(ROW_LEN):
                if self.board.cell_rect(r_idx, c).collidepoint(pos):
                    return r_idx, c
        return None

    def find_hover_candidate(self, pos):
        cell = self.find_grid_cell_at(pos)
        if cell is None:
            return None
        row_idx, col = cell
        row = self.board.rows[row_idx]
        if (
            row.resolution_phase is not None
            or row.cells[col] is None
            or row.is_locked(col)
        ):
            return None

        start = col
        while (
            start > 0
            and row.cells[start - 1] is not None
            and not row.is_locked(start - 1)
        ):
            start -= 1
        end = col
        while (
            end < ROW_LEN - 1
            and row.cells[end + 1] is not None
            and not row.is_locked(end + 1)
        ):
            end += 1
        return row_idx, start, end

    # -- mouse handling ----------------------------------------------------

    def handle_mousedown(self, pos):
        if self.board.game_over:
            return

        fl = self.find_falling_at(pos)
        if fl is not None:
            fl.dragging = True
            fl.origin = "fall"
            self.dragging = fl
            return

        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if (
                row.resolution_phase is None
                and not row.is_locked(c)
                and row.cells[c] is not None
            ):
                letter = row.cells[c]
                row.cells[c] = None
                row.hole_cols.discard(c)
                fl = FallingLetter(letter, pos[0], pos[1])
                fl.dragging = True
                fl.origin = "grid"
                self.dragging = fl
                self.board.falling.append(fl)
            return

    def handle_mousemove(self, pos):
        if self.dragging is not None:
            self.dragging.x, self.dragging.y = pos

    def handle_mouseup(self, pos):
        fl = self.dragging
        self.dragging = None
        if fl is None:
            return
        now = pygame.time.get_ticks()

        # Grid cell
        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if row.resolution_phase is None and not row.is_locked(c):
                if row.cells[c] is None:
                    row.cells[c] = fl.letter
                    row.hole_cols.discard(c)
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    return
                elif fl.origin == "fall":
                    # replace: evicted letter resumes falling from this spot
                    evicted = row.cells[c]
                    row.cells[c] = fl.letter
                    row.hole_cols.discard(c)
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    new_fl = FallingLetter(evicted, pos[0], pos[1])
                    new_fl.origin = "fall"
                    self.board.falling.append(new_fl)
                    return
                # occupied + origin == "grid": no-op, falls through to invalid-drop handling

        # Invalid drop location
        # Resume falling from the release point.
        fl.x, fl.y = pos
        # dragging flag cleared implicitly since fl.dragging isn't checked elsewhere
        fl.dragging = False

    def confirm_hovered_segment(self):
        if self.board.game_over or self.dragging is not None:
            return
        candidate = self.find_hover_candidate(pygame.mouse.get_pos())
        if candidate is None:
            return
        row_idx, start, end = candidate
        self.board.try_clear_segment(
            row_idx,
            start,
            end,
            pygame.time.get_ticks(),
        )

    # -- render -----------------------------------------------------------

    def draw(self):
        self.screen.fill(BG)
        board = self.board

        # Tint the playfield more strongly red as the stack climbs toward the
        # danger line, giving pressure a constant visual presence.
        danger_level = board.danger_level()
        if danger_level > 0:
            danger_overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            danger_overlay.fill((190, 25, 25, round(125 * danger_level)))
            self.screen.blit(danger_overlay, (0, 0))

        # The stack consumes falling letters at its highest top edge. Draw the
        # moving boundary line here; the masking gradient is drawn after the
        # falling letters so they disappear naturally behind it.
        disappear_y = board.stack_top_y() - 4

        # Cover the area below the gradient before drawing UI elements so the
        # bank and grid remain visible on top of it.
        under_gradient_y = disappear_y + DELETION_ZONE_HEIGHT
        if under_gradient_y < SCREEN_H:
            pygame.draw.rect(
                self.screen,
                BG,
                pygame.Rect(0, under_gradient_y, SCREEN_W, SCREEN_H - under_gradient_y),
            )

        # danger / buffer line
        pygame.draw.line(self.screen, DANGER_LINE_COLOR, (0, BUFFER_LINE_Y), (SCREEN_W, BUFFER_LINE_Y), 2)

        

        # Draw ungrabbed letters before the deletion mask so they disappear
        # behind the stack boundary as they pass under it.
        for fl in board.falling:
            if fl.dragging:
                continue
            color = letter_color(fl.letter, fl.dragging)
            pygame.draw.circle(self.screen, color, (int(fl.x), int(fl.y)), FALLING_RADIUS)
            txt = self.font.render(fl.letter.upper(), True, (30, 30, 30))
            self.screen.blit(txt, txt.get_rect(center=(int(fl.x), int(fl.y))))

        deletion_zone = pygame.Rect(
            0,
            disappear_y,
            SCREEN_W,
            DELETION_ZONE_HEIGHT,
        )
        pygame.draw.rect(self.screen, BG, deletion_zone)

        gradient = pygame.Surface((SCREEN_W, DELETION_ZONE_HEIGHT), pygame.SRCALPHA)
        for y in range(DELETION_ZONE_HEIGHT):
            distance = (y + 1) / DELETION_ZONE_HEIGHT
            alpha = round(105 * (1 - distance) ** 2)
            pygame.draw.line(
                gradient,
                (220, 45, 45, alpha),
                (0, y),
                (SCREEN_W, y),
            )
        self.screen.blit(gradient, (0, disappear_y))

        pygame.draw.line(
            self.screen,
            (245, 75, 75, 180),
            (0, disappear_y),
            (SCREEN_W, disappear_y),
            2,
        )

        # Draw the grid last so its cells and letters stay visible above the
        # disappearance line and its masking gradient.
        hover_candidate = None
        if self.dragging is None:
            hover_candidate = self.find_hover_candidate(pygame.mouse.get_pos())
        hovered_cell = self.find_grid_cell_at(pygame.mouse.get_pos())
        for r_idx, row in enumerate(board.rows):
            top_y = board.row_top_y(r_idx)
            if top_y < -CELL:
                continue
            for c in range(ROW_LEN):
                rect = board.cell_rect(r_idx, c)
                if row.is_locked(c):
                    color = ROW_INVALID_COLOR
                elif (
                    row.resolution_phase == "flicker"
                    and row.resolution_range is not None
                    and row.resolution_range[0] <= c <= row.resolution_range[1]
                    and (pygame.time.get_ticks() // 50) % 2 == 0
                ):
                    color = ROW_FLICKER_COLOR
                elif c in row.hole_cols:
                    color = CELL_HOLE
                elif row.cells[c] is not None:
                    color = CELL_UNLOCKED_FILLED
                else:
                    color = CELL_EMPTY
                pygame.draw.rect(self.screen, color, rect, border_radius=6)
                pygame.draw.rect(self.screen, GRID_LINE, rect, 2, border_radius=6)
                if hover_candidate is not None and hover_candidate[0] == r_idx:
                    _, start, end = hover_candidate
                    if start <= c <= end:
                        pygame.draw.rect(
                            self.screen,
                            ROW_FLICKER_COLOR,
                            rect,
                            3,
                            border_radius=6,
                        )
                if hovered_cell == (r_idx, c):
                    pygame.draw.rect(
                        self.screen,
                        TEXT_COLOR,
                        rect,
                        3,
                        border_radius=6,
                    )
                if row.cells[c] is not None:
                    txt = self.font.render(row.cells[c].upper(), True, letter_color(row.cells[c]))
                    self.screen.blit(txt, txt.get_rect(center=rect.center))

        # Keep the letter being dragged above the boundary, grid, and every
        # other board element so it remains visible throughout the drag.
        for fl in board.falling:
            if not fl.dragging:
                continue
            color = letter_color(fl.letter, dragging=True)
            pygame.draw.circle(self.screen, color, (int(fl.x), int(fl.y)), FALLING_RADIUS)
            txt = self.font.render(fl.letter.upper(), True, (30, 30, 30))
            self.screen.blit(txt, txt.get_rect(center=(int(fl.x), int(fl.y))))

        # Completed rows launch their score briefly upward before fading out.
        now = pygame.time.get_ticks()
        for popup in board.score_popups:
            age = now - popup.created_at
            progress = age / SCORE_POPUP_MS
            popup_y = popup.y - 42 * progress
            if age < SCORE_POPUP_INTRO_MS:
                popup_alpha = 255
                popup_text = f"{popup.base_points:g} x {popup.multiplier:g}"
                if popup.bingo:
                    popup_text += f" x{BINGO_BONUS_MULTIPLIER:g}"
            else:
                popup_alpha = round(255 * (1 - progress))
                popup_text = f"+ {popup.points:g}!"
            popup_txt = self.font.render(popup_text, True, SCORE_POPUP_COLOR)
            popup_txt.set_alpha(popup_alpha)
            self.screen.blit(popup_txt, popup_txt.get_rect(center=(round(popup.x), round(popup_y))))

            tier_text = self.font.render(
                f"{TIER_NAMES[popup.tier]}",
                True,
                tier_color(popup.tier),
            )
            tier_text.set_alpha(popup_alpha)
            self.screen.blit(
                tier_text,
                tier_text.get_rect(center=(SCREEN_W // 2, BOARD_BOTTOM_Y + 75)),
            )
            if popup.bingo:
                bingo_text = self.big_font.render("BINGO!", True, SCORE_POPUP_COLOR)
                bingo_text.set_alpha(popup_alpha)
                self.screen.blit(
                    bingo_text,
                    bingo_text.get_rect(center=(SCREEN_W // 2, BOARD_BOTTOM_Y + 125)),
                )

        score_txt = self.font.render(f"Score: {board.score}", True, TEXT_COLOR)
        self.screen.blit(score_txt, (16, 16))

        if board.game_over:
            go_txt = self.big_font.render("GAME OVER", True, (240, 90, 90))
            self.screen.blit(go_txt, go_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 - 30)))
            sc_txt = self.font.render(f"Final score: {board.score}", True, TEXT_COLOR)
            self.screen.blit(sc_txt, sc_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 20)))
            r_txt = self.small_font.render("Press R to restart, ESC to quit", True, TEXT_COLOR)
            self.screen.blit(r_txt, r_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 60)))

        pygame.display.flip()

    # -- main loop ----------------------------------------------------------

    def run(self):
        running = True
        while running:
            dt = self.clock.tick(FPS) / 1000.0
            now = pygame.time.get_ticks()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        running = False
                    elif event.key == pygame.K_r and self.board.game_over:
                        self.reset()
                    elif event.key == pygame.K_SPACE:
                        self.confirm_hovered_segment()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.handle_mousedown(event.pos)
                elif event.type == pygame.MOUSEMOTION:
                    self.handle_mousemove(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.handle_mouseup(event.pos)

            self.board.update(dt, now)
            self.draw()

        pygame.quit()
        sys.exit()


if __name__ == "__main__":
    Game().run()