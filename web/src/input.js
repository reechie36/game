/**
 * Pointer (mouse & touch) and keyboard input handler for Letter Rise.
 */

import { CELL, ROW_LEN, SCREEN_H, SCREEN_W } from "./config.js";
import { FallingLetter, MultiplierToken } from "./board.js";

export class InputHandler {
  constructor(canvas, board, options = {}) {
    this.canvas = canvas;
    this.board = board;
    this.onSound = options.onSound || (() => {});
    this.onSegmentChange = options.onSegmentChange || (() => {});

    this.dragging = null; // FallingLetter currently being dragged
    this.currentPos = [SCREEN_W / 2, SCREEN_H / 2];
    this.lastSelectedCandidate = null; // [row_idx, start, end]

    // Double-tap tracking for touch confirm
    this.lastTapTime = 0;
    this.lastTapCell = null;

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    this.attach();
  }

  setBoard(board) {
    this.board = board;
    this.dragging = null;
    this.lastSelectedCandidate = null;
    this.onSegmentChange(null);
  }

  attach() {
    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundPointerUp);
    window.addEventListener("pointercancel", this.boundPointerCancel);
    window.addEventListener("keydown", this.boundKeyDown);
  }

  detach() {
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundPointerUp);
    window.removeEventListener("pointercancel", this.boundPointerCancel);
    window.removeEventListener("keydown", this.boundKeyDown);
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (SCREEN_W / rect.width);
    const y = (e.clientY - rect.top) * (SCREEN_H / rect.height);
    return [Math.max(0, Math.min(SCREEN_W, x)), Math.max(0, Math.min(SCREEN_H, y))];
  }

  findFallingAt(pos) {
    for (let i = this.board.falling.length - 1; i >= 0; i--) {
      const fl = this.board.falling[i];
      if (!fl.dragging && Math.abs(fl.x - pos[0]) < CELL / 2 && Math.abs(fl.y - pos[1]) < CELL / 2) {
        return fl;
      }
    }
    return null;
  }

  findGridCellAt(pos) {
    for (let rIdx = 0; rIdx < this.board.rows.length; rIdx++) {
      for (let c = 0; c < ROW_LEN; c++) {
        const rect = this.board.cell_rect(rIdx, c);
        if (
          pos[0] >= rect.x &&
          pos[0] <= rect.x + rect.width &&
          pos[1] >= rect.y &&
          pos[1] <= rect.y + rect.height
        ) {
          return [rIdx, c];
        }
      }
    }
    return null;
  }

  findHoverCandidate(pos) {
    const cell = this.findGridCellAt(pos);
    if (!cell) return null;
    const [rowIdx, col] = cell;
    const row = this.board.rows[rowIdx];
    if (
      !row ||
      row.resolution_phase !== null ||
      row.cells[col] === null ||
      row.isLocked(col) ||
      row.scored_cols.has(col)
    ) {
      return null;
    }

    let start = col;
    while (
      start > 0 &&
      row.cells[start - 1] !== null &&
      !row.isLocked(start - 1) &&
      !row.scored_cols.has(start - 1)
    ) {
      start--;
    }

    let end = col;
    while (
      end < ROW_LEN - 1 &&
      row.cells[end + 1] !== null &&
      !row.isLocked(end + 1) &&
      !row.scored_cols.has(end + 1)
    ) {
      end++;
    }

    return [rowIdx, start, end];
  }

  handlePointerDown(e) {
    if (this.board.game_over) return;
    if (e.button !== 0 && e.pointerType === "mouse") return; // Primary click only

    const pos = this.getCanvasCoords(e);
    this.currentPos = pos;

    // Check for double-tap on segment (mobile friendly confirm)
    const now = performance.now();
    const cell = this.findGridCellAt(pos);
    if (cell && this.lastTapCell && cell[0] === this.lastTapCell[0] && cell[1] === this.lastTapCell[1]) {
      if (now - this.lastTapTime < 350) {
        const candidate = this.findHoverCandidate(pos);
        if (candidate) {
          this.board.try_clear_segment(candidate[0], candidate[1], candidate[2], now);
          this.lastTapTime = 0;
          this.lastTapCell = null;
          return;
        }
      }
    }
    this.lastTapTime = now;
    this.lastTapCell = cell;

    // Check if clicked a falling entity
    const fl = this.findFallingAt(pos);
    if (fl) {
      fl.dragging = true;
      fl.origin = "fall";
      this.dragging = fl;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.onSound("pickup");
      return;
    }

    // Check if clicked an occupied grid cell to pick up
    if (cell) {
      const [rIdx, c] = cell;
      const row = this.board.rows[rIdx];
      if (
        row &&
        row.resolution_phase === null &&
        !row.isLocked(c) &&
        !row.scored_cols.has(c) &&
        (row.cells[c] !== null || row.multiplier_cols.has(c))
      ) {
        let newFl;
        if (row.multiplier_cols.has(c)) {
          const value = row.multiplier_cols.get(c);
          row.multiplier_cols.delete(c);
          newFl = new MultiplierToken(value, pos[0], pos[1]);
        } else if (row.cells[c] !== null) {
          const letter = row.cells[c];
          row.cells[c] = null;
          row.hole_cols.delete(c);
          newFl = new FallingLetter(letter, pos[0], pos[1]);
        }
        if (!newFl) return;
        newFl.dragging = true;
        newFl.origin = "grid";
        this.dragging = newFl;
        this.board.falling.push(newFl);
        this.canvas.setPointerCapture?.(e.pointerId);
        this.onSound("pickup");
      }
    }
  }

  handlePointerMove(e) {
    const pos = this.getCanvasCoords(e);
    this.currentPos = pos;

    if (this.dragging) {
      this.dragging.x = pos[0];
      this.dragging.y = pos[1];
    } else {
      const candidate = this.findHoverCandidate(pos);
      if (candidate) {
        this.lastSelectedCandidate = candidate;
        const row = this.board.rows[candidate[0]];
        const word = row ? row.segmentWord(candidate[1], candidate[2]) : "";
        this.onSegmentChange({ rowIdx: candidate[0], start: candidate[1], end: candidate[2], word });
      } else if (!this.lastSelectedCandidate) {
        this.onSegmentChange(null);
      }
    }
  }

  handlePointerUp(e) {
    const fl = this.dragging;
    this.dragging = null;
    try {
      this.canvas.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore if not captured
    }

    if (!fl) return;

    const pos = this.getCanvasCoords(e);
    const cell = this.findGridCellAt(pos);

    if (cell) {
      const [rIdx, c] = cell;
      const row = this.board.rows[rIdx];
      if (
        row &&
        row.resolution_phase === null &&
        !row.isLocked(c) &&
        !row.scored_cols.has(c)
      ) {
        if (fl instanceof MultiplierToken) {
          if (row.multiplier_cols.has(c) || [...row.multiplier_cols.values()].includes(fl.value)) {
            fl.x = pos[0];
            fl.y = pos[1];
            fl.dragging = false;
            return;
          }
          row.multiplier_cols.set(c, fl.value);
          const idx = this.board.falling.indexOf(fl);
          if (idx !== -1) this.board.falling.splice(idx, 1);
          return;
        }
        if (row.cells[c] === null) {
          row.cells[c] = fl.letter;
          row.hole_cols.delete(c);
          const idx = this.board.falling.indexOf(fl);
          if (idx !== -1) this.board.falling.splice(idx, 1);
          this.onSound("place");
          return;
        } else if (fl.origin === "fall") {
          // Replace: evicted letter resumes falling from this spot
          const evicted = row.cells[c];
          row.cells[c] = fl.letter;
          row.hole_cols.delete(c);
          const idx = this.board.falling.indexOf(fl);
          if (idx !== -1) this.board.falling.splice(idx, 1);
          const newFl = new FallingLetter(evicted, pos[0], pos[1]);
          newFl.origin = "fall";
          this.board.falling.push(newFl);
          this.onSound("place");
          return;
        }
      }
    }

    // Invalid drop location: resume falling from release coordinates
    fl.x = pos[0];
    fl.y = pos[1];
    fl.dragging = false;
  }

  handlePointerCancel(e) {
    this.handlePointerUp(e);
  }

  handleKeyDown(e) {
    if (e.code === "Space" && !this.board.game_over && !this.dragging) {
      e.preventDefault();
      this.confirmCurrentSegment();
    }
  }

  confirmCurrentSegment(now = performance.now()) {
    if (this.board.game_over || this.dragging) return;
    const candidate = this.findHoverCandidate(this.currentPos) || this.lastSelectedCandidate;
    if (!candidate) return;
    const [rowIdx, start, end] = candidate;
    this.board.try_clear_segment(rowIdx, start, end, now);
    this.lastSelectedCandidate = null;
    this.onSegmentChange(null);
  }
}
