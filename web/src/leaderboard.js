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

  async fetchLeaderboard() {
    await this.initPromise;
    if (!this.client) {
      throw new Error("Leaderboard is not configured");
    }
    const profile = this.profileManager.profile;
    const { data, error } = await this.client.rpc("get_leaderboard", {
      requested_client_id: profile.client_id,
      result_limit: LEADERBOARD_LIMIT,
    });

    if (error) throw error;
    if (!data) return [];
    return Array.isArray(data) ? data : data.rows || [];
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      if (!this.isConfigured()) {
        this.error = "Offline mode (Supabase not configured)";
        return;
      }
      this.rows = await this.fetchLeaderboard();
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

  async submitAndRefresh(score, rarestWord) {
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
      const { error: insertError } = await this.client.table("leaderboard").insert({
        player_name: profile.player_name || "Unknown",
        score: roundedScore,
        rarest_word_found: rarestWord || "-",
        client_id: profile.client_id,
      });

      if (insertError) throw insertError;

      this.rows = await this.fetchLeaderboard();
      const me = this.rows.find((r) => r.is_me);
      this.rank = me ? me.rank : null;
      this.error = null;
    } catch (err) {
      console.error("Leaderboard submit error:", err);
      this.error = "Couldn't reach leaderboard";
    } finally {
      this.loading = false;
    }
  }
}
