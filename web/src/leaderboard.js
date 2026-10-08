/**
 * Supabase Leaderboard Client for Letter Rise Web.
 * Connects asynchronously via @supabase/supabase-js with graceful offline fallback.
 */

import { LEADERBOARD_LIMIT, SUPABASE_CONFIG } from "./config.js";

// CDN import for supabase-js ESM
const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export class LeaderboardClient {
  constructor(profileManager) {
    this.profileManager = profileManager;
    this.rows = [];
    this.rank = null;
    this.error = null;
    this.loading = false;
    this.mode = "endless";
    this.client = null;
    this.supabaseModule = null;
    this.initPromise = this.initClient();
  }

  isConfigured() {
    const { url, anonKey } = SUPABASE_CONFIG;
    return Boolean(
      url &&
      anonKey &&
      url !== "https://your-project.supabase.co" &&
      anonKey !== "your-anon-key"
    );
  }

  async initClient() {
    if (!this.isConfigured()) {
      return;
    }
    try {
      if (!this.supabaseModule) {
        this.supabaseModule = await import(SUPABASE_CDN);
      }
      const { createClient } = this.supabaseModule;
      this.client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    } catch (err) {
      console.warn("Could not initialize Supabase client:", err);
      this.error = "Leaderboard offline";
    }
  }

  async fetchLeaderboard(mode = this.mode) {
    await this.initPromise;
    if (!this.client) {
      throw new Error("Leaderboard is not configured");
    }
    const profile = this.profileManager.profile;
    const table = tableForMode(mode);
    const { data, error } = await this.client
      .from(table)
      .select("player_name, score, rarest_word_found, client_id, created_at")
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(LEADERBOARD_LIMIT);

    if (error) throw error;
    return (data || []).map((row, index) => ({
      ...row,
      rank: index + 1,
      is_me: row.client_id === profile.client_id,
    }));
  }

  async refresh(mode = this.mode) {
    if (this.loading) return;
    this.mode = mode;
    this.loading = true;
    this.error = null;
    try {
      if (!this.isConfigured()) {
        this.error = "Offline mode (Supabase not configured)";
        return;
      }
      this.rows = await this.fetchLeaderboard(mode);
      const me = this.rows.find((r) => r.is_me);
      this.rank = me ? me.rank : null;
      this.error = null;
    } catch (err) {
      console.error("Leaderboard refresh error:", err);
      this.error = "Couldn't reach leaderboard";
    } finally {
      this.loading = false;
    }
  }

  async submitAndRefresh(score, rarestWord, mode = this.mode, durationMs = 120000) {
    this.mode = mode;
    await this.initPromise;
    const profile = this.profileManager.profile;
    if (!profile.public) {
      this.error = "Global sharing is off in Settings";
      return;
    }
    if (!this.isConfigured() || !this.client) {
      this.error = "Offline mode (score saved locally)";
      return;
    }

    this.loading = true;
    this.error = null;
    try {
      const roundedScore = Math.round(score * 100) / 100;
      const table = tableForMode(mode);
      const payload = {
        player_name: profile.player_name || "Unknown",
        score: roundedScore,
        rarest_word_found: rarestWord || "-",
        client_id: profile.client_id,
      };
      if (mode === "time_attack") {
        payload.trial_seconds = TIME_TRIAL_SECONDS;
        payload.duration_ms = Math.round(durationMs);
      }

      const { error: insertError } = await this.client.from(table).insert(payload);

      if (insertError) {
        throw new Error(`Score submission failed: ${insertError.message}`, {
          cause: insertError,
        });
      }

      this.rows = await this.fetchLeaderboard(mode);
      const me = this.rows.find((r) => r.is_me);
      this.rank = me ? me.rank : null;
      this.error = null;
    } catch (err) {
      console.error("Leaderboard submit error:", err);
      const message = err instanceof Error ? err.message : String(err);
      this.error = message || "Couldn't reach leaderboard";
    } finally {
      this.loading = false;
    }
  }

}

const TIME_TRIAL_SECONDS = 120;

function tableForMode(mode) {
  return mode === "time_attack" ? "timetrial_leaderboard" : "endless_leaderboard";
}
