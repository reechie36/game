/**
 * Main game entry point, loop, and state machine for Letter Rise Web.
 */

import { AudioEngine } from "./audio.js";
import { Board } from "./board.js";
import { loadWords } from "./data.js";
import { InputHandler } from "./input.js";
import { LeaderboardClient } from "./leaderboard.js";
import { ProfileManager } from "./profile.js";
import { Renderer } from "./render.js";
import { UIManager } from "./ui.js";

class GameApp {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.profileManager = new ProfileManager();
    const profile = this.profileManager.profile;

    this.audio = new AudioEngine(profile.sound_volume, profile.sound_muted);

    this.leaderboard = new LeaderboardClient(this.profileManager);
    this.renderer = new Renderer(this.canvas);
    this.board = new Board(performance.now());

    this.inputHandler = new InputHandler(this.canvas, this.board, {
      onSound: (sound) => this.audio.play(sound),
      onSegmentChange: (candidate) => this.ui.setSegmentCandidate(candidate),
    });

    this.state = "menu"; // "menu" | "name_entry" | "settings" | "leaderboard" | "playing" | "paused" | "game_over"
    this.nameReturnState = "menu";
    this.lastTime = performance.now();
    this.isNewBest = false;
    this.submitted = false;

    this.ui = new UIManager({
      onPlay: () => this.handlePlayClick(),
      onLeaderboard: () => this.handleOpenLeaderboard(),
      onSettings: () => this.handleOpenSettings(),
      onNameSubmit: (name) => this.handleNameSubmit(name),
      onNameCancel: () => this.handleNameCancel(),
      onPublicToggle: () => this.handlePublicToggle(),
      onVolumeChange: (vol) => this.handleVolumeChange(vol),
      onMuteToggle: () => this.handleMuteToggle(),
      onResume: () => this.resumeGame(),
      onRestart: () => this.restartGame(),
      onMenu: () => this.switchState("menu"),
      onConfirmSegment: () => this.inputHandler.confirmCurrentSegment(performance.now()),
      onPauseClick: () => this.togglePause(),
    });

    this.setupGlobalEvents();
    this.ui.updateSettingsUI(this.profileManager.profile);
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
        if (this.state === "leaderboard" || this.state === "settings") {
          this.switchState("menu");
        } else if (this.state === "name_entry") {
          this.handleNameCancel();
        }
      }
    });
  }

  switchState(newState) {
    const oldState = this.state;
    this.state = newState;

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
    if (!this.profileManager.profile.player_name) {
      this.nameReturnState = "play";
      this.ui.promptName("play", "");
      this.state = "name_entry";
    } else {
      this.startNewGame();
    }
  }

  handleNameSubmit(name) {
    const success = this.profileManager.setPlayerName(name);
    if (!success) return;
    this.ui.updateSettingsUI(this.profileManager.profile);

    if (this.nameReturnState === "play") {
      this.startNewGame();
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

  handleOpenLeaderboard() {
    this.switchState("leaderboard");
    this.ui.renderLeaderboard(
      this.leaderboard.rows,
      this.leaderboard.rank,
      true,
      null,
      this.profileManager.profile.client_id
    );
    this.leaderboard.refresh().then(() => {
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
    this.ui.updateSettingsUI(this.profileManager.profile);
    this.switchState("settings");
  }

  handlePublicToggle() {
    this.profileManager.togglePublic();
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  handleVolumeChange(vol) {
    this.profileManager.setAudioSettings(vol, false);
    this.audio.setVolume(vol);
    this.audio.setMuted(false);
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  handleMuteToggle() {
    const newMuted = !this.profileManager.profile.sound_muted;
    this.profileManager.setAudioSettings(this.profileManager.profile.sound_volume, newMuted);
    this.audio.setMuted(newMuted);
    this.ui.updateSettingsUI(this.profileManager.profile);
  }

  startNewGame() {
    const now = performance.now();
    this.board = new Board(now);
    this.inputHandler.setBoard(this.board);
    this.submitted = false;
    this.isNewBest = false;
    this.switchState("playing");
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
    this.isNewBest = this.profileManager.updatePersonalBest(this.board.score);

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

    this.ui.showGameOver(this.board.score, this.isNewBest, null, "Submitting score...");
    this.leaderboard
      .submitAndRefresh(this.board.score, this.board.rarest_word_found)
      .then(() => {
        this.ui.showGameOver(
          this.board.score,
          this.isNewBest,
          this.leaderboard.rank,
          this.leaderboard.error
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
      if (this.state === "playing") {
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
