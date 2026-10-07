/**
 * Web Audio API Engine for Letter Rise.
 * Preloads AudioBuffers, manages master GainNode, and unlocks on first interaction.
 */

import {
  BACKGROUND_MUSIC_FALLBACK_PATH,
  MUSIC_MANIFEST_PATH,
  SOUND_FALLBACK_PATHS,
  SOUND_PATHS,
} from "./config.js";

export class AudioEngine {
  constructor(volume = 0.75, muted = false, musicVolume = 0.75) {
    this.volume = volume;
    this.musicVolume = musicVolume;
    this.muted = muted;
    this.ctx = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.unlocked = false;
    this.preloadPromise = null;
    this.musicTracks = null;
    this.currentMusicIndex = -1;
    this.music = new Audio(BACKGROUND_MUSIC_FALLBACK_PATH);
    this.music.loop = false;
    this.music.preload = "auto";
    this.music.addEventListener("ended", () => this.playNextMusic());
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn("Web Audio API is not supported in this browser.");
        return null;
      }
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((err) => {
        console.warn("Could not resume audio context:", err);
      });
    }
    this.unlocked = true;
    return this.ctx;
  }

  applyVolume() {
    if (!this.masterGain || !this.ctx) return;
    const targetVolume = this.muted ? 0.0 : this.volume;
    this.masterGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolume();
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    this.music.volume = this.getMusicVolume();
  }

  setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    this.music.muted = this.muted;
    this.applyVolume();
  }

  getMusicVolume() {
    return Math.min(1, this.musicVolume * 0.35);
  }

  async playMusic() {
    if (this.muted || this.volume <= 0) return;

    if (this.currentMusicIndex < 0) {
      this.currentMusicIndex = 0;
    }
    this.music.volume = this.getMusicVolume();
    this.music.muted = false;
    const playback = this.music.play();
    playback.catch((err) => {
      console.warn("Could not play background music:", err);
    });

    try {
      await this.loadMusicTracks();
    } catch (err) {
      console.warn("Could not load background music tracks:", err);
    }
  }

  async loadMusicTracks() {
    if (this.musicTracks) return this.musicTracks;

    try {
      const response = await fetch(MUSIC_MANIFEST_PATH);
      if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
      const manifest = await response.json();
      this.musicTracks = Array.isArray(manifest.tracks) && manifest.tracks.length
        ? manifest.tracks.map((track) => new URL(track, MUSIC_MANIFEST_PATH).href)
        : [BACKGROUND_MUSIC_FALLBACK_PATH];
    } catch (err) {
      console.warn("Could not load music manifest; using fallback track:", err);
      this.musicTracks = [BACKGROUND_MUSIC_FALLBACK_PATH];
    }

    return this.musicTracks;
  }

  async playNextMusic() {
    const tracks = await this.loadMusicTracks();
    if (tracks.length > 1) {
      let nextIndex = this.currentMusicIndex;
      while (nextIndex === this.currentMusicIndex) {
        nextIndex = Math.floor(Math.random() * tracks.length);
      }
      this.currentMusicIndex = nextIndex;
    } else {
      this.currentMusicIndex = 0;
    }

    this.music.src = tracks[this.currentMusicIndex];
    this.music.loop = false;
    await this.playMusic();
  }

  pauseMusic() {
    this.music.pause();
  }

  async loadSound(name, path, fallbackPath) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      let res = await fetch(path);
      if (!res.ok && fallbackPath) {
        res = await fetch(fallbackPath);
      }
      if (!res.ok) {
        console.warn(`Could not load audio file for ${name}: ${res.status}`);
        return;
      }
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(name, audioBuffer);
    } catch (err) {
      console.warn(`Error loading sound "${name}":`, err);
    }
  }

  async preloadAll() {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    const promises = [];
    for (const [name, path] of Object.entries(SOUND_PATHS)) {
      const fallback = SOUND_FALLBACK_PATHS[name];
      promises.push(this.loadSound(name, path, fallback));
    }
    this.preloadPromise = Promise.allSettled(promises).then(() => {
      this.preloadPromise = null;
    });
    return this.preloadPromise;
  }

  async play(name) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.buffers.has(name)) {
      await this.preloadAll();
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("Could not resume audio context:", err);
        return;
      }
    }

    const buffer = this.buffers.get(name);
    if (!buffer) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.masterGain);
      source.start(0);
    } catch (err) {
      console.warn(`Error playing sound "${name}":`, err);
    }
  }
}
