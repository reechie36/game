# Shuffall

Shuffall is a word puzzle game where falling letters are dragged into rows and turned into valid words. Clear rows before the stack reaches the danger line to keep playing.

## Features

- Web version built with HTML5 Canvas and vanilla JavaScript
- Desktop version built with Python and Pygame
- Drag-and-drop letter placement
- Valid word scoring with rarity tiers
- Optional local and Supabase leaderboard support

## Play it locally

### Web version

From the project root:

```bash
npm run dev
```

Then open:

```text
http://localhost:8080
```

You can also serve it with:

```bash
python3 -m http.server 8080
```

### Desktop version

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install pygame-ce pandas supabase python-dotenv
python main.py
```

## How to play

- Drag falling letters into empty spots in the grid
- Build a connected run of letters
- Press Space to confirm the word
- Valid words clear and score points
- Invalid words lock the run in red
- The stack rises over time, so keep clearing rows before the danger line hits

## Controls

- Left click + drag: move letters
- Space: confirm word
- P: pause / resume
- R: restart
- Esc: quit

## Project structure

- `web/`: browser version
- `python/`: Python game code
- `main.py`: desktop entry point
- `assets/`: fonts, sounds, and data files
- `DEPLOYMENT.md`: deployment guide
- `PORTING_PROCESS.md`: notes on the project evolution
- `READINESS.md`: current demo/pitch readiness assessment and punch list

## Deployment and leaderboard

The web app is set up for Vercel and can be deployed using the config in `vercel.json`. See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

Optional Supabase leaderboard support can be enabled with environment variables for the project URL and anonymous key.

## Notes

This project is a small playable prototype and is designed to be easy to run locally. For more implementation detail, check the docs in [DEPLOYMENT.md](DEPLOYMENT.md) and [PORTING_PROCESS.md](PORTING_PROCESS.md). For the current state of the game — what is verified, what blocks a public demo link, and the ordered punch list — see [READINESS.md](READINESS.md).

