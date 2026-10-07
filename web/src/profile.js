/**
 * Player profile and settings persistence via localStorage.
 */

const STORAGE_KEY = "letter_rise_profile";
const THEMES = new Set(["default", "gruvbox-dark", "gruvbox-light"]);

const BLOCKED_WORDS = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot"];

/**
 * Clean and validate display name.
 */
export function cleanName(name) {
  if (!name || typeof name !== "string") return "";
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 16);
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();
  for (const blocked of BLOCKED_WORDS) {
    if (lower.includes(blocked)) return "";
  }
  return cleaned;
}

export function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ProfileManager {
  constructor() {
    this.profile = this.load();
  }

  load() {
    let data = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = JSON.parse(raw);
      }
    } catch (e) {
      console.warn("Could not read profile from localStorage:", e);
    }

    return {
      client_id: data.client_id || generateUUID(),
      player_name: typeof data.player_name === "string" ? data.player_name : "",
      public: typeof data.public === "boolean" ? data.public : true,
      personal_best: typeof data.personal_best === "number" ? data.personal_best : 0,
      sound_volume: typeof data.sound_volume === "number" ? data.sound_volume : 0.75,
      music_volume: typeof data.music_volume === "number" ? data.music_volume : 0.75,
      sound_muted: typeof data.sound_muted === "boolean" ? data.sound_muted : false,
      theme: THEMES.has(data.theme) ? data.theme : "default",
    };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (e) {
      console.warn("Could not save profile to localStorage:", e);
    }
  }

  setPlayerName(name) {
    const cleaned = cleanName(name);
    if (!cleaned) return false;
    this.profile.player_name = cleaned;
    this.save();
    return true;
  }

  updatePersonalBest(score) {
    const rounded = Math.round(score * 100) / 100;
    if (rounded > this.profile.personal_best) {
      this.profile.personal_best = rounded;
      this.save();
      return true;
    }
    return false;
  }

  setAudioSettings(volume, muted) {
    this.profile.sound_volume = Math.max(0, Math.min(1, volume));
    this.profile.sound_muted = Boolean(muted);
    this.save();
  }

  setMusicVolume(volume) {
    this.profile.music_volume = Math.max(0, Math.min(1, volume));
    this.save();
  }

  setTheme(theme) {
    if (!THEMES.has(theme)) return false;
    this.profile.theme = theme;
    this.save();
    return true;
  }

  togglePublic() {
    this.profile.public = !this.profile.public;
    this.save();
    return this.profile.public;
  }
}
