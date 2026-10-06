# Letter Rise

Letter Rise is a word-building puzzle game available for both the **Web (Canvas 2D / Mobile)** and **Desktop (Python / Pygame)**. Letters fall from the top of the screen, and the player drags them into a growing stack of seven-block rows. Complete valid words to score points and unlock locked blocks before the rising stack reaches the danger line.

---

## 🌐 Web Edition (Play in Browser)

The Web Edition is written in pure vanilla ES modules, HTML5 Canvas 2D, and Web Audio API with zero build dependencies, touch controls, and responsive scaling.

### Quick Start (Web)

```bash
# Start local dev server
npm run dev

# Or with Python
python3 -m http.server 8080
```

Open **[http://localhost:8080](http://localhost:8080)** in any modern browser.

### Deploying to Vercel
See the complete deployment guide in **[DEPLOYMENT.md](DEPLOYMENT.md)**.
- Connect your GitHub repository to [Vercel](https://vercel.com).
- Vercel automatically detects [`vercel.json`](vercel.json) and deploys instantly.
- Optionally add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to enable the global leaderboard.

---

## 🐍 Desktop Edition (Python / Pygame)

- Python 3.11 or newer
- `pygame-ce` (the pygame package is also compatible with the current code)
- `pandas`

## Installation

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install pygame-ce pandas supabase python-dotenv
```

On Windows, activate the environment with:

```powershell
.venv\Scripts\activate
```

## Run the game

Run the game from the project directory so it can find the word dataset:

```bash
python main.py
```

The game window is 820 x 820 pixels and runs at up to 60 frames per second.

## How to play

Letters fall from the top of the window. Click and drag letters into empty
cells in any unlocked row. You can also drag letters already placed in a row
to rearrange them. Dropping a falling letter onto an occupied cell replaces
that letter, which resumes falling from the drop position.

Rows are seven blocks wide. Hovering over any filled, unlocked block highlights the contiguous filled run connected to it. Press Space to confirm that run:

- A valid one-to-seven-letter word clears only the confirmed run and adds its dataset-based score. The cleared blocks remain as gaps. The row disappears only after all seven block positions have been included in valid scores.
- An invalid word locks only the confirmed run and colors those blocks red.
- Letters can continue to be dragged into other empty, unlocked blocks.


## Game pressure and losing

The stack grows upward automatically every 17.5 seconds. Falling letters that
reach the stack or the bottom disappear. When the stack reaches the danger
line, a 10-second grace period begins. Clearing a valid row during that period
resets the timer. The game ends when the grace period expires.

## Controls

| Input | Action |
| --- | --- |
| Left mouse button | Click and drag falling and grid letters |
| `Space` | Confirm the contiguous run under the cursor |
| `P` | Pause or resume the game |
| `R` | Restart after Game Over |
| `Esc` | Quit the game |
| Window close | Quit the game |

## Render order

The main game renderer draws the scene in this order, from back to front:

1. Background and danger overlay
2. Danger/buffer line
3. Ungrabbed falling letters
4. Deletion mask and red fade gradient
5. Solid cover below the gradient
6. Stack boundary line
7. Grid cells and placed letters
8. The currently dragged letter
9. Score popups
10. Score and game-over HUD

The cover hides falling letters after they pass through the gradient, while
the grid and other UI are rendered afterward so they remain visible.
The dragged letter is rendered near the end so it stays visible over every
playfield layer during dragging.

## Scoring

The game calculates each valid word's score from its Scrabble letter values and
the word's tier in `merged.csv`:

```text
sum(Scrabble letter points) * tier multiplier
```

Tier multipliers are: tier 1 = 1.0, tier 2 = 1.2, tier 3 = 1.5, tier 4 = 2.0,
tier 5 = 2.5, tier 6 = 3.0, tier 7 = 3.5, and tier 8 = 4.0.

The score is shown in the top-left corner of the game window with two decimal
places.

When a word is cleared, its popup first shows the base score and multiplier,
such as `56 x1.2`. After 500 milliseconds, the popup changes to the final
multiplied score before fading out.

A valid seven-letter word earns a BINGO bonus: the normal score is multiplied
by 2. The popup shows the additional multiplier and displays `BINGO!` below
the tier message.

For a seven-letter word, the complete formula is:

```text
sum(Scrabble letter points) * tier multiplier * 2
```

A separate tier message appears below the bottom row, using these names:
Common, Uncommon, Rare, Epic, Legendary, Mythic, Ancient, and Celestial for
tiers 1 through 8 respectively.

## Dataset

The game loads `merged.csv` and `scrabble_letter_points.csv` with pandas. Both
files must be in the same directory as `main.py`. `merged.csv` must contain:

- `word`: the lowercase one-to-seven-letter word used for validation
- `tier`: the word's rarity tier
- `count`: word frequency information retained in the CSV

`scrabble_letter_points.csv` must contain:

- `character`: a letter
- `points`: that letter's Scrabble value

The game builds a weighted falling-letter pool from the `count` values of every
non-empty word in `merged.csv`. Each letter receives the combined frequency of
the words that contain it, so letters from more common words are more likely to
fall. This spawn pool is independent of the one-to-seven-letter validation
limit.

For validation, words from one to seven letters are accepted. The game also
adds `A` and `I` as tier-1 one-letter words. The other CSV files in
`source_data/` are data-cleaning or reference files and are not loaded directly
by `main.py`.

## Project files

- `main.py`: stable launcher (`python main.py`)
- `letter_rise/config.py`: display, gameplay, audio, and Supabase configuration
- `letter_rise/data.py`: vocabulary loading, scoring, and letter-color helpers
- `letter_rise/leaderboard.py`: local profile and optional Supabase leaderboard client
- `letter_rise/models.py`: row, falling-letter, and score-popup data models
- `letter_rise/board.py`: board state, falling-letter updates, and word resolution
- `letter_rise/game.py`: pygame window, input handling, rendering, and main loop
- `merged.csv`: runtime word list, frequencies, and rarity tiers
- `scrabble_letter_points.csv`: Scrabble letter values
- `source_data/`: source word-frequency data and the data-cleaning notebook

## Color rules

Tier names use the same ascending palette as the rarity tiers:

| Tier | Name | Color |
| --- | --- | --- |
| 1 | Common | Red |
| 2 | Uncommon | Red-orange |
| 3 | Rare | Yellow |
| 4 | Epic | Yellow-green |
| 5 | Legendary | Green |
| 6 | Mythic | Blue-green |
| 7 | Ancient | Blue-violet / purple |
| 8 | Celestial | Red-violet |

Falling letters use the same palette in this order: 1-point letters, `S`,
2-point, 3-point, 4-point, 5-point, 8-point, and 10-point letters. Dragged
letters use a lighter version of their assigned color.

## Current status

This is a standalone quick demo of the Letter Rise game concept. It now includes a local menu, display-name settings, and an optional Supabase global leaderboard. Game progress exists only while the program is running.

## Global leaderboard setup

The game uses the Supabase Python client with the anonymous public key and
never asks for a password. Copy `.env.example` to `.env` and fill in the
project URL and anonymous key:

```bash
cp .env.example .env
.venv/bin/python main.py
```

`.env` is ignored by Git. Never put a Supabase service-role key in this file
or in the client; use only the project URL and anonymous key.

Run [supabase_leaderboard.sql](supabase_leaderboard.sql) in the Supabase SQL
editor. It creates the `leaderboard` table, anonymous RLS policies, and the
`get_leaderboard` rank function used by the game. The essential table shape is:

```sql
create table public.leaderboard (
	id uuid primary key default gen_random_uuid(),
	player_name text not null check (char_length(player_name) between 1 and 16),
	score numeric not null,
	rarest_word_found text not null,
	client_id uuid not null,
	created_at timestamptz not null default now()
);
```

The client expects an RPC named `get_leaderboard` that returns the top 100 rows
plus the requesting player's row when they are outside the top 100. Each row
should contain `rank`, `player_name`, `score`, `rarest_word_found`, and
`is_me`. The RPC can use `requested_client_id` and `result_limit` arguments.
Enable Row Level Security and permit anonymous `select` and `insert` only for
this table; validate public display names in the database as well as in the
client. If the variables are missing or the request fails, the game continues
offline and shows a quiet leaderboard error.

## Function pseudocode

The following pseudocode describes the main functions in `main.py`. It is
language-independent and focuses on the game logic rather than pygame drawing
syntax.

### Data preparation

```text
LOAD merged.csv
LOAD scrabble_letter_points.csv
CREATE WORD_TIERS from one-to-seven-letter words and their tier column
ADD A and I to WORD_TIERS as tier-1 words
CREATE WORD_SET from WORD_TIERS for fast membership checks
CREATE LETTER_POINTS from the character and points columns

CREATE an empty letter weight map
FOR each non-empty word and its count in merged.csv:
	FOR each character in word:
		increase that character's weight by the word count

CREATE LETTER_POOL from the weighted characters

FUNCTION random_letter:
	return one character selected using LETTER_WEIGHTS
```

The word counts in `merged.csv` make letters from more common words more likely
to appear as falling letters.

### `Row` and `FallingLetter`

```text
CLASS Row:
	FUNCTION initialize:
		cells = a list of seven empty values
		hole_cols = an empty set used only for visual highlighting
		locked_cols = an empty set
		scored_cols = an empty set

	FUNCTION is_full:
		return true only when every value in cells is filled

	FUNCTION segment_word(start, end):
		return the contiguous letters from start through end

	FUNCTION is_locked(column):
		return true when column is in locked_cols

CLASS FallingLetter:
	FUNCTION initialize(letter, x, y):
		store the letter and screen position
		dragging = false
		origin = "fall"
```

`origin` determines what happens when a dragged letter is released in an invalid location:

- `fall`: continue falling from the release position.
- `grid`: continue falling after being picked up from the board.

### Board setup and geometry

```text
FUNCTION Board.initialize:
	rows = one new unlocked Row
	falling = an empty list
	score = 0
	last_spawn = 0
	last_growth = current pygame time
	grace_active = false
	grace_end = 0
	game_over = false

FUNCTION row_top_y(row_index):
	calculate the vertical position of the requested row
	return its top screen coordinate

FUNCTION stack_top_y:
	return the top coordinate of the highest row

FUNCTION cell_rect(row_index, column):
	calculate the cell's x and y position from the board layout
	return a rectangle covering that cell

```

### Board growth and letter spawning

```text
FUNCTION maybe_grow(current_time):
	IF current_time - last_growth >= 17.5 seconds:
		set last_growth to current_time
		insert a new empty Row at the bottom of rows
```

```text
FUNCTION maybe_spawn(current_time):
	IF the number of falling letters is already 15:
		stop

	IF less than 1 second has passed since last_spawn:
		stop

	set last_spawn to current_time
	choose a random x coordinate above the board
	create a FallingLetter using random_letter()
	add it to falling
```

### Per-frame board update

```text
FUNCTION update(delta_time, current_time):
	IF game_over:
		stop

	maybe_grow(current_time)
	maybe_spawn(current_time)

	reduce falling speed slightly when many rows exist
	top_y = stack_top_y()
	new_falling_list = empty list

	FOR each letter in falling:
		IF letter is being dragged:
			keep it in new_falling_list
			continue

		move the letter downward using speed * delta_time

		IF the letter reaches the stack or the bottom of the screen:
			remove it from play
		ELSE:
			keep it in new_falling_list

	replace falling with new_falling_list

	IF the stack top is at or above the danger line:
		IF grace_active is false:
			grace_active = true
			grace_end = current_time + 10 seconds
	ELSE:
		grace_active = false

	IF grace_active and current_time >= grace_end:
		game_over = true
```

### Clearing or locking a row

```text
FUNCTION on_row_cleared(current_time):
	IF grace_active:
		grace_end = current_time + 10 seconds
```

```text
FUNCTION try_clear_segment(row_index, start, end, current_time):
	row = rows[row_index]

	IF the candidate contains an empty or locked block:
		stop

	candidate_word = row.segment_word(start, end)

	IF candidate_word exists in WORD_SET:
		base_points = sum(LETTER_POINTS for each letter in candidate_word)
		score += base_points * the multiplier for WORD_TIERS[candidate_word]
		empty cells from start through end
		mark those cells as holes
		mark columns from start through end as scored
		reset the danger timer if necessary
		remove the row only when all seven columns are scored
	ELSE:
		add columns from start through end to row.locked_cols
```

### Finding objects under the mouse

```text
FUNCTION find_falling_at(mouse_position):
	search falling letters from front to back
	return the first non-dragging letter close enough to the mouse
	return none if no letter was found

FUNCTION find_grid_cell_at(mouse_position):
	FOR each row and column:
		IF the cell rectangle contains the mouse:
			return row index and column index
	return none

```

### Mouse-down and mouse-move handling

```text
FUNCTION handle_mousedown(mouse_position):
	IF game_over:
		stop

	IF a falling letter is under the mouse:
		mark it as dragging
		set its origin to "fall"
		store it as the active dragged letter
		stop

	IF a filled cell in an unlocked row is under the mouse:
		remove the cell's letter
		create a dragging FallingLetter at the mouse position
		set origin to "grid"
		add it to falling
		store it as the active dragged letter
```

```text
FUNCTION handle_mousemove(mouse_position):
	IF an active dragged letter exists:
		move the letter to mouse_position
```

### Mouse-up and drop handling

```text
FUNCTION handle_mouseup(mouse_position):
	dragged = the active dragged letter
	clear the active dragged-letter reference

	IF no dragged letter exists:
		stop

	cell = find_grid_cell_at(mouse_position)
	IF cell exists AND its row is unlocked:
		IF the cell is empty:
			place dragged.letter in the cell
			remove dragged from falling
			stop

		ELSE IF dragged.origin is "fall":
			save the old cell letter as evicted
			put dragged.letter in the cell
			remove dragged from falling
			create a new falling letter for evicted at the drop position
			stop

	place it at the release position and let it resume falling

	mark dragged as no longer being dragged
```

```text
FUNCTION find_hover_candidate(mouse_position):
	find the filled, unlocked cell under the cursor
	scan left and right through contiguous filled, unlocked cells
	return the row and the start/end columns of that run

FUNCTION confirm_hovered_segment:
	find the hover candidate
	IF one exists:
		submit its one-to-seven-letter word to segment validation
```

### Reset, rendering, and main loop

```text
FUNCTION Game.initialize:
	initialize pygame
	create the game window, clock, and fonts
	call reset()

FUNCTION reset:
	create a fresh Board
	clear the active dragged-letter reference
```

```text
FUNCTION draw:
	clear the screen
	draw the danger line and danger overlay

	FOR each row and cell:
		choose a color based on locked, hole, filled, or empty state
		draw the cell and its letter if present

	draw falling letters
	draw the current score and score popups

	IF game_over:
		draw the dark overlay, final score, and restart instructions

	update the display
```

```text
FUNCTION run:
	running = true

	WHILE running:
		delta_time = time since previous frame
		current_time = pygame time

		FOR each pygame event:
			window close -> running = false
			Escape -> running = false
			R after Game Over -> reset()
			left mouse press -> handle_mousedown(position)
			mouse movement -> handle_mousemove(position)
			left mouse release -> handle_mouseup(position)
			Space -> confirm_hovered_segment()

		board.update(delta_time, current_time)
		draw()

	quit pygame
```
