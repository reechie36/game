/**
 * Main game entry point, loop, and state machine for Letter Rise Web.
 */

import { AudioEngine } from "./audio.js";
import { Board } from "./board.js";
import { loadWords } from "./data.js";
import { InputHandler } from "./input.js";
import { LeaderboardClient } from "./leaderboard.js?v=2";
import { MenuBackground } from "./menu_background.js";
import { ProfileManager } from "./profile.js";
import { GAME_MODES } from "./config.js?v=2";
import { Renderer } from "./render.js?v=4";
import { UIManager } from "./ui.js?v=6";

class GameApp {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.menuBackground = new MenuBackground(document.getElementById("menu-letter-rain"));
    this.profileManager = new ProfileManager();
    const profile = this.profileManager.profile;

    this.audio = new AudioEngine(
      profile.sound_volume,
      profile.sound_muted,
      profile.music_volume
    );

    this.leaderboard = new LeaderboardClient(this.profileManager);
    this.renderer = new Renderer(this.canvas);
    this.board = new Board(performance.now());

    this.inputHandler = new InputHandler(this.canvas, this.board, {
      onSound: (sound) => this.audio.play(sound),
      onSegmentChange: (candidate) => this.ui.setSegmentCandidate(candidate),
    });

    this.state = "menu"; // "menu" | "mode_picker" | "name_entry" | "settings" | "leaderboard" | "countdown" | "playing" | "paused" | "game_over"
    this.nameReturnState = "menu";
    this.settingsReturnState = "menu";
    this.leaderboardMode = "endless";
    this.selectedMode = "endless";
    this.countdownEnd = 0;
    this.lastTime = performance.now();
    this.isNewBest = false;
    this.submitted = false;

    this.ui = new UIManager({
      onPlay: () => this.handlePlayClick(),
      onModeSelect: (mode) => this.handleModeSelect(mode),
      onMenuNameSubmit: (name) => this.handleMenuNameSubmit(name),
      onLeaderboard: () => this.handleOpenLeaderboard(),
      onLeaderboardModeSelect: (mode) => this.handleOpenLeaderboard(mode),
      onSettings: () => this.handleOpenSettings(),
      onNameSubmit: (name) => this.handleNameSubmit(name),
      onNameCancel: () => this.handleNameCancel(),
      onPublicToggle: () => this.handlePublicToggle(),
      onThemeChange: (theme) => this.handleThemeChange(theme),
      onVolumeChange: (vol) => this.handleVolumeChange(vol),
      onMusicVolumeChange: (vol) => this.handleMusicVolumeChange(vol),
      onMuteToggle: () => this.handleMuteToggle(),
      onSettingsBack: () => this.handleSettingsBack(),
      onResume: () => this.resumeGame(),
      onRestart: () => this.restartGame(),
      onMenu: () => this.switchState("menu"),
      onConfirmSegment: () => this.inputHandler.confirmCurrentSegment(performance.now()),
      onPauseClick: () => this.togglePause(),
    });

    this.setupGlobalEvents();
    this.ui.updateSettingsUI(this.profileManager.profile);
    this.applyTheme(this.profileManager.profile.theme);
    this.ui.updateMenuUI(this.profileManager.profile);
    this.ui.updateModePickerUI(this.profileManager.profile);
    this.ui.showState("menu");
  }

  setupGlobalEvents() {
    // Audio unlock on first user gesture
    const unlockAudio = () => {
      this.audio.ensureContext();
      this.audio.preloadAll().catch((err) => {
        console.warn("Could not preload audio:", err);
      });
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });

    // Auto-pause when user leaves tab
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") {
        this.pauseGame();
      }
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (this.state === "playing" && (e.key === "p" || e.key === "P")) {
        this.pauseGame();
      } else if (this.state === "paused" && (e.key === "p" || e.key === "P")) {
        this.resumeGame();
      } else if (this.state === "game_over") {
        if (e.key === "r" || e.key === "R") {
          this.restartGame();
        } else if (e.key === "l" || e.key === "L") {
          this.handleOpenLeaderboard();
        } else if (e.key === "m" || e.key === "M") {
          this.switchState("menu");
        }
      } else if (e.key === "Escape") {
        if (this.state === "leaderboard") {
          this.switchState("menu");
        } else if (this.state === "settings") {
          this.handleSettingsBack();
        } else if (this.state === "name_entry") {
          this.handleNameCancel();
        }
      }
    });
  }

  switchState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === "menu" && oldState !== "menu") {
      this.board = new Board(performance.now());
      this.inputHandler.setBoard(this.board);
      this.submitted = false;
      this.isNewBest = false;
      this.renderer.clear();
    }

    if (newState === "playing") {
      if (oldState === "paused") {
        this.audio.playMusic();
      } else {
        this.audio.playNextMusic();
      }
    } else if (oldState === "playing" || newState === "paused" || newState === "game_over") {
      this.audio.pauseMusic();
    }

    if (newState === "playing") {
      const now = performance.now();
      if (oldState === "paused") {
        this.board.resume(now);
      }
    } else if (newState === "paused") {
      this.board.pause(performance.now());
      if (this.inputHandler.dragging) {
        this.inputHandler.dragging.dragging = false;
        this.inputHandler.dragging = null;
      }
    }

    this.ui.showState(newState);
  }

  handlePlayClick() {
    this.ui.updateModePickerUI(this.profileManager.profile);
    this.state = "mode_picker";
    this.ui.showState("mode_picker");
  }

  handleModeSelect(mode) {
    if (!GAME_MODES[mode]) return;
    this.selectedMode = mode;
    if (!this.profileManager.profile.player_name) {
      this.nameReturnState = "play";
      this.ui.promptName("play", "");
      this.state = "name_entry";
    } else {
      this.startNewGame(this.selectedMode);
    }
  }

  handleMenuNameSubmit(name) {
    const success = this.profileManager.setPlayerName(name);
    if (success) {
      this.ui.updateSettingsUI(this.profileManager.profile);
      this.ui.updateMenuUI(this.profileManager.profile);
    }
    return success;
  }

  handleNameSubmit(name) {
    const success = this.profileManager.setPlayerName(name);
    if (!success) return;
    this.ui.updateSettingsUI(this.profileManager.profile);

    if (this.nameReturnState === "play") {
      this.startNewGame(this.selectedMode);
    } else if (this.nameReturnState === "game_over") {
      this.submitScore();
      this.switchState("game_over");
    } else {
      this.switchState(this.nameReturnState);
    }
  }

  handleNameCancel() {
    if (this.nameReturnState === "play" || this.nameReturnState === "game_over") {
      this.switchState("menu");
    } else {
      this.switchState(this.nameReturnState);
    }
  }

  handleOpenLeaderboard(mode = this.leaderboardMode) {
    this.leaderboardMode = mode;
    this.switchState("leaderboard");
    this.ui.setLeaderboardMode(mode);
    this.ui.renderLeaderboard(
      this.leaderboard.rows,
      this.leaderboard.rank,
      true,
      null,
      this.profileManager.profile.client_id
    );
    this.leaderboard.refresh(mode).then(() => {
      this.ui.renderLeaderboard(
        this.leaderboard.rows,
        this.leaderboard.rank,
        this.leaderboard.loading,
        this.leaderboard.error,
        this.profileManager.profile.client_id
      );
    });
  }

  handleOpenSettings() {
    this.settingsReturnState = this.state;
    this.ui.setSettingsInGame(this.state === "paused");
    this.ui.updateSettingsUI(this.profileManager.profile);
    this.switchState("settings");
  }

  handleSettingsBack() {
    this.switchState(this.settingsReturnState);
  }

  handlePublicToggle() {
    this.profileManager.togglePublic();
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  handleThemeChange(theme) {
    if (this.profileManager.setTheme(theme)) {
      this.applyTheme(this.profileManager.profile.theme);
      this.ui.updateSettingsUI(this.profileManager.profile);
    }
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  handleVolumeChange(vol) {
    this.profileManager.setAudioSettings(vol, false);
    this.audio.setVolume(vol);
    this.audio.setMuted(false);
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  handleMusicVolumeChange(vol) {
    this.profileManager.setMusicVolume(vol);
    this.audio.setMusicVolume(vol);
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  handleMuteToggle() {
    const newMuted = !this.profileManager.profile.sound_muted;
    this.profileManager.setAudioSettings(this.profileManager.profile.sound_volume, newMuted);
    this.audio.setMuted(newMuted);
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  startNewGame(mode = this.selectedMode) {
    const now = performance.now();
    this.selectedMode = GAME_MODES[mode] ? mode : "endless";
    this.board = new Board(now, this.selectedMode);
    this.inputHandler.setBoard(this.board);
    this.submitted = false;
    this.isNewBest = false;
    if (this.selectedMode === "time_attack") {
      this.board.pause(now);
      this.countdownEnd = now + 3000;
      this.state = "countdown";
      this.ui.showState("countdown");
      this.ui.setCountdown(3);
    } else {
      this.switchState("playing");
    }
  }

  pauseGame() {
    if (this.state === "playing") {
      this.switchState("paused");
    }
  }

  resumeGame() {
    if (this.state === "paused") {
      this.switchState("playing");
    }
  }

  togglePause() {
    if (this.state === "playing") {
      this.pauseGame();
    } else if (this.state === "paused") {
      this.resumeGame();
    }
  }

  restartGame() {
    if (!this.profileManager.profile.player_name) {
      this.nameReturnState = "play";
      this.ui.promptName("play", "");
      this.state = "name_entry";
    } else {
      this.startNewGame();
    }
  }

  handleGameOver() {
    this.state = "game_over";
    this.isNewBest = this.profileManager.updatePersonalBest(this.board.score, this.board.mode);

    if (this.profileManager.profile.player_name) {
      this.submitScore();
    } else {
      this.nameReturnState = "game_over";
      this.ui.promptName("game_over", "");
      this.state = "name_entry";
    }
  }

  submitScore() {
    if (this.submitted) return;
    this.submitted = true;

    this.ui.showGameOver(
      this.board.score,
      this.isNewBest,
      null,
      "Submitting score...",
      this.board.mode,
      this.board.end_reason,
      this.board.elapsed_seconds(performance.now())
    );
    this.leaderboard
      .submitAndRefresh(
        this.board.score,
        this.board.rarest_word_found,
        this.board.mode,
        this.board.active_elapsed_ms(performance.now())
      )
      .then(() => {
        this.ui.showGameOver(
          this.board.score,
          this.isNewBest,
          this.leaderboard.rank,
          this.leaderboard.error,
          this.board.mode,
          this.board.end_reason,
          this.board.elapsed_seconds(performance.now())
        );
      });
  }

  start() {
    this.lastTime = performance.now();
    const frame = (now) => {
      let dt = (now - this.lastTime) / 1000;
      dt = Math.min(dt, 0.1); // Clamp dt to prevent physics exploding
      this.lastTime = now;

      const wasGameOver = this.board.game_over;
      if (this.state === "countdown") {
        const countdownSeconds = Math.ceil((this.countdownEnd - now) / 1000);
        this.ui.setCountdown(countdownSeconds);
        if (now >= this.countdownEnd) {
          this.board.resume(now);
          this.switchState("playing");
        }
      } else if (this.state === "playing") {
        this.board.update(dt, now);
      }

      if (this.board.sound_events.length > 0) {
        for (const evt of this.board.sound_events) {
          this.audio.play(evt);
        }
        this.board.sound_events.length = 0;
      }

      if (this.board.game_over && !wasGameOver) {
        this.handleGameOver();
      }

      // Render gameplay if active or paused
      if (this.state === "playing" || this.state === "paused" || this.state === "game_over") {
        const hoverCandidate = this.inputHandler.findHoverCandidate(this.inputHandler.currentPos);
        const hoveredCell = this.inputHandler.findGridCellAt(this.inputHandler.currentPos);
        this.renderer.renderGame(
          this.board,
          now,
          hoverCandidate,
          hoveredCell,
          this.inputHandler.dragging
        );
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

// Bootstrap application once dictionary and fonts are ready
async function init() {
  console.log("Loading Letter Rise assets...");
  try {
    await Promise.all([
      loadWords("assets/words.json"),
      document.fonts ? document.fonts.ready : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("Initialization error:", err);
  }

  const app = new GameApp();
  app.start();
}

window.addEventListener("DOMContentLoaded", init);