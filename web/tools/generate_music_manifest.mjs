#!/usr/bin/env node
/** Generate the static music manifest used by the browser audio engine. */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const MUSIC_DIR = path.join(WEB_DIR, "assets", "bg-music");
const MANIFEST_PATH = path.join(MUSIC_DIR, "manifest.json");
const SUPPORTED_EXTENSIONS = new Set([".mp3", ".m4a", ".ogg", ".wav"]);

export async function generateMusicManifest() {
  await fs.mkdir(MUSIC_DIR, { recursive: true });
  const entries = await fs.readdir(MUSIC_DIR, { withFileTypes: true });
  const tracks = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => encodeURIComponent(entry.name))
    .sort();

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify({ tracks }, null, 2)}\n`, "utf-8");
  console.log(`[generate_music_manifest] Found ${tracks.length} track(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateMusicManifest();
}