# Letter Rise

Letter Rise is a pygame word-building game demo. Letters fall from the top of the screen, and the player drags them into a growing stack of five-letter rows. Complete valid words to clear rows and earn points before the stack reaches the danger line.

## Requirements

- Python 3.11 or newer
- `pygame-ce` (the pygame package is also compatible with the current code)
- `pandas`

## Installation

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install pygame-ce pandas
```

On Windows, activate the environment with:

```powershell
.venv\Scripts\activate
```

## Run the game

Run the game from the project directory so it can find the word dataset:

```bash
python gamev2.py
```

The game window is 820 x 820 pixels and runs at up to 60 frames per second.

## How to play


Rows are five letters wide. When a row is full:


## Game pressure and losing


## Controls

| Input | Action |
| --- | --- |
| Left mouse button | Click and drag letters, bank items, and grid items |
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
7. Bank slots and bank labels
8. Grid cells and placed letters
9. The currently dragged letter
10. Score popups
11. Score, danger timer, and game-over HUD

The cover hides falling letters after they pass through the gradient, while
the bank, grid, and other UI are rendered afterward so they remain visible.
The dragged letter is rendered near the end so it stays visible over every
playfield layer during dragging.

## Scoring

Each valid word has a `points` value in the dataset. The game calculates the score as:

```text
rounded(points * 100)
```

The score is shown in the top-left corner of the game window.

## Dataset

The game loads `wordle_referenced.csv` with pandas. The file must be in the same directory as `gamev2.py` and must contain these columns:

- `word`: the lowercase five-letter word used for validation
- `points`: the word's score value
- `count` and `occurrence`: additional dataset information retained in the CSV

The game also builds a weighted falling-letter pool from the words. Letters that appear more often in the word list are therefore more likely to fall.

The other CSV and JSON files in the project are data-cleaning or reference files and are not loaded directly by `gamev2.py`.

## Project files

- `gamev2.py`: pygame game, game state, input handling, rendering, and scoring
- `wordle_referenced.csv`: runtime word list and word scores
- `wordle.csv`: source word-frequency data
- `unigram_freq.csv`: general word-frequency data
- `unigram_freq_5.csv`: five-letter word-frequency data
- `words.json`: additional word data
- `datacleaner.ipynb`: notebook used for data preparation and exploration

## Current status

This is a standalone quick demo of the Letter Rise game concept. It has no save system, sound effects, menus, multiplayer mode, or persistent high-score table. Game progress exists only while the program is running.

## Function pseudocode

The following pseudocode describes the main functions in `gamev3.py`. It is language-independent and focuses on the game logic rather than pygame drawing syntax.

### Data preparation

```text
LOAD wordle_referenced.csv
CREATE WORD_LIST from the word column
CREATE POINT_LIST from the points column
CREATE WORD_SET from WORD_LIST for fast membership checks

CREATE an empty letter frequency map
FOR each word in WORD_LIST:
	FOR each character in the word:
		increase that character's frequency

CREATE LETTER_POOL
FOR each character and frequency:
	add the character to LETTER_POOL frequency times

FUNCTION random_letter:
	return one random character from LETTER_POOL
```

The repeated characters in `LETTER_POOL` make common letters more likely to appear as falling letters.

### `Row` and `FallingLetter`

```text
CLASS Row:
	FUNCTION initialize:
		cells = a list of five empty values
		hole_cols = an empty set used only for visual highlighting
		locked = false

	FUNCTION is_full:
		return true only when every value in cells is filled

	FUNCTION word:
		convert the five cells into one string
		use "?" for any empty cell
		return the resulting string

CLASS FallingLetter:
	FUNCTION initialize(letter, x, y):
		store the letter and screen position
		dragging = false
		origin = "fall"
		origin_bank_index = none
```

`origin` determines what happens when a dragged letter is released in an invalid location:

- `fall`: continue falling from the release position.
- `grid`: continue falling after being picked up from the board.
- `bank`: return to the original bank slot.

### Board setup and geometry

```text
FUNCTION Board.initialize:
	rows = one new unlocked Row
	falling = an empty list
	bank = ten empty slots
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

FUNCTION bank_rect(slot_index):
	calculate the bank slot's x and y position
	return a rectangle covering that slot
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
FUNCTION try_clear_row(row_index, current_time):
	row = rows[row_index]

	IF row is locked OR row is not full:
		stop

	candidate_word = row.word()

	IF candidate_word exists in WORD_SET:
		find candidate_word's matching index in WORD_LIST
		point_value = POINT_LIST at that index
		score += round(point_value * 100)
		empty all cells in the row
		clear its hole markers
		reset the danger timer if necessary
		remove the entire row from rows
	ELSE:
		row.locked = true
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

FUNCTION find_bank_slot_at(mouse_position):
	FOR each bank slot:
		IF the slot rectangle contains the mouse:
			return slot index
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

	IF a filled bank slot is under the mouse:
		remove its letter from the bank
		create a dragging FallingLetter at the mouse position
		set origin to "bank" and remember the bank slot index
		add it to falling
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

	slot = find_bank_slot_at(mouse_position)
	IF slot is empty AND dragged did not come from the bank:
		put dragged.letter into the bank slot
		remove dragged from falling
		stop

	cell = find_grid_cell_at(mouse_position)
	IF cell exists AND its row is unlocked:
		IF the cell is empty:
			place dragged.letter in the cell
			remove dragged from falling
			check the row for a valid word
			stop

		ELSE IF dragged.origin is "fall":
			save the old cell letter as evicted
			put dragged.letter in the cell
			remove dragged from falling
			create a new falling letter for evicted at the drop position
			check the row for a valid word
			stop

	IF dragged.origin is "bank":
		return its letter to its original bank slot
		remove dragged from falling
	ELSE:
		place it at the release position and let it resume falling

	mark dragged as no longer being dragged
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
	draw the danger line

	FOR each row and cell:
		choose a color based on locked, hole, filled, or empty state
		draw the cell and its letter if present

	draw all bank slots and stored letters
	draw falling letters
	draw the current score

	IF danger is active:
		draw the remaining danger time

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

		board.update(delta_time, current_time)
		draw()

	quit pygame
```
