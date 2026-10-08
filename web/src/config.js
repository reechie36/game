/**
 * Game Configuration & Constants for Letter Rise Web
 */

export const SCREEN_W = 820;
export const SCREEN_H = 820;
export const FPS = 60;

export const ROW_LEN = 7; // blocks per row
export const CELL = 64; // cell size in px
export const CELL_GAP = 6;
export const BOARD_LEFT = Math.floor((SCREEN_W - (ROW_LEN * CELL + (ROW_LEN - 1) * CELL_GAP)) / 2); // 168
export const BOARD_BOTTOM_Y = 660; // bottom of lowest row (row index 0)

export const BUFFER_LINE_Y = 106; // top edge of danger zone that triggers grace period
export const SPAWN_Y = 20;

export const MAX_FALLING = 15;
export const MAX_MULTIPLIER_TOKENS = 1;
export const MULTIPLIER_SPAWN_CHECK_MS = 1000;
export const MULTIPLIER_SPAWN_CHANCE = 0.025;
export const SPAWN_INTERVAL_MS = 1000;
export const MIN_SPAWN_INTERVAL_MS = 250;
export const SPAWN_INTERVAL_STEP_MS = 50;
export const FALL_SPEED = 40.0; // px / sec
export const FALLING_RADIUS = Math.floor(CELL / 2) - 6; // 26
export const FALLING_DIAMETER = FALLING_RADIUS * 2; // 52
export const MULTIPLIER_COLOR = [255, 215, 70];
export const MULTIPLIER_GLOW_COLOR = [255, 240, 150];
export const DELETION_ZONE_HEIGHT = CELL * 2; // 128

export const ROW_GROWTH_INTERVAL_MS = 17500;
export const MIN_ROW_GROWTH_INTERVAL_MS = 4000;
export const ROW_GROWTH_INTERVAL_STEP_MS = 500;
export const GRACE_PERIOD_MS = 10000;
export const GAME_MODES = {
  endless: {
    label: "ENDLESS",
    description: "Survive as long as you can while scoring.",
    time_limit_ms: null,
    difficulty_interval_ms: 60000,
    spawn_interval_ms: SPAWN_INTERVAL_MS,
    row_growth_interval_ms: ROW_GROWTH_INTERVAL_MS,
  },
  time_attack: {
    label: "TIME ATTACK",
    description: "Score as much as possible before the 2:00 clock expires.",
    time_limit_ms: 120000,
    difficulty_interval_ms: 25000,
    spawn_interval_ms: 750,
    row_growth_interval_ms: 9000,
  },
};
export const ROW_HOLD_MS = 300;
export const ROW_FLICKER_MS = 200;
export const SCORE_POPUP_MS = 900;
export const SCORE_POPUP_INTRO_MS = 500;
export const BINGO_BONUS_MULTIPLIER = 2;

export const LEADERBOARD_LIMIT = 100;

const globalScope = typeof window !== "undefined" ? window : globalThis;

export const SUPABASE_CONFIG = {
  url: globalScope.ENV?.SUPABASE_URL || "https://your-project.supabase.co",
  anonKey: globalScope.ENV?.SUPABASE_ANON_KEY || "your-anon-key",
};

// Colors
export const COLORS = {
  BG: [18, 18, 24],
  GRID_LINE: [60, 60, 72],
  CELL_EMPTY: [32, 32, 42],
  CELL_UNLOCKED_FILLED: [48, 50, 58],
  CELL_LOCKED: [70, 70, 76],
  CELL_HOLE: [90, 40, 40],
  TEXT_COLOR: [235, 235, 240],
  DANGER_LINE_COLOR: [200, 60, 60],
  FALLING_COLOR: [230, 190, 90],
  FALLING_DRAG_COLOR: [255, 220, 130],
  GRACE_COLOR: [220, 90, 90],
  ROW_INVALID_COLOR: [170, 55, 55],
  ROW_FLICKER_COLOR: [245, 220, 110],
  SCORE_POPUP_COLOR: [255, 235, 135],
};

export const TIER_COLORS = {
  1: [220, 55, 55],    // Red
  2: [235, 105, 45],   // Red-orange
  3: [235, 205, 45],   // Yellow
  4: [155, 195, 55],   // Yellow-green
  5: [70, 175, 80],    // Green
  6: [50, 150, 190],   // Blue-green
  7: [125, 80, 190],   // Purple
  8: [190, 60, 145],   // Magenta
};

export const LETTER_POINT_COLORS = {
  1: TIER_COLORS[1],
  2: TIER_COLORS[3],
  3: TIER_COLORS[4],
  4: TIER_COLORS[5],
  5: TIER_COLORS[6],
  8: TIER_COLORS[7],
  10: TIER_COLORS[8],
};

export const TIER_MULTIPLIERS = {
  1: 1.0,
  2: 1.2,
  3: 1.5,
  4: 2.0,
  5: 2.5,
  6: 3.0,
  7: 3.5,
  8: 4.0,
};

export const TIER_NAMES = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
  6: "Mythic",
  7: "Ancient",
  8: "Celestial",
};

const SOUND_BASE_URL = new URL("../assets/sounds/", import.meta.url);
export const MUSIC_MANIFEST_PATH = new URL("../assets/bg-music/manifest.json", import.meta.url).href;
export const BACKGROUND_MUSIC_FALLBACK_PATH = new URL(
  "../assets/bg-music/background.mp3",
  import.meta.url
).href;

export const SOUND_PATHS = {
  pickup: new URL("dice_grab.wav", SOUND_BASE_URL).href,
  place: new URL("chips_place_1.wav", SOUND_BASE_URL).href,
  confirm: new URL("item_equip.wav", SOUND_BASE_URL).href,
  success: new URL("grand_piano_chime_positive.wav", SOUND_BASE_URL).href,
  bingo: new URL("coin_jingle_small.wav", SOUND_BASE_URL).href,
  error: new URL("grand_piano_negative_quick.wav", SOUND_BASE_URL).href,
  grow: new URL("lock_quick.wav", SOUND_BASE_URL).href,
  warning: new URL("grand_piano_negative_long.wav", SOUND_BASE_URL).href,
  game_over: new URL("grand_piano_defeated.wav", SOUND_BASE_URL).href,
};

export const SOUND_FALLBACK_PATHS = {};
