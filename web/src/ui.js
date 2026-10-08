/**
 * DOM Overlay and UI Manager for Letter Rise.
 */

import { calculateWordScore, WORD_TIERS } from "./data.js";
import { BINGO_BONUS_MULTIPLIER, GAME_MODES, ROW_LEN } from "./config.js?v=2";

export class UIManager {
  constructor(options = {}) {
    this.onPlay = options.onPlay || (() => {});
    this.onModeSelect = options.onModeSelect || (() => {});
    this.onMenuNameSubmit = options.onMenuNameSubmit || (() => false);
    this.onLeaderboard = options.onLeaderboard || (() => {});
    this.onLeaderboardModeSelect = options.onLeaderboardModeSelect || (() => {});
    this.onSettings = options.onSettings || (() => {});
    this.onNameSubmit = options.onNameSubmit || (() => {});
    this.onNameCancel = options.onNameCancel || (() => {});
    this.onPublicToggle = options.onPublicToggle || (() => {});
    this.onThemeChange = options.onThemeChange || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
    this.onMusicVolumeChange = options.onMusicVolumeChange || (() => {});
    this.onMuteToggle = options.onMuteToggle || (() => {});
    this.onSettingsBack = options.onSettingsBack || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onRestart = options.onRestart || (() => {});
    this.onMenu = options.onMenu || (() => {});
    this.onConfirmSegment = options.onConfirmSegment || (() => {});
    this.onPauseClick = options.onPauseClick || (() => {});

    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.appContainer = document.getElementById("app-container");
    this.menuOverlay = document.getElementById("menu-overlay");
    this.modeOverlay = document.getElementById("mode-overlay");
    this.nameOverlay = document.getElementById("name-overlay");
    this.settingsOverlay = document.getElementById("settings-overlay");
    this.leaderboardOverlay = document.getElementById("leaderboard-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.gameoverOverlay = document.getElementById("gameover-overlay");

    this.actionBar = document.getElementById("action-bar");
    this.confirmHint = document.getElementById("confirm-hint");
    this.confirmBtn = document.getElementById("confirm-btn");
    this.pauseBtnHud = document.getElementById("pause-btn-hud");
    this.startCountdown = document.getElementById("start-countdown");

    // Menu
    this.btnMenuPlay = document.getElementById("btn-menu-play");
    this.btnMenuLeaderboard = document.getElementById("btn-menu-leaderboard");
    this.btnMenuSettings = document.getElementById("btn-menu-settings");
    this.menuNameForm = document.getElementById("menu-name-form");
    this.menuPlayerNameInput = document.getElementById("menu-player-name-input");
    this.menuNameStatus = document.getElementById("menu-name-status");

    // Name
    this.nameForm = document.getElementById("name-form");
    this.playerNameInput = document.getElementById("player-name-input");
    this.btnNameCancel = document.getElementById("btn-name-cancel");

    // Settings
    this.settingsNameDisplay = document.getElementById("settings-name-display");
    this.btnSettingsEditName = document.getElementById("btn-settings-edit-name");
    this.btnSettingsPublic = document.getElementById("btn-settings-public");
    this.themeSelect = document.getElementById("theme-select");
    this.volumeSlider = document.getElementById("volume-slider");
    this.volumeLabel = document.getElementById("volume-label");
    this.musicVolumeSlider = document.getElementById("music-volume-slider");
    this.musicVolumeLabel = document.getElementById("music-volume-label");
    this.btnSettingsMute = document.getElementById("btn-settings-mute");
    this.btnSettingsBack = document.getElementById("btn-settings-back");

    // Leaderboard
    this.leaderboardStatus = document.getElementById("leaderboard-status");
    this.leaderboardTable = document.getElementById("leaderboard-table");
    this.leaderboardBody = document.getElementById("leaderboard-body");
    this.btnLeaderboardBack = document.getElementById("btn-leaderboard-back");
    this.btnLeaderboardEndless = document.getElementById("btn-leaderboard-endless");
    this.btnLeaderboardTime = document.getElementById("btn-leaderboard-time");

    // Pause
    this.btnPauseResume = document.getElementById("btn-pause-resume");
    this.btnPauseRestart = document.getElementById("btn-pause-restart");
    this.btnPauseSettings = document.getElementById("btn-pause-settings");
    this.btnPauseMenu = document.getElementById("btn-pause-menu");

    // Game Over
    this.gameoverScore = document.getElementById("gameover-score");
    this.gameoverBest = document.getElementById("gameover-best");
    this.gameoverRank = document.getElementById("gameover-rank");
    this.gameoverTitle = document.getElementById("gameover-title");
    this.gameoverTime = document.getElementById("gameover-time");
    this.btnGameoverRestart = document.getElementById("btn-gameover-restart");
    this.btnGameoverLeaderboard = document.getElementById("btn-gameover-leaderboard");
    this.btnGameoverMenu = document.getElementById("btn-gameover-menu");

    // Mode picker
    this.btnModeEndless = document.getElementById("btn-mode-endless");
    this.btnModeTimeAttack = document.getElementById("btn-mode-time-attack");
    this.btnModeBack = document.getElementById("btn-mode-back");
    this.modeEndlessBest = document.getElementById("mode-endless-best");
    this.modeTimeBest = document.getElementById("mode-time-best");
  }

  bindEvents() {
    this.btnMenuPlay.addEventListener("click", () => this.onPlay());
    this.btnMenuLeaderboard.addEventListener("click", () => this.onLeaderboard());
    this.btnMenuSettings.addEventListener("click", () => this.onSettings());
    this.btnModeEndless.addEventListener("click", () => this.onModeSelect("endless"));
    this.btnModeTimeAttack.addEventListener("click", () => this.onModeSelect("time_attack"));
    this.btnModeBack.addEventListener("click", () => this.onMenu());
    this.menuNameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const saved = this.onMenuNameSubmit(this.menuPlayerNameInput.value);
      this.menuNameStatus.textContent = saved
        ? "Username saved."
        : "Please choose a valid username.";
    });

    this.nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.onNameSubmit(this.playerNameInput.value);
    });
    this.btnNameCancel.addEventListener("click", () => this.onNameCancel());

    this.btnSettingsEditName.addEventListener("click", () => {
      this.promptName("settings", this.playerNameInput.value);
    });
    this.btnSettingsPublic.addEventListener("click", () => this.onPublicToggle());
    this.themeSelect.addEventListener("change", (e) => this.onThemeChange(e.target.value));
    this.volumeSlider.addEventListener("input", (e) => {
      this.onVolumeChange(parseFloat(e.target.value));
    });
    this.musicVolumeSlider.addEventListener("input", (e) => {
      this.onMusicVolumeChange(parseFloat(e.target.value));
    });
    this.btnSettingsMute.addEventListener("click", () => this.onMuteToggle());
    this.btnSettingsBack.addEventListener("click", () => this.onSettingsBack());

    this.btnLeaderboardBack.addEventListener("click", () => this.onMenu());
    this.btnLeaderboardEndless.addEventListener("click", () => this.onLeaderboardModeSelect("endless"));
    this.btnLeaderboardTime.addEventListener("click", () => this.onLeaderboardModeSelect("time_attack"));

    this.btnPauseResume.addEventListener("click", () => this.onResume());
    this.btnPauseRestart.addEventListener("click", () => this.onRestart());
    this.btnPauseSettings.addEventListener("click", () => this.onSettings());
    this.btnPauseMenu.addEventListener("click", () => this.onMenu());

    this.btnGameoverRestart.addEventListener("click", () => this.onRestart());
    this.btnGameoverLeaderboard.addEventListener("click", () => this.onLeaderboard());
    this.btnGameoverMenu.addEventListener("click", () => this.onMenu());

    this.confirmBtn.addEventListener("click", () => this.onConfirmSegment());
    this.pauseBtnHud.addEventListener("click", () => this.onPauseClick());
  }

  showState(state) {
    this.appContainer?.classList.toggle("menu-state", state === "menu");
    const overlays = [
      this.menuOverlay,
      this.modeOverlay,
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
    this.startCountdown.classList.toggle("hidden", state !== "countdown");

    switch (state) {
      case "menu":
        this.menuOverlay?.classList.remove("hidden");
        break;
      case "mode_picker":
        this.modeOverlay?.classList.remove("hidden");
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

  setSettingsInGame(isInGame) {
    this.settingsOverlay?.classList.toggle("in-game", isInGame);
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
    this.musicVolumeSlider.value = profile.music_volume;
    this.musicVolumeLabel.textContent = profile.sound_muted
      ? "MUSIC: MUTED"
      : `MUSIC: ${Math.round(profile.music_volume * 100)}%`;
    this.btnSettingsMute.textContent = profile.sound_muted ? "UNMUTE SOUND" : "MUTE SOUND";
    this.themeSelect.value = profile.theme;
  }

  updateMenuUI(profile) {
    this.menuPlayerNameInput.value = profile.player_name;
    this.menuNameStatus.textContent = profile.player_name
      ? "Username saved."
      : "Enter a name for leaderboard scores.";
  }

  updateModePickerUI(profile) {
    const personalBests = profile.personal_bests || {};
    this.modeEndlessBest.textContent = `BEST: ${(personalBests.endless ?? profile.personal_best ?? 0).toFixed(2)}`;
    this.modeTimeBest.textContent = `BEST: ${(personalBests.time_attack ?? 0).toFixed(2)}`;
  }

  setSegmentCandidate(candidate) {
    if (!candidate || !candidate.word) {
      this.confirmBtn.textContent = "SPACE TO CONFIRM";
      this.confirmBtn.setAttribute("aria-label", "Select a word to confirm");
      this.confirmHint.textContent = "Tap a word twice or click SPACE to confirm";
      this.confirmBtn.classList.add("hidden");
      this.confirmBtn.classList.remove("active");
    } else {
      const upper = candidate.word.toUpperCase();
      this.confirmBtn.textContent = `CONFIRM "${upper}"`;
      this.confirmBtn.setAttribute("aria-label", `Confirm word ${upper}`);
      this.confirmHint.textContent = `Tap "${upper}" twice, or tap confirm`;
      this.confirmBtn.classList.remove("hidden");
      this.confirmBtn.classList.add("active");
    }
  }

  setCountdown(seconds) {
    this.startCountdown.textContent = seconds > 0 ? String(seconds) : "GO";
  }

  showGameOver(score, isNewBest, rank, error, mode = "endless", endReason = "top_out", timeSurvived = 0) {
    const isTimeUp = mode === "time_attack" && endReason === "time_up";
    this.gameoverTitle.textContent = isTimeUp ? "TIME'S UP" : "GAME OVER";
    this.gameoverScore.textContent = `Final Score: ${score.toFixed(2)}`;
    this.gameoverTime.textContent = `Time survived: ${formatDuration(timeSurvived)}`;
    this.gameoverTime.style.display = mode === "endless" ? "block" : "none";
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

  setLeaderboardMode(mode) {
    const isTimeAttack = mode === "time_attack";
    this.btnLeaderboardEndless.classList.toggle("primary", !isTimeAttack);
    this.btnLeaderboardTime.classList.toggle("primary", isTimeAttack);
  }
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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
