"""Local profile and optional Supabase leaderboard integration."""

import json
import threading
import uuid

from postgrest.exceptions import APIError
from supabase import create_client

from .config import LEADERBOARD_LIMIT, PROFILE_PATH, SUPABASE_ANON_KEY, SUPABASE_URL

class LeaderboardClient:
    """Supabase client that keeps network failures out of the game loop."""

    def __init__(self):
        self.profile = self.load_profile()
        self.rows = []
        self.rank = None
        self.error = None
        self.loading = False
        self.client = None
        if self.configured():
            try:
                self.client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
            except (TypeError, ValueError) as exc:
                self.error = "Invalid Supabase configuration"
                print(f"Supabase unavailable: {exc}")

    @staticmethod
    def load_profile():
        try:
            with open(PROFILE_PATH, "r", encoding="utf-8") as profile_file:
                profile = json.load(profile_file)
        except (OSError, ValueError):
            profile = {}
        profile.setdefault("client_id", str(uuid.uuid4()))
        profile.setdefault("player_name", "")
        profile.setdefault("public", True)
        profile.setdefault("personal_best", 0)
        profile.setdefault("sound_volume", 0.75)
        profile.setdefault("sound_muted", False)
        return profile

    def save_profile(self):
        try:
            with open(PROFILE_PATH, "w", encoding="utf-8") as profile_file:
                json.dump(self.profile, profile_file, indent=2)
        except OSError:
            pass

    def configured(self):
        return bool(SUPABASE_URL and SUPABASE_ANON_KEY)

    def fetch_leaderboard(self):
        if self.client is None:
            raise RuntimeError("Supabase is not configured")
        response = self.client.rpc(
            "get_leaderboard",
            {
                "requested_client_id": self.profile["client_id"],
                "result_limit": LEADERBOARD_LIMIT,
            },
        ).execute()
        result = response.data
        return result.get("rows", result) if isinstance(result, dict) else result

    def submit_and_refresh(self, score, rarest_word):
        try:
            if not self.profile["public"]:
                self.error = "Global sharing is off in Settings"
                return
            if self.client is None:
                raise RuntimeError("Supabase is not configured")
            self.client.table("leaderboard").insert(
                {
                    "player_name": self.profile["player_name"],
                    "score": round(score, 2),
                    "rarest_word_found": rarest_word or "-",
                    "client_id": self.profile["client_id"],
                },
            ).execute()
            self.rows = self.fetch_leaderboard()
            self.rank = next(
                (row.get("rank") for row in self.rows if row.get("is_me")),
                None,
            )
            self.error = None
        except (APIError, OSError, RuntimeError, TypeError, ValueError) as exc:
            self.error = "Couldn't reach leaderboard"
            print(f"Leaderboard unavailable: {exc}")
        finally:
            self.loading = False

    def refresh_async(self):
        if self.loading:
            return
        self.loading = True
        self.error = None
        threading.Thread(target=self._refresh, daemon=True).start()

    def _refresh(self):
        try:
            self.rows = self.fetch_leaderboard()
            self.rank = next(
                (row.get("rank") for row in self.rows if row.get("is_me")),
                None,
            )
            self.error = None
        except (APIError, OSError, RuntimeError, TypeError, ValueError) as exc:
            self.error = "Couldn't reach leaderboard"
            print(f"Leaderboard unavailable: {exc}")
        finally:
            self.loading = False


