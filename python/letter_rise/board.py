"""Board state and word-resolution logic."""

import math
import random

import pygame

from .config import (
    BOARD_BOTTOM_Y,
    BOARD_LEFT,
    BUFFER_LINE_Y,
    CELL,
    CELL_GAP,
    FALLING_DIAMETER,
    FALLING_RADIUS,
    FALL_SPEED,
    GRACE_PERIOD_MS,
    MAX_FALLING,
    MIN_ROW_GROWTH_INTERVAL_MS,
    MIN_SPAWN_INTERVAL_MS,
    ROW_GROWTH_INTERVAL_MS,
    ROW_GROWTH_INTERVAL_STEP_MS,
    ROW_HOLD_MS,
    ROW_LEN,
    ROW_FLICKER_MS,
    SCORE_POPUP_MS,
    SCREEN_H,
    SCREEN_W,
    SPAWN_INTERVAL_MS,
    SPAWN_INTERVAL_STEP_MS,
    SPAWN_Y,
    MAX_MULTIPLIER_TOKENS,
    MULTIPLIER_SPAWN_CHANCE,
    MULTIPLIER_SPAWN_CHECK_MS,
)
from .data import (
    LETTER_POINTS,
    TIER_MULTIPLIERS,
    WORD_SET,
    WORD_TIERS,
    random_letter,
)
from .config import BINGO_BONUS_MULTIPLIER
from .models import FallingLetter, MultiplierToken, Row, ScorePopup

class Board:
    def __init__(self):
        self.rows = [Row()]  # start with one open row at the bottom
        self.falling = []
        self.sound_events = []
        self.score = 0
        self.started_at = pygame.time.get_ticks()
        self.ended_at = None
        self.paused_at = None
        self.paused_ms = 0
        self.last_spawn = self.started_at
        self.last_multiplier_spawn_check = self.started_at
        self.last_growth = self.started_at
        self.grace_active = False
        self.grace_end = 0
        self.game_over = False
        self.score_popups = []
        self.rarest_word_found = ""

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

    def difficulty_steps(self, now):
        return self.active_elapsed_ms(now) // 60_000

    def active_elapsed_ms(self, now):
        end_time = self.ended_at if self.ended_at is not None else now
        paused_ms = self.paused_ms
        if self.paused_at is not None:
            paused_ms += now - self.paused_at
        return max(0, end_time - self.started_at - paused_ms)

    def pause(self, now):
        if self.paused_at is None:
            self.paused_at = now

    def resume(self, now):
        if self.paused_at is None:
            return
        pause_duration = now - self.paused_at
        self.paused_ms += pause_duration
        self.last_spawn += pause_duration
        self.last_growth += pause_duration
        if self.grace_active:
            self.grace_end += pause_duration
        self.paused_at = None

    def spawn_interval(self, now):
        return max(
            MIN_SPAWN_INTERVAL_MS,
            SPAWN_INTERVAL_MS - self.difficulty_steps(now) * SPAWN_INTERVAL_STEP_MS,
        )

    def row_growth_interval(self, now):
        return max(
            MIN_ROW_GROWTH_INTERVAL_MS,
            ROW_GROWTH_INTERVAL_MS - self.difficulty_steps(now) * ROW_GROWTH_INTERVAL_STEP_MS,
        )

    def maybe_grow(self, now):
        if self.grace_active:
            return
        if now - self.last_growth >= self.row_growth_interval(now):
            self.last_growth = now
            self.rows.insert(0, Row())
            self.sound_events.append("grow")

    def maybe_spawn(self, now):
        if len(self.falling) >= MAX_FALLING:
            return
        if now - self.last_spawn < self.spawn_interval(now):
            return
        self.last_spawn = now
        x = random.randint(CELL // 2, SCREEN_W - CELL // 2)
        self.falling.append(FallingLetter(random_letter(), x, SPAWN_Y))

    def maybe_spawn_multiplier(self, now):
        token_count = sum(isinstance(fl, MultiplierToken) for fl in self.falling)
        if token_count >= MAX_MULTIPLIER_TOKENS:
            return
        if now - self.last_multiplier_spawn_check < MULTIPLIER_SPAWN_CHECK_MS:
            return
        self.last_multiplier_spawn_check = now
        if random.random() >= MULTIPLIER_SPAWN_CHANCE:
            return
        value = 2 if random.random() < 0.7 else 3
        x = random.randint(CELL // 2, SCREEN_W - CELL // 2)
        self.falling.append(MultiplierToken(value, x, SPAWN_Y))

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
        self.maybe_spawn_multiplier(now)
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

        self.update_grace_period(now, top_y)

    def update_grace_period(self, now, top_y=None):
        """Start, reset, or end the grace period from the current stack height."""
        if top_y is None:
            top_y = self.stack_top_y()
        in_danger = top_y <= BUFFER_LINE_Y
        if in_danger and not self.grace_active:
            self.grace_active = True
            self.grace_end = now + GRACE_PERIOD_MS
            self.last_growth = now
            self.sound_events.append("warning")
        elif not in_danger and self.grace_active:
            self.grace_active = False
            self.grace_end = 0

        if self.grace_active and now >= self.grace_end:
            self.game_over = True
            self.ended_at = now
            self.sound_events.append("game_over")

    def elapsed_seconds(self, now):
        return self.active_elapsed_ms(now) // 1000

    def grace_remaining_ms(self, now):
        reference_time = self.paused_at if self.paused_at is not None else now
        return max(0, self.grace_end - reference_time)

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
            multiplier_values = [
                row.multiplier_cols[col]
                for col in range(start, end + 1)
                if col in row.multiplier_cols
            ]
            for value in multiplier_values:
                points *= value
            bingo = len(word) == ROW_LEN
            if bingo:
                points *= BINGO_BONUS_MULTIPLIER
            self.score += points
            if tier > WORD_TIERS.get(self.rarest_word_found, 0):
                self.rarest_word_found = word
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
                multiplier_values,
            ))
            for col in range(start, end + 1):
                row.cells[col] = None
                row.multiplier_cols.pop(col, None)
                row.hole_cols.add(col)
            row.scored_cols.update(range(start, end + 1))
            self.unlock_adjacent_locked_cells(row, start, end)
            self.on_row_cleared(now)
            self.sound_events.append("bingo" if bingo else "success")
            if len(row.scored_cols) == ROW_LEN:
                row.hole_cols.clear()
                self.rows.remove(row)
        else:
            row.locked_cols.update(range(start, end + 1))
            self.sound_events.append("error")

    def unlock_adjacent_locked_cells(self, row, start, end):
        """Unlock contiguous locked cells directly beside a valid word."""
        left = start - 1
        while left >= 0 and left in row.locked_cols:
            row.locked_cols.remove(left)
            left -= 1

        right = end + 1
        while right < ROW_LEN and right in row.locked_cols:
            row.locked_cols.remove(right)
            right += 1

    # -- word checking -------------------------------------------------

    def try_clear_segment(self, row_idx, start, end, now):
        row = self.rows[row_idx]
        if row.resolution_phase is not None:
            return
        if any(
            row.cells[col] is None
            or row.is_locked(col)
            or col in row.scored_cols
            for col in range(start, end + 1)
        ):
            return
        row.resolution_phase = "hold"
        row.resolution_until = now + ROW_HOLD_MS
        row.resolution_range = (start, end)
        self.sound_events.append("confirm")


# ---------------------------------------------------------------------------
# Interaction
# ---------------------------------------------------------------------------
