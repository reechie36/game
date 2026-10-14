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

/**
 * CSS gradient mirroring the canvas deletion zone. The canvas paints a 2px
 * stroke centred on the stack line and a falloff that starts at that same
 * centre, so the CSS layer offsets its stops by half a line thickness.
 */
function buildStackZoneGradient(lineHeight, zoneHeight) {
  const origin = lineHeight / 2;
  const stops = [
    `rgba(${STACK_LINE_RGB.join(", ")}, ${STACK_LINE_ALPHA}) 0 ${lineHeight}px`,
  ];
  for (const [pos, alpha] of DELETION_ZONE_STOPS) {
    stops.push(
      `rgba(${DELETION_ZONE_RGB.join(", ")}, ${alpha}) ${origin + zoneHeight * pos}px`
    );
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function cssColorToRgb(value, fallback) {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;

  const rgbMatch = normalized.match(
    /^rgba?\(\s*([\d.]+)(?:%?)\s*[,\s]\s*([\d.]+)(?:%?)\s*[,\s]\s*([\d.]+)(?:%?)/i
  );
  if (rgbMatch) return rgbMatch.slice(1, 4).map((v) => Math.round(Number(v)));

  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  // Last resort: let the browser normalise any other CSS color syntax.
  if (typeof document !== "undefined") {
    if (!cssColorToRgb.parser) {
      cssColorToRgb.parser = document.createElement("canvas").getContext("2d");
    }
    const parser = cssColorToRgb.parser;
    parser.fillStyle = "#010203"; // sentinel: unchanged means the value was invalid
    parser.fillStyle = normalized;
    const resolved = typeof parser.fillStyle === "string" ? parser.fillStyle : "";
    if (resolved && resolved !== "#010203") return cssColorToRgb(resolved, fallback);
  }

  return fallback;
}

/* ----------------------------------------------------------------------
 * Backdrop effects shared between the canvas and the surrounding page.
 * The renderer publishes these values as CSS custom properties every frame
 * so the area left/right/above/below the square canvas always matches what
 * is painted inside it (see #app-container layers in css/style.css).
 * -------------------------------------------------------------------- */
const DANGER_TINT_RGB = [150, 35, 35];
const GRACE_TINT_RGB = [255, 90, 90];
const STACK_LINE_RGB = [245, 75, 75];
const STACK_LINE_ALPHA = 0.706;
const DELETION_ZONE_RGB = [220, 45, 45];
// [gradient position, alpha] — used by both the canvas and the CSS backdrop.
const DELETION_ZONE_STOPS = [
  [0.0, 0.412],
  [0.25, 0.231],
  [0.5, 0.103],
  [0.75, 0.026],
  [1.0, 0.0],
];
const DANGER_TINT_STRENGTH = 16; // max alpha = 16 / 255 at danger level 1
const GRACE_TINT_BASE = 18;
const GRACE_TINT_PEAK = 55;

const BACKDROP_VARS = [
  "--game-bg",
  "--danger-line-color",
  "--danger-tint-rgb",
  "--danger-tint-height",
  "--danger-overlay-opacity",
  "--grace-tint-rgb",
  "--grace-overlay-opacity",
  "--line-height",
  "--danger-line-top",
  "--stack-line-top",
  "--stack-zone-height",
  "--stack-zone-gradient",
];

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

  /**
   * Heartbeat alpha (0..1) for the grace-period pulse at time `now`.
   */
  gracePulseAlpha(now) {
    const beatPeriodMs = 60000 / 80; // 750ms
    const beatPhase = (now % beatPeriodMs) / beatPeriodMs;
    const pulse = Math.min(
      1.0,
      Math.exp(-Math.pow((beatPhase - 0.12) / 0.055, 2)) +
        0.55 * Math.exp(-Math.pow((beatPhase - 0.27) / 0.08, 2))
    );
    return (GRACE_TINT_BASE + pulse * GRACE_TINT_PEAK) / 255;
  }

  /**
   * Canvas -> page geometry used to position the backdrop layers. Cached for
   * a short while because getBoundingClientRect() forces layout.
   */
  getBackdropLayout() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!this._layout || now - this._layout.at > 250) {
      const canvasRect = this.canvas.getBoundingClientRect();
      const containerRect = this.getContainer().getBoundingClientRect();
      this._layout = {
        at: now,
        scale: canvasRect.height > 0 ? canvasRect.height / SCREEN_H : 1,
        offsetY: canvasRect.top - containerRect.top,
      };
    }
    return this._layout;
  }

  /**
   * Publish the canvas' dynamic backdrop state (base color, danger tint,
   * grace heartbeat, stack/danger lines) as CSS custom properties so the
   * page around the square canvas mirrors the game screen exactly.
   */
  updateViewportEffects({ disappearY, dangerAlpha, graceAlpha, colors }) {
    const { scale, offsetY } = this.getBackdropLayout();

    // A 2px canvas stroke is centred on its logical Y coordinate, so the
    // matching CSS layer must start half a line higher to stay seamless.
    const lineHeight = Math.max(1, 2 * scale);
    const toContainerY = (logicalY) => offsetY + logicalY * scale;
    const stackTopPx = toContainerY(disappearY);
    const zonePx = DELETION_ZONE_HEIGHT * scale;

    const root = document.documentElement;
    const cache = (this._backdropCache ||= {});
    const set = (name, value) => {
      if (cache[name] !== value) {
        cache[name] = value;
        root.style.setProperty(name, value);
      }
    };

    set("--game-bg", rgbStr(colors.BG));
    set("--danger-line-color", rgbStr(colors.DANGER_LINE_COLOR));
    set("--danger-tint-rgb", DANGER_TINT_RGB.join(", "));
    set("--grace-tint-rgb", GRACE_TINT_RGB.join(", "));
    set("--danger-overlay-opacity", `${dangerAlpha}`);
    set("--grace-overlay-opacity", `${graceAlpha}`);
    set("--line-height", `${lineHeight}px`);
    set("--danger-line-top", `${toContainerY(BUFFER_LINE_Y) - lineHeight / 2}px`);
    set("--stack-line-top", `${stackTopPx - lineHeight / 2}px`);
    set("--stack-zone-height", `${zonePx}px`);
    // The canvas stops tinting where the deletion zone repaints it, so the
    // page tint stops at the exact same line (it still covers the letterboxed
    // strip above the canvas, which is tinted as well).
    set("--danger-tint-height", `${Math.max(0, stackTopPx)}px`);
    set("--stack-zone-gradient", buildStackZoneGradient(lineHeight, zonePx));
  }

  /**
   * Clear all backdrop overrides (menu, countdown, after a game ends).
   */
  resetViewportEffects() {
    const root = document.documentElement;
    this._backdropCache = {};
    this._layout = null;
    for (const name of BACKDROP_VARS) root.style.removeProperty(name);
    this.currentDangerLevel = 0;
  }

  getContainer() {
    if (!this.containerEl || !this.containerEl.isConnected) {
      this.containerEl =
        this.canvas.closest("#app-container") ||
        this.canvas.parentElement ||
        document.body;
    }
    return this.containerEl;
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
    this.currentDangerLevel = dangerLevel;
    const dangerAlpha = (DANGER_TINT_STRENGTH * dangerLevel) / 255;
    if (dangerAlpha > 0) {
      ctx.fillStyle = rgbaStr(DANGER_TINT_RGB, dangerAlpha);
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    const disappearY = board.stack_top_y() - 4;
    const graceAlpha =
      board.grace_active && !board.game_over ? this.gracePulseAlpha(now) : 0;

    this.updateViewportEffects({ disappearY, dangerAlpha, graceAlpha, colors });

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

    // Gradient with quadratic falloff (mirrored by the CSS backdrop layer)
    const grad = ctx.createLinearGradient(0, disappearY, 0, disappearY + DELETION_ZONE_HEIGHT);
    for (const [pos, alpha] of DELETION_ZONE_STOPS) {
      grad.addColorStop(pos, rgbaStr(DELETION_ZONE_RGB, alpha));
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, disappearY, SCREEN_W, DELETION_ZONE_HEIGHT);

    // 6. Stack disappearance line
    ctx.strokeStyle = rgbaStr(STACK_LINE_RGB, STACK_LINE_ALPHA);
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
    if (graceAlpha > 0) {
      ctx.fillStyle = rgbaStr(GRACE_TINT_RGB, graceAlpha);
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
    const displaySeconds = board.mode === "time_attack"
      ? board.time_remaining_seconds(now)
      : elapsedSeconds;
    const minutes = Math.floor(displaySeconds / 60);
    const seconds = displaySeconds % 60;
    const timeLabel = board.mode === "time_attack" ? "Time left" : "Time";
    const timeStr = `${timeLabel}: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    ctx.textAlign = "right";
    const urgent = board.mode === "time_attack" && displaySeconds <= 10;
    const pulse = urgent ? 0.7 + Math.sin(now / 120) * 0.3 : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = urgent ? "rgb(255, 190, 70)" : rgbStr(colors.TEXT_COLOR);
    ctx.font = `18px ${this.fontFamily}`;
    ctx.fillText(timeStr, SCREEN_W - 16, 44);
    ctx.globalAlpha = 1;

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
