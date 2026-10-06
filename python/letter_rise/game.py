"""Pygame application loop and rendering for Letter Rise."""

import sys
import threading
import math

import pygame

from .board import Board
from .config import *
from .data import TIER_NAMES, WORD_TIERS, calculate_word_score, letter_color, tier_color
from .leaderboard import LeaderboardClient
from .models import FallingLetter, MultiplierToken

class Game:
    def __init__(self):
        pygame.mixer.pre_init(44100, -16, 2, 512)
        pygame.init()
        pygame.display.set_caption("Letter Rise — Demo v2")
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        self.clock = pygame.time.Clock()
        self.sounds = {}
        if pygame.mixer.get_init() is not None:
            for name, path in SOUND_PATHS.items():
                try:
                    self.sounds[name] = pygame.mixer.Sound(path)
                except pygame.error as error:
                    print(f"Could not load sound '{path}': {error}")
        else:
            print("Sound effects are unavailable because the audio mixer failed to initialize.")
        self.font = pygame.font.Font(FONT_PATH, 30)
        self.font.set_bold(True)
        self.small_font = pygame.font.Font(FONT_PATH, 18)
        self.big_font = pygame.font.Font(FONT_PATH, 46)
        self.big_font.set_bold(True)
        self.title_font = pygame.font.Font(FONT_PATH, 58)
        self.title_font.set_bold(True)
        self.leaderboard = LeaderboardClient()
        try:
            self.audio_volume = max(0.0, min(1.0, float(self.leaderboard.profile["sound_volume"])))
        except (KeyError, TypeError, ValueError):
            self.audio_volume = 0.75
        self.audio_muted = bool(self.leaderboard.profile.get("sound_muted", False))
        self.apply_audio_settings()
        self.state = "name_entry"
        self.name_input = ""
        self.name_cursor = True
        self.name_prompt = True
        self.name_entry_return = "menu"
        self.submission_started = False
        self.new_personal_best = False
        self.reset()
        self.name_prompt = True
        self.name_entry_return = "menu"
        self.state = "name_entry"

    def reset(self):
        self.board = Board()
        self.dragging = None  # the FallingLetter currently being dragged
        self.submission_started = False
        self.name_prompt = False
        self.state = "playing"

    def prompt_for_new_game(self):
        self.name_input = ""
        self.name_prompt = True
        self.name_entry_return = "play"
        self.state = "name_entry"

    def play_sound(self, name):
        sound = self.sounds.get(name)
        if sound is not None and not self.audio_muted:
            sound.play()

    def apply_audio_settings(self):
        volume = 0.0 if self.audio_muted else self.audio_volume
        for sound in self.sounds.values():
            sound.set_volume(volume)

    def save_audio_settings(self):
        self.leaderboard.profile["sound_volume"] = self.audio_volume
        self.leaderboard.profile["sound_muted"] = self.audio_muted
        self.leaderboard.save_profile()

    def play_board_sounds(self):
        for event in self.board.sound_events:
            self.play_sound(event)
        self.board.sound_events.clear()

    def button_rect(self, index, width=300, height=54):
        return pygame.Rect(
            (SCREEN_W - width) // 2,
            250 + index * (height + 16),
            width,
            height,
        )

    def clean_name(self, name):
        blocked = {"fuck", "shit", "bitch", "cunt", "nigger", "faggot"}
        cleaned = " ".join(name.strip().split())[:16]
        if not cleaned or any(word in cleaned.lower() for word in blocked):
            return ""
        return cleaned

    def save_name(self):
        cleaned = self.clean_name(self.name_input)
        if not cleaned:
            return False
        self.name_input = cleaned
        self.leaderboard.profile["player_name"] = cleaned
        self.leaderboard.save_profile()
        return True

    def start_submission(self):
        if self.submission_started or not self.leaderboard.profile["player_name"]:
            return
        self.submission_started = True
        self.new_personal_best = self.board.score > self.leaderboard.profile["personal_best"]
        if self.new_personal_best:
            self.leaderboard.profile["personal_best"] = round(self.board.score, 2)
            self.leaderboard.save_profile()
        self.leaderboard.loading = True
        threading.Thread(
            target=self.leaderboard.submit_and_refresh,
            args=(self.board.score, self.board.rarest_word_found),
            daemon=True,
        ).start()

    def open_leaderboard(self):
        self.state = "leaderboard"
        self.leaderboard.refresh_async()

    def draw_button(self, rect, label, active=False):
        color = (72, 72, 86) if active else (45, 45, 58)
        if active:
            pulse = 2 + round(2 * (1 + math.sin(pygame.time.get_ticks() / 140)) / 2)
            animated_rect = rect.inflate(pulse * 2, pulse)
            animated_rect.y -= pulse
        else:
            animated_rect = rect
        pygame.draw.rect(self.screen, color, animated_rect, border_radius=8)
        pygame.draw.rect(self.screen, FALLING_COLOR if active else GRID_LINE, animated_rect, 2, border_radius=8)
        text = self.font.render(label, True, TEXT_COLOR)
        self.screen.blit(text, text.get_rect(center=animated_rect.center))

    def draw_menu(self):
        self.screen.fill(BG)
        title = self.title_font.render("LETTER RISE", True, FALLING_COLOR)
        self.screen.blit(title, title.get_rect(center=(SCREEN_W // 2, 140)))
        mouse_pos = pygame.mouse.get_pos()
        for index, label in enumerate(("PLAY", "LEADERBOARD", "SETTINGS", "QUIT")):
            rect = self.button_rect(index)
            self.draw_button(rect, label, rect.collidepoint(mouse_pos))

    def draw_pause_overlay(self):
        overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        overlay.fill((100, 100, 100, 190))
        self.screen.blit(overlay, (0, 0))
        pause_text = self.big_font.render("PAUSED", True, TEXT_COLOR)
        self.screen.blit(
            pause_text,
            pause_text.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 - 24)),
        )
        hint = self.small_font.render("Press P to resume", True, TEXT_COLOR)
        self.screen.blit(hint, hint.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 34)))

    def draw_name_prompt(self):
        self.screen.fill(BG)
        title = self.big_font.render("Choose a display name", True, TEXT_COLOR)
        self.screen.blit(title, title.get_rect(center=(SCREEN_W // 2, 190)))
        pygame.draw.rect(self.screen, CELL_EMPTY, (130, 270, 560, 62), border_radius=6)
        pygame.draw.rect(self.screen, FALLING_COLOR, (130, 270, 560, 62), 2, border_radius=6)
        shown_name = self.name_input + ("|" if self.name_cursor else "")
        name_text = self.font.render(shown_name, True, TEXT_COLOR)
        self.screen.blit(name_text, (150, 285))
        hint = self.small_font.render("Enter to continue  |  Esc to cancel", True, TEXT_COLOR)
        self.screen.blit(hint, hint.get_rect(center=(SCREEN_W // 2, 390)))
        warning = self.small_font.render("1-16 characters; public display name", True, GRACE_COLOR)
        self.screen.blit(warning, warning.get_rect(center=(SCREEN_W // 2, 430)))

    def draw_settings(self):
        self.screen.fill(BG)
        title = self.big_font.render("SETTINGS", True, TEXT_COLOR)
        self.screen.blit(title, title.get_rect(center=(SCREEN_W // 2, 125)))
        name_text = self.font.render(f"Name: {self.leaderboard.profile['player_name'] or '(not set)'}", True, TEXT_COLOR)
        self.screen.blit(name_text, (90, 220))
        mouse_pos = pygame.mouse.get_pos()
        privacy = "ON" if self.leaderboard.profile["public"] else "OFF"
        privacy_button = pygame.Rect(90, 285, 640, 54)
        name_button = pygame.Rect(90, 365, 640, 54)
        volume_track = pygame.Rect(260, 470, 430, 10)
        volume_label = "SOUND: MUTED" if self.audio_muted else f"SOUND: {round(self.audio_volume * 100)}%"
        volume_text = self.small_font.render(volume_label, True, TEXT_COLOR)
        self.screen.blit(volume_text, (90, 465))
        pygame.draw.rect(self.screen, CELL_EMPTY, volume_track, border_radius=5)
        pygame.draw.rect(
            self.screen,
            FALLING_COLOR,
            pygame.Rect(volume_track.left, volume_track.top, round(volume_track.width * self.audio_volume), volume_track.height),
            border_radius=5,
        )
        knob_x = volume_track.left + round(volume_track.width * self.audio_volume)
        pygame.draw.circle(self.screen, TEXT_COLOR, (knob_x, volume_track.centery), 8)
        mute_button = pygame.Rect(90, 525, 640, 54)
        back_button = pygame.Rect(90, 605, 640, 54)
        self.draw_button(privacy_button, f"GLOBAL SCORES: {privacy}", privacy_button.collidepoint(mouse_pos))
        self.draw_button(name_button, "EDIT DISPLAY NAME", name_button.collidepoint(mouse_pos))
        self.draw_button(mute_button, "UNMUTE SOUND" if self.audio_muted else "MUTE SOUND", mute_button.collidepoint(mouse_pos))
        self.draw_button(back_button, "BACK", back_button.collidepoint(mouse_pos))

    def draw_leaderboard(self):
        self.screen.fill(BG)
        title = self.big_font.render("GLOBAL LEADERBOARD", True, TEXT_COLOR)
        self.screen.blit(title, title.get_rect(center=(SCREEN_W // 2, 62)))
        if self.leaderboard.loading:
            loading = self.font.render("Loading...", True, FALLING_COLOR)
            self.screen.blit(loading, loading.get_rect(center=(SCREEN_W // 2, 180)))
        elif self.leaderboard.error:
            error = self.small_font.render(self.leaderboard.error, True, GRACE_COLOR)
            self.screen.blit(error, error.get_rect(center=(SCREEN_W // 2, 180)))
        else:
            columns = ((78, "RANK"), (230, "PLAYER"), (430, "SCORE"), (585, "RAREST WORD"), (735, "WORD PTS"))
            for x, label in columns:
                header = self.small_font.render(label, True, GRID_LINE)
                self.screen.blit(header, header.get_rect(center=(x, 120)))
            positive_rows = []
            for row in self.leaderboard.rows:
                try:
                    score = float(row.get("score", 0))
                except (TypeError, ValueError):
                    continue
                if score > 0:
                    positive_rows.append((row, score))
            for index, (row, score) in enumerate(positive_rows[:18]):
                y = 155 + index * 28
                if row.get("is_me"):
                    pygame.draw.rect(self.screen, (75, 65, 35), (45, y - 3, 730, 27), border_radius=4)
                rank = row.get("rank", index + 1)
                player = str(row.get("player_name", "Unknown"))[:16]
                word = str(row.get("rarest_word_found", "-"))[:10]
                word_points = 0
                if word != "-" and word.lower() in WORD_TIERS:
                    word_points = calculate_word_score(word)
                    if len(word) == ROW_LEN:
                        word_points *= BINGO_BONUS_MULTIPLIER
                values = (
                    (f"#{rank}", 78),
                    (player, 230),
                    (f"{score:.2f}", 430),
                    (word, 585),
                    (f"{word_points:.2f}", 735),
                )
                for value, x in values:
                    text = self.small_font.render(value, True, TEXT_COLOR)
                    self.screen.blit(text, text.get_rect(center=(x, y + 10)))
        back = pygame.Rect(260, 700, 300, 52)
        self.draw_button(back, "BACK", back.collidepoint(pygame.mouse.get_pos()))

    # -- hit testing -----------------------------------------------------

    def find_falling_at(self, pos):
        for fl in reversed(self.board.falling):
            if not fl.dragging and abs(fl.x - pos[0]) < CELL // 2 and abs(fl.y - pos[1]) < CELL // 2:
                return fl
        return None

    def find_grid_cell_at(self, pos):
        for r_idx, row in enumerate(self.board.rows):
            for c in range(ROW_LEN):
                if self.board.cell_rect(r_idx, c).collidepoint(pos):
                    return r_idx, c
        return None

    def find_hover_candidate(self, pos):
        cell = self.find_grid_cell_at(pos)
        if cell is None:
            return None
        row_idx, col = cell
        row = self.board.rows[row_idx]
        if (
            row.resolution_phase is not None
            or row.cells[col] is None
            or row.is_locked(col)
            or col in row.scored_cols
        ):
            return None

        start = col
        while (
            start > 0
            and row.cells[start - 1] is not None
            and not row.is_locked(start - 1)
            and start - 1 not in row.scored_cols
        ):
            start -= 1
        end = col
        while (
            end < ROW_LEN - 1
            and row.cells[end + 1] is not None
            and not row.is_locked(end + 1)
            and end + 1 not in row.scored_cols
        ):
            end += 1
        return row_idx, start, end

    # -- mouse handling ----------------------------------------------------

    def handle_mousedown(self, pos):
        if self.board.game_over:
            return

        fl = self.find_falling_at(pos)
        if fl is not None:
            fl.dragging = True
            fl.origin = "fall"
            self.dragging = fl
            self.play_sound("pickup")
            return

        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if (
                row.resolution_phase is None
                and not row.is_locked(c)
                and c not in row.scored_cols
                and (row.cells[c] is not None or c in row.multiplier_cols)
            ):
                if c in row.multiplier_cols:
                    value = row.multiplier_cols.pop(c)
                    fl = MultiplierToken(value, pos[0], pos[1])
                elif row.cells[c] is not None:
                    letter = row.cells[c]
                    row.cells[c] = None
                    row.hole_cols.discard(c)
                    fl = FallingLetter(letter, pos[0], pos[1])
                else:
                    return
                fl.dragging = True
                fl.origin = "grid"
                self.dragging = fl
                self.board.falling.append(fl)
                self.play_sound("pickup")
            return

    def handle_mousemove(self, pos):
        if self.dragging is not None:
            self.dragging.x, self.dragging.y = pos

    def handle_mouseup(self, pos):
        fl = self.dragging
        self.dragging = None
        if fl is None:
            return
        now = pygame.time.get_ticks()

        # Grid cell
        cell = self.find_grid_cell_at(pos)
        if cell is not None:
            r_idx, c = cell
            row = self.board.rows[r_idx]
            if (
                row.resolution_phase is None
                and not row.is_locked(c)
                and c not in row.scored_cols
            ):
                if isinstance(fl, MultiplierToken):
                    if c in row.multiplier_cols or fl.value in row.multiplier_cols.values():
                        fl.x, fl.y = pos
                        fl.dragging = False
                        return
                    row.multiplier_cols[c] = fl.value
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    return
                if row.cells[c] is None:
                    row.cells[c] = fl.letter
                    row.hole_cols.discard(c)
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    self.play_sound("place")
                    return
                elif fl.origin == "fall":
                    # replace: evicted letter resumes falling from this spot
                    evicted = row.cells[c]
                    row.cells[c] = fl.letter
                    row.hole_cols.discard(c)
                    if fl in self.board.falling:
                        self.board.falling.remove(fl)
                    new_fl = FallingLetter(evicted, pos[0], pos[1])
                    new_fl.origin = "fall"
                    self.board.falling.append(new_fl)
                    self.play_sound("place")
                    return
                # occupied + origin == "grid": no-op, falls through to invalid-drop handling

        # Invalid drop location
        # Resume falling from the release point.
        fl.x, fl.y = pos
        # dragging flag cleared implicitly since fl.dragging isn't checked elsewhere
        fl.dragging = False

    def confirm_hovered_segment(self):
        if self.board.game_over or self.dragging is not None:
            return
        candidate = self.find_hover_candidate(pygame.mouse.get_pos())
        if candidate is None:
            return
        row_idx, start, end = candidate
        self.board.try_clear_segment(
            row_idx,
            start,
            end,
            pygame.time.get_ticks(),
        )

    # -- render -----------------------------------------------------------

    def draw(self):
        if self.state == "menu":
            self.draw_menu()
            pygame.display.flip()
            return
        if self.state == "leaderboard":
            self.draw_leaderboard()
            pygame.display.flip()
            return
        if self.state == "settings":
            self.draw_settings()
            pygame.display.flip()
            return
        if self.state == "name_entry":
            self.draw_name_prompt()
            pygame.display.flip()
            return
        self.screen.fill(BG)
        board = self.board
        now = pygame.time.get_ticks()

        danger_level = board.danger_level()
        danger_overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        danger_overlay.fill((150, 35, 35, round(16 * danger_level)))
        self.screen.blit(danger_overlay, (0, 0))

        # The stack consumes falling letters at its highest top edge. Draw the
        # moving boundary line here; the masking gradient is drawn after the
        # falling letters so they disappear naturally behind it.
        disappear_y = board.stack_top_y() - 4

        # Cover the area below the gradient before drawing UI elements so the
        # bank and grid remain visible on top of it.
        under_gradient_y = disappear_y + DELETION_ZONE_HEIGHT
        if under_gradient_y < SCREEN_H:
            pygame.draw.rect(
                self.screen,
                BG,
                pygame.Rect(0, under_gradient_y, SCREEN_W, SCREEN_H - under_gradient_y),
            )

        # danger / buffer line
        pygame.draw.line(self.screen, DANGER_LINE_COLOR, (0, BUFFER_LINE_Y), (SCREEN_W, BUFFER_LINE_Y), 2)

        

        # Draw ungrabbed letters before the deletion mask so they disappear
        # behind the stack boundary as they pass under it.
        for fl in board.falling:
            if fl.dragging:
                continue
            if isinstance(fl, MultiplierToken):
                center = (int(fl.x), int(fl.y))
                points = [(center[0], center[1] - FALLING_RADIUS),
                          (center[0] + FALLING_RADIUS, center[1]),
                          (center[0], center[1] + FALLING_RADIUS),
                          (center[0] - FALLING_RADIUS, center[1])]
                pygame.draw.polygon(self.screen, MULTIPLIER_GLOW_COLOR, points)
                pygame.draw.polygon(self.screen, MULTIPLIER_COLOR, points, 3)
                txt = self.font.render(f"{fl.value}x", True, (30, 30, 30))
                self.screen.blit(txt, txt.get_rect(center=center))
            else:
                color = letter_color(fl.letter, fl.dragging)
                pygame.draw.circle(self.screen, color, (int(fl.x), int(fl.y)), FALLING_RADIUS)
                txt = self.font.render(fl.letter.upper(), True, (30, 30, 30))
                self.screen.blit(txt, txt.get_rect(center=(int(fl.x), int(fl.y))))

        deletion_zone = pygame.Rect(
            0,
            disappear_y,
            SCREEN_W,
            DELETION_ZONE_HEIGHT,
        )
        pygame.draw.rect(self.screen, BG, deletion_zone)

        gradient = pygame.Surface((SCREEN_W, DELETION_ZONE_HEIGHT), pygame.SRCALPHA)
        for y in range(DELETION_ZONE_HEIGHT):
            distance = (y + 1) / DELETION_ZONE_HEIGHT
            alpha = round(105 * (1 - distance) ** 2)
            pygame.draw.line(
                gradient,
                (220, 45, 45, alpha),
                (0, y),
                (SCREEN_W, y),
            )
        self.screen.blit(gradient, (0, disappear_y))

        pygame.draw.line(
            self.screen,
            (245, 75, 75, 180),
            (0, disappear_y),
            (SCREEN_W, disappear_y),
            2,
        )

        # Draw the grid last so its cells and letters stay visible above the
        # disappearance line and its masking gradient.
        hover_candidate = None
        if self.dragging is None:
            hover_candidate = self.find_hover_candidate(pygame.mouse.get_pos())
        hovered_cell = self.find_grid_cell_at(pygame.mouse.get_pos())
        for r_idx, row in enumerate(board.rows):
            top_y = board.row_top_y(r_idx)
            if top_y < -CELL:
                continue
            for c in range(ROW_LEN):
                rect = board.cell_rect(r_idx, c)
                if c in row.scored_cols:
                    continue
                if row.is_locked(c):
                    color = ROW_INVALID_COLOR
                elif (
                    row.resolution_phase == "flicker"
                    and row.resolution_range is not None
                    and row.resolution_range[0] <= c <= row.resolution_range[1]
                    and (pygame.time.get_ticks() // 50) % 2 == 0
                ):
                    color = ROW_FLICKER_COLOR
                elif c in row.hole_cols:
                    color = CELL_HOLE
                elif row.cells[c] is not None:
                    color = CELL_UNLOCKED_FILLED
                else:
                    color = CELL_EMPTY
                pygame.draw.rect(self.screen, color, rect, border_radius=6)
                pygame.draw.rect(self.screen, GRID_LINE, rect, 2, border_radius=6)
                if hover_candidate is not None and hover_candidate[0] == r_idx:
                    _, start, end = hover_candidate
                    if start <= c <= end:
                        pygame.draw.rect(
                            self.screen,
                            ROW_FLICKER_COLOR,
                            rect,
                            3,
                            border_radius=6,
                        )
                if hovered_cell == (r_idx, c):
                    pygame.draw.rect(
                        self.screen,
                        TEXT_COLOR,
                        rect,
                        3,
                        border_radius=6,
                    )
                if row.cells[c] is not None:
                    txt = self.font.render(row.cells[c].upper(), True, letter_color(row.cells[c]))
                    self.screen.blit(txt, txt.get_rect(center=rect.center))
                if c in row.multiplier_cols:
                    pygame.draw.rect(self.screen, MULTIPLIER_COLOR, rect, 3, border_radius=6)
                    token_txt = self.small_font.render(f"{row.multiplier_cols[c]}x", True, MULTIPLIER_GLOW_COLOR)
                    self.screen.blit(token_txt, token_txt.get_rect(topright=(rect.right - 4, rect.top + 3)))

        # Keep the letter being dragged above the boundary, grid, and every
        # other board element so it remains visible throughout the drag.
        for fl in board.falling:
            if not fl.dragging:
                continue
            if isinstance(fl, MultiplierToken):
                center = (int(fl.x), int(fl.y))
                points = [(center[0], center[1] - FALLING_RADIUS),
                          (center[0] + FALLING_RADIUS, center[1]),
                          (center[0], center[1] + FALLING_RADIUS),
                          (center[0] - FALLING_RADIUS, center[1])]
                pygame.draw.polygon(self.screen, MULTIPLIER_GLOW_COLOR, points)
                pygame.draw.polygon(self.screen, MULTIPLIER_COLOR, points, 3)
                txt = self.font.render(f"{fl.value}x", True, (30, 30, 30))
                self.screen.blit(txt, txt.get_rect(center=center))
            else:
                color = letter_color(fl.letter, dragging=True)
                pygame.draw.circle(self.screen, color, (int(fl.x), int(fl.y)), FALLING_RADIUS)
                txt = self.font.render(fl.letter.upper(), True, (30, 30, 30))
                self.screen.blit(txt, txt.get_rect(center=(int(fl.x), int(fl.y))))

        if board.grace_active and not board.game_over:
            beat_period_ms = 60_000 / 80
            beat_phase = (now % beat_period_ms) / beat_period_ms
            pulse = min(
                1.0,
                math.exp(-((beat_phase - 0.12) / 0.055) ** 2)
                + 0.55 * math.exp(-((beat_phase - 0.27) / 0.08) ** 2),
            )
            grace_overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            grace_overlay.fill((255, 90, 90, round(18 + pulse * 55)))
            self.screen.blit(grace_overlay, (0, 0))

        # Completed rows launch their score briefly upward before fading out.
        now = pygame.time.get_ticks()
        for popup in board.score_popups:
            age = now - popup.created_at
            progress = age / SCORE_POPUP_MS
            popup_y = popup.y - 42 * progress
            if age < SCORE_POPUP_INTRO_MS:
                popup_alpha = 255
                popup_text = f"{popup.base_points:g} x {popup.multiplier:g}"
                for value in popup.multiplier_values:
                    popup_text += f" x{value:g}"
                if popup.bingo:
                    popup_text += f" x{BINGO_BONUS_MULTIPLIER:g}"
            else:
                popup_alpha = round(255 * (1 - progress))
                popup_text = f"+ {popup.points:g}!"
            popup_txt = self.font.render(popup_text, True, SCORE_POPUP_COLOR)
            popup_txt.set_alpha(popup_alpha)
            self.screen.blit(popup_txt, popup_txt.get_rect(center=(round(popup.x), round(popup_y))))

            tier_text = self.font.render(
                f"{TIER_NAMES[popup.tier]}",
                True,
                tier_color(popup.tier),
            )
            tier_text.set_alpha(popup_alpha)
            self.screen.blit(
                tier_text,
                tier_text.get_rect(center=(SCREEN_W // 2, BOARD_BOTTOM_Y + 75)),
            )
            if popup.bingo:
                bingo_text = self.big_font.render("BINGO!", True, SCORE_POPUP_COLOR)
                bingo_text.set_alpha(popup_alpha)
                self.screen.blit(
                    bingo_text,
                    bingo_text.get_rect(center=(SCREEN_W // 2, BOARD_BOTTOM_Y + 125)),
                )

        score_txt = self.font.render(f"Score: {board.score:.2f}", True, TEXT_COLOR)
        self.screen.blit(score_txt, (16, 16))
        elapsed_seconds = board.elapsed_seconds(now)
        minutes, seconds = divmod(elapsed_seconds, 60)
        time_txt = self.small_font.render(
            f"Time: {minutes:02d}:{seconds:02d}",
            True,
            TEXT_COLOR,
        )
        self.screen.blit(time_txt, (SCREEN_W - time_txt.get_width() - 16, 20))

        if board.game_over:
            go_txt = self.big_font.render("GAME OVER", True, (240, 90, 90))
            self.screen.blit(go_txt, go_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 - 30)))
            sc_txt = self.font.render(f"Final score: {board.score:.2f}", True, TEXT_COLOR)
            self.screen.blit(sc_txt, sc_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 20)))
            if self.leaderboard.rank is not None:
                rank_txt = self.font.render(f"Global rank: #{self.leaderboard.rank}", True, FALLING_COLOR)
                self.screen.blit(rank_txt, rank_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 62)))
            elif self.leaderboard.error:
                error_txt = self.small_font.render(self.leaderboard.error, True, GRACE_COLOR)
                self.screen.blit(error_txt, error_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 62)))
            if self.new_personal_best:
                best_txt = self.small_font.render("NEW PERSONAL BEST", True, SCORE_POPUP_COLOR)
                self.screen.blit(best_txt, best_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 125)))
            r_txt = self.small_font.render("L: leaderboard   R: restart   M: menu", True, TEXT_COLOR)
            self.screen.blit(r_txt, r_txt.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 95)))

            if self.name_prompt:
                panel = pygame.Surface((620, 250), pygame.SRCALPHA)
                panel.fill((18, 18, 24, 245))
                self.screen.blit(panel, (100, 245))
                prompt = self.big_font.render("DISPLAY NAME", True, TEXT_COLOR)
                self.screen.blit(prompt, prompt.get_rect(center=(SCREEN_W // 2, 285)))
                pygame.draw.rect(self.screen, CELL_EMPTY, (150, 330, 520, 52), border_radius=6)
                pygame.draw.rect(self.screen, FALLING_COLOR, (150, 330, 520, 52), 2, border_radius=6)
                shown_name = self.name_input + ("|" if self.name_cursor else "")
                name_text = self.font.render(shown_name, True, TEXT_COLOR)
                self.screen.blit(name_text, (170, 340))
                hint = self.small_font.render("Enter to submit  |  Esc to stay offline", True, TEXT_COLOR)
                self.screen.blit(hint, hint.get_rect(center=(SCREEN_W // 2, 410)))

        if self.state == "paused":
            self.draw_pause_overlay()

        pygame.display.flip()

    # -- main loop ----------------------------------------------------------

    def run(self):
        running = True
        while running:
            dt = self.clock.tick(FPS) / 1000.0
            now = pygame.time.get_ticks()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if self.name_prompt:
                            self.name_prompt = False
                            if self.state == "name_entry":
                                self.state = "menu" if self.name_entry_return == "play" else self.name_entry_return
                        elif self.state in ("leaderboard", "settings"):
                            self.state = "menu"
                        elif self.state == "game_over":
                            self.state = "menu"
                        else:
                            running = False
                    elif self.name_prompt and event.key == pygame.K_RETURN:
                        if self.save_name():
                            self.name_prompt = False
                            if self.name_entry_return in ("menu", "settings"):
                                self.state = self.name_entry_return
                            elif self.name_entry_return == "play":
                                self.reset()
                            else:
                                self.start_submission()
                    elif self.name_prompt and event.key == pygame.K_BACKSPACE:
                        self.name_input = self.name_input[:-1]
                    elif self.name_prompt and event.unicode.isprintable():
                        self.name_input = (self.name_input + event.unicode)[:16]
                    elif event.key == pygame.K_p and self.state in ("playing", "paused"):
                        if self.state == "playing":
                            if self.dragging is not None:
                                self.dragging.dragging = False
                                self.dragging = None
                            self.board.pause(now)
                            self.state = "paused"
                        else:
                            self.board.resume(now)
                            self.state = "playing"
                    elif event.key == pygame.K_r and self.state == "game_over":
                        self.prompt_for_new_game()
                    elif event.key == pygame.K_l and self.state == "game_over":
                        self.open_leaderboard()
                    elif event.key == pygame.K_m and self.state == "game_over":
                        self.state = "menu"
                    elif event.key == pygame.K_SPACE and self.state == "playing":
                        self.confirm_hovered_segment()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if self.state == "menu":
                        if self.button_rect(0).collidepoint(event.pos):
                            self.reset()
                        elif self.button_rect(1).collidepoint(event.pos):
                            self.open_leaderboard()
                        elif self.button_rect(2).collidepoint(event.pos):
                            self.state = "settings"
                        elif self.button_rect(3).collidepoint(event.pos):
                            running = False
                    elif self.state == "leaderboard" and pygame.Rect(260, 700, 300, 52).collidepoint(event.pos):
                        self.state = "menu"
                    elif self.state == "settings":
                        if pygame.Rect(90, 285, 640, 54).collidepoint(event.pos):
                            self.leaderboard.profile["public"] = not self.leaderboard.profile["public"]
                            self.leaderboard.save_profile()
                        elif pygame.Rect(90, 365, 640, 54).collidepoint(event.pos):
                            self.name_input = self.leaderboard.profile["player_name"]
                            self.name_prompt = True
                            self.name_entry_return = "settings"
                            self.state = "name_entry"
                        elif pygame.Rect(90, 435, 640, 70).collidepoint(event.pos):
                            volume = (event.pos[0] - 260) / 430
                            self.audio_volume = max(0.0, min(1.0, volume))
                            self.audio_muted = False
                            self.apply_audio_settings()
                            self.save_audio_settings()
                        elif pygame.Rect(90, 525, 640, 54).collidepoint(event.pos):
                            self.audio_muted = not self.audio_muted
                            self.apply_audio_settings()
                            self.save_audio_settings()
                        elif pygame.Rect(90, 605, 640, 54).collidepoint(event.pos):
                            self.state = "menu"
                    elif self.state == "playing":
                        self.handle_mousedown(event.pos)
                elif event.type == pygame.MOUSEMOTION:
                    if self.state == "playing":
                        self.handle_mousemove(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    if self.state == "playing":
                        self.handle_mouseup(event.pos)

            was_game_over = self.board.game_over
            if self.state == "playing":
                self.board.update(dt, now)
            if self.board.game_over and not was_game_over:
                self.state = "game_over"
                if self.leaderboard.profile["player_name"]:
                    self.start_submission()
                else:
                    self.name_prompt = True
            if self.state == "game_over" and self.leaderboard.profile["player_name"]:
                self.start_submission()
            self.play_board_sounds()
            self.draw()

        pygame.quit()
        sys.exit()

