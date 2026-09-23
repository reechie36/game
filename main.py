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
      unlocked row, or into an empty bank slot.
    * Drag a falling letter onto an OCCUPIED grid cell to REPLACE the
      letter there. The evicted letter resumes falling from that spot.
    * Drag a letter already placed in the grid to pick it back up and
      move it. If you drop it somewhere invalid, it resumes falling
      from wherever you dropped it (never just disappears).
    * Drag a placed letter onto the trash-can icon to DISCARD it
      permanently. The letter directly above it in the same column
      (if that row is unlocked) drops down one row to fill the gap;
      no further cascade. Discard never reaches through a locked row.
    * Dragging a letter OUT of the bank into the grid is one-way —
      once it leaves the bank it can never go back in.
- Row fills with a valid word -> clears, scores points, resets to
  empty (stays in place — the stack does not shrink from clearing).
- Row fills with an invalid word -> LOCKS (grayed out, no longer
  usable — including immune to discard-shift from below).
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

ROW_LEN = 5                 # letters per row
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
DELETION_ZONE_HEIGHT = FALLING_DIAMETER

ROW_GROWTH_INTERVAL_MS = 17_500 
GRACE_PERIOD_MS = 10_000
ROW_HOLD_MS = 300
ROW_FLICKER_MS = 200
SCORE_POPUP_MS = 900

BANK_SLOTS = 6
BANK_Y = 740
BANK_GROUP_SLOTS = 3
BANK_LEFT = 30
BANK_RIGHT = SCREEN_W - 30 - (BANK_GROUP_SLOTS * CELL + (BANK_GROUP_SLOTS - 1) * CELL_GAP)

TRASH_RECT = pygame.Rect(SCREEN_W - 70, BANK_Y - 90, 50, 50)

# Colors
BG = (18, 18, 24)
GRID_LINE = (60, 60, 72)
CELL_EMPTY = (32, 32, 42)
CELL_UNLOCKED_FILLED = (48, 50, 58)
CELL_LOCKED = (70, 70, 76)
CELL_HOLE = (90, 40, 40)          # freshly vacated by discard/replace — visually distinct
TEXT_COLOR = (235, 235, 240)
DANGER_LINE_COLOR = (200, 60, 60)
BANK_COLOR = (45, 45, 58)
TRASH_COLOR = (120, 50, 50)
FALLING_COLOR = (230, 190, 90)
FALLING_DRAG_COLOR = (255, 220, 130)
VOWEL_COLOR = (70, 145, 235)
VOWEL_DRAG_COLOR = (120, 190, 255)
S_COLOR = (235, 140, 55)
S_DRAG_COLOR = (255, 180, 90)
GRACE_COLOR = (220, 90, 90)
ROW_INVALID_COLOR = (170, 55, 55)
ROW_FLICKER_COLOR = (245, 220, 110)
SCORE_POPUP_COLOR = (255, 235, 135)

# Dataset from wordle_referenced.csv (5-letter words only, lowercase, no punctuation)
DATASET = pd.read_csv("wordle_referenced.csv", index_col=0)

WORD_LIST = DATASET['word'].tolist()

POINT_LIST = DATASET['points'].tolist()


WORD_SET = set(WORD_LIST)

# Weighted letter pool built from the word list so common letters fall more often
_letter_counts = {}
for _w in WORD_LIST:
    for _ch in _w:
        _letter_counts[_ch] = _letter_counts.get(_ch, 0) + 1
LETTER_POOL = []
for _ch, _n in _letter_counts.items():
    LETTER_POOL.extend([_ch] * _n)


def random_letter():
    return random.choice(LETTER_POOL)


def letter_color(letter, dragging=False):
    """Return the display color for a letter and its drag state."""
    upper_letter = letter.upper()
    if upper_letter == "S":
        return S_DRAG_COLOR if dragging else S_COLOR
    if upper_letter in "AEIOU":
        return VOWEL_DRAG_COLOR if dragging else VOWEL_COLOR
    return FALLING_DRAG_COLOR if dragging else FALLING_COLOR


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

class Row:
    """A single row of ROW_LEN cells. Index 0 = bottom-most row in the stack."""

    def __init__(self):
        self.cells = [None] * ROW_LEN     # each entry: letter char or None
        self.hole_cols = set()             # columns freshly vacated (visual only)
        self.locked = False
        self.resolution_phase = None       # "hold" or "flicker" while checking
        self.resolution_until = 0

    def is_full(self):
        return all(c is not None for c in self.cells)

    def word(self):
        return "".join(c if c else "?" for c in self.cells)


class FallingLetter:
    def __init__(self, letter, x, y):
        self.letter = letter
        self.x = x
        self.y = y
        self.dragging = False
        # origin tells us what happens on an invalid drop:
        #   "fall"  -> just keeps falling from the release point
        #   "grid"  -> resumes falling from the release point (picked up from board)
        #   "bank"  -> snaps back into its bank slot
        self.origin = "fall"
        self.origin_bank_index = None


class ScorePopup:
    def __init__(self, points, x, y, created_at):
        self.points = points
        self.x = x
        self.y = y
        self.created_at = created_at


class Board:
    def __init__(self):
        self.rows = [Row()]  # start with one open row at the bottom
        self.falling = []
        self.bank = [None] * BANK_SLOTS
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

    def bank_rect(self, i):
        group_index = i if i < BANK_GROUP_SLOTS else i - BANK_GROUP_SLOTS
        group_left = BANK_LEFT if i < BANK_GROUP_SLOTS else BANK_RIGHT
        return pygame.Rect(group_left + group_index * (CELL + CELL_GAP), BANK_Y, CELL, CELL)

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
            if fl.y >= top_y - 4 + DELETION_ZONE_HEIGHT or fl.y >= SCREEN_H:
                continue  # vanished — touched the stack, or hit the floor
            still_falling.append(fl)
        self.falling = still_falling
        self.separate_falling_letters()

        # Grace period handling
        in_danger = top_y <= BUFFER_LINE_Y
        if in_danger and not self.grace_active:
            self.grace_active = True
            self.grace_end = now + GRACE_PERIOD_MS
            for row in self.rows:
                row.locked = False
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
        word = row.word()
        row.resolution_phase = None
        row.resolution_until = 0
        if word in WORD_SET:
            point = POINT_LIST[WORD_LIST.index(word)]
            points = round(point * 100)
            self.score += points
            row_index = self.rows.index(row)
            self.score_popups.append(ScorePopup(
                points,
                BOARD_LEFT + (ROW_LEN * CELL + (ROW_LEN - 1) * CELL_GAP) / 2,
                self.row_top_y(row_index) + CELL / 2,
                now,
            ))
            row.cells = [None] * ROW_LEN
            row.hole_cols.clear()
            self.on_row_cleared(now)
            self.rows.remove(row)
        else:
            row.locked = True

    # -- word checking -------------------------------------------------

    def try_clear_row(self, row_idx, now):
        row = self.rows[row_idx]
        if row.locked or row.resolution_phase is not None or not row.is_full():
            return
        row.resolution_phase = "hold"
        row.resolution_until = now + ROW_HOLD_MS


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

    def find_bank_slot_at(self, pos):
        for i in range(BANK_SLOTS):
            if self.board.bank_rect(i).collidepoint(pos):
                return i
        return None

    # -- discard / column shift -----------------------------------------

    def discard_at(self, row_idx, col):
        rows = self.board.rows
        rows[row_idx].cells[col] = None
        rows[row_idx].hole_cols.discard(col)
        above = row_idx + 1
        if above < len(rows) and not rows[above].locked and rows[above].resolution_phase is None:
            letter = rows[above].cells[col]
            if letter is not None:
                rows[row_idx].cells[col] = letter
                rows[above].cells[col] = None
                rows[above].hole_cols.add(col)  # freshly vacated — visually distinct
        self.board.try_clear_row(row_idx, pygame.time.get_ticks())

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

        slot = self.find_bank_slot_at(pos)
        if slot is not None and self.board.bank[slot] is not None:
            letter = self.board.bank[slot]
            self.board.bank[slot] = None
            fl = FallingLetter(letter, pos[0], pos[1])
            fl.dragging = True
            fl.origin = "bank"
            fl.origin_bank_index = slot
            self.dragging = fl
            self.board.falling.append(fl)
            return

        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if not row.locked and row.resolution_phase is None and row.cells[c] is not None:
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

        # Trash can — discard (only meaningful for a letter that came off the grid)
        if TRASH_RECT.collidepoint(pos) and fl.origin == "grid":
            if fl in self.board.falling:
                self.board.falling.remove(fl)
            return

        # Bank slot
        slot = self.find_bank_slot_at(pos)
        if slot is not None and self.board.bank[slot] is None and fl.origin != "bank":
            self.board.bank[slot] = fl.letter
            if fl in self.board.falling:
                self.board.falling.remove(fl)
            return

        # Grid cell
        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if not row.locked and row.resolution_phase is None:
                if row.cells[c] is None:
                    row.cells[c] = fl.letter
                    row.hole_cols.discard(c)
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    self.board.try_clear_row(r_idx, now)
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
                    self.board.try_clear_row(r_idx, now)
                    return
                # occupied + origin == "grid": no-op, falls through to invalid-drop handling

        # Invalid drop location
        if fl.origin == "bank":
            self.board.bank[fl.origin_bank_index] = fl.letter
            if fl in self.board.falling:
                self.board.falling.remove(fl)
        else:
            # "fall" or "grid" origin: just resumes falling from release point
            fl.x, fl.y = pos
        # dragging flag cleared implicitly since fl.dragging isn't checked elsewhere
        fl.dragging = False

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
        # danger / buffer line
        pygame.draw.line(self.screen, DANGER_LINE_COLOR, (0, BUFFER_LINE_Y), (SCREEN_W, BUFFER_LINE_Y), 2)

        # bank
        for i in range(BANK_SLOTS):
            rect = board.bank_rect(i)
            pygame.draw.rect(self.screen, BANK_COLOR, rect, border_radius=6)
            pygame.draw.rect(self.screen, GRID_LINE, rect, 2, border_radius=6)
            if board.bank[i] is not None:
                txt = self.font.render(board.bank[i].upper(), True, letter_color(board.bank[i]))
                self.screen.blit(txt, txt.get_rect(center=rect.center))
        bank_label = self.small_font.render("BANK", True, TEXT_COLOR)
        self.screen.blit(bank_label, (BANK_LEFT, BANK_Y - 22))
        self.screen.blit(bank_label, (BANK_RIGHT, BANK_Y - 22))

        # trash can
        pygame.draw.rect(self.screen, TRASH_COLOR, TRASH_RECT, border_radius=6)
        pygame.draw.rect(self.screen, GRID_LINE, TRASH_RECT, 2, border_radius=6)
        tx = self.small_font.render("DEL", True, TEXT_COLOR)
        self.screen.blit(tx, tx.get_rect(center=TRASH_RECT.center))

        # falling letters
        for fl in board.falling:
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
        for r_idx, row in enumerate(board.rows):
            top_y = board.row_top_y(r_idx)
            if top_y < -CELL:
                continue
            for c in range(ROW_LEN):
                rect = board.cell_rect(r_idx, c)
                if row.locked:
                    color = ROW_INVALID_COLOR
                elif row.resolution_phase == "flicker" and (pygame.time.get_ticks() // 50) % 2 == 0:
                    color = ROW_FLICKER_COLOR
                elif c in row.hole_cols:
                    color = CELL_HOLE
                elif row.cells[c] is not None:
                    color = CELL_UNLOCKED_FILLED
                else:
                    color = CELL_EMPTY
                pygame.draw.rect(self.screen, color, rect, border_radius=6)
                pygame.draw.rect(self.screen, GRID_LINE, rect, 2, border_radius=6)
                if row.cells[c] is not None:
                    txt = self.font.render(row.cells[c].upper(), True, letter_color(row.cells[c]))
                    self.screen.blit(txt, txt.get_rect(center=rect.center))

        # Completed rows launch their score briefly upward before fading out.
        now = pygame.time.get_ticks()
        for popup in board.score_popups:
            progress = (now - popup.created_at) / SCORE_POPUP_MS
            popup_y = popup.y - 42 * progress
            popup_alpha = round(255 * (1 - progress))
            popup_txt = self.font.render(f"+ {popup.points}!", True, SCORE_POPUP_COLOR)
            popup_txt.set_alpha(popup_alpha)
            self.screen.blit(popup_txt, popup_txt.get_rect(center=(round(popup.x), round(popup_y))))

        # HUD
        score_txt = self.font.render(f"Score: {board.score}", True, TEXT_COLOR)
        self.screen.blit(score_txt, (16, 16))

        if board.grace_active and not board.game_over:
            remaining = max(0, board.grace_end - pygame.time.get_ticks()) / 1000.0
            g_txt = self.font.render(f"DANGER! {remaining:0.1f}s", True, GRACE_COLOR)
            self.screen.blit(g_txt, g_txt.get_rect(midtop=(SCREEN_W // 2, 16)))

        if board.game_over:
            overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 170))
            self.screen.blit(overlay, (0, 0))
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