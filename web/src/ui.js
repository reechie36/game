/**
 * DOM Overlay and UI Manager for Letter Rise.
 */

import { calculateWordScore, WORD_TIERS } from "./data.js";
import { BINGO_BONUS_MULTIPLIER, ROW_LEN } from "./config.js";

export class UIManager {
  constructor(options = {}) {
    this.onPlay = options.onPlay || (() => {});
    this.onLeaderboard = options.onLeaderboard || (() => {});
    this.onSettings = options.onSettings || (() => {});
    this.onNameSubmit = options.onNameSubmit || (() => {});
    this.onNameCancel = options.onNameCancel || (() => {});
    this.onPublicToggle = options.onPublicToggle || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
    this.onMuteToggle = options.onMuteToggle || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onRestart = options.onRestart || (() => {});
    this.onMenu = options.onMenu || (() => {});
    this.onConfirmSegment = options.onConfirmSegment || (() => {});
    this.onPauseClick = options.onPauseClick || (() => {});

    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.menuOverlay = document.getElementById("menu-overlay");
    this.nameOverlay = document.getElementById("name-overlay");
    this.settingsOverlay = document.getElementById("settings-overlay");
    this.leaderboardOverlay = document.getElementById("leaderboard-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.gameoverOverlay = document.getElementById("gameover-overlay");

    this.actionBar = document.getElementById("action-bar");
    this.confirmHint = document.getElementById("confirm-hint");
    this.confirmBtn = document.getElementById("confirm-btn");
    this.pauseBtnHud = document.getElementById("pause-btn-hud");

    // Menu
    this.btnMenuPlay = document.getElementById("btn-menu-play");
    this.btnMenuLeaderboard = document.getElementById("btn-menu-leaderboard");
    this.btnMenuSettings = document.getElementById("btn-menu-settings");

    // Name
    this.nameForm = document.getElementById("name-form");
    this.playerNameInput = document.getElementById("player-name-input");
    this.btnNameCancel = document.getElementById("btn-name-cancel");

    // Settings
    this.settingsNameDisplay = document.getElementById("settings-name-display");
    this.btnSettingsEditName = document.getElementById("btn-settings-edit-name");
    this.btnSettingsPublic = document.getElementById("btn-settings-public");
    this.volumeSlider = document.getElementById("volume-slider");
    this.volumeLabel = document.getElementById("volume-label");
    this.btnSettingsMute = document.getElementById("btn-settings-mute");
    this.btnSettingsBack = document.getElementById("btn-settings-back");

    // Leaderboard
    this.leaderboardStatus = document.getElementById("leaderboard-status");
    this.leaderboardTable = document.getElementById("leaderboard-table");
    this.leaderboardBody = document.getElementById("leaderboard-body");
    this.btnLeaderboardBack = document.getElementById("btn-leaderboard-back");

    // Pause
    this.btnPauseResume = document.getElementById("btn-pause-resume");
    this.btnPauseRestart = document.getElementById("btn-pause-restart");
    this.btnPauseMenu = document.getElementById("btn-pause-menu");

    // Game Over
    this.gameoverScore = document.getElementById("gameover-score");
    this.gameoverBest = document.getElementById("gameover-best");
    this.gameoverRank = document.getElementById("gameover-rank");
    this.btnGameoverRestart = document.getElementById("btn-gameover-restart");
    this.btnGameoverLeaderboard = document.getElementById("btn-gameover-leaderboard");
    this.btnGameoverMenu = document.getElementById("btn-gameover-menu");
  }

  bindEvents() {
    this.btnMenuPlay.addEventListener("click", () => this.onPlay());
    this.btnMenuLeaderboard.addEventListener("click", () => this.onLeaderboard());
    this.btnMenuSettings.addEventListener("click", () => this.onSettings());

    this.nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.onNameSubmit(this.playerNameInput.value);
    });
    this.btnNameCancel.addEventListener("click", () => this.onNameCancel());

    this.btnSettingsEditName.addEventListener("click", () => {
      this.promptName("settings", this.playerNameInput.value);
    });
    this.btnSettingsPublic.addEventListener("click", () => this.onPublicToggle());
    this.volumeSlider.addEventListener("input", (e) => {
      this.onVolumeChange(parseFloat(e.target.value));
    });
    this.btnSettingsMute.addEventListener("click", () => this.onMuteToggle());
    this.btnSettingsBack.addEventListener("click", () => this.onMenu());

    this.btnLeaderboardBack.addEventListener("click", () => this.onMenu());

    this.btnPauseResume.addEventListener("click", () => this.onResume());
    this.btnPauseRestart.addEventListener("click", () => this.onRestart());
    this.btnPauseMenu.addEventListener("click", () => this.onMenu());

    this.btnGameoverRestart.addEventListener("click", () => this.onRestart());
    this.btnGameoverLeaderboard.addEventListener("click", () => this.onLeaderboard());
    this.btnGameoverMenu.addEventListener("click", () => this.onMenu());

    this.confirmBtn.addEventListener("click", () => this.onConfirmSegment());
    this.pauseBtnHud.addEventListener("click", () => this.onPauseClick());
  }

  showState(state) {
    const overlays = [
      this.menuOverlay,
      this.nameOverlay,
      this.settingsOverlay,
      this.leaderboardOverlay,
      this.pauseOverlay,
      this.gameoverOverlay,
    ];
    overlays.forEach((o) => o?.classList.add("hidden"));

    const isPlaying = state === "playing";
    this.actionBar.style.display = isPlaying ? "flex" : "none";
    this.pauseBtnHud.style.display = isPlaying ? "block" : "none";

    switch (state) {
      case "menu":
        this.menuOverlay?.classList.remove("hidden");
        break;
      case "name_entry":
        this.nameOverlay?.classList.remove("hidden");
        this.playerNameInput?.focus();
        break;
      case "settings":
        this.settingsOverlay?.classList.remove("hidden");
        break;
      case "leaderboard":
        this.leaderboardOverlay?.classList.remove("hidden");
        break;
      case "paused":
        this.pauseOverlay?.classList.remove("hidden");
        break;
      case "game_over":
        this.gameoverOverlay?.classList.remove("hidden");
        break;
      case "playing":
      default:
        break;
    }
  }

  promptName(returnTo, currentName = "") {
    this.playerNameInput.value = currentName;
    this.showState("name_entry");
  }

  updateSettingsUI(profile) {
    this.settingsNameDisplay.textContent = `Player: ${profile.player_name || "(not set)"}`;
    this.btnSettingsPublic.textContent = `GLOBAL SCORES: ${profile.public ? "ON" : "OFF"}`;
    this.volumeSlider.value = profile.sound_volume;
    this.volumeLabel.textContent = profile.sound_muted
      ? "SOUND: MUTED"
      : `SOUND: ${Math.round(profile.sound_volume * 100)}%`;
    this.btnSettingsMute.textContent = profile.sound_muted ? "UNMUTE SOUND" : "MUTE SOUND";
  }

  setSegmentCandidate(candidate) {
    if (!candidate || !candidate.word) {
      this.confirmBtn.textContent = "SPACE TO CONFIRM";
      this.confirmBtn.setAttribute("aria-label", "Select a word to confirm");
      this.confirmHint.textContent = "Tap a word twice to confirm";
      this.confirmBtn.classList.remove("active");
    } else {
      const upper = candidate.word.toUpperCase();
      this.confirmBtn.textContent = `CONFIRM "${upper}"`;
      this.confirmBtn.setAttribute("aria-label", `Confirm word ${upper}`);
      this.confirmHint.textContent = `Tap "${upper}" twice, or tap confirm`;
      this.confirmBtn.classList.add("active");
    }
  }

  showGameOver(score, isNewBest, rank, error) {
    this.gameoverScore.textContent = `Final Score: ${score.toFixed(2)}`;
    this.gameoverBest.style.display = isNewBest ? "block" : "none";

    if (rank !== null && rank !== undefined) {
      this.gameoverRank.textContent = `Global Rank: #${rank}`;
      this.gameoverRank.className = "hint-text";
    } else if (error) {
      this.gameoverRank.textContent = error;
      this.gameoverRank.className = "hint-text warning";
    } else {
      this.gameoverRank.textContent = "";
    }
    this.showState("game_over");
  }

  renderLeaderboard(rows, rank, loading, error, clientId) {
    if (loading) {
      this.leaderboardStatus.style.display = "block";
      this.leaderboardStatus.textContent = "Loading...";
      this.leaderboardStatus.className = "loading-text";
      this.leaderboardTable.style.display = "none";
      return;
    }

    if (error) {
      this.leaderboardStatus.style.display = "block";
      this.leaderboardStatus.textContent = error;
      this.leaderboardStatus.className = "error-text";
      this.leaderboardTable.style.display = "none";
      return;
    }

    this.leaderboardStatus.style.display = "none";
    this.leaderboardTable.style.display = "table";
    this.leaderboardBody.innerHTML = "";

    const positiveRows = rows
      .filter((r) => parseFloat(r.score || 0) > 0)
      .slice(0, 18);

    if (positiveRows.length === 0) {
      this.leaderboardStatus.style.display = "block";
      this.leaderboardStatus.textContent = "No scores submitted yet. Be the first!";
      this.leaderboardStatus.className = "hint-text";
      this.leaderboardTable.style.display = "none";
      return;
    }

    positiveRows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      const isMe = r.is_me || r.client_id === clientId;
      if (isMe) tr.classList.add("is-me");

      const rankVal = r.rank || idx + 1;
      const playerName = String(r.player_name || "Unknown").slice(0, 16);
      const score = parseFloat(r.score || 0).toFixed(2);
      const word = String(r.rarest_word_found || "-").slice(0, 10);

      let wordPoints = 0;
      if (word !== "-" && WORD_TIERS.has(word.toLowerCase())) {
        wordPoints = calculateWordScore(word);
        if (word.length === ROW_LEN) {
          wordPoints *= BINGO_BONUS_MULTIPLIER;
        }
      }

      tr.innerHTML = `
        <td>#${rankVal}</td>
        <td>${escapeHtml(playerName)}</td>
        <td>${score}</td>
        <td>${escapeHtml(word)}</td>
        <td>${wordPoints > 0 ? wordPoints.toFixed(2) : "-"}</td>
      `;
      this.leaderboardBody.appendChild(tr);
    });
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, (tag) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[tag] || tag));
}
