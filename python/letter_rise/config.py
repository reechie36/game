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
- A valid word submitted beside locked cells -> UNLOCKS contiguous locked
    cells directly beside that word.
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

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCREEN_W, SCREEN_H = 820, 820
FPS = 60

ROW_LEN = 7                 # blocks per row; submitted words may use 1-7 blocks
CELL = 64                   # cell size in px
CELL_GAP = 6
BOARD_LEFT = (SCREEN_W - (ROW_LEN * CELL + (ROW_LEN - 1) * CELL_GAP)) // 2
BOARD_BOTTOM_Y = 660         # y-coordinate of the bottom of the lowest row (row index 0)

BUFFER_LINE_Y = 106         # top edge of the row that starts the grace period
SPAWN_Y = 20                 # falling letters spawn just below the top edge

MAX_FALLING = 15
SPAWN_INTERVAL_MS = 1000
MIN_SPAWN_INTERVAL_MS = 250
SPAWN_INTERVAL_STEP_MS = 50
FALL_SPEED = 40.0            # px / second, eased down as stack rises (see update)
FALLING_RADIUS = CELL // 2 - 6
FALLING_DIAMETER = FALLING_RADIUS * 2
DELETION_ZONE_HEIGHT = CELL * 2

ROW_GROWTH_INTERVAL_MS = 17_500 
MIN_ROW_GROWTH_INTERVAL_MS = 4_000
ROW_GROWTH_INTERVAL_STEP_MS = 500
GRACE_PERIOD_MS = 10_000
ROW_HOLD_MS = 300
ROW_FLICKER_MS = 200
SCORE_POPUP_MS = 900
SCORE_POPUP_INTRO_MS = 500
BINGO_BONUS_MULTIPLIER = 2
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(PROJECT_DIR)
load_dotenv(os.path.join(ROOT_DIR, ".env"), override=True)
load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

def _find_path(*candidates):
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

FONT_PATH = _find_path(
    os.path.join(ROOT_DIR, "assets", "fonts", "FiraMono-Regular.ttf"),
    os.path.join(ROOT_DIR, "FiraMono-Regular.ttf"),
    os.path.join(PROJECT_DIR, "FiraMono-Regular.ttf"),
)
SOUNDS_DIR = _find_path(
    os.path.join(ROOT_DIR, "assets", "sounds"),
    os.path.join(ROOT_DIR, "source_data", "sounds"),
    os.path.join(PROJECT_DIR, "source_data", "sounds"),
)
DATA_DIR = _find_path(
    os.path.join(ROOT_DIR, "assets", "data"),
    ROOT_DIR,
    PROJECT_DIR,
)

SOUND_PATHS = {
    "pickup": os.path.join(SOUNDS_DIR, "dice_grab.wav"),
    "place": os.path.join(SOUNDS_DIR, "chips_place_1.wav"),
    "confirm": os.path.join(SOUNDS_DIR, "item_equip.wav"),
    "success": os.path.join(SOUNDS_DIR, "grand_piano_chime_positive.wav"),
    "bingo": os.path.join(SOUNDS_DIR, "coin_jingle_small.wav"),
    "error": os.path.join(SOUNDS_DIR, "grand_piano_negative_quick.wav"),
    "grow": os.path.join(SOUNDS_DIR, "lock_quick.wav"),
    "warning": os.path.join(SOUNDS_DIR, "grand_piano_negative_long.wav"),
    "game_over": os.path.join(SOUNDS_DIR, "grand_piano_defeated.wav"),
}
PROFILE_PATH = os.path.join(PROJECT_DIR, "player_profile.json")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_TOKEN", "")
)
LEADERBOARD_LIMIT = 100

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
