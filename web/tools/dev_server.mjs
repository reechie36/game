#!/usr/bin/env node
/**
 * Zero-dependency local development server for Letter Rise Web.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMusicManifest } from "./generate_music_manifest.mjs";

const PORT = parseInt(process.env.PORT || "8080", 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, "../..");
const WEB_DIR = path.join(REPO_DIR, "web");

await generateMusicManifest();

// Ensure env.js exists in web directory
if (!fs.existsSync(path.join(WEB_DIR, "env.js"))) {
  import("./generate_env.mjs").catch(() => {});
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  if (reqPath.endsWith("/")) reqPath += "index.html";

  const filePath = path.join(REPO_DIR, reqPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(REPO_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 Letter Rise Web is running locally at:`);
  console.log(`   👉 http://localhost:${PORT}/\n`);
  console.log(`Press Ctrl+C to stop the server.\n`);
});
