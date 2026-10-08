/**
 * Canvas 2D Renderer for Letter Rise.
 * Implements 1:1 visual parity with Python/Pygame draw() sequence.
 */

import {
  BINGO_BONUS_MULTIPLIER,
  BOARD_BOTTOM_Y,
  BUFFER_LINE_Y,
  CELL,
  COLORS,
  DELETION_ZONE_HEIGHT,
  FALLING_DIAMETER,
  FALLING_RADIUS,
  MULTIPLIER_COLOR,
  MULTIPLIER_GLOW_COLOR,
  ROW_LEN,
  SCORE_POPUP_INTRO_MS,
  SCORE_POPUP_MS,
  SCREEN_H,
  SCREEN_W,
} from "./config.js";
import { letterColor, tierColor, tierName } from "./data.js";

function rgbStr([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbaStr([r, g, b], a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function cssColorToRgb(value, fallback) {
  const normalized = value.trim();
  const rgbMatch = normalized.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) return rgbMatch.slice(1).map(Number);

  const hexMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1].slice(0, 2), 16),
      parseInt(hexMatch[1].slice(2, 4), 16),
      parseInt(hexMatch[1].slice(4, 6), 16),
    ];
  }

  return fallback;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.fontFamily = "'Fira Mono', monospace";
    this.initCanvasSize();
  }

  initCanvasSize() {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(SCREEN_W * this.dpr);
    this.canvas.height = Math.round(SCREEN_H * this.dpr);
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Reset context transform with DPR scaling.
   */
  beginFrame() {
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== this.dpr) {
      this.initCanvasSize();
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.textBaseline = "middle";
  }

  getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const color = (name, fallback) =>
      cssColorToRgb(styles.getPropertyValue(name), fallback);

    return {
      ...COLORS,
      BG: color("--bg-color", COLORS.BG),
      GRID_LINE: color("--grid-line", COLORS.GRID_LINE),
      CELL_EMPTY: color("--cell-empty", COLORS.CELL_EMPTY),
      TEXT_COLOR: color("--text-color", COLORS.TEXT_COLOR),
      DANGER_LINE_COLOR: color("--danger-color", COLORS.DANGER_LINE_COLOR),
      FALLING_COLOR: color("--accent-gold", COLORS.FALLING_COLOR),
      FALLING_DRAG_COLOR: color("--accent-gold-hover", COLORS.FALLING_DRAG_COLOR),
      GRACE_COLOR: color("--danger-color", COLORS.GRACE_COLOR),
    };
  }

  updateViewportEffects(disappearY) {
    const wrapperRect = this.canvas.getBoundingClientRect();
    const scale = wrapperRect.height / SCREEN_H;
    const root = document.documentElement;
    const toViewportY = (logicalY) => wrapperRect.top + logicalY * scale;

    root.style.setProperty("--stack-line-top", `${toViewportY(disappearY)}px`);
    root.style.setProperty("--danger-line-top", `${toViewportY(BUFFER_LINE_Y)}px`);
    root.style.setProperty("--line-height", `${Math.max(1, 2 * scale)}px`);
    root.style.setProperty(
      "--stack-zone-height",
      `${Math.max(2, DELETION_ZONE_HEIGHT * scale)}px`
    );
  }

  /**
   * Draw rounded rectangle path.
   */
  drawRoundRect(x, y, w, h, radius) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  /**
   * Main gameplay rendering sequence.
   * Exact order:
   * 1. Clear / Background & Danger overlay
   * 2. Masking background under gradient
   * 3. Danger / Buffer boundary line
   * 4. Falling letters (un-dragged)
   * 5. Deletion zone background & Masking gradient
   * 6. Stack disappearance line
   * 7. Grid cells (locked, flicker, hole, filled, empty, hover, letters)
   * 8. Dragged letter (on top of grid)
   * 9. Grace period heartbeat pulse overlay
   * 10. Score popups, tier & bingo text
   * 11. HUD (Score & Time)
   */
  renderGame(board, now, hoverCandidate = null, hoveredCell = null, draggedLetter = null) {
    this.beginFrame();
    const ctx = this.ctx;
    const colors = this.getThemeColors();

    // 1. Base background
    ctx.fillStyle = rgbStr(colors.BG);
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    const dangerLevel = board.danger_level();
    if (dangerLevel > 0) {
      const dangerAlpha = (16 * dangerLevel) / 255;
      ctx.fillStyle = `rgba(150, 35, 35, ${dangerAlpha})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    const disappearY = board.stack_top_y() - 4;
    this.updateViewportEffects(disappearY);

    // 2. Cover area below the gradient
    const underGradientY = disappearY + DELETION_ZONE_HEIGHT;
    if (underGradientY < SCREEN_H) {
      ctx.fillStyle = rgbStr(colors.BG);
      ctx.fillRect(0, underGradientY, SCREEN_W, SCREEN_H - underGradientY);
    }

    // 3. Danger / buffer line
    ctx.strokeStyle = rgbStr(colors.DANGER_LINE_COLOR);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, BUFFER_LINE_Y);
    ctx.lineTo(SCREEN_W, BUFFER_LINE_Y);
    ctx.stroke();

    // 4. Draw ungrabbed falling letters
    ctx.textAlign = "center";
    ctx.font = `bold 30px ${this.fontFamily}`;
    for (const fl of board.falling) {
      if (fl.dragging) continue;
      if (fl.value) {
        this.drawMultiplierToken(fl.x, fl.y, fl.value);
      } else {
        const col = letterColor(fl.letter, false);
        ctx.fillStyle = rgbStr(col);
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, FALLING_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgb(30, 30, 30)";
        ctx.fillText(fl.letter.toUpperCase(), fl.x, fl.y + 1);
      }
    }

    // 5. Deletion zone background & Masking gradient
    ctx.fillStyle = rgbStr(colors.BG);
    ctx.fillRect(0, disappearY, SCREEN_W, DELETION_ZONE_HEIGHT);

    // Gradient with quadratic falloff
    const grad = ctx.createLinearGradient(0, disappearY, 0, disappearY + DELETION_ZONE_HEIGHT);
    grad.addColorStop(0.0, "rgba(220, 45, 45, 0.412)"); // 105 / 255
    grad.addColorStop(0.25, "rgba(220, 45, 45, 0.231)");
    grad.addColorStop(0.5, "rgba(220, 45, 45, 0.103)");
    grad.addColorStop(0.75, "rgba(220, 45, 45, 0.026)");
    grad.addColorStop(1.0, "rgba(220, 45, 45, 0.0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, disappearY, SCREEN_W, DELETION_ZONE_HEIGHT);

    // 6. Stack disappearance line
    ctx.strokeStyle = "rgba(245, 75, 75, 0.706)"; // 180 / 255
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, disappearY);
    ctx.lineTo(SCREEN_W, disappearY);
    ctx.stroke();

    // 7. Draw grid cells
    for (let rIdx = 0; rIdx < board.rows.length; rIdx++) {
      const row = board.rows[rIdx];
      const topY = board.row_top_y(rIdx);
      if (topY < -CELL) continue;

      for (let c = 0; c < ROW_LEN; c++) {
        if (row.scored_cols.has(c)) continue; // Scored cells are cleared
        const rect = board.cell_rect(rIdx, c);

        // Determine cell background color
        let cellCol;
        if (row.isLocked(c)) {
          cellCol = colors.ROW_INVALID_COLOR;
        } else if (
          row.resolution_phase === "flicker" &&
          row.resolution_range !== null &&
          c >= row.resolution_range[0] &&
          c <= row.resolution_range[1] &&
          Math.floor(now / 50) % 2 === 0
        ) {
          cellCol = colors.ROW_FLICKER_COLOR;
        } else if (row.hole_cols.has(c)) {
          cellCol = colors.CELL_HOLE;
        } else if (row.cells[c] !== null) {
          cellCol = colors.CELL_UNLOCKED_FILLED;
        } else {
          cellCol = colors.CELL_EMPTY;
        }

        this.drawRoundRect(rect.x, rect.y, rect.width, rect.height, 6);
        ctx.fillStyle = rgbStr(cellCol);
        ctx.fill();

        ctx.strokeStyle = rgbStr(colors.GRID_LINE);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Highlight hover candidate segment
        if (hoverCandidate !== null && hoverCandidate[0] === rIdx) {
          const [, start, end] = hoverCandidate;
          if (c >= start && c <= end) {
            this.drawRoundRect(rect.x, rect.y, rect.width, rect.height, 6);
            ctx.strokeStyle = rgbStr(colors.ROW_FLICKER_COLOR);
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }

        // Highlight directly hovered cell
        if (hoveredCell !== null && hoveredCell[0] === rIdx && hoveredCell[1] === c) {
          this.drawRoundRect(rect.x, rect.y, rect.width, rect.height, 6);
          ctx.strokeStyle = rgbStr(colors.TEXT_COLOR);
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Draw letter in cell
        if (row.cells[c] !== null) {
          const lColor = letterColor(row.cells[c]);
          ctx.fillStyle = rgbStr(lColor);
          ctx.font = `bold 30px ${this.fontFamily}`;
          ctx.textAlign = "center";
          ctx.fillText(row.cells[c].toUpperCase(), rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
        }
        if (row.multiplier_cols.has(c)) {
          ctx.strokeStyle = rgbStr(MULTIPLIER_COLOR);
          ctx.lineWidth = 3;
          this.drawRoundRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, 5);
          ctx.stroke();
          ctx.fillStyle = rgbStr(MULTIPLIER_GLOW_COLOR);
          ctx.font = `bold 14px ${this.fontFamily}`;
          ctx.textAlign = "right";
          ctx.fillText(`${row.multiplier_cols.get(c)}x`, rect.x + rect.width - 5, rect.y + 10);
          ctx.textAlign = "center";
        }
      }
    }

    // 8. Draw letter currently being dragged (above all grid elements)
    if (draggedLetter !== null) {
      if (draggedLetter.value) {
        this.drawMultiplierToken(draggedLetter.x, draggedLetter.y, draggedLetter.value);
      } else {
        const col = letterColor(draggedLetter.letter, true);
        ctx.fillStyle = rgbStr(col);
        ctx.beginPath();
        ctx.arc(draggedLetter.x, draggedLetter.y, FALLING_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgb(30, 30, 30)";
        ctx.font = `bold 30px ${this.fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillText(draggedLetter.letter.toUpperCase(), draggedLetter.x, draggedLetter.y + 1);
      }
    }

    // 9. Grace period overlay heartbeat pulse
    if (board.grace_active && !board.game_over) {
      const beatPeriodMs = 60000 / 80; // 750ms
      const beatPhase = (now % beatPeriodMs) / beatPeriodMs;
      const pulse = Math.min(
        1.0,
        Math.exp(-Math.pow((beatPhase - 0.12) / 0.055, 2)) +
          0.55 * Math.exp(-Math.pow((beatPhase - 0.27) / 0.08, 2))
      );
      const graceAlpha = (18 + pulse * 55) / 255;
      ctx.fillStyle = `rgba(255, 90, 90, ${graceAlpha})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    // 10. Completed word score popups & tier announcements
    for (const popup of board.score_popups) {
      const age = now - popup.created_at;
      const progress = age / SCORE_POPUP_MS;
      const popupY = popup.y - 42 * progress;
      let popupAlpha = 1.0;
      let popupText = "";

      if (age < SCORE_POPUP_INTRO_MS) {
        popupAlpha = 1.0;
        popupText = `${popup.base_points} x ${popup.multiplier}`;
        for (const value of popup.multiplier_values) popupText += ` x${value}`;
        if (popup.bingo) {
          popupText += ` x${BINGO_BONUS_MULTIPLIER}`;
        }
      } else {
        popupAlpha = Math.max(0, 1.0 - progress);
        popupText = `+ ${popup.points}!`;
      }

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = rgbaStr(colors.SCORE_POPUP_COLOR, popupAlpha);
      ctx.font = `bold 30px ${this.fontFamily}`;
      ctx.fillText(popupText, Math.round(popup.x), Math.round(popupY));

      const tColor = tierColor(popup.tier);
      ctx.fillStyle = rgbaStr(tColor, popupAlpha);
      ctx.font = `bold 30px ${this.fontFamily}`;
      ctx.fillText(tierName(popup.tier), SCREEN_W / 2, BOARD_BOTTOM_Y + 75);

      if (popup.bingo) {
        ctx.fillStyle = rgbaStr(colors.SCORE_POPUP_COLOR, popupAlpha);
        ctx.font = `bold 46px ${this.fontFamily}`;
        ctx.fillText("BINGO!", SCREEN_W / 2, BOARD_BOTTOM_Y + 125);
      }
      ctx.restore();
    }

    // 11. HUD: Score and Time
    ctx.textAlign = "left";
    ctx.fillStyle = rgbStr(colors.TEXT_COLOR);
    ctx.font = `bold 30px ${this.fontFamily}`;
    ctx.fillText(`Score: ${board.score.toFixed(2)}`, 16, 44);

    const elapsedSeconds = board.elapsed_seconds(now);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const timeStr = `Time: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    ctx.textAlign = "right";
    ctx.font = `18px ${this.fontFamily}`;
    ctx.fillText(timeStr, SCREEN_W - 16, 44);

    // 12. If Game Over: draw game over text on canvas
    if (board.game_over) {
      ctx.save();
      ctx.textAlign = "center";

      ctx.font = `bold 46px ${this.fontFamily}`;
      ctx.fillStyle = "rgb(240, 90, 90)";
      ctx.fillText("GAME OVER", SCREEN_W / 2, SCREEN_H / 2 - 30);

      ctx.font = `bold 30px ${this.fontFamily}`;
      ctx.fillStyle = rgbStr(colors.TEXT_COLOR);
      ctx.fillText(`Final score: ${board.score.toFixed(2)}`, SCREEN_W / 2, SCREEN_H / 2 + 20);

      ctx.font = `18px ${this.fontFamily}`;
      ctx.fillText("R: restart   M: menu   L: leaderboard", SCREEN_W / 2, SCREEN_H / 2 + 95);
      ctx.restore();
    }
  }

  drawMultiplierToken(x, y, value) {
    const ctx = this.ctx;
    ctx.fillStyle = rgbStr(MULTIPLIER_GLOW_COLOR);
    ctx.strokeStyle = rgbStr(MULTIPLIER_COLOR);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - FALLING_RADIUS);
    ctx.lineTo(x + FALLING_RADIUS, y);
    ctx.lineTo(x, y + FALLING_RADIUS);
    ctx.lineTo(x - FALLING_RADIUS, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgb(30, 30, 30)";
    ctx.font = `bold 24px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText(`${value}x`, x, y + 1);
  }
}
