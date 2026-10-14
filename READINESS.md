# Shuffall — Readiness Assessment

**Date:** 14 October 2026
**Assessed at:** commit `00f38b4` ("add the animated bg to the rest of the screens")
**Scope:** primarily `web/` (browser build); `python/` noted where it affects claims.
**Method:** static code inspection + the repo's parity suite + a scripted headless-Chrome
session (real page, real assets, synthesized pointer input). See
[Appendix A](#appendix-a--reproducing-the-browser-measurements).

---

## TL;DR

| Audience | Readiness | Why |
| --- | --- | --- |
| Internal / "look at this" demo on your own machine | **~8.5/10 — ready today** | Runs, 61 FPS, core loop verified end-to-end, fails soft offline |
| Public demo link (someone else clicks a URL) | **~6/10 — a few hours of work** | No working deploy path today; leaderboard offline; font 404s on Pages |
| Investor / publisher pitch | **~5/10 as a product, 8/10 as a prototype** | Excellent "it actually works" demo, but no onboarding, no traction data, split branding |

**Verdict:** a strong, honest vertical slice — not yet a shippable product. The gaps are
mostly packaging and presentation, not engineering. Demo it live on a laptop now; do not
send a link until punch-list items 1–3 are done.

---

## 1. Evidence — what was actually verified

### 1.1 Code health

- **No scaffolding.** Zero `TODO` / `FIXME` / `HACK` / `XXX` / `stub` / "not implemented"
  markers anywhere in `web/src`, `web/css`, `web/index.html`, or `python/letter_rise`.
- **Rules are tested and green.** `node web/tools/test_parity.mjs` →
  `>>> ALL PARITY TESTS PASSED! 100% PARITY WITH PYTHON <<<` — covers scoring, rarity
  tiers, board resolution, invalid-segment locking, row/danger geometry, and 10 000-sample
  letter frequency distribution against the Python reference.
- **Active and small:** 56 commits, 2 authors, last commit same day as this assessment.
- **Zero runtime dependencies** in the browser: vanilla ES modules + Canvas 2D + Web Audio;
  Supabase is pulled from a CDN only when configured.

### 1.2 Runtime performance (headless Chrome, 1280x900, local dev server)

| Measurement | Result |
| --- | --- |
| `DOMContentLoaded` / `load` | **51 ms / 52 ms** |
| Requests for a full first play session | 31 |
| Bytes transferred | **~1.74 MB** (words.json 756 KB + ~1.5 MB of `.wav` SFX) |
| FPS in the main menu | **61** |
| FPS while playing | **61** |
| Uncaught page exceptions | **0** |
| Console errors | **0** |
| Failed network requests | 1 benign `ERR_ABORTED` (audio `src` swap on track change) |
| Console warnings | 1 expected autoplay block (synthetic input carries no user activation) |

### 1.3 Core interaction verified (drag a falling letter into a cell)

Driven with real `Input.dispatchMouseEvent` events and pixel probes on the canvas:

1. **Pickup works** — the grabbed disc tracked the pointer at **1581 / 1936** saturated
   pixels inside a 44 px probe window centred on the cursor.
2. **Still held over the grid** — **1644 / 1936** px.
3. **Drop places the letter** — a `H` appeared in exactly the targeted cell (bottom row,
   4th column), confirmed by screenshot.
4. **Coordinate mapping is exact** — the hover highlight landed on the aimed-at cell.
5. **State machine works** — menu → mode picker → ENDLESS → playing (pause HUD visible) →
   `P` pauses and the pause overlay appears.

> **Methodology note worth keeping:** the first two attempts produced a **false positive**.
> The metric counted the white hover outline as "a placed letter". The placement is real;
> the measurement was wrong. Any future automated UI test must probe *chroma* (saturated
> pixels), not brightness.

### 1.4 Graceful degradation

With empty Supabase credentials the leaderboard renders
`Offline mode (Supabase not configured)` in red, personal bests keep persisting to
`localStorage`, and nothing throws. The game is fully playable with no backend.

### 1.5 Layout / responsive

At 390x844 (phone portrait): no horizontal overflow, the square board scales to 390x390,
and the shared letter-rain backdrop stays `position: fixed` and viewport-covering.

---

## 2. Blockers for a public demo link

### 2.1 There is no deployable path today

- `.github/workflows/deploy.yml` **fails the build on purpose** when secrets are absent:
  `echo "::error::Missing SUPABASE_URL or SUPABASE_ANON_KEY ..." && exit 1`.
- Locally, `web/env.js` (generated, git-ignored) contains **empty strings** for both
  `SUPABASE_URL` and `SUPABASE_ANON_KEY`, so the leaderboard is offline by default.
- Consequence: pushing to `main` cannot currently produce a public URL unless the GitHub
  secrets exist. Either provision them, or turn that hard failure into a warning plus an
  offline build.

### 2.2 The Pages deploy would ship a broken UI font

- The workflow uploads **only `./web`** as the Pages artifact (`path: './web'`).
- `web/css/style.css:3` requests `url('../../assets/fonts/FiraMono-Regular.ttf')`, which
  resolves to `/assets/fonts/FiraMono-Regular.ttf` from the site root.
- **`web/assets/` has no `fonts/` directory** — the file lives at
  `web/assets/FiraMono-Regular.ttf`. So on Pages the UI font 404s and falls back to
  generic monospace.
- It works locally only because `web/tools/dev_server.mjs` roots at the **repository**
  root, where `/assets/fonts/` does exist.
- Note the sibling `@font-face` for Sigmar uses `../assets/Sigmar-Regular.ttf`, which *is*
  correct — only the Fira Mono path is wrong.

### 2.3 Two conflicting deploy models

| File | Root/output | Notes |
| --- | --- | --- |
| `vercel.json` (repo root) | `outputDirectory: "."` | Correct — serves `/assets/**` from repo root |
| `web/vercel.json` | `outputDirectory: "."`, build `node tools/generate_env.mjs` | A second config that will be picked up if `web/` is ever set as the Vercel root directory |
| `.github/workflows/deploy.yml` | artifact `./web` | Conflicts with the above (see 2.2) |

Pick one host, delete the other config, and make the asset paths identical under both.

### 2.4 61 MB of music in the repo

- `web/assets/bg-music/` is **61 MB** (`.git` is 132 MB); four of the five tracks are
  **12–18 MB** each.
- `web/src/audio.js:25-27` creates the player with `preload = "auto"`, and
  `playNextMusic()` swaps `src` to a random track mid-session — so a first-time player can
  pull a 15–18 MB MP3 on conference Wi-Fi. Expect late or missing music in a live demo.
- Every SFX also has an **unused `.mp3` twin**: `SOUND_PATHS` points at `.wav` and
  `SOUND_FALLBACK_PATHS = {}` (`web/src/config.js:149`), so the mp3s are dead weight.
- Fix: encode 3–4 short loops (~200 KB total), drop the unused mp3s, and consider
  `preload = "none"` until the first game starts.

### 2.5 No share surface

`web/index.html` has no `og:image`, no Twitter card, no screenshot, no PWA manifest and no
service worker. A pitch link that doesn't preview looks unfinished before anyone plays.

---

## 3. Gaps that matter specifically for a pitch

1. **No onboarding at all.** No how-to-play screen, no tutorial, no first-run coach marks;
   the only guidance is `Tap a word twice or click SPACE to confirm`. A cold player has to
   infer drag-to-place, row growth, and the danger line on their own. This is the single
   biggest demo risk — rehearse on someone who has never seen it.
2. **A name prompt gates the first run.** `handleModeSelect()` (`web/src/main.js:176-186`)
   interrupts PLAY → ENDLESS with "Choose Display Name" before the first letter falls.
   Asking for identity before the first second of fun is a classic demo-killer; make it
   skippable or defer it to score-submission time.
3. **Mobile touch targets are too small.** At 390 px wide the board scales by 390/820 ≈ 0.48,
   so `CELL = 64` renders ~30 px and `FALLING_DIAMETER = 52` renders ~**25 px** — well under
   the 44 px guideline. Desktop and tablet are fine; a phone demo is shaky.
4. **Leaderboard integrity.** `web/src/leaderboard.js:123` inserts directly with the public
   anon key, and the "time trials must reach 02:00" rule (`web/src/main.js:348-351`) is
   enforced client-side. Scores are trivially spoofable. Acceptable for a prototype — state
   it before someone else does.
5. **Split brand.** The product is **Shuffall** (`<title>`, the H1, `README.md`), while
   **"Letter Rise"** still appears in 10+ files — including the canvas `aria-label`
   (`web/index.html:19`), the dev-server banner, both `package.json` names, and all docs.
6. **No telemetry.** No analytics, so there is no retention, session-length or play-count
   number to put in a deck.
7. **Test coverage is rules-only.** `test_parity.mjs` is a Node suite over `board.js`;
   there is no UI/browser regression test. The animated-background change in `00f38b4` is
   verified by a human, not by CI.
8. **Commit hygiene.** `fidex ui`, `leaderboard23232`, `BIGGG UPDATE` — cosmetic, but
   publishers do peek at history.

---

## 4. Strengths to lead with in a pitch

- **A real porting discipline.** A pygame reference implementation plus an automated
  100 %-parity suite is engineering rigour, not a toy — it means the rules are pinned down
  and testable independently of the renderer.
- **Depth in a small box.** 8 rarity tiers with colour-coded scoring, a bingo bonus,
  multiplier tokens, a 10 s grace period, escalating spawn and row-growth intervals, 2
  modes, 3 themes, SFX + a rotating music playlist, sound/music volume + mute, personal
  bests per mode, and global boards per mode.
- **Zero build step, zero dependencies.** Deploys to any static host; Supabase is optional
  and loaded from a CDN only when configured.
- **Performance.** 61 FPS with a 756 KB dictionary loaded, and it degrades gracefully with
  no backend at all.
- **Visible polish.** The falling-letter backdrop now spans all four menu screens
  (main menu, mode picker, settings, leaderboard), with `prefers-reduced-motion` support,
  `aria-label` / `aria-live` regions, 44 px minimum button heights, and keyboard shortcuts
  (`Space`, `P`, `R`, `L`, `M`, `Esc`).
- **Clear headroom to tell as a roadmap:** daily challenges, a seeded word-of-the-day,
  streaks, a third mode, achievements, and server-validated scoring.

---

## 5. Punch list to pitch-ready (ordered)

| # | Task | Est. | Done when |
| --- | --- | --- | --- |
| 1 | Deploy it: pick Vercel **or** Pages, delete the other config, fix the font path, add the secrets (or make them optional) | 1–2 h | A stranger opens a URL and plays |
| 2 | 30-second "HOW TO PLAY" overlay, shown once; make the name prompt skippable | 2–3 h | A cold player scores a word unassisted |
| 3 | Encode 3–4 short music loops (~200 KB total), drop unused mp3 twins, defer music preload | 1–2 h | First-load payload < 3 MB incl. music |
| 4 | Global rename pass `Letter Rise` → `Shuffall` (code, docs, aria-labels, package names) | 30 min | `grep -ri "letter rise"` returns only historical notes |
| 5 | `og:image` + a real screenshot + a one-paragraph description | 30 min | The link previews with an image |
| 6 | Add the headless-Chrome smoke test from Appendix A as `npm run smoke` | 1–2 h | CI catches a broken overlay or input path |
| 7 | Phone-sized touch targets, or explicitly scope the demo to desktop/tablet | 2–4 h | A thumb can hit a letter reliably |
| 8 | Minimal analytics (plays, mode split, longest survival) | 1–2 h | A traction slide exists |

---

## 6. What this assessment did NOT verify

- **A full word clear in the browser.** Placement was verified; the *confirm → score →
  row-clear* path in the live DOM was not driven end-to-end (the rules themselves are
  covered by the Node parity suite, and the confirm button correctly stayed hidden for a
  single-letter segment).
- **Time Attack mode**, the 3-2-1-GO countdown, and the 02:00 leaderboard qualification.
- **A real Supabase round-trip** (submit + rank + board refresh) — credentials are not
  configured locally, so only the offline branch was exercised.
- **Real-device behaviour** (iOS Safari, Android Chrome, audio unlock on first touch,
  pointer capture under scroll gestures) — mobile was emulated at viewport level only.
- **Long-session stability** (memory growth over many rows, the 15-letter falling cap under
  sustained play, tab-backgrounding).
- **Fun.** Difficulty pacing (17.5 s row growth, 10 s grace) needs human play-testing;
  nothing here measures whether people want to keep playing.

---

## Appendix A — reproducing the browser measurements

The checks used the repo's own zero-dependency dev server plus headless Chrome driven over
the DevTools Protocol from a plain Node script (Node 22+ exposes a global `WebSocket`, so
no packages are needed).

```bash
# 1. serve the app
cd web && PORT=8123 node tools/dev_server.mjs &

# 2. start headless Chrome with a debugging port
google-chrome --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=9333 '--remote-allow-origins=*' \
  --user-data-dir=/tmp/chrome-prof --window-size=1280,900 about:blank &

# 3. from Node: PUT http://127.0.0.1:9333/json/new?<url> to open a tab, attach to its
#    webSocketDebuggerUrl, call Page/Runtime/Network/Log .enable, then drive the app
#    with Runtime.evaluate + Input.dispatchMouseEvent + Page.captureScreenshot.
```

Gotchas that cost real time during this assessment — recorded so nobody repeats them:

1. **Serve `/web/index.html`, not `/`.** The repo-root `index.html` is only a redirect stub,
   and the dev server roots at the repository, not at `web/`.
2. **`Input.dispatchMouseEvent` defaults `button` to `"none"`.** Omitting `button: "left"`
   silently delivers **no** `pointerdown` — every drag test then "fails" while `pointermove`
   keeps working, which looks exactly like a game bug. Always pass `button: "left"`.
3. **Do not identify letters by colour.** Falling letters are tinted by letter value
   (`letterColor()` in `web/src/data.js`) — common letters are **red**, not gold — and a
   dragged letter is a brightened variant of its own colour. Detect a disc by *chroma inside
   a fixed window*, not by matching gold.
4. **Brightness metrics lie on this canvas.** The hover highlight is a near-white rounded
   rect; a `max(r,g,b) > threshold` probe counts it and produced a false "letter placed"
   here. Require `max(r,g,b) - min(r,g,b) > 40` to exclude it.
5. **Programmatic clicks carry no user activation**, so `music.play()` logs a
   `NotAllowedError` warning under automation. That is a harness artefact, not a bug.

### One-off commands that are always worth running

```bash
# rules only, no browser needed
node web/tools/test_parity.mjs

# is anything still stubbed out?
grep -rn 'TODO\|FIXME\|HACK\|XXX\|stub\|not implemented' \
  web/src web/css web/index.html python/letter_rise

# payload reality check
du -sh web/assets/bg-music web/assets/sounds web/assets/words.json .git

# first-load numbers (after step 3 above):
#   performance.getEntriesByType('navigation')[0]   -> dcl / load
#   count requestAnimationFrame ticks over 1s       -> FPS
#   Network.loadingFailed + Log.entryAdded          -> errors
```

---

*Assessment generated from live measurement of this repository; re-run the numbers in
Appendix A after any change to the overlays, input handling, or asset pipeline.*



