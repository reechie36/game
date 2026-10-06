/**
 * Board state, word checking, and falling letter physics.
 * 1:1 port of Python letter_rise/board.py & models.py (pure logic, no DOM).
 */

import {
  BINGO_BONUS_MULTIPLIER,
  BOARD_BOTTOM_Y,
  BOARD_LEFT,
  BUFFER_LINE_Y,
  CELL,
  CELL_GAP,
  FALL_SPEED,
  FALLING_DIAMETER,
  FALLING_RADIUS,
  GRACE_PERIOD_MS,
  MAX_FALLING,
  MIN_ROW_GROWTH_INTERVAL_MS,
  MIN_SPAWN_INTERVAL_MS,
  ROW_FLICKER_MS,
  ROW_GROWTH_INTERVAL_MS,
  ROW_GROWTH_INTERVAL_STEP_MS,
  ROW_HOLD_MS,
  ROW_LEN,
  SCORE_POPUP_MS,
  SCREEN_H,
  SCREEN_W,
  SPAWN_INTERVAL_MS,
  SPAWN_INTERVAL_STEP_MS,
  SPAWN_Y,
  TIER_MULTIPLIERS,
} from "./config.js";
import {
  LETTER_POINTS,
  randomLetter,
  WORD_SET,
  WORD_TIERS,
} from "./data.js";

/**
 * A single row of ROW_LEN cells. Index 0 = bottom-most row in the stack.
 */
export class Row {
  constructor() {
    this.cells = new Array(ROW_LEN).fill(null); // each entry: letter char (lowercase) or null
    this.hole_cols = new Set(); // columns freshly vacated (visual only)
    this.locked_cols = new Set();
    this.scored_cols = new Set();
    this.resolution_phase = null; // "hold" | "flicker" | null
    this.resolution_until = 0;
    this.resolution_range = null; // [start, end]
  }

  isFull() {
    return this.cells.every((c) => c !== null);
  }

  word() {
    return this.cells.map((c) => (c ? c : "?")).join("");
  }

  segmentWord(start, end) {
    return this.cells.slice(start, end + 1).join("");
  }

  isLocked(col) {
    return this.locked_cols.has(col);
  }
}

/**
 * A letter falling from the sky or being dragged.
 */
export class FallingLetter {
  constructor(letter, x, y) {
    this.letter = letter;
    this.x = x;
    this.y = y;
    this.dragging = false;
    this.origin = "fall"; // "fall" | "grid"
  }
}

/**
 * Transient score notification after a word is confirmed.
 */
export class ScorePopup {
  constructor(base_points, multiplier, points, tier, bingo, x, y, created_at) {
    this.base_points = base_points;
    this.multiplier = multiplier;
    this.points = points;
    this.tier = tier;
    this.bingo = bingo;
    this.x = x;
    this.y = y;
    this.created_at = created_at;
  }
}

/**
 * Main game board managing stack rows, falling letters, timers, and score.
 */
export class Board {
  constructor(now = 0) {
    this.rows = [new Row()]; // start with one open row at the bottom
    this.falling = [];
    this.sound_events = [];
    this.score = 0;
    this.started_at = now;
    this.ended_at = null;
    this.paused_at = null;
    this.paused_ms = 0;
    this.last_spawn = this.started_at;
    this.last_growth = this.started_at;
    this.grace_active = false;
    this.grace_end = 0;
    this.game_over = false;
    this.score_popups = [];
    this.rarest_word_found = "";
  }

  // -- geometry -----------------------------------------------------

  /**
   * Top y-coordinate of row idx (0 = bottom).
   */
  row_top_y(idx) {
    return BOARD_BOTTOM_Y - (idx + 1) * (CELL + CELL_GAP) + CELL_GAP;
  }

  /**
   * Top edge y-coordinate of the whole stack (smallest y = highest row).
   */
  stack_top_y() {
    return this.row_top_y(this.rows.length - 1);
  }

  /**
   * Return how close the stack is to the danger line, from 0 to 1.
   */
  danger_level() {
    const safe_height = BOARD_BOTTOM_Y - BUFFER_LINE_Y;
    const stack_height = BOARD_BOTTOM_Y - this.stack_top_y();
    return Math.max(0.0, Math.min(1.0, stack_height / safe_height));
  }

  /**
   * Bounding box of a cell in row_idx, col.
   */
  cell_rect(row_idx, col) {
    const x = BOARD_LEFT + col * (CELL + CELL_GAP);
    const y = this.row_top_y(row_idx);
    return { x, y, width: CELL, height: CELL };
  }

  // -- growth / spawning ---------------------------------------------

  difficulty_steps(now) {
    return Math.floor(this.active_elapsed_ms(now) / 60000);
  }

  active_elapsed_ms(now) {
    const endTime = this.ended_at !== null ? this.ended_at : now;
    let pausedMs = this.paused_ms;
    if (this.paused_at !== null) {
      pausedMs += now - this.paused_at;
    }
    return Math.max(0, endTime - this.started_at - pausedMs);
  }

  pause(now) {
    if (this.paused_at === null) {
      this.paused_at = now;
    }
  }

  resume(now) {
    if (this.paused_at === null) return;
    const pauseDuration = now - this.paused_at;
    this.paused_ms += pauseDuration;
    this.last_spawn += pauseDuration;
    this.last_growth += pauseDuration;
    if (this.grace_active) {
      this.grace_end += pauseDuration;
    }
    this.paused_at = null;
  }

  spawn_interval(now) {
    return Math.max(
      MIN_SPAWN_INTERVAL_MS,
      SPAWN_INTERVAL_MS - this.difficulty_steps(now) * SPAWN_INTERVAL_STEP_MS
    );
  }

  row_growth_interval(now) {
    return Math.max(
      MIN_ROW_GROWTH_INTERVAL_MS,
      ROW_GROWTH_INTERVAL_MS - this.difficulty_steps(now) * ROW_GROWTH_INTERVAL_STEP_MS
    );
  }

  maybe_grow(now) {
    if (this.grace_active) return;
    if (now - this.last_growth >= this.row_growth_interval(now)) {
      this.last_growth = now;
      this.rows.unshift(new Row());
      this.sound_events.push("grow");
    }
  }

  maybe_spawn(now) {
    if (this.falling.length >= MAX_FALLING) return;
    if (now - this.last_spawn < this.spawn_interval(now)) return;
    this.last_spawn = now;
    const minX = Math.floor(CELL / 2);
    const maxX = SCREEN_W - Math.floor(CELL / 2);
    const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    this.falling.push(new FallingLetter(randomLetter(), x, SPAWN_Y));
  }

  separate_falling_letters() {
    for (let iter = 0; iter < 12; iter++) {
      for (let index = 0; index < this.falling.length; index++) {
        const first = this.falling[index];
        for (let next = index + 1; next < this.falling.length; next++) {
          const second = this.falling[next];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= FALLING_DIAMETER) continue;

          let push_x, push_y;
          if (distance === 0) {
            push_x = FALLING_DIAMETER;
            push_y = 0.0;
          } else {
            push_x = (dx / distance) * (FALLING_DIAMETER - distance);
            push_y = (dy / distance) * (FALLING_DIAMETER - distance);
          }

          if (first.dragging) {
            second.x += push_x;
            second.y += push_y;
          } else if (second.dragging) {
            first.x -= push_x;
            first.y -= push_y;
          } else {
            first.x -= push_x / 2;
            first.y -= push_y / 2;
            second.x += push_x / 2;
            second.y += push_y / 2;
          }

          first.x = Math.max(FALLING_RADIUS, Math.min(SCREEN_W - FALLING_RADIUS, first.x));
          second.x = Math.max(FALLING_RADIUS, Math.min(SCREEN_W - FALLING_RADIUS, second.x));
        }
      }
    }
  }

  // -- per-frame update -------------------------------------------------

  update(dt, now) {
    if (this.game_over) return;

    this.maybe_grow(now);
    this.maybe_spawn(now);
    this.update_row_resolutions(now);
    this.score_popups = this.score_popups.filter(
      (popup) => now - popup.created_at < SCORE_POPUP_MS
    );

    // Ease fall speed down slightly as the stack rises
    const rows_up = Math.max(0, this.rows.length - 3);
    const speed = Math.max(28.0, FALL_SPEED - rows_up * 3.0);

    const top_y = this.stack_top_y();
    const still_falling = [];
    for (const fl of this.falling) {
      if (fl.dragging) {
        still_falling.push(fl);
        continue;
      }
      fl.y += speed * dt;
      if (fl.y >= top_y - 4 + FALLING_DIAMETER || fl.y >= SCREEN_H) {
        continue; // Vanished
      }
      still_falling.push(fl);
    }
    this.falling = still_falling;
    this.separate_falling_letters();

    this.update_grace_period(now, top_y);
  }

  update_grace_period(now, top_y = null) {
    if (top_y === null) {
      top_y = this.stack_top_y();
    }
    const in_danger = top_y <= BUFFER_LINE_Y;
    if (in_danger && !this.grace_active) {
      this.grace_active = true;
      this.grace_end = now + GRACE_PERIOD_MS;
      this.last_growth = now;
      this.sound_events.push("warning");
    } else if (!in_danger && this.grace_active) {
      this.grace_active = false;
      this.grace_end = 0;
    }

    if (this.grace_active && now >= this.grace_end) {
      this.game_over = true;
      this.ended_at = now;
      this.sound_events.push("game_over");
    }
  }

  elapsed_seconds(now) {
    return Math.floor(this.active_elapsed_ms(now) / 1000);
  }

  grace_remaining_ms(now) {
    const reference_time = this.paused_at !== null ? this.paused_at : now;
    return Math.max(0, this.grace_end - reference_time);
  }

  on_row_cleared(now) {
    if (this.grace_active) {
      this.grace_end = now + GRACE_PERIOD_MS;
    }
  }

  update_row_resolutions(now) {
    for (const row of [...this.rows]) {
      if (row.resolution_phase === "hold" && now >= row.resolution_until) {
        row.resolution_phase = "flicker";
        row.resolution_until = now + ROW_FLICKER_MS;
      } else if (row.resolution_phase === "flicker" && now >= row.resolution_until) {
        this.finish_row_resolution(row, now);
      }
    }
  }

  finish_row_resolution(row, now) {
    const [start, end] = row.resolution_range;
    const word = row.segmentWord(start, end);
    row.resolution_phase = null;
    row.resolution_until = 0;
    row.resolution_range = null;

    if (WORD_SET.has(word)) {
      const tier = WORD_TIERS.get(word) || 1;
      const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
      let base_points = 0;
      for (const letter of word.toUpperCase()) {
        base_points += LETTER_POINTS[letter] || 1;
      }
      let points = base_points * multiplier;
      const bingo = word.length === ROW_LEN;
      if (bingo) {
        points *= BINGO_BONUS_MULTIPLIER;
      }
      this.score += points;

      const currentRarestTier = WORD_TIERS.get(this.rarest_word_found) || 0;
      if (tier > currentRarestTier) {
        this.rarest_word_found = word;
      }

      const row_index = this.rows.indexOf(row);
      this.score_popups.push(
        new ScorePopup(
          base_points,
          multiplier,
          points,
          tier,
          bingo,
          BOARD_LEFT + ((start + end + 1) * CELL + (start + end) * CELL_GAP) / 2,
          this.row_top_y(row_index) + CELL / 2,
          now
        )
      );

      for (let col = start; col <= end; col++) {
        row.cells[col] = null;
        row.hole_cols.add(col);
        row.scored_cols.add(col);
      }

      this.unlock_adjacent_locked_cells(row, start, end);
      this.on_row_cleared(now);
      this.sound_events.push(bingo ? "bingo" : "success");

      if (row.scored_cols.size === ROW_LEN) {
        row.hole_cols.clear();
        const removeIdx = this.rows.indexOf(row);
        if (removeIdx !== -1) {
          this.rows.splice(removeIdx, 1);
        }
      }
    } else {
      for (let col = start; col <= end; col++) {
        row.locked_cols.add(col);
      }
      this.sound_events.push("error");
    }
  }

  unlock_adjacent_locked_cells(row, start, end) {
    let left = start - 1;
    while (left >= 0 && row.locked_cols.has(left)) {
      row.locked_cols.delete(left);
      left -= 1;
    }

    let right = end + 1;
    while (right < ROW_LEN && row.locked_cols.has(right)) {
      row.locked_cols.delete(right);
      right += 1;
    }
  }

  // -- word checking -------------------------------------------------

  try_clear_segment(row_idx, start, end, now) {
    const row = this.rows[row_idx];
    if (!row) return;
    if (row.resolution_phase !== null) return;
    for (let col = start; col <= end; col++) {
      if (
        row.cells[col] === null ||
        row.isLocked(col) ||
        row.scored_cols.has(col)
      ) {
        return;
      }
    }
    row.resolution_phase = "hold";
    row.resolution_until = now + ROW_HOLD_MS;
    row.resolution_range = [start, end];
    this.sound_events.push("confirm");
  }
}
