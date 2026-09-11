"""
LETTER RISE — Quick Demo v2 (NOT the full game)
=================================================
Changes from v1, per updated design decisions:
- ALL rows on the board are open/fillable at the same time (not just one
  "active" row) — you choose which row to work on.
- Interaction is now CLICK-AND-DRAG instead of click-to-catch:
    - Click and drag a falling letter, drop it into any empty grid cell
      in any unlocked row, OR drop it into an empty bank slot.
    - You can also click and drag a letter that's ALREADY placed in the
      grid to pick it back up and move it — including dropping it
      somewhere that ISN'T a valid target, in which case it just
      resumes falling from wherever you dropped it (instead of
      disappearing).
    - Dragging a letter out of the BANK into the grid is still one-way:
      once it leaves the bank, it can't go back into the bank.

Rules unchanged from v1:
- Each row is 5 letters wide.
- Row fills -> valid word -> clears, scores points, resets empty.
- Row fills -> invalid word -> row LOCKS (grayed out, no longer usable)
  and a new empty row appears above it. Stack grows.
- Stack reaching the top of the screen -> Game Over.
- No miss-penalty yet: uncaught letters that hit bottom just vanish.

Controls: mouse only (click-drag-drop). Press R to restart after Game
Over. ESC to quit.

Run locally with:  pip install pygame   then   python letter_rise_demo_v2.py
"""

import pygame
import random
import sys

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
WIDTH, HEIGHT = 520, 760
COLS = 5
CELL = 68
BOARD_LEFT = (WIDTH - COLS * CELL) // 2 + 60
BOARD_BOTTOM = HEIGHT - 130     # baseline the stack grows up from
GAME_OVER_LINE = 80             # if stack reaches this y (from top), game over

FALL_SPEED = 85                 # pixels/sec, constant for the demo
SPAWN_INTERVAL_MS = 950
LETTER_RADIUS = 24

BANK_SLOTS = 4
BANK_SIZE = 56
BANK_GAP = 14
BANK_LEFT = 24
BANK_TOP = HEIGHT // 2 - (BANK_SLOTS * (BANK_SIZE + BANK_GAP)) // 2

VALID_WORDS = {
    "ABOUT": 5, "APPLE": 8, "BEACH": 6, "BRAIN": 7, "BREAD": 6,
    "CHESS": 9, "CRANE": 7, "DANCE": 6, "EARTH": 5, "FLAME": 8,
    "GRAPE": 7, "HOUSE": 4, "LEMON": 8, "MONEY": 5, "NIGHT": 5,
    "OCEAN": 6, "PIANO": 9, "QUEEN": 12, "QUILT": 14, "RIVER": 5,
    "SNAKE": 7, "STONE": 5, "TABLE": 4, "TIGER": 8, "TRAIN": 6,
    "WATER": 4, "WHALE": 9, "ZEBRA": 15,
}
LETTER_POOL = list("EEEEAAAARRRRIIIOOOOTTTTNNNNSSSSLLLCCUUDDPPMMHHGGBBFFYYWWKVXZJQ")

FONT_NAME = None

BG = (18, 18, 24)
GRID_LINE = (40, 40, 52)
EMPTY_CELL = (30, 30, 40)
FILLED_CELL = (70, 130, 220)
LOCKED_CELL = (90, 90, 100)
HOVER_CELL = (60, 100, 170)
TEXT_WHITE = (235, 235, 240)
FALLING_LETTER = (250, 210, 90)
DRAG_LETTER = (255, 235, 150)
BANK_EMPTY = (35, 35, 46)
BANK_FILLED = (200, 120, 220)
BANK_HOVER = (150, 90, 170)
GOOD = (100, 220, 130)
BAD = (220, 90, 90)


class Letter:
    """A single letter tile. Exactly one of these states is true at a time:
    falling, being dragged, sitting in a grid cell, or sitting in a bank slot."""
    def __init__(self, letter, x, y):
        self.letter = letter
        self.x = x
        self.y = y
        self.state = "falling"      # falling | dragging | grid | bank
        self.row = None             # Row object, if state == "grid"
        self.col = None             # column index, if state == "grid"
        self.bank_index = None      # if state == "bank"
        self.from_bank = False      # True if this letter ever left the bank (one-way rule)

    def rect(self, radius=LETTER_RADIUS):
        return pygame.Rect(self.x - radius, self.y - radius, radius * 2, radius * 2)


class Row:
    def __init__(self):
        self.slots = [None] * COLS   # holds Letter objects or None
        self.locked = False

    def is_full(self):
        return all(s is not None for s in self.slots)

    def word(self):
        return "".join(l.letter for l in self.slots)

    def first_open_index(self):
        for i, s in enumerate(self.slots):
            if s is None:
                return i
        return None


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Letter Rise — Demo v2 (drag & drop)")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont(FONT_NAME, 30, bold=True)
        self.small_font = pygame.font.SysFont(FONT_NAME, 18)
        self.big_font = pygame.font.SysFont(FONT_NAME, 46, bold=True)
        self.reset()

    def reset(self):
        self.rows = [Row()]
        self.bank = [None] * BANK_SLOTS
        self.letters = []          # ALL letters currently in play (any state)
        self.dragging = None       # the Letter currently being dragged, or None
        self.drag_offset = (0, 0)
        self.spawn_timer = 0
        self.score = 0
        self.game_over = False
        self.message = ""
        self.message_timer = 0

    # -- geometry helpers -----------------------------------------------
    def row_rect(self, row_index, col):
        y = BOARD_BOTTOM - (row_index + 1) * CELL
        x = BOARD_LEFT + col * CELL
        return pygame.Rect(x, y, CELL - 4, CELL - 4)

    def bank_rect(self, i):
        return pygame.Rect(BANK_LEFT, BANK_TOP + i * (BANK_SIZE + BANK_GAP), BANK_SIZE, BANK_SIZE)

    def stack_top_y(self):
        return BOARD_BOTTOM - len(self.rows) * CELL

    def flash(self, text):
        self.message = text
        self.message_timer = 1.2

    # -- spawning ----------------------------------------------------------
    def spawn_letter(self):
        letter = random.choice(LETTER_POOL)
        x = random.randint(180, WIDTH - 40)
        self.letters.append(Letter(letter, x, -30))

    # -- resolving a completed row ------------------------------------------
    def resolve_row(self, row):
        word = row.word()
        if word in VALID_WORDS:
            points = VALID_WORDS[word]
            self.score += points
            self.flash(f"+{points}  {word}!")
            for l in row.slots:
                self.letters.remove(l)
            row.slots = [None] * COLS
        else:
            row.locked = True
            self.flash(f"'{word}' not valid — locked")
            self.rows.append(Row())
            if self.stack_top_y() <= GAME_OVER_LINE:
                self.game_over = True

    # -- drag & drop ---------------------------------------------------------
    def pick_up(self, pos):
        # Search topmost-first: currently-falling letters drawn last, so
        # check falling letters first (visually on top), then grid, then bank.
        for l in reversed(self.letters):
            if l.state == "falling" and l.rect().collidepoint(pos):
                l.state = "dragging"
                self.dragging = l
                return
        for l in self.letters:
            if l.state == "grid" and l.rect().collidepoint(pos):
                l.row.slots[l.col] = None
                l.row = None
                l.col = None
                l.state = "dragging"
                self.dragging = l
                return
        for l in self.letters:
            if l.state == "bank" and l.rect(BANK_SIZE // 2 - 4).collidepoint(pos):
                self.bank[l.bank_index] = None
                l.bank_index = None
                l.state = "dragging"
                l.from_bank = True
                self.dragging = l
                return

    def drop(self, pos):
        l = self.dragging
        if l is None:
            return
        self.dragging = None

        # Try grid cells (any unlocked row, any open slot)
        for r_index, row in enumerate(self.rows):
            if row.locked:
                continue
            for c in range(COLS):
                if row.slots[c] is not None:
                    continue
                rect = self.row_rect(r_index, c)
                if rect.collidepoint(pos):
                    row.slots[c] = l
                    l.state = "grid"
                    l.row = row
                    l.col = c
                    l.x, l.y = rect.center
                    if row.is_full():
                        self.resolve_row(row)
                    return

        # Try bank slots (only if this letter didn't originate from the bank)
        if not l.from_bank:
            for i in range(BANK_SLOTS):
                if self.bank[i] is None and self.bank_rect(i).collidepoint(pos):
                    self.bank[i] = l
                    l.state = "bank"
                    l.bank_index = i
                    l.x, l.y = self.bank_rect(i).center
                    return

        # Not a valid target -> resume falling from the drop point
        l.state = "falling"
        l.x, l.y = pos

    # -- update / draw -------------------------------------------------------
    def update(self, dt):
        if self.game_over:
            return
        self.spawn_timer += dt * 1000
        if self.spawn_timer >= SPAWN_INTERVAL_MS:
            self.spawn_timer = 0
            self.spawn_letter()

        for l in list(self.letters):
            if l.state == "falling":
                l.y += FALL_SPEED * dt
                if l.y - LETTER_RADIUS > HEIGHT:
                    self.letters.remove(l)
            elif l.state == "dragging":
                pos = pygame.mouse.get_pos()
                l.x, l.y = pos

        if self.message_timer > 0:
            self.message_timer -= dt

    def draw_board(self):
        mouse_pos = pygame.mouse.get_pos()
        for r_index, row in enumerate(self.rows):
            for c in range(COLS):
                rect = self.row_rect(r_index, c)
                if row.locked:
                    color = LOCKED_CELL
                elif row.slots[c] is not None:
                    color = FILLED_CELL
                elif self.dragging and rect.collidepoint(mouse_pos):
                    color = HOVER_CELL
                else:
                    color = EMPTY_CELL
                pygame.draw.rect(self.screen, color, rect, border_radius=8)
        # game-over line indicator
        pygame.draw.line(self.screen, (150, 60, 60), (0, GAME_OVER_LINE),
                          (WIDTH, GAME_OVER_LINE), 2)

    def draw_bank(self):
        mouse_pos = pygame.mouse.get_pos()
        label = self.small_font.render("BANK", True, TEXT_WHITE)
        self.screen.blit(label, (BANK_LEFT, BANK_TOP - 26))
        for i in range(BANK_SLOTS):
            rect = self.bank_rect(i)
            if self.bank[i] is not None:
                color = BANK_FILLED
            elif self.dragging and rect.collidepoint(mouse_pos):
                color = BANK_HOVER
            else:
                color = BANK_EMPTY
            pygame.draw.rect(self.screen, color, rect, border_radius=8)
            pygame.draw.rect(self.screen, GRID_LINE, rect, 2, border_radius=8)

    def draw_letters(self):
        for l in self.letters:
            if l.state == "grid":
                txt = self.font.render(l.letter, True, TEXT_WHITE)
                self.screen.blit(txt, txt.get_rect(center=(l.x, l.y)))
            elif l.state == "bank":
                txt = self.font.render(l.letter, True, TEXT_WHITE)
                self.screen.blit(txt, txt.get_rect(center=(l.x, l.y)))
            elif l.state == "falling":
                pygame.draw.circle(self.screen, FALLING_LETTER, (int(l.x), int(l.y)), LETTER_RADIUS)
                txt = self.font.render(l.letter, True, (20, 20, 20))
                self.screen.blit(txt, txt.get_rect(center=(l.x, l.y)))
            elif l.state == "dragging":
                pygame.draw.circle(self.screen, DRAG_LETTER, (int(l.x), int(l.y)), LETTER_RADIUS + 3)
                pygame.draw.circle(self.screen, (255, 255, 255), (int(l.x), int(l.y)), LETTER_RADIUS + 3, 2)
                txt = self.font.render(l.letter, True, (20, 20, 20))
                self.screen.blit(txt, txt.get_rect(center=(l.x, l.y)))

    def draw_hud(self):
        score_txt = self.font.render(f"Score: {self.score}", True, TEXT_WHITE)
        self.screen.blit(score_txt, (16, 16))
        hint = self.small_font.render(
            "Drag a falling letter into any open row, or into the bank. Drag placed letters to move them.",
            True, (170, 170, 180))
        self.screen.blit(hint, (16, HEIGHT - 24))

        if self.message_timer > 0:
            color = GOOD if "+" in self.message else BAD
            txt = self.font.render(self.message, True, color)
            self.screen.blit(txt, txt.get_rect(center=(WIDTH // 2 + 60, 55)))

        if self.game_over:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 160))
            self.screen.blit(overlay, (0, 0))
            over_txt = self.big_font.render("GAME OVER", True, TEXT_WHITE)
            self.screen.blit(over_txt, over_txt.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 40)))
            score_txt = self.font.render(f"Final Score: {self.score}", True, TEXT_WHITE)
            self.screen.blit(score_txt, score_txt.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 10)))
            hint_txt = self.small_font.render("Press R to restart", True, (200, 200, 210))
            self.screen.blit(hint_txt, hint_txt.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 50)))

    def run(self):
        while True:
            dt = self.clock.tick(60) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()
                    if event.key == pygame.K_r and self.game_over:
                        self.reset()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and not self.game_over:
                    self.pick_up(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1 and not self.game_over:
                    self.drop(event.pos)

            self.update(dt)

            self.screen.fill(BG)
            self.draw_board()
            self.draw_bank()
            self.draw_letters()
            self.draw_hud()
            pygame.display.flip()


if __name__ == "__main__":
    Game().run()