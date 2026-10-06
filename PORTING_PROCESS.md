# Letter Rise — Web Porting Process & Progress

## Overview
Porting **Letter Rise** from Python/Pygame to modern static Web standards.

- **Stack**: Vanilla JS (ES Modules), Canvas 2D, Web Audio API, Supabase JS (CDN/ESM), CSS / HTML5.
- **Target Hosting**: Cloudflare Pages / Netlify / GitHub Pages (100% static, no build step required, Vite-compatible).
- **Canvas Resolution**: Logical 820×820, HiDPI / `devicePixelRatio` responsive scaling.

---

## Architecture & Directory Structure

```
├── index.html              # Entry HTML, canvas container, DOM overlays (Dialog/Popover/Menus)
├── css/
│   └── style.css           # Modern CSS styling (responsive scaling, overlays, typography)
├── assets/
│   ├── FiraMono-Regular.ttf
│   ├── words.json          # Pre-filtered dictionary { word: [tier, count] }
│   └── sounds/             # Audio files (wav/mp3)
├── src/
│   ├── config.js           # Game constants, colors, timings, Supabase credentials
│   ├── data.js             # Word dictionary loader, tiers, points, weighted letter pool
│   ├── board.js            # Pure game state (Row, Board, FallingLetter) - 1:1 parity with Python
│   ├── render.js           # Canvas 2D rendering pipeline (exact draw order)
│   ├── input.js            # Pointer events (mouse + touch), pointer capture, coordinate conversion
│   ├── ui.js               # DOM overlay manager (Menu, Settings, Name Entry, Leaderboard, HUD)
│   ├── profile.js          # Player profile persistence via localStorage
│   ├── leaderboard.js      # Supabase client (async submit & RPC get_leaderboard)
│   ├── audio.js            # Web Audio API engine (preloaded AudioBuffers, GainNode master volume)
│   └── main.js             # Game loop (requestAnimationFrame), state machine, visibility handling
└── tools/
    ├── export_data.py      # One-off exporter for words.json and precomputed letter weights
    └── verify_parity.py    # Parity verification script comparing Python vs JS results
```

---

## Milestone Checklist

### M1: Core Engine & Playable Canvas (Steps 1–5)
- [x] **Step 1: Data Export**
  - Export `merged.csv` to `assets/words.json` with `{word: [tier, count]}` format (≤7 letters: 38,151 words).
  - Precompute letter weights and letter points constants.
  - Verify file size & gzip compression (738 KB raw, 273 KB gzip).
- [x] **Step 2: Core Logic Port (`src/board.js`, `src/data.js`, `src/config.js`)**
  - Port `Row`, `FallingLetter`, `ScorePopup`, and `Board` classes with exact parity.
  - Time-injected `now` and `dt` parameters.
  - Weighted random letter selection via cumulative array + binary search.
  - Unlock adjacent locked cells algorithm.
  - Resolution hold/flicker and grace period timers.
- [x] **Step 3: Parity Verification**
  - Verify word score calculations against Python `calculate_word_score`.
  - Verify difficulty curve formulas (`spawn_interval`, `row_growth_interval`, `danger_level`).
  - Unit test in Node / test vectors passed 100%.
- [x] **Step 4: Canvas 2D Renderer (`src/render.js`)**
  - Logical 820×820 with DPR scaling and aspect-ratio preservation.
  - Precise draw order:
    1. Danger backdrop overlay
    2. Falling letters (un-dragged)
    3. Deletion zone background & masking gradient
    4. Danger boundary line
    5. Grid rows & cells (unlocked, filled, locked, hole, flicker, hover highlight)
    6. Dragged letter (top-most layer)
    7. Grace period heartbeat pulse overlay
    8. Score popups & tier/bingo animations
    9. HUD (score, elapsed time)
  - Font loading via `@font-face` with `document.fonts.ready`.
- [x] **Step 5: Pointer Input & Confirm Mechanic (`src/input.js`)**
  - Pointer events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`).
  - `touch-action: none` on canvas, coordinate translation `(clientX - rect.left) * 820 / rect.width`.
  - `setPointerCapture` for smooth dragging across edges.
  - Mobile touch confirm mechanic: On-screen confirm button + SPACE key on desktop + double-tap segment.

### M2: UI States, Game Loop & Persistence (Steps 6–8)
- [x] **Step 6: UI States (`src/ui.js`, `css/style.css`, `index.html`)**
  - DOM overlays over canvas for Menu, Settings, Name Entry, Leaderboard, Pause, Game Over.
  - Real native `<input>` element for player name to prevent soft keyboard issues.
  - State machine: `menu` | `playing` | `paused` | `game_over` | `name_entry` | `leaderboard` | `settings`.
- [x] **Step 7: Game Loop (`src/main.js`)**
  - `requestAnimationFrame` loop with clamped `dt` (`Math.min(dt, 0.1)`).
  - Auto-pause on `document.visibilitychange` (prevents rAF background timer jumps).
  - Clean pause/resume offset tracking.
- [x] **Step 8: Persistence (`src/profile.js`)**
  - `localStorage` profile management (`player_name`, `public`, `personal_best`, `sound_volume`, `sound_muted`, `client_id`).
  - `crypto.randomUUID()` for unique device `client_id`.

### M3: Leaderboard & Sound (Steps 9–10)
- [x] **Step 9: Supabase Leaderboard (`src/leaderboard.js`)**
  - Supabase client integration (CDN / ESM).
  - `leaderboard` table insert + `get_leaderboard` RPC.
  - Async non-blocking flow with loading/error handling.
- [x] **Step 10: Audio Engine (`src/audio.js`)**
  - Preloaded `AudioBuffer` for all 9 game sound effects.
  - Unlock / resume `AudioContext` on first user interaction.
  - Master `GainNode` for volume and mute control.

### M4: Mobile Polish & Deployment Readiness (Steps 11–12)
- [x] **Step 11: Mobile Polish**
  - Proper viewport meta (`viewport-fit=cover`, disable pinch-zoom/pull-to-refresh).
  - Safe hit targets for touch.
  - Layout stability in portrait and landscape with CSS `aspect-ratio: 1 / 1`.
  - On-screen touch confirm button and double-tap detection.
- [x] **Step 12: Deployment Readiness**
  - Zero build step dependency (runs directly in any modern browser as static files).
  - Ready to deploy to Cloudflare Pages, Netlify, or GitHub Pages.
