/**
 * Web Audio API Engine for Letter Rise.
 * Preloads AudioBuffers, manages master GainNode, and unlocks on first interaction.
 */

import { SOUND_FALLBACK_PATHS, SOUND_PATHS } from "./config.js";

export class AudioEngine {
  constructor(volume = 0.75, muted = false) {
    this.volume = volume;
    this.muted = muted;
    this.ctx = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.unlocked = false;
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
      this.ctx.resume().catch(() => {});
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

  setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    this.applyVolume();
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
    const promises = [];
    for (const [name, path] of Object.entries(SOUND_PATHS)) {
      const fallback = SOUND_FALLBACK_PATHS[name];
      promises.push(this.loadSound(name, path, fallback));
    }
    await Promise.allSettled(promises);
  }

  play(name) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

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
